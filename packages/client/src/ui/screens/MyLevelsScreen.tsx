import { useState } from 'react';
import {
  QueryClientProvider,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { MAX_LEVELS_PER_ACCOUNT, type LevelSummary } from '@bng/shared';
import { t } from '../../i18n/index.ts';
import { fetchLevels, LEVELS_QUERY_KEY, type ApiResult } from '../../net/levels-api.ts';
import { ConfirmDialog } from '../ConfirmDialog.tsx';
import { playHoverSound } from '../hover-sound.ts';
import { LevelThumbnail } from '../level-picker/LevelThumbnail.tsx';
import { updatedLabel } from '../level-picker/updated-label.ts';
import { queryClient } from '../query-client.ts';
import { useUi, useUiStore } from '../UiStoreContext.tsx';

/** Entry point of the lazily loaded My levels chunk (see lazy-screens.ts). */
export function MyLevelsScreenWithQuery() {
  return (
    <QueryClientProvider client={queryClient}>
      <MyLevelsScreen />
    </QueryClientProvider>
  );
}

type Tab = 'mine' | 'all';

/** A row action in flight, so the buttons wait for it. */
type Busy = string | null;

function MyLevelsScreen() {
  const store = useUiStore();
  const queries = useQueryClient();
  const error = useUi((s) => s.myLevelsError);
  const locale = useUi((s) => s.locale);
  const [tab, setTab] = useState<Tab>('mine');
  const [busy, setBusy] = useState<Busy>(null);
  const [deleting, setDeleting] = useState<LevelSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // "Updated 2 days ago" is counted from when the screen opened; it needn't tick.
  const [now] = useState(() => Date.now());

  const mine = useQuery({
    queryKey: [...LEVELS_QUERY_KEY, 'myLevels'],
    queryFn: ({ signal }) => fetchLevels({ search: '', mine: true, offset: 0 }, signal),
  });
  const mineCount = mine.data?.levels.length ?? 0;
  const full = mineCount >= MAX_LEVELS_PER_ACCOUNT;

  /** Runs one level request; every answer refreshes the lists, a failure shows its reason. */
  const run = async <T,>(key: string, request: () => Promise<ApiResult<T>>) => {
    if (busy !== null) return false;
    setBusy(key);
    setNotice(null);
    store.getState().setMyLevelsError(null);
    const result = await request();
    setBusy(null);
    void queries.invalidateQueries({ queryKey: LEVELS_QUERY_KEY });
    if (!result.ok) store.getState().setMyLevelsError(result.error);
    return result.ok;
  };

  const levels = store.getState().levelsApi;
  const copy = async (level: LevelSummary) => {
    if (await run(`copy:${level.id}`, () => levels.duplicate(level.id))) {
      setTab('mine');
      setNotice(t('myLevels.copied'));
    }
  };

  return (
    <div className="screen screen--menu screen--above-strip interactive">
      <div className="brick-strip" />
      <div className="my-levels pixel-panel">
        <div className="rooms__header">
          <h2 className="rooms__title">{t('myLevels.title')}</h2>
          <div className="level-browser__tabs" role="group">
            {(
              [
                ['mine', 'myLevels.mine'],
                ['all', 'myLevels.all'],
              ] as const
            ).map(([value, key]) => (
              <button
                key={value}
                type="button"
                className="pixel-button pixel-button--small level-browser__tab"
                aria-pressed={tab === value}
                onPointerEnter={playHoverSound}
                onClick={() => setTab(value)}
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>
        {tab === 'mine' ? (
          <MineList
            levels={mine.data?.levels}
            pending={mine.isPending}
            failed={mine.isError}
            busy={busy}
            now={now}
            locale={locale}
            onEdit={(level) => void run(`edit:${level.id}`, () => openEditor(level.id))}
            onPublish={(level) =>
              void run(`publish:${level.id}`, () => levels.setPublished(level.id, !level.published))
            }
            onCopy={(level) => void copy(level)}
            onDelete={setDeleting}
          />
        ) : (
          <AllList busy={busy} full={full} onCopy={(level) => void copy(level)} />
        )}
        {error !== null && (
          <p className="rooms__note rooms__note--error" role="alert">
            {t(`levelError.${error}`)}
          </p>
        )}
        {notice !== null && error === null && <p className="my-levels__notice">{notice}</p>}
      </div>
      <div className="rooms__actions">
        <button
          type="button"
          className="pixel-button"
          disabled={busy !== null}
          onPointerEnter={playHoverSound}
          onClick={() => store.getState().backToMenu()}
        >
          {t('myLevels.back')}
        </button>
        <div className="my-levels__new">
          <button
            type="button"
            className="pixel-button pixel-button--primary"
            disabled={full || busy !== null || mine.isPending}
            onPointerEnter={playHoverSound}
            onClick={() => void store.getState().openEditor(null)}
          >
            {t('myLevels.new')}
          </button>
          {full && (
            <p className="field__hint">{t('myLevels.full', { max: MAX_LEVELS_PER_ACCOUNT })}</p>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={deleting !== null}
        title={t('myLevels.deleteTitle')}
        text={t('myLevels.confirmDelete', { name: deleting?.name ?? '' })}
        confirm={t('myLevels.delete')}
        cancel={t('myLevels.cancel')}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const level = deleting;
          setDeleting(null);
          if (level) void run(`delete:${level.id}`, () => levels.remove(level.id));
        }}
      />
    </div>
  );

  /** Opening the editor reports through the UI store; wrapped so `run` shows it as busy. */
  async function openEditor(id: string): Promise<ApiResult<null>> {
    const opened = await store.getState().openEditor(id);
    const failed = store.getState().myLevelsError;
    return opened || failed === null ? { ok: true, value: null } : { ok: false, error: failed };
  }
}

function MineList({
  levels,
  pending,
  failed,
  busy,
  now,
  locale,
  onEdit,
  onPublish,
  onCopy,
  onDelete,
}: {
  levels: LevelSummary[] | undefined;
  pending: boolean;
  failed: boolean;
  busy: Busy;
  now: number;
  locale: Parameters<typeof updatedLabel>[2];
  onEdit(level: LevelSummary): void;
  onPublish(level: LevelSummary): void;
  onCopy(level: LevelSummary): void;
  onDelete(level: LevelSummary): void;
}) {
  const full = (levels?.length ?? 0) >= MAX_LEVELS_PER_ACCOUNT;
  return (
    <div className="my-levels__list-wrap">
      <ul className="my-levels__list">
        {levels?.map((level) => (
          <li key={level.id} className="my-level">
            <LevelThumbnail tiles={level.tiles} />
            <span className="level-row__meta">
              <span className="level-row__name">
                {level.name}
                <span
                  className={`level-row__badge${level.published ? ' level-row__badge--published' : ''}`}
                >
                  {t(level.published ? 'myLevels.published' : 'myLevels.draft')}
                </span>
              </span>
              <span className="level-row__detail">
                {updatedLabel(level.updatedAt, now, locale)}
              </span>
              {!level.playable && (
                <span className="level-row__detail">{t('myLevels.unplayable')}</span>
              )}
            </span>
            <span className="my-level__actions">
              <RowButton label={t('myLevels.edit')} busy={busy} onClick={() => onEdit(level)} />
              <RowButton
                label={t(level.published ? 'myLevels.unpublish' : 'myLevels.publish')}
                busy={busy}
                disabled={!level.published && !level.playable}
                hint={!level.published && !level.playable ? t('myLevels.unplayable') : undefined}
                onClick={() => onPublish(level)}
              />
              <RowButton
                label={t('myLevels.copy')}
                busy={busy}
                disabled={full}
                hint={full ? t('myLevels.full', { max: MAX_LEVELS_PER_ACCOUNT }) : undefined}
                onClick={() => onCopy(level)}
              />
              <RowButton
                label={t('myLevels.delete')}
                busy={busy}
                danger
                onClick={() => onDelete(level)}
              />
            </span>
          </li>
        ))}
      </ul>
      {pending && <p className="rooms__note blink">{t('myLevels.loading')}</p>}
      {failed && !levels && (
        <p className="rooms__note rooms__note--error">{t('myLevels.loadError')}</p>
      )}
      {levels?.length === 0 && <p className="rooms__note">{t('myLevels.empty')}</p>}
    </div>
  );
}

/** Published levels from everyone, built-ins included, each with COPY. */
function AllList({
  busy,
  full,
  onCopy,
}: {
  busy: Busy;
  full: boolean;
  onCopy(level: LevelSummary): void;
}) {
  const all = useInfiniteQuery({
    queryKey: [...LEVELS_QUERY_KEY, 'myLevels', 'all'],
    queryFn: ({ pageParam, signal }) =>
      fetchLevels({ search: '', mine: false, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
  });
  // The list also holds this player's own drafts; ALL is what everyone can play.
  const rows = all.data?.pages.flatMap((page) => page.levels).filter((l) => l.published) ?? [];
  return (
    <div className="my-levels__list-wrap">
      <ul className="my-levels__list">
        {rows.map((level) => (
          <li key={level.id} className="my-level">
            <LevelThumbnail tiles={level.tiles} />
            <span className="level-row__meta">
              <span className="level-row__name">{level.name}</span>
              <span className="level-row__detail">
                {level.builtin
                  ? t('createRoom.classic')
                  : t('createRoom.by', { author: level.author })}
              </span>
            </span>
            <span className="my-level__actions">
              <RowButton
                label={t('myLevels.copy')}
                busy={busy}
                disabled={full}
                hint={full ? t('myLevels.full', { max: MAX_LEVELS_PER_ACCOUNT }) : undefined}
                onClick={() => onCopy(level)}
              />
            </span>
          </li>
        ))}
      </ul>
      {all.isPending && <p className="rooms__note blink">{t('myLevels.loading')}</p>}
      {all.isError && rows.length === 0 && (
        <p className="rooms__note rooms__note--error">{t('myLevels.loadError')}</p>
      )}
      {all.isSuccess && rows.length === 0 && <p className="rooms__note">{t('myLevels.noneAll')}</p>}
      {all.hasNextPage && (
        <button
          type="button"
          className="pixel-button pixel-button--small level-browser__more"
          disabled={all.isFetchingNextPage}
          onClick={() => void all.fetchNextPage()}
        >
          {t('createRoom.more')}
        </button>
      )}
    </div>
  );
}

function RowButton({
  label,
  busy,
  disabled = false,
  danger = false,
  hint,
  onClick,
}: {
  label: string;
  busy: Busy;
  disabled?: boolean;
  danger?: boolean;
  hint?: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className={`pixel-button pixel-button--small${danger ? ' pixel-button--danger' : ''}`}
      disabled={disabled || busy !== null}
      title={hint}
      onPointerEnter={playHoverSound}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
