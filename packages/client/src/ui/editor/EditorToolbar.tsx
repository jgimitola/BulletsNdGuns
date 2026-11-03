import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { DropdownMenu } from 'radix-ui';
import { useStore } from 'zustand';
import { isPlayable } from '@bng/shared';
import { isTitleClick } from '../../debug/panel-prefs.ts';
import type { EditorState, EditorStore } from '../../editor/editor-store.ts';
import { sameTool, toolKey, TOOLS, type Tool } from '../../editor/tools.ts';
import { t } from '../../i18n/index.ts';
import { tileSource } from '../level-picker/thumbnail.ts';
import { loadToolbarPrefs, saveToolbarPrefs, type ToolbarPrefs } from './toolbar-prefs.ts';

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
/** .editor-toolbar's width and its title row's height, in game px (see styles.css). */
const TOOLBAR_WIDTH = 292;
const TITLE_HEIGHT = 48;
/** Tool icons are 3/4 of a tile (see .tool-icon in styles.css). */
const ICON_SCALE = 0.75;
const FALLBACK: ToolbarPrefs = { x: 8, y: 8, collapsed: false };

/** Storage can be unavailable (private mode); the toolbar then forgets its place. */
const storage: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Not remembered.
    }
  },
};

export type EditorDialog = 'rename' | 'delete' | 'leave' | null;

/**
 * The editor's one floating panel over the level: tools, Test, Save, undo and redo, and a menu.
 * Dragging the title moves it inside the game area; a click on the title folds it.
 */
export function EditorToolbar({
  editor,
  onTest,
  onBack,
  onDialog,
}: {
  editor: EditorStore;
  onTest(): void;
  onBack(): void;
  onDialog(dialog: EditorDialog): void;
}) {
  const state = useStore(editor);
  const panel = useRef<HTMLDivElement>(null);
  const [prefs, setPrefs] = useState(() =>
    // The panel's width is fixed; its title must stay on screen whatever its height.
    loadToolbarPrefs(storage, FALLBACK, {
      width: GAME_WIDTH - TOOLBAR_WIDTH + 1,
      height: GAME_HEIGHT - TITLE_HEIGHT + 1,
    }),
  );
  const drag = useRef<{ x: number; y: number; from: ToolbarPrefs } | null>(null);

  /** Screen pixels per game pixel: the #ui overlay is the game area, scaled. */
  const scale = () =>
    (panel.current?.parentElement?.getBoundingClientRect().width ?? GAME_WIDTH) / GAME_WIDTH;
  /** Keeps the whole panel inside the game area. */
  const clamp = (next: ToolbarPrefs): ToolbarPrefs => {
    const rect = panel.current?.getBoundingClientRect();
    const width = rect ? rect.width / scale() : 0;
    const height = rect ? rect.height / scale() : 0;
    return {
      ...next,
      x: Math.round(Math.min(Math.max(next.x, 0), GAME_WIDTH - width)),
      y: Math.round(Math.min(Math.max(next.y, 0), GAME_HEIGHT - height)),
    };
  };

  const toggle = () => {
    const next = { ...prefs, collapsed: !prefs.collapsed };
    setPrefs(next);
    saveToolbarPrefs(storage, next);
  };

  const onTitleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, from: prefs };
  };
  const onTitleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    const s = scale();
    setPrefs(
      clamp({
        ...start.from,
        x: start.from.x + (event.clientX - start.x) / s,
        y: start.from.y + (event.clientY - start.y) / s,
      }),
    );
  };
  const onTitleUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start) return;
    drag.current = null;
    const next = isTitleClick(start.x, start.y, event.clientX, event.clientY)
      ? { ...start.from, collapsed: !start.from.collapsed }
      : prefs;
    setPrefs(next);
    saveToolbarPrefs(storage, next);
  };

  const playable = isPlayable(state.data);
  return (
    <div
      ref={panel}
      className={`editor-toolbar pixel-panel interactive${prefs.collapsed ? ' editor-toolbar--collapsed' : ''}`}
      style={{
        left: `calc(${prefs.x} * var(--px))`,
        top: `calc(${prefs.y} * var(--px))`,
      }}
    >
      <div
        className="editor-toolbar__title"
        title={t('editor.collapse')}
        onPointerDown={onTitleDown}
        onPointerMove={onTitleMove}
        onPointerUp={onTitleUp}
        onPointerCancel={() => (drag.current = null)}
      >
        <span className="editor-toolbar__name">{t('editor.title', { name: state.name })}</span>
        <SaveStateLabel state={state} />
        {/* The keyboard way to fold the panel; the title also folds on a click. */}
        <button
          type="button"
          className="editor-toolbar__fold"
          aria-expanded={!prefs.collapsed}
          aria-label={t(prefs.collapsed ? 'editor.expand' : 'editor.fold')}
          title={t(prefs.collapsed ? 'editor.expand' : 'editor.fold')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => toggle()}
        >
          {prefs.collapsed ? '▸' : '▾'}
        </button>
      </div>
      {!prefs.collapsed && (
        <>
          <div className="editor-toolbar__tools" role="group" aria-label={t('editor.tools')}>
            {TOOLS.map((tool) => (
              <ToolButton
                key={toolKey(tool)}
                tool={tool}
                selected={sameTool(tool, state.tool)}
                onSelect={() => state.setTool(tool)}
              />
            ))}
          </div>
          <div className="editor-toolbar__actions">
            <button
              type="button"
              className="pixel-button pixel-button--small"
              disabled={!playable}
              title={playable ? undefined : t('editor.testNeedsPieces')}
              onClick={onTest}
            >
              {t('editor.test')}
            </button>
            <button
              type="button"
              className="pixel-button pixel-button--small pixel-button--primary"
              disabled={state.saveState !== 'unsaved'}
              onClick={() => void state.save()}
            >
              {t('editor.save')}
            </button>
            <button
              type="button"
              className="pixel-button pixel-button--small"
              aria-label={t('editor.undo')}
              title={t('editor.undo')}
              disabled={!state.history.canUndo}
              onClick={state.undo}
            >
              ↶
            </button>
            <button
              type="button"
              className="pixel-button pixel-button--small"
              aria-label={t('editor.redo')}
              title={t('editor.redo')}
              disabled={!state.history.canRedo}
              onClick={state.redo}
            >
              ↷
            </button>
            <EditorMenu state={state} onBack={onBack} onDialog={onDialog} />
          </div>
          {state.error !== null && (
            <p className="editor-toolbar__error" role="alert">
              <span>
                {state.error === 'notPublishable' && state.published
                  ? t('editor.saveNotPublishable')
                  : t(`levelError.${state.error}`)}
              </span>
              <button
                type="button"
                className="editor-toolbar__dismiss"
                aria-label={t('editor.dismiss')}
                onClick={state.clearError}
              >
                ✕
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SaveStateLabel({ state }: { state: EditorState }) {
  const text = {
    saved: t('editor.saved'),
    unsaved: t('editor.unsaved'),
    saving: t('editor.saving'),
  }[state.saveState];
  return (
    <span className={`editor-toolbar__state editor-toolbar__state--${state.saveState}`}>
      {state.published && <span className="editor-toolbar__badge">{t('editor.published')}</span>}
      {text}
    </span>
  );
}

function toolLabel(tool: Tool): string {
  if (tool.kind === 'tile') return t('editor.tool.tile', { n: tool.id });
  if (tool.kind === 'eraser') return t('editor.tool.eraser');
  return t(`editor.tool.${tool.object}`);
}

function ToolIcon({ tool }: { tool: Tool }) {
  if (tool.kind === 'tile') {
    const { x, y } = tileSource(tool.id);
    return (
      <span
        className="tool-icon tool-icon--tile"
        // Shown at 3/4 size, like the sheet in the CSS.
        style={{
          backgroundPosition: `calc(${-x * ICON_SCALE} * var(--px)) calc(${-y * ICON_SCALE} * var(--px))`,
        }}
      />
    );
  }
  if (tool.kind === 'eraser') return <span className="tool-icon tool-icon--eraser">✕</span>;
  switch (tool.object) {
    case 'coin':
      return <img className="tool-icon" src="assets/textures/coin.png" alt="" />;
    case 'ammo':
      return <img className="tool-icon" src="assets/textures/ammo-pickup.png" alt="" />;
    case 'portal':
      return <img className="tool-icon" src="assets/textures/portal.png" alt="" />;
    case 'spawnLeft':
      return <span className="tool-icon tool-icon--spawn tool-icon--left">L</span>;
    case 'spawnRight':
      return <span className="tool-icon tool-icon--spawn">R</span>;
  }
}

function ToolButton({
  tool,
  selected,
  onSelect,
}: {
  tool: Tool;
  selected: boolean;
  onSelect(): void;
}) {
  const label = toolLabel(tool);
  const key = toolKey(tool).toUpperCase();
  return (
    <button
      type="button"
      className="tool-button"
      aria-pressed={selected}
      aria-label={`${label} (${key})`}
      title={`${label} (${key})`}
      onClick={onSelect}
    >
      <ToolIcon tool={tool} />
      <span className="tool-button__key">{key}</span>
    </button>
  );
}

function EditorMenu({
  state,
  onBack,
  onDialog,
}: {
  state: EditorState;
  onBack(): void;
  onDialog(dialog: EditorDialog): void;
}) {
  // Publishing and deleting wait for a running save, which they depend on.
  const saving = state.saveState === 'saving';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="pixel-button pixel-button--small"
        aria-label={t('editor.menu')}
        title={t('editor.menu')}
      >
        ≡
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={document.getElementById('ui')}>
        <DropdownMenu.Content
          className="editor-menu pixel-panel interactive"
          align="end"
          sideOffset={4}
        >
          <DropdownMenu.Item className="editor-menu__item" onSelect={() => onDialog('rename')}>
            {t('editor.rename')}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="editor-menu__item"
            disabled={saving}
            onSelect={() => void state.setPublished(!state.published)}
          >
            {t(state.published ? 'editor.unpublish' : 'editor.publish')}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="editor-menu__item"
            disabled={saving}
            onSelect={() => onDialog('delete')}
          >
            {t('editor.delete')}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="editor-menu__separator" />
          <DropdownMenu.Item className="editor-menu__item" onSelect={onBack}>
            {t('editor.back')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
