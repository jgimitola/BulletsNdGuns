import type { BuiltinLevel, LevelData, LevelId, LevelWrite } from '@bng/shared';

/** A stored level. Times are ms since the epoch. */
export interface LevelRecord {
  id: LevelId;
  name: string;
  /** Null for built-in levels. */
  authorId: string | null;
  /** The author's current nickname; null for built-in levels. */
  authorNickname: string | null;
  builtin: boolean;
  published: boolean;
  data: LevelData;
  createdAt: number;
  updatedAt: number;
}

export interface LevelListFilter {
  /** Who is looking: they also see their own unpublished levels. Null for guests. */
  viewerId: string | null;
  /** Only the viewer's own levels (none for guests). */
  mineOnly: boolean;
  /** Matched against level names and author nicknames, case-insensitively and literally. */
  search: string;
  offset: number;
  limit: number;
}

/**
 * Where levels are kept. The game talks to this interface only, so another database means another
 * implementation of it. Ownership and visibility rules live in LevelService, above it.
 */
export interface LevelStore {
  /** Visible levels: built-ins first, then the most recently updated. */
  list(filter: LevelListFilter): Promise<LevelRecord[]>;
  /** Null when missing, or when its stored data no longer parses. */
  get(id: LevelId): Promise<LevelRecord | null>;
  countByAuthor(authorId: string): Promise<number>;
  /** A new, unpublished level. */
  create(authorId: string, write: LevelWrite): Promise<LevelRecord>;
  /** Null when the level doesn't exist. */
  update(id: LevelId, write: LevelWrite): Promise<LevelRecord | null>;
  setPublished(id: LevelId, published: boolean): Promise<void>;
  delete(id: LevelId): Promise<void>;
  /** Inserts or refreshes a built-in level (published, id = slug), keeping its updatedAt. */
  upsertBuiltin(level: BuiltinLevel): Promise<void>;
}
