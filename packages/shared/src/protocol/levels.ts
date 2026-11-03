import { z } from 'zod';
import { CLASSIC_LEVELS } from '../levels/classic-levels.ts';
import { levelDataSchema, type LevelData } from '../levels/level-data.ts';
import { parseWith } from '../validation.ts';
import { labelSchema } from './labels.ts';

export const LEVEL_NAME_MAX_LENGTH = 24;
/** Levels one room plays, at most. */
export const MAX_PLAYLIST_LENGTH = 10;
export const LEVELS_PAGE_SIZE = 20;
/** Built-in levels' ids are their slugs; a room created without a playlist plays these. */
export const DEFAULT_PLAYLIST: readonly string[] = CLASSIC_LEVELS.map((l) => l.slug);

export type LevelId = string;

export const levelIdSchema = z.string().min(1).max(64);
export const levelNameSchema = labelSchema(LEVEL_NAME_MAX_LENGTH);

/** What a create or update sends. */
export interface LevelWrite {
  name: string;
  data: LevelData;
}

export const levelWriteSchema = z.object({
  name: levelNameSchema,
  data: levelDataSchema,
}) satisfies z.ZodType<LevelWrite>;

/** Validates an untrusted level body. Returns a fresh LevelWrite, or null. Never throws. */
export function parseLevelWrite(raw: unknown): LevelWrite | null {
  return parseWith(levelWriteSchema, raw);
}

/** The level browser's query: `mine` lists only the caller's own levels, drafts included. */
export interface LevelQuery {
  search: string;
  mine: boolean;
  offset: number;
}

/** Reads `GET /api/levels`' query string, where every value arrives as a string. */
export const levelQuerySchema = z.object({
  search: z.string().trim().max(40).default(''),
  mine: z
    .string()
    .optional()
    .transform((value) => value === '1'),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
}) satisfies z.ZodType<LevelQuery, unknown>;

export function parseLevelQuery(raw: unknown): LevelQuery | null {
  return parseWith(levelQuerySchema, raw);
}

/** One row of the level browser. `tiles` is the 500 tile characters of `tilesToRows`, joined. */
export interface LevelSummary {
  id: LevelId;
  name: string;
  /** The author's nickname; built-in levels show `RESERVED_NICKNAME`. */
  author: string;
  builtin: boolean;
  published: boolean;
  /** Has both spawns and the portal, so it can be published and played. */
  playable: boolean;
  /** ISO 8601. */
  updatedAt: string;
  tiles: string;
}

export interface LevelPage {
  levels: LevelSummary[];
  /** Offset of the next page, or null on the last one. */
  nextOffset: number | null;
}

export interface LevelDetail extends Omit<LevelSummary, 'tiles'> {
  data: LevelData;
}

/** Why a level request failed; the HTTP API answers it as `{ error }`. */
export type LevelError =
  | 'invalid'
  | 'signInRequired'
  | 'notFound'
  | 'forbidden'
  | 'notPublishable'
  | 'tooManyLevels'
  | 'levelUnavailable';
