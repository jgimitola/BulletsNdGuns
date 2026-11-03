import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { MAX_PLAYLIST_LENGTH, type LevelSummary } from '@bng/shared';
import { t } from '../../i18n/index.ts';
import { fetchLevels, LEVELS_QUERY_KEY } from '../../net/levels-api.ts';
import { useUi } from '../UiStoreContext.tsx';
import { LevelThumbnail } from './LevelThumbnail.tsx';
import type { LevelChoice, PlaylistItem } from './playlist.ts';
import { updatedLabel } from './updated-label.ts';

const SEARCH_DEBOUNCE_MS = 250;

/** Searchable levels (ALL / MINE); clicking a row adds it to the playlist or takes it out. */
export function LevelBrowser({
  playlist,
  onToggle,
}: {
  playlist: readonly PlaylistItem[];
  onToggle(level: LevelChoice): void;
}) {
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const [mine, setMine] = useState(false);
  // "Updated 2 days ago" is counted from when the browser opened; it needn't tick.
  const [now] = useState(() => Date.now());
  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed]);
  const levels = useInfiniteQuery({
    queryKey: [...LEVELS_QUERY_KEY, search, mine],
    queryFn: ({ pageParam, signal }) => fetchLevels({ search, mine, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
  });
  const full = playlist.length >= MAX_PLAYLIST_LENGTH;
  const rows = levels.data?.pages.flatMap((page) => page.levels) ?? [];
  return (
    <div className="level-browser">
      <div className="level-browser__bar">
        <input
          className="pixel-input level-browser__search"
          type="search"
          value={typed}
          placeholder={t('createRoom.search')}
          aria-label={t('createRoom.search')}
          spellCheck={false}
          maxLength={40}
          onChange={(event) => setTyped(event.target.value)}
        />
        <div className="level-browser__tabs" role="group">
          {(
            [
              [false, 'createRoom.all'],
              [true, 'createRoom.mine'],
            ] as const
          ).map(([value, key]) => (
            <button
              key={key}
              type="button"
              className="pixel-button pixel-button--small level-browser__tab"
              aria-pressed={mine === value}
              onClick={() => setMine(value)}
            >
              {t(key)}
            </button>
          ))}
        </div>
      </div>
      <ul className="level-browser__list">
        {rows.map((level) => (
          <LevelRow
            key={level.id}
            level={level}
            positions={playlist.flatMap((item, i) => (item.id === level.id ? [i + 1] : []))}
            full={full}
            now={now}
            onToggle={() => onToggle({ id: level.id, name: level.name })}
          />
        ))}
      </ul>
      {levels.isPending && <p className="rooms__note blink">{t('createRoom.loadingLevels')}</p>}
      {levels.isError && rows.length === 0 && (
        <p className="rooms__note rooms__note--error">{t('createRoom.levelsError')}</p>
      )}
      {levels.isSuccess && rows.length === 0 && (
        <p className="rooms__note">{t('createRoom.noLevels')}</p>
      )}
      {levels.hasNextPage && (
        <button
          type="button"
          className="pixel-button pixel-button--small level-browser__more"
          disabled={levels.isFetchingNextPage}
          onClick={() => void levels.fetchNextPage()}
        >
          {t('createRoom.more')}
        </button>
      )}
      {full && <p className="field__hint">{t('createRoom.full', { max: MAX_PLAYLIST_LENGTH })}</p>}
    </div>
  );
}

function LevelRow({
  level,
  positions,
  full,
  now,
  onToggle,
}: {
  level: LevelSummary;
  /** Where this level sits in the playlist (1-based); empty when it isn't in it. */
  positions: number[];
  full: boolean;
  now: number;
  onToggle(): void;
}) {
  const locale = useUi((s) => s.locale);
  const selected = positions.length > 0;
  const disabled = !level.playable || (full && !selected);
  return (
    <li>
      <button
        type="button"
        className={`level-row${selected ? ' level-row--selected' : ''}`}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onToggle}
      >
        <LevelThumbnail tiles={level.tiles} />
        <span className="level-row__meta">
          <span className="level-row__name">
            {level.name}
            {!level.published && <span className="level-row__badge">{t('createRoom.draft')}</span>}
          </span>
          <span className="level-row__detail">
            {t('createRoom.by', { author: level.author })} ·{' '}
            {level.builtin ? t('createRoom.classic') : updatedLabel(level.updatedAt, now, locale)}
          </span>
          {!level.playable && (
            <span className="level-row__detail">{t('createRoom.unplayable')}</span>
          )}
        </span>
        {selected && <span className="level-row__position">{positions.join(', ')}</span>}
      </button>
    </li>
  );
}
