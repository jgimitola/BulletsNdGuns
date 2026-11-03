import { Suspense } from 'react';
import { ConnectingScreen } from './screens/ConnectingScreen.tsx';
import { GameOverScreen } from './screens/GameOverScreen.tsx';
import { HudScreen } from './screens/HudScreen.tsx';
import { LoadingScreen } from './screens/LoadingScreen.tsx';
import { LobbyScreen } from './screens/LobbyScreen.tsx';
import { MenuScreen } from './screens/MenuScreen.tsx';
import { LazyEditorScreen, LazyMyLevelsScreen, LazyRoomsScreen } from './screens/lazy-screens.ts';
import { NicknameRevokedDialog } from './dialogs/NicknameRevokedDialog.tsx';
import { PingIndicator } from './PingIndicator.tsx';
import type { Screen } from './store.ts';
import { useUi } from './UiStoreContext.tsx';

/** Where latency matters and the top-right corner is free (the menu keeps its credits button). */
const SHOWS_PING: ReadonlySet<Screen> = new Set(['rooms', 'lobby', 'level']);

export function App() {
  const screen = useUi((s) => s.screen);
  const revoked = useUi((s) => s.nicknameRevoked);
  // `t` reads the i18n module, not React state. Subscribing here re-renders the whole tree (nothing
  // below is memoised) when the language changes, so every text is translated again.
  useUi((s) => s.locale);
  return (
    <>
      <CurrentScreen screen={screen} />
      {SHOWS_PING.has(screen) && <PingIndicator />}
      {/* Mid-match the notice waits for the result screen, so it never covers the game. */}
      {revoked !== null && screen !== 'level' && <NicknameRevokedDialog nickname={revoked} />}
    </>
  );
}

function CurrentScreen({ screen }: { screen: Screen }) {
  switch (screen) {
    case 'connecting':
      return <ConnectingScreen />;
    case 'loading':
      return <LoadingScreen />;
    case 'menu':
      return <MenuScreen />;
    case 'rooms':
      return (
        // Normally prefetched from the menu; the fallback only shows on a slow connection.
        <Suspense fallback={<div className="screen screen--menu" />}>
          <LazyRoomsScreen />
        </Suspense>
      );
    case 'lobby':
      return <LobbyScreen />;
    case 'level':
      return <HudScreen />;
    case 'gameOver':
      return <GameOverScreen />;
    case 'myLevels':
      return (
        <Suspense fallback={<div className="screen screen--menu" />}>
          <LazyMyLevelsScreen />
        </Suspense>
      );
    case 'editor':
    case 'editorTest':
      return (
        <Suspense fallback={null}>
          <LazyEditorScreen />
        </Suspense>
      );
  }
}
