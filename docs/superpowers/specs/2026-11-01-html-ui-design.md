# HTML UI and responsive game: design

Date: 2026-11-01
Status: approved

## Intent

Today every screen in BulletsNdGuns is drawn by Phaser on the 800x600 canvas: the loader's progress bar, the main menu (made of PNG images with hover-swap copies), the credits and how-to-play popups (also PNGs, with the Spanish text baked into the image), the "waiting" spinner (a spritesheet), the ammo/coin HUD, and the game-over result. Only the "match in progress" notice is HTML, styled inline in `index.html`.

Upcoming features (room list, player profile, and similar) are forms, lists and panels. They are much easier to build in HTML/CSS than in Phaser game objects. This work moves **all UI out of Phaser into an HTML layer** built with React, so those features have a home. Phaser keeps drawing only the game world (tilemap, portal, players, bullets, pickups).

At the same time the game stops being a fixed 800x600 box: it scales to fill the browser window.

The UI gets a new look, the "Pixel arcade" style the user picked from mockups. It uses a pixel font and hard-edged boxes with solid drop shadows, with colours taken from the game's tileset, so the UI matches the pixel-art sprites and tiles.

This does **not** change gameplay. The earlier rewrite's rule "never change UI or art" (`docs/superpowers/specs/2026-11-01-rewrite-design.md`) is lifted for the UI only. Gameplay, levels, sprites, sounds, controls and timings stay exactly as they are.

## Goals

1. Every screen and overlay is HTML rendered by React: loader, menu, waiting state, how-to-play, credits, HUD, game over, match in progress. No Phaser text, images or input handling remains for UI.
2. Phaser and React share state through one small store, so a scene can update the UI and the UI can trigger game/network actions without either knowing the other's internals.
3. The game area keeps its 4:3 aspect ratio and its 800x600 world coordinates, and scales up or down to fit the window. Pixels stay crisp. Dark bars fill the leftover space. The UI layer covers exactly the game area and scales with it, so the HUD stays in the corner of the game, not the corner of the window.
4. Pixel arcade styling across all screens (details below).
5. All player-facing text comes from the i18n locale file (`packages/client/src/i18n/locales/es.ts`), including text currently baked into PNGs. Spanish stays the only locale.
6. The code structure makes adding a new screen (room list, profile) straightforward: a new component plus a new screen value in the store.

## Non-goals

- No gameplay change of any kind: physics, controls, timings, levels, sprites, sound effects, netcode.
- No "back to menu" or "play again" after game over. The server does not support re-queueing; game over stays a final screen as today.
- No settings, volume or options screens.
- No mobile/touch controls or mobile-specific layout. It should still render sensibly on a small window, but play stays keyboard-only.
- No room list, profile, or other new features. Those come later and this work only prepares for them.
- No server changes.
- No new locales.

## Anti-goals (failure even if it "works")

- The game feels different: input lag, dropped key presses, or keys going to an HTML element instead of the game while playing. For example, a focused button eating `SPACE`.
- The UI and the game area drift apart on resize: the HUD floats outside the play area, or overlays don't line up with the canvas.
- Blurry, smeared sprites when the game is scaled.
- React re-rendering every frame. HUD updates should only re-render when ammo or coins actually change.
- Over-engineering: Redux-style ceremony, routers, or abstraction layers for a handful of screens. A newcomer should see within minutes how a scene updates the HUD and how the COMENZAR button reaches the server.

## Constraints and decided choices

Decided by the user:

- **React** (latest) for the UI layer, with TypeScript and JSX (`.tsx`).
- **Zustand** is allowed and is the chosen store. Its vanilla store (`createStore` from `zustand/vanilla`) is readable and writable from Phaser scenes, and components subscribe through Zustand's React hook with selectors.
- **Radix UI** primitives are preferred for interactive widgets: modals, dropdowns, tooltips and similar. Use the Radix Dialog for the how-to-play and credits modals, since it handles `Escape`, backdrop click, focus trapping and focus return. Radix ships unstyled, so all styling stays Pixel arcade. Don't add Radix components that nothing uses yet. Whether to install the per-component packages (`@radix-ui/react-dialog`) or the combined `radix-ui` package is the builder's call.
- **TanStack Query** is allowed but has no use yet: there are no HTTP calls, only socket events. Do not add it in this work.
- **Visual direction: Pixel arcade** (option B from the mockups). Mockup file: `.superpowers/brainstorm/1307-1793566167/content/visual-style.html`.
- **Scaling**: keep the 800x600 world and scale it to fit the window with letterboxing. Do not show more of the level on bigger screens.

Existing project facts the builder must respect:

- npm workspaces monorepo. Client is `packages/client` (Vite 8, Phaser 4.2, socket.io-client 4.8, TypeScript 6.0.3 pinned at the root).
- Phaser 4's API differs from Phaser 3. Check `node_modules/phaser/types/phaser.d.ts` or https://phaser.io/oss/docs before writing Phaser code. Phaser 4 has `Phaser.Scale.FIT` and `Phaser.Scale.CENTER_BOTH`.
- The client's ESLint glob (`packages/*/{src,test}/**/*.ts` in the root `package.json`) and Vitest include (`test/**/*.test.ts` in `vitest.config.ts`) cover `.ts` only. They must be extended for `.tsx` where needed. The client tsconfig needs JSX enabled.
- `main.ts` creates the Phaser game only after the server's `joined` event, and reloads the page on a second `joined` (socket.io reconnect). Keep that behaviour.
- Code in English; player-facing text in Spanish via `t()`.

## Screens

The UI is a single React tree mounted in an overlay element that sits exactly on top of the canvas. The store holds which screen is showing. Phaser scenes set the screen as they start, so the network-driven flow stays where it is today. The "match in progress" notice overrides everything else.

Screen flow: `connecting` → `loading` → `menu` → `level` → `gameOver`. `matchInProgress` can appear from `connecting` and replaces whatever is showing.

Look shared by all screens (Pixel arcade):

- Font: **Press Start 2P**, self-hosted (for example via `@fontsource/press-start-2p`), not loaded from Google's CDN, so it works offline and in Docker. The builder must check that it renders the Spanish characters used (á é í ó ú ñ ¿ ¡). If a glyph is missing, pick another pixel font that has them and note the choice.
- Palette: dark navy background `#14182b`, panel `#3a3f63`, primary purple `#7b3fbf` (from the purple tile), brick red `#8a3b2a` / `#b0533c`, highlight yellow `#ffd23f`, white text and borders. Builder may tune shades.
- Boxes and buttons: square corners, 3px white border, solid 4px black drop shadow. Hover: lighter background or yellow border. Pressed: shadow removed and box shifted 4px down/right.
- Text: uppercase in buttons and titles.
- A strip of brick-tile pattern along the bottom of full-screen menus, as in the mockup. CSS pattern or the real `level-tiles.png` cropped, builder's call.
- Pixel-perfect rendering: `image-rendering: pixelated` on any sprite images used in the UI.

### Connecting (new)

Shown from page load until the server's `joined` event. Navy background, centered blinking "CONECTANDO..." text. Today the page is blank during this time.

### Loading

Replaces the Phaser-drawn loader. Phaser's loader scene still loads all assets and reports progress (0–1, plus the current file key) into the store. The HTML screen shows a pixel-bordered progress bar, the percentage, and the current asset line (the existing `loader.loading` and `loader.asset` texts). When loading completes, the loader scene starts the menu scene, which sets the screen to `menu`.

### Menu

- Title "BULLETS AND GUNS" in two lines, yellow with layered red/black hard shadow, as in the mockup.
- **COMENZAR** button (primary purple). Click sends `ready` through the network client, same as today. After the click it becomes a non-interactive, blinking "ESPERANDO..." state (replaces the `waiting.png` spritesheet; text "Esperando" with animated dots or a blink, builder's call) until `levelStarted` arrives.
- **CÓMO JUGAR** button (panel colour). Opens the how-to-play modal.
- Small square **?** or **i** button in the top-right corner. Opens the credits modal (today's info button).
- Hovering COMENZAR or CÓMO JUGAR plays the existing `button-hover.ogg` at volume 0.2, as today. Play it from HTML (`HTMLAudioElement`) or through Phaser's sound manager, builder's call. Phaser uses HTML5 audio already (`disableWebAudio: true`).

The Phaser menu scene stays as an empty scene that waits for `levelStarted` and starts the level. It draws nothing, since the HTML menu is opaque and covers it.

### How-to-play modal

Pixel-bordered panel over a dimmed menu. Text taken from today's PNG, now in the locale file:

> **¿Cómo jugar?**
> Utilice las teclas **W**, **A**, **S**, **D** para moverse.
> Presione **espacio** para disparar.
> Elimine todos los **enemigos**.
> Recolecte todas las **monedas**.

Keep today's colour highlights, mapped to the new palette: keys and "espacio" in a light purple or blue that stays readable on the panel, "enemigos" red, "monedas" yellow. Close with a click anywhere on the modal or backdrop (as today) and with `Escape`. Drop the old footer hint "Haga click en cualquier zona de esta ventana para cerrarla" in favour of a visible **CERRAR** button or a small ✕, builder's call.

Note: the original text mentions `S` though `S` does nothing in-game. Keep the text as is. Changing the instructions is out of scope.

### Credits modal

Same modal style. Text from today's `credits.png`, moved into the locale file:

- **Créditos**
- Desarrollado por Jesús Imitola, Santiago Guerrero y Julio Mendoza.
- **Diseños**: Sprites de personajes por Disthron.
- **Sonidos**: Efecto de salto por LittleRobotSoundFactory. Efecto de disparo por josepharaoh99.
- **Desarrollo y Creación**: Mapas hechos con Tiled. Desarrollado en Phaser 4. (Updated from "Phaser 3" because the game now runs on Phaser 4. Also adds the missing accent in "Creación". Both are my calls.)

Section headers in yellow and names in a highlight colour, as in the PNG. Names stay plain text, not links, since no source URLs are recorded.

### HUD (level)

Shown while a level is running, over the canvas, top-left, as in the mockup: two small stacked boxes (navy fill, 2px white border), each with the game's own sprite as an icon (`ammo-pickup.png`, `coin.png`, pixelated) and the count, e.g. "x12" and "x03". Ammo and coins come from the local player's predicted state, written to the store only when a value changes (the current `Hud` class already de-duplicates; keep that). The HUD must never take pointer events or keyboard focus.

Keep the accessible meaning: the counts need a text label for screen readers (`Munición`, `Monedas` from the existing `hud.ammo` / `hud.coins` keys), even though the visual shows icons.

### Game over

Full overlay with the result in large pixel text, centred: GANASTE (green `#00ff0d`), PERDISTE (red `#ff0000`), EMPATADO (white), the same words and colours as today (`result.*` keys), with the hard drop shadow style. The game-over Phaser scene computes the result as today and puts it in the store. No buttons (see non-goals).

### Match in progress

Same trigger and texts as today (`matchInProgress.*` keys, also sets `document.title`), restyled to Pixel arcade: navy full-window overlay, title, heading in yellow, body in white. Remove the inline-styled markup from `index.html` and the `ui/match-in-progress.ts` DOM code; it becomes a React screen. Keep the dev-only `window.__showMatchInProgress` hook working (it can set the store instead). This overlay may cover the whole window rather than only the game area, since the game is not running.

## Scaling

- The page fills the window with a dark background (`#000` or the navy). No scrollbars at any window size.
- One "stage" element holds both the canvas and the UI overlay. The stage keeps a 4:3 ratio, is as large as fits in the window, and is centred.
- Phaser uses `Scale.FIT` (or `Scale.NONE` inside a CSS-sized stage, builder's call) with the world still 800x600. `pixelArt: true` stays. The canvas must look crisp at non-integer scales (`image-rendering: pixelated`).
- The UI overlay is positioned with `inset: 0` inside the stage. UI sizes scale with the stage, using container-query units (`cqw`/`cqh`) or a CSS variable holding the current scale. Designing the UI in "800x600 units" and scaling it keeps mockup proportions at any size.
- Resizing the window mid-game must not reset or pause the game.

Possible approach (builder's call): make the stage a CSS box with `width: min(100vw, 100vh * 4/3)` and `aspect-ratio: 4/3`. Phaser's parent is the stage, set to `Scale.FIT`, `CENTER_BOTH`. The overlay is a sibling of Phaser's canvas inside the stage.

## Keyboard focus

Gameplay keys (`W`, `A`, `D`, `SPACE`) are read by Phaser's keyboard plugin on `window`. Moving to HTML buttons creates new risks the builder must handle:

- After clicking COMENZAR, the button must not keep focus such that `SPACE` re-activates it during play. Unmount it, `blur()` it, or make it non-interactive once clicked.
- During the `level` screen the overlay must have `pointer-events: none` and contain no focusable elements.
- Phaser may call `preventDefault` on captured keys. Check that this does not block typing in future HTML inputs (room list, profile). If it would, note it in the code for the next feature. Fixing it is not required now.

## Architecture

The pieces, as a guide. Names are suggestions.

- `ui/store.ts`: one Zustand vanilla store. State: `screen`, `loading` (progress, current file), `hud` (ammo, coins), `result` (win/lose/tie), `menu` (waiting flag), and `matchInProgress`. Also exposes the actions the UI needs, e.g. `ready()`, which calls the network client. Phaser scenes write into it; React reads with selectors. Prefer passing the network client in when the store or app is created over importing a global.
- `ui/App.tsx` plus one component per screen and one for the modals.
- `ui/styles.css` (or CSS modules, builder's call): Pixel arcade tokens (colours, border, shadow) as CSS variables and shared button/panel classes.
- `main.ts`: mounts React immediately (screen `connecting`), creates the store, and still creates the Phaser game on `joined`, giving it the store through the existing registry-based `GameServices`.
- Scenes: `LoaderScene` writes progress. `MenuScene` sets `screen: 'menu'` and waits for `levelStarted`. `LevelScene` sets `screen: 'level'` and pushes HUD values (the `Hud` class becomes a thin adapter writing to the store, or is removed). `GameOverScene` sets the result.
- `render/hud.ts`, the Phaser-drawn parts of `loader-scene.ts` and `menu-scene.ts`, and `ui/match-in-progress.ts` are removed or reduced as above.
- The `waiting` animation registration and `ANIMATION_WAITING`, if no longer used.

Assets to delete once unused, from `packages/client/public/assets/`: `locales/es/title.png`, `credits.png`, `how-to-play-popup.png`, `play-button.png`, `play-button-hover.png`, `how-to-play-button.png`, `how-to-play-button-hover.png`, `waiting.png`, and `textures/info-button.png`, `textures/menu-background.png`. Remove the matching `TextureKey` entries and loader calls. If `locales/es/` ends up empty, `localizedAsset()` can go too. Keep the i18n `t()` function.

## Testing and verification

- Unit tests (Vitest) for the store: screen transitions, HUD updates de-duplicated, `ready()` calls the network client once. Component tests are optional; if added, configure a DOM environment for the client project only.
- Existing tests keep passing. `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` all pass.
- Manual check in the browser with two clients (Playwright is available). Cover: connecting, loading, menu, both modals, COMENZAR to waiting to level, HUD counts changing on pickup/shot, game over result, and match in progress (third client while a match runs). Check sizes: small (e.g. 640x400), 1920x1080, a tall portrait window, and live resize during a level. Sprites crisp, HUD inside the game area, `SPACE` never triggers a button.

## Smaller decisions already made

These were settled while writing the design (designer's calls, not the user's):

- CÓMO JUGAR and the credits button stay usable while waiting for other players, as today. Only COMENZAR changes state.
- The game-over screen has an opaque navy backdrop. Today's game-over scene has a black background, not the level behind it.
- If the server is never reached, the connecting screen stays up and socket.io keeps retrying. No error screen. Today the page just stays blank.
- Coloured words in the how-to-play and credits text are stored in the locale file in a way the component can style (for example, a simple markup like `*enemigos*`, or separate keys per fragment). Builder picks the format.

## Left to the builder

- Exact component and file layout, CSS approach (plain CSS, CSS modules), and Vite React plugin choice.
- `Scale.FIT` vs CSS-sized stage, as long as the scaling rules above hold.
- Fine-tuning of palette shades, spacing, animations (blink speed, button press), as long as it reads as the mockup's Pixel arcade style.
- Whether `Hud` survives as an adapter class or is folded into `LevelScene`.
