# Level Editor Implementation Plan (stage 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in players build levels in an in-game editor, test them alone in the browser, save them, and publish them. A **My levels** screen manages their levels and copies published ones.

**Architecture:**
- **Editing model:** pure functions over stage 1's `LevelData`, plus an undo history, live in `packages/client/src/editor/` and are fully unit-tested.
- **Shared state:** a zustand vanilla `EditorStore` holds the session (level, name, id, tool, history, save state). The Phaser `EditorScene` draws the level and turns pointer and key input into store actions; a React overlay renders the floating toolbar and the dialogs. This is the same Phaser/React split the game already uses.
- **Saving:** goes through stage 3's `/api/levels`.
- **Test mode:** a Phaser `TestScene` runs the shared `stepWorld` locally for one player at the left spawn, with no server.
- **Navigation:** the UI store gains the `myLevels`, `editor` and `editorTest` screens. The menu scene starts the editor scene when an editor session opens.

**Tech Stack:** TypeScript, Phaser 4.2 (read https://phaser.io/oss/docs before writing Phaser code; the API changed from Phaser 3), React 19, zustand 5 (vanilla stores), Radix Dialog, TanStack Query 5, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-levels-and-accounts-design.md`. In scope: the Editor and "Save, test, publish" sections, the permissions table, and "Decisions settled after review". Stage 4 of its build order. Stage 3's API (`/api/levels`, `LevelService`) is done and not changed here, except for the one shared export in Task 1.

## Global Constraints

- Code in English. Every player-facing string goes through i18n in both `es` and `en`.
- **Editor layout:** option A, approved. The level fills the 800 × 600 game area at real size with a faint grid. One floating toolbar sits over it, draggable by its title and collapsible, and remembers its place like the debug panel.
- **Tools:**
  - the 8 tileset tiles, coin, ammo, portal, left spawn, right spawn, and eraser;
  - click or drag paints tiles; a click places an object;
  - the portal and each spawn are single, so placing again moves them;
  - the eraser removes the tile and the objects under the cursor.
- **Snapping:** new objects snap to the tile grid.
- **Undo and redo:** Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z). Leaving with unsaved changes asks for confirmation.
- **Toolbar buttons:** Test, Save, and a menu with Rename, Publish/Unpublish, Delete, and Back to My levels.
- **Save:**
  - stores the level privately (a draft); drafts may be incomplete;
  - saving a published level that lacks both spawns or the portal is refused by the server (`notPublishable`); the editor keeps the changes and says why.
- **Test:**
  - runs the level in the browser, the player alone, using the shared simulation, at the left spawn;
  - needs both spawns and the portal;
  - Esc returns to the editor where the player left off.
- **Publish and unpublish:** publishing needs both spawns and the portal.
- **Delete:** asks for confirmation.
- **Duplicate:**
  - any published level, or one of your own, becomes your own draft;
  - available on My levels: on your own levels, and on published levels in an ALL tab;
  - the 10-level cap (stage 3) applies.
- **Access:** guests never see My levels or the editor. The server already refuses their writes.
- **Commits:** messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Before each commit, run `npx prettier --write --end-of-line auto <files>`.

## Review Focus

1. **Saving a published level after removing its portal.** The server answers `notPublishable`. The editor keeps every change, stays "unsaved", and shows a message telling the player to unpublish first or restore the pieces. Nothing is lost. (Test in Task 2.)
2. **Save fails on the network or hits the rate limit (429).** The level stays unsaved with a message, and a later Save succeeds. A second Save pressed while one is running does nothing. (Test in Task 2.)
3. **Undo back to exactly the saved state** counts as saved again (no unsaved-changes warning). A new edit after an undo clears the redo stack. (Tests in Tasks 1 and 2.)
4. **A drag stroke that crosses many cells and leaves the level.** It is one undo step and paints only cells inside the level. A stroke outside the level does nothing and never throws. (Test in Task 1.)
5. **Placing the 101st coin or ammo** is refused and the level is unchanged, so the editor can never produce data the server would reject as invalid. (Test in Task 1.)

---

### Task 1: Editing model and undo history

**Files:**
- Modify: `packages/shared/src/simulation/player.ts` (export `spawnFacing`)
- Create: `packages/client/src/editor/level-edits.ts`, `packages/client/src/editor/edit-history.ts`, `packages/client/src/editor/tools.ts`
- Test: `packages/client/test/level-edits.test.ts`, `packages/client/test/edit-history.test.ts`, `packages/client/test/tools.test.ts`

**Interfaces:**
- Consumes: `LevelData`, `LEVEL_COLS`, `LEVEL_ROWS`, `TILE_WIDTH`, `TILE_HEIGHT`, `MAX_PICKUPS_PER_KIND`, `BODY_HEIGHT`, `spriteCentre` and `spawnFacing` (shared).
- Produces:

```ts
// tools.ts
export type ObjectTool = 'coin' | 'ammo' | 'portal' | 'spawnLeft' | 'spawnRight';
export type Tool = { kind: 'tile'; id: number } | { kind: 'object'; object: ObjectTool } | { kind: 'eraser' };
export const TOOLS: readonly Tool[]; // tiles 1..8, coin, ammo, portal, spawnLeft, spawnRight, eraser
/** Keyboard shortcut of each tool: '1'..'8' tiles, '9' coin, '0' ammo, 'p' portal, 'l' / 'r' spawns, 'e' eraser. */
export function toolForKey(key: string): Tool | null; // case-insensitive
export const sameTool: (a: Tool, b: Tool) => boolean;

// level-edits.ts: pure, never mutates its input; returns the same object when nothing changes
export interface Cell { col: number; row: number }
export function emptyLevel(): LevelData; // all tiles 0, no spawns, no portal, no pickups
export function cellAt(x: number, y: number): Cell | null; // world px -> cell, null outside 0..800 x 0..600
export function snapObject(object: ObjectTool, cell: Cell): Vec2;
export function applyTool(data: LevelData, tool: Tool, cell: Cell): LevelData;
```

Snapping, using the original game's conventions (see `coinRect`, `ammoPickupRect`, `portalRect`):

| Object | Snapped position for cell (col, row) | Classic example |
|---|---|---|
| coin, ammo | `{ x: col * 32, y: (row + 1) * 30 }` (bottom-left corner of the cell) | coin `{ x: 384, y: 540 }` is cell (12, 17) |
| portal | `{ x: (col + 1) * 32, y: (row + 1) * 30 }`; the clicked cell is the top-left of the 2 × 2 cells it covers | classic 1 `{ x: 704, y: 60 }` is cell (21, 1) |
| spawnLeft, spawnRight | `spriteCentre({ x: col * 32 + 16, y: (row + 1) * 30 - BODY_HEIGHT / 2 - 1 }, spawnFacing(side))` | the hitbox stands on the cell's floor without overlapping the cell below |

`applyTool` rules:
- **Tile:** sets that cell's tile id.
- **Coin or ammo:** adds the pickup unless one already sits at that snapped position, or the kind already has `MAX_PICKUPS_PER_KIND` (100).
- **Portal or spawn:** replaces the single one.
- **Eraser:** sets the tile to 0 and removes every object whose cell is this cell. An object's cell is `objectCell(object, position)`, the inverse of `snapObject` with floor rounding and clamped into the grid. Export it. Objects from the classic levels, which aren't on the grid, are erased through the cell their position falls in.

```ts
// edit-history.ts
export class EditHistory {
  constructor(initial: LevelData, limit?: number); // limit 200 steps
  get current(): LevelData;
  /** A stroke groups every change until endStroke into one undo step. */
  beginStroke(): void;
  apply(next: LevelData): void; // ignored when next === current
  endStroke(): void;
  undo(): boolean; redo(): boolean; // false when nothing to do
  get canUndo(): boolean; get canRedo(): boolean;
}
```

- [ ] **Step 1: Write the failing tests.**
  - `tools.test.ts`:
    - `toolForKey('1')` is tile 1, `'8'` is tile 8, `'9'` is coin, `'0'` is ammo, `'P'` is portal, `'l'` is spawnLeft, `'r'` is spawnRight, and `'e'` is the eraser;
    - `toolForKey('x')` is null;
    - `TOOLS` has 14 entries.
  - `level-edits.test.ts`, placement:
    - `emptyLevel()` passes `parseLevelData` and is not `isPlayable`;
    - `cellAt(0, 0)` is `{ col: 0, row: 0 }`, `cellAt(799, 599)` is `{ col: 24, row: 19 }`, and `cellAt(800, 10)` and `cellAt(-1, 10)` are null;
    - the snapping table rows above, as exact equalities;
    - a spawn placed at cell (5, 10) gives a player from `createPlayer` (using `buildLevel` on a level that also has the other spawn and a portal) whose `bodyBox` bottom is ≤ 330 and > 300;
    - `applyTool` with a tile sets exactly that index;
    - placing a portal twice keeps one portal at the second spot, and the same for each spawn;
    - placing a coin twice at the same cell keeps one coin;
    - with 100 coins, a 101st returns the same object, and the result still passes `parseLevelData` (Review Focus 5).
  - `level-edits.test.ts`, erasing and immutability:
    - the eraser at a cell clears the tile and removes a coin, ammo, the portal and a spawn placed in that cell, but not a coin in the next cell;
    - the eraser on classic level 1's off-grid right spawn at `{ x: 803, y: 514 }` removes it when applied at `objectCell('spawnRight', thatSpawn)`;
    - the input `LevelData` is never mutated (deep-freeze it in the test).
  - `edit-history.test.ts`:
    - a stroke of five applies is undone in one `undo` (Review Focus 4);
    - `undo` then `redo` restores;
    - an `apply` after an `undo` clears redo (Review Focus 3);
    - `undo` on a fresh history returns false;
    - the limit drops the oldest steps.
  - Stroke clipping (Review Focus 4): applying through `cellAt` for points at (-50, 10), (10, 10) and (900, 10) inside one stroke changes only cell (0, 0), and throws nothing.
- [ ] **Step 2: Run them.** `npx vitest run packages/client/test/level-edits.test.ts packages/client/test/edit-history.test.ts packages/client/test/tools.test.ts`. Expected: FAIL, because the modules are missing.
- [ ] **Step 3: Implement** the three modules and export `spawnFacing` from shared.
- [ ] **Step 4: Verify.** Everything is green, and `npm run typecheck` and `npm run lint` pass.
- [ ] **Step 5: Commit** `feat(client): level editing model and undo history`.

---

### Task 2: Levels API client and the editor store

**Files:**
- Modify: `packages/client/src/net/levels-api.ts`
- Create: `packages/client/src/editor/editor-store.ts`
- Test: `packages/client/test/levels-api.test.ts`, `packages/client/test/editor-store.test.ts`

**Interfaces:**
- Consumes: Task 1, and `LevelDetail`, `LevelWrite`, `LevelError`, `parseLevelData` and `isPlayable` (shared).
- Produces:

```ts
// levels-api.ts (added)
export type ApiError = LevelError | 'rateLimited' | 'tooLarge' | 'network' | 'unknown';
export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiError };
export interface LevelsApi {
  get(id: string): Promise<ApiResult<LevelDetail>>;
  create(write: LevelWrite): Promise<ApiResult<LevelDetail>>;
  update(id: string, write: LevelWrite): Promise<ApiResult<LevelDetail>>;
  setPublished(id: string, published: boolean): Promise<ApiResult<LevelDetail>>;
  remove(id: string): Promise<ApiResult<null>>;
  duplicate(id: string): Promise<ApiResult<LevelDetail>>;
}
export function createLevelsApi(fetchFn?: typeof fetch): LevelsApi;

// editor-store.ts
export type SaveState = 'saved' | 'unsaved' | 'saving';
export interface EditorState {
  levelId: string | null; name: string; published: boolean;
  history: EditHistory; data: LevelData; // data mirrors history.current
  tool: Tool; saveState: SaveState; error: ApiError | null;
  setTool(tool: Tool): void;
  beginStroke(): void; paintAt(x: number, y: number): void; endStroke(): void; // world px
  undo(): void; redo(): void;
  rename(name: string): void;
  save(): Promise<boolean>;
  setPublished(published: boolean): Promise<boolean>;
  remove(): Promise<boolean>;
  clearError(): void;
}
export type EditorStore = StoreApi<EditorState>;
export function createEditorStore(
  api: LevelsApi,
  from: { levelId: string; name: string; published: boolean; data: LevelData } | null,
  defaultName: string,
): EditorStore;
```

Store rules:
- **New sessions:** `from === null` starts from `emptyLevel()` and `defaultName`, with `levelId` null, unpublished, and the tile 1 tool.
- **`saveState`** is `'saved'` when the current data and name equal the last saved ones (compare `JSON.stringify` snapshots), `'unsaved'` otherwise, and `'saving'` while a request runs. Undoing back to the saved snapshot reads `'saved'` (Review Focus 3).
- **`save()`:**
  - does nothing and returns false while already saving;
  - POSTs when `levelId` is null and stores the new id, and PUTs otherwise;
  - on success, takes `published` from the answer and updates the saved snapshot;
  - on failure, sets `error` and stays `'unsaved'`, and the history is untouched (Review Focus 1 and 2).
- **`setPublished(true)`** saves first when there are unsaved changes. It answers `notPublishable` locally, with no request, when `!isPlayable(data)`.
- **`remove()`** deletes the level. A level that was never saved needs no request and returns true.

`createLevelsApi`:
- maps statuses through the JSON body's `error` field: 400, 401, 403, 404, 409 and 429 become `rateLimited` and the like, 413 becomes `tooLarge`, and anything else `unknown`;
- a thrown `fetch` becomes `network`;
- request bodies are JSON;
- answers are read as `{ level }`, or nothing for a 204.

- [ ] **Step 1: Write the failing tests.**
  - `levels-api.test.ts`, with a fake `fetchFn`:
    - `create` POSTs `/api/levels` with a JSON body and returns the level;
    - `update` PUTs `/api/levels/id`;
    - `setPublished(id, false)` POSTs `/api/levels/id/unpublish`;
    - `remove` handles a 204;
    - a 409 `{ error: 'notPublishable' }` maps to `notPublishable`, a 429 to `rateLimited`, and a rejected fetch to `network`.
  - `editor-store.test.ts`, with a fake `LevelsApi`. Saving and saved state:
    - a new session starts `'saved'` with `levelId` null;
    - `paintAt` makes it `'unsaved'`;
    - undoing that paint returns to `'saved'`;
    - the first `save` calls `create` and stores the id; the next `save` calls `update`;
    - while a save is pending a second `save` returns false and calls the API once.
  - `editor-store.test.ts`, failures:
    - a published level edited to have no portal: `save` gets `notPublishable` from the fake, `error` is `notPublishable`, `saveState` is `'unsaved'`, and `data` still has the edit (Review Focus 1);
    - `network` then success: the first save fails, and the retry saves (Review Focus 2).
  - `editor-store.test.ts`, publishing, removal and renaming:
    - `setPublished(true)` on an unplayable level returns false with `error` `notPublishable` and makes no request;
    - `setPublished(true)` with unsaved changes calls `update` and then `setPublished`;
    - `remove` on a never-saved level makes no request;
    - `rename(' Torre ')` stores `'Torre'` and marks the level unsaved.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Verify.** Everything is green, and typecheck and lint pass.
- [ ] **Step 5: Commit** `feat(client): levels API client and editor store`.

---

### Task 3: Navigation and the My levels screen

**Files:**
- Modify: `packages/client/src/ui/store.ts`, `packages/client/src/main.ts`, `packages/client/src/ui/App.tsx`, `packages/client/src/ui/screens/MenuScreen.tsx`, `packages/client/src/ui/screens/lazy-screens.ts`, `packages/client/src/ui/styles.css`, both locale files
- Create: `packages/client/src/ui/screens/MyLevelsScreen.tsx`
- Test: `packages/client/test/ui-store.test.ts`

**Interfaces:**
- Consumes: `LevelsApi`, `createEditorStore` and `EditorStore` (Task 2), and `fetchLevels`, `LEVELS_QUERY_KEY`, `LevelThumbnail` and `updatedLabel` (stage 3).
- Produces:
  - `Screen` adds `'myLevels' | 'editor' | 'editorTest'`;
  - `UiState.editor: EditorStore | null`;
  - `UiActions.levels: LevelsApi`;
  - `openMyLevels(): void`, which needs an account and otherwise does nothing;
  - `openEditor(levelId: string | null): Promise<boolean>`:
    - `null` starts a new level named `t('editor.defaultName')`;
    - an id loads it with `levels.get`;
    - on success it sets `editor` and the `'editor'` screen;
    - on failure it sets `myLevelsError` and stays;
  - `closeEditor(): void`, which clears `editor` and goes to `'myLevels'`;
  - `setEditorScreen(screen: 'editor' | 'editorTest'): void`, used by the scenes;
  - `myLevelsError: ApiError | null`.

My levels screen, reached from a MY LEVELS button on the signed-in menu, between PLAY and PROFILE:
- **Tabs:** MINE and ALL.
- **MINE:**
  - lists `fetchLevels({ mine: true })` rows: thumbnail, name, PUBLISHED or DRAFT, and "updated …";
  - actions per row: EDIT, PUBLISH/UNPUBLISH (disabled with the "needs spawns and portal" hint when unplayable), COPY (duplicate), and DELETE, which opens a confirmation dialog ("Delete {name}? This can't be undone.");
  - a NEW LEVEL button, disabled at 10 levels with the hint "You have 10 levels: delete one to make another.";
  - the 10-level cap is checked against the MINE list's length, and the server stays the authority.
- **ALL:** lists published levels from everyone with a COPY button; a copy lands in MINE.
- **Results and errors:**
  - every action invalidates `LEVELS_QUERY_KEY`;
  - errors show as a line using `levelError.<code>` i18n keys;
  - a successful COPY switches to MINE.
- **BACK** returns to the menu.

The screen lives in its own lazy chunk, which also gets TanStack Query: give it its own `QueryClientProvider`, sharing the module-level client exported from RoomsScreen through a new `ui/query-client.ts`.

- [ ] **Step 1: Write the failing store tests.**
  - With no account, `openMyLevels` stays on the menu. With an account, it goes to `'myLevels'`.
  - `openEditor(null)` creates an editor store whose name is the default and whose screen is `'editor'`.
  - `openEditor('x')` with a fake `levels.get` returning `notFound` stays on `'myLevels'` with `myLevelsError` `notFound`.
  - `closeEditor` clears `editor` and shows `'myLevels'`.
  - `signOut` while editing still reloads; the leave warning is the toolbar's job (Task 5).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the store, the `main.ts` wiring (`levels: createLevelsApi()`), the menu button, the screen, the CSS and the i18n.
  - New i18n keys: `menu.myLevels`, `myLevels.*` (title, mine, all, new, edit, publish, unpublish, copy, delete, confirmDelete, cancel, published, draft, full, empty, loadError, back), `editor.defaultName` ("Mi nivel" / "My level"), and `levelError.*` for every `ApiError`.
- [ ] **Step 4: Verify.** Everything is green, and typecheck and lint pass.
- [ ] **Step 5: Commit** `feat(client): My levels screen`.

---

### Task 4: Editor scene

**Files:**
- Create: `packages/client/src/scenes/editor-scene.ts`
- Modify: `packages/client/src/game-config.ts`, `packages/client/src/scenes/menu-scene.ts`, `packages/client/src/render/depth.ts` (if new depths are needed)
- Test: browser check. The scene only translates input into the Task 1 and 2 functions, which are unit-tested.

**Interfaces:**
- Consumes: `EditorStore` (Task 2), `cellAt`, `toolForKey` and `TOOLS` (Task 1), and `UiStore.editor`, `closeEditor` and `setEditorScreen` (Task 3).
- Produces: scene key `'editor'`, started with no data. It reads `ui.getState().editor`.

Behaviour:
- **Starting:** `MenuScene` subscribes to the UI store. When `editor` becomes non-null and the screen is `'editor'`, it starts `'editor'`.
- **Leaving:** `EditorScene` subscribes too. When `editor` becomes null it starts `'menu'`. All subscriptions end on shutdown.
- **Drawing:**
  - `LEVEL_BACKGROUND`;
  - a blank tilemap layer from `make.tilemap({ width: 25, height: 20, tileWidth: 32, tileHeight: 30 })` with the tileset at firstgid 1, kept in sync through `putTileAt` / `removeTileAt` for changed indexes only;
  - a faint grid as one `Graphics` (1 px lines, white at 8 % alpha);
  - objects redrawn from `data` on every change: coin and ammo images (as `PickupViews` draws them), the portal image, and the spawns as the player and enemy sprite frame 0 with "L" / "R" labels;
  - a hover outline on the cell under the pointer.
- **Input:**
  - pointer down starts a stroke and `paintAt`; pointer move while down `paintAt`; pointer up or out ends the stroke;
  - object tools place only on pointer down, never by dragging;
  - keys: `toolForKey` picks tools; Ctrl+Z undoes; Ctrl+Y or Ctrl+Shift+Z redoes;
  - keys are ignored while a text input has focus (`document.activeElement` is an input or textarea), so typing a name in a dialog doesn't change tools.
- The scene never talks to the network.

- [ ] **Step 1: Read the Phaser 4 docs** for Tilemap (`putTileAt`, `removeTileAt`, blank layers), Input pointer events and Keyboard. Note anything that differs from Phaser 3 in the ledger.
- [ ] **Step 2: Implement** the scene and the scene switching.
- [ ] **Step 3: Verify.** `npm test`, typecheck and lint pass.
- [ ] **Step 4: Browser check** (Playwright, `npm run dev`, signed in), the toolbar not being built yet:
  - select tools with the number and letter keys;
  - paint tiles by click and by drag;
  - place a coin, ammo, portal and both spawns;
  - erase;
  - undo and redo with the keyboard;
  - take screenshots.
- [ ] **Step 5: Commit** `feat(client): editor scene`.

---

### Task 5: Floating toolbar and editor dialogs

**Files:**
- Create: `packages/client/src/ui/editor/EditorToolbar.tsx`, `packages/client/src/ui/editor/toolbar-prefs.ts`, `packages/client/src/ui/editor/EditorDialogs.tsx`
- Modify: `packages/client/src/ui/App.tsx` (render the toolbar on `'editor'`), `packages/client/src/ui/styles.css`, both locale files
- Test: `packages/client/test/toolbar-prefs.test.ts`

**Interfaces:**
- Consumes: `EditorStore` (Task 2), `TOOLS` and `sameTool` (Task 1), `PixelDialog`, and the debug panel's prefs pattern (`debug/panel-prefs.ts`).
- Produces:
  - `loadToolbarPrefs(storage, fallback, bounds)` and `saveToolbarPrefs(storage, prefs)` under the key `'bng:editor-toolbar'`, with the same shape and clamping as `PanelPrefs`;
  - `confirmLeave(state: EditorState): 'leave' | 'ask'`, which is `'ask'` when `saveState !== 'saved'`.

Toolbar:
- A `.pixel-panel` positioned absolutely over the canvas.
- **Title row:** "EDITOR · {name}" plus the save state ("Saved" / "Unsaved changes" / "Saving..."). Dragging the title moves the panel, clamped inside the game area; a click without movement collapses it, using the debug panel's `isTitleClick`. The position is saved.
- **Tool grid:**
  - the 8 tiles drawn from `level-tiles.png` with a CSS background (64 × 30 px per tile, scaled);
  - coin, ammo and portal icons from their textures;
  - L and R spawn buttons and an eraser button;
  - each shows its key in a corner; the selected tool is highlighted with `aria-pressed`.
- **Buttons:**
  - TEST, disabled with a title hint when the level isn't playable;
  - SAVE, disabled while saving or when saved;
  - UNDO and REDO;
  - a ≡ menu (Radix DropdownMenu from `radix-ui`, portalled into `#ui`) with RENAME, PUBLISH/UNPUBLISH, DELETE and BACK TO MY LEVELS.
- **Error line:** `levelError.<code>`. For `notPublishable` on save, the text is "A published level needs both spawns and the portal. Unpublish it first, or put them back."

Dialogs:
- **Rename:** a field with `levelNameSchema` validation.
- **Delete:** confirm, then `remove()`, then `closeEditor()`.
- **Leave:** when `confirmLeave` says `'ask'`, BACK opens "You have unsaved changes. Leave without saving?" with LEAVE and STAY.
- **Closing the tab:** `beforeunload` is registered while `saveState !== 'saved'`.
- **TEST:** calls `ui.setEditorScreen('editorTest')`, and the editor scene starts `'test'` (Task 6).

- [ ] **Step 1: Write the failing tests.**
  - `toolbar-prefs.test.ts`: the same cases as the debug panel prefs (bad JSON gives the fallback; an off-screen position is clamped) under the new key.
  - `confirmLeave` gives `'leave'` when saved and `'ask'` when unsaved or saving (add it to `editor-store.test.ts`).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the toolbar, dialogs, CSS and i18n.
  - New keys:
    - `editor.*`: title, saved, unsaved, saving, test, testNeedsPieces, save, undo, redo, menu, rename, publish, unpublish, delete, back, leaveTitle, leaveText, leave, stay, renameTitle, deleteText
    - `editor.tool.*`, one per tool, used as `aria-label`s
- [ ] **Step 4: Verify.** Everything is green, and typecheck and lint pass.
- [ ] **Step 5: Browser check:**
  - My levels, then NEW LEVEL, then paint a small level with the toolbar;
  - SAVE, and it shows in My levels as a DRAFT;
  - EDIT it again: the data is loaded;
  - PUBLISH, then remove the portal and SAVE: the `notPublishable` message shows and the change is kept;
  - undo, then SAVE;
  - BACK with unsaved changes asks first;
  - RENAME;
  - DELETE from the menu, with confirmation;
  - drag and collapse the toolbar, then reload: the position is kept;
  - screenshots in es and en.
- [ ] **Step 6: Commit** `feat(client): editor toolbar and dialogs`.

---

### Task 6: Test mode

**Files:**
- Create: `packages/client/src/editor/test-run.ts`, `packages/client/src/scenes/test-scene.ts`, `packages/client/src/ui/screens/EditorTestScreen.tsx`
- Modify: `packages/client/src/game-config.ts`, `packages/client/src/scenes/editor-scene.ts`, `packages/client/src/ui/App.tsx`, both locale files
- Test: `packages/client/test/test-run.test.ts`

**Interfaces:**
- Consumes: `createWorld`, `stepWorld`, `buildLevel`, `isPlayable`, `InputKeys` and `TICK_MS` (shared); `KeyboardInput`, `PlayerView`, `PickupViews` and `BulletViews` (client render); the `EditorStore`; and `setEditorScreen`.
- Produces:

```ts
// test-run.ts
export type TestOutcome = 'playing' | 'completed';
export class TestRun {
  /** Throws when the level isn't playable (the toolbar never offers Test then). */
  constructor(data: LevelData);
  get world(): WorldState; get level(): Level; get outcome(): TestOutcome;
  /** One 60 Hz tick for the one player ('tester', left side). Stops changing once completed. */
  step(keys: InputKeys): WorldEvent[];
  restart(): void;
}
```

Scene and screen:
- **Starting:** `EditorScene` starts `'test'` when the UI screen becomes `'editorTest'`.
- **`TestScene`:**
  - builds a `TestRun` from `editor.getState().data`;
  - draws it the way `LevelScene` does: tilemap, portal, pickups, player and bullets;
  - steps at a fixed 60 Hz with an accumulator, as `LevelScene` does;
  - updates the HUD through `ui.setHud`, and plays the jump and shot sounds.
- **Esc** calls `setEditorScreen('editor')`, and the scene returns to `'editor'`. The editor store was never touched, so the player is back where they left off.
- **Restart:** R restarts the run at any time.
- **`EditorTestScreen` (React):** the HUD counters plus a top banner, "TEST · Esc: back to the editor · R: restart". When `outcome` becomes `'completed'`, the banner shows "Portal reached! Coins {n}/{total} · R: again · Esc: editor". The scene pushes `outcome` and the coin counts through a small `ui` setter, `setTestStatus({ completed, coins, totalCoins })`.

- [ ] **Step 1: Write the failing tests** (`test-run.test.ts`):
  - `new TestRun(emptyLevel())` throws.
  - On classic level 1's data, the player starts at the left spawn (equal to `createPlayer('tester', 'left', level)`).
  - Stepping with `right: true` moves it right.
  - On a level whose portal covers the left spawn (left spawn and portal snapped from the same cell), the first `step` returns a `levelCompleted` event and `outcome` becomes `'completed'`. Further steps leave the world unchanged.
  - `restart` returns to the start, with `outcome` back to `'playing'` and the coins restored.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `TestRun`, the scene, the screen, the store setter and the i18n keys `editorTest.banner`, `editorTest.completed`.
- [ ] **Step 4: Verify.** Everything is green, and typecheck and lint pass.
- [ ] **Step 5: Browser check:**
  - build a small playable level in the editor and TEST it;
  - move, jump, pick a coin, reach the portal: the completion banner shows;
  - R restarts; Esc returns to the editor with the level and the tool unchanged;
  - TEST is disabled while a spawn is missing;
  - take screenshots.
- [ ] **Step 6: Commit** `feat(client): test a level in the editor`.

---

## Notes for the executor

- The UI overlay (`#ui`) passes pointer events through except on `.interactive` elements, so the toolbar must carry `interactive`; clicks elsewhere reach the canvas.
- Phaser's keyboard captures W, A, S, D and SPACE in `KeyboardInput` for the test scene. The editor scene must not capture keys the dialogs need. Use `keyboard.on('keydown', ...)` without `addKey` captures.
- Keep the editor and test scenes out of the production critical path; they ship in the game chunk with the other scenes, which is fine.
- The spec's open confirmation, publishable means both spawns, is already what stage 3 enforces. This plan follows it.
