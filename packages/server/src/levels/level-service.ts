import {
  CLASSIC_LEVELS,
  LEVELS_PAGE_SIZE,
  MAX_LEVELS_PER_ACCOUNT,
  RESERVED_NICKNAME,
  buildLevel,
  isPlayable,
  tilesToRows,
  type LevelDetail,
  type LevelError,
  type LevelId,
  type LevelPage,
  type LevelQuery,
  type LevelSummary,
  type LevelWrite,
} from '@bng/shared';
import type { PlaylistLevel } from '../rooms/room.ts';
import type { LevelRecord, LevelStore } from './level-store.ts';

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: LevelError };

/** The cap lives in shared so My levels can show it; re-exported for the server code and tests. */
export { MAX_LEVELS_PER_ACCOUNT };

const ok = <T>(value: T): ServiceResult<T> => ({ ok: true, value });
const fail = <T>(error: LevelError): ServiceResult<T> => ({ ok: false, error });

function toSummary(record: LevelRecord): LevelSummary {
  const { data, ...detail } = toDetail(record);
  return { ...detail, tiles: tilesToRows(data.tiles).join('') };
}

function toDetail(record: LevelRecord): LevelDetail {
  return {
    id: record.id,
    name: record.name,
    author: record.authorNickname ?? RESERVED_NICKNAME,
    builtin: record.builtin,
    published: record.published,
    playable: isPlayable(record.data),
    updatedAt: new Date(record.updatedAt).toISOString(),
    data: record.data,
  };
}

const isVisibleTo = (record: LevelRecord, viewerId: string | null): boolean =>
  record.published || (viewerId !== null && record.authorId === viewerId);

/**
 * The rules above the store: who sees and changes which level. A level the caller can't see is
 * `notFound`, never `forbidden`, so drafts don't reveal that they exist.
 */
export class LevelService {
  private readonly store: LevelStore;
  /** The tail of each author's queue of writes; see `serialized`. */
  private readonly writeQueues = new Map<string, Promise<unknown>>();

  constructor(store: LevelStore) {
    this.store = store;
  }

  /** Code is the source of truth for built-in levels: refresh them on every start. */
  async seedBuiltins(): Promise<void> {
    for (const level of CLASSIC_LEVELS) await this.store.upsertBuiltin(level);
  }

  async list(viewerId: string | null, query: LevelQuery): Promise<LevelPage> {
    const { records, more } = await this.store.list({
      viewerId,
      mineOnly: query.mine,
      search: query.search,
      offset: query.offset,
      limit: LEVELS_PAGE_SIZE,
    });
    return {
      levels: records.map(toSummary),
      nextOffset: more ? query.offset + LEVELS_PAGE_SIZE : null,
    };
  }

  async get(viewerId: string | null, id: LevelId): Promise<ServiceResult<LevelDetail>> {
    const record = await this.visible(viewerId, id);
    return record ? ok(toDetail(record)) : fail('notFound');
  }

  create(authorId: string, write: LevelWrite): Promise<ServiceResult<LevelDetail>> {
    return this.serialized(authorId, () => this.createNow(authorId, write));
  }

  update(authorId: string, id: LevelId, write: LevelWrite): Promise<ServiceResult<LevelDetail>> {
    return this.serialized(authorId, () => this.updateNow(authorId, id, write));
  }

  setPublished(
    authorId: string,
    id: LevelId,
    published: boolean,
  ): Promise<ServiceResult<LevelDetail>> {
    return this.serialized(authorId, () => this.setPublishedNow(authorId, id, published));
  }

  delete(authorId: string, id: LevelId): Promise<ServiceResult<null>> {
    return this.serialized(authorId, () => this.deleteNow(authorId, id));
  }

  /** A draft copy, owned by the caller, of any level they can see (built-ins included). */
  duplicate(authorId: string, id: LevelId): Promise<ServiceResult<LevelDetail>> {
    return this.serialized(authorId, async () => {
      const source = await this.visible(authorId, id);
      if (!source) return fail('notFound');
      return this.createNow(authorId, { name: source.name, data: source.data });
    });
  }

  /**
   * Runs one author's writes one at a time. A check and the write it guards are separate store
   * calls, so without this a burst of requests could all pass the level cap, or a save and a
   * publish could each check a state the other is changing. The server is one process, so an
   * in-memory queue is enough for any store.
   */
  private serialized<T>(authorId: string, write: () => Promise<T>): Promise<T> {
    const previous = this.writeQueues.get(authorId) ?? Promise.resolve();
    const run = previous.then(write, write);
    const tail = run.catch(() => {});
    this.writeQueues.set(authorId, tail);
    void tail.then(() => {
      if (this.writeQueues.get(authorId) === tail) this.writeQueues.delete(authorId);
    });
    return run;
  }

  private async createNow(
    authorId: string,
    write: LevelWrite,
  ): Promise<ServiceResult<LevelDetail>> {
    if ((await this.store.countByAuthor(authorId)) >= MAX_LEVELS_PER_ACCOUNT) {
      return fail('tooManyLevels');
    }
    return ok(toDetail(await this.store.create(authorId, write)));
  }

  private async updateNow(
    authorId: string,
    id: LevelId,
    write: LevelWrite,
  ): Promise<ServiceResult<LevelDetail>> {
    const owned = await this.owned(authorId, id);
    if (!owned.ok) return owned;
    // One stored copy: a published level must stay playable, or players would meet a broken one.
    if (owned.value.published && !isPlayable(write.data)) return fail('notPublishable');
    const updated = await this.store.update(id, write);
    return updated ? ok(toDetail(updated)) : fail('notFound');
  }

  private async setPublishedNow(
    authorId: string,
    id: LevelId,
    published: boolean,
  ): Promise<ServiceResult<LevelDetail>> {
    const owned = await this.owned(authorId, id);
    if (!owned.ok) return owned;
    if (published && !isPlayable(owned.value.data)) return fail('notPublishable');
    await this.store.setPublished(id, published);
    return ok(toDetail({ ...owned.value, published }));
  }

  private async deleteNow(authorId: string, id: LevelId): Promise<ServiceResult<null>> {
    const owned = await this.owned(authorId, id);
    if (!owned.ok) return owned;
    await this.store.delete(id);
    return ok(null);
  }

  /**
   * The levels of a new room, in order, as the room's own copies. Every id must be visible to the
   * creator and playable; otherwise the whole playlist is refused with `levelUnavailable`.
   */
  async loadPlaylist(
    viewerId: string,
    ids: readonly LevelId[],
  ): Promise<ServiceResult<PlaylistLevel[]>> {
    // A level repeated in the playlist is read and built once; the room never changes it.
    const loaded = new Map<LevelId, PlaylistLevel>();
    for (const id of new Set(ids)) {
      const record = await this.visible(viewerId, id);
      if (!record || !isPlayable(record.data)) return fail('levelUnavailable');
      loaded.set(id, { name: record.name, level: buildLevel(record.data) });
    }
    return ok(ids.map((id) => loaded.get(id) as PlaylistLevel));
  }

  private async visible(viewerId: string | null, id: LevelId): Promise<LevelRecord | null> {
    const record = await this.store.get(id);
    return record && isVisibleTo(record, viewerId) ? record : null;
  }

  /** The caller's own level; built-ins belong to nobody. */
  private async owned(authorId: string, id: LevelId): Promise<ServiceResult<LevelRecord>> {
    const record = await this.visible(authorId, id);
    if (!record) return fail('notFound');
    return record.authorId === authorId ? ok(record) : fail('forbidden');
  }
}
