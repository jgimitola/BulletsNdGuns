import {
  CLASSIC_LEVELS,
  LEVELS_PAGE_SIZE,
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

/** Levels one account may own, drafts included (user's decision). */
export const MAX_LEVELS_PER_ACCOUNT = 10;

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

  constructor(store: LevelStore) {
    this.store = store;
  }

  /** Code is the source of truth for built-in levels: refresh them on every start. */
  async seedBuiltins(): Promise<void> {
    for (const level of CLASSIC_LEVELS) await this.store.upsertBuiltin(level);
  }

  async list(viewerId: string | null, query: LevelQuery): Promise<LevelPage> {
    // One extra row says whether another page follows.
    const records = await this.store.list({
      viewerId,
      mineOnly: query.mine,
      search: query.search,
      offset: query.offset,
      limit: LEVELS_PAGE_SIZE + 1,
    });
    const more = records.length > LEVELS_PAGE_SIZE;
    return {
      levels: records.slice(0, LEVELS_PAGE_SIZE).map(toSummary),
      nextOffset: more ? query.offset + LEVELS_PAGE_SIZE : null,
    };
  }

  async get(viewerId: string | null, id: LevelId): Promise<ServiceResult<LevelDetail>> {
    const record = await this.visible(viewerId, id);
    return record ? ok(toDetail(record)) : fail('notFound');
  }

  async create(authorId: string, write: LevelWrite): Promise<ServiceResult<LevelDetail>> {
    if ((await this.store.countByAuthor(authorId)) >= MAX_LEVELS_PER_ACCOUNT) {
      return fail('tooManyLevels');
    }
    return ok(toDetail(await this.store.create(authorId, write)));
  }

  async update(
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

  async setPublished(
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

  async delete(authorId: string, id: LevelId): Promise<ServiceResult<null>> {
    const owned = await this.owned(authorId, id);
    if (!owned.ok) return owned;
    await this.store.delete(id);
    return ok(null);
  }

  /** A draft copy, owned by the caller, of any level they can see (built-ins included). */
  async duplicate(authorId: string, id: LevelId): Promise<ServiceResult<LevelDetail>> {
    const source = await this.visible(authorId, id);
    if (!source) return fail('notFound');
    return this.create(authorId, { name: source.name, data: source.data });
  }

  /**
   * The levels of a new room, in order, as the room's own copies. Every id must be visible to the
   * creator and playable; otherwise the whole playlist is refused with `levelUnavailable`.
   */
  async loadPlaylist(
    viewerId: string,
    ids: readonly LevelId[],
  ): Promise<ServiceResult<PlaylistLevel[]>> {
    const playlist: PlaylistLevel[] = [];
    for (const id of ids) {
      const record = await this.visible(viewerId, id);
      if (!record || !isPlayable(record.data)) return fail('levelUnavailable');
      playlist.push({ name: record.name, level: buildLevel(record.data) });
    }
    return ok(playlist);
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
