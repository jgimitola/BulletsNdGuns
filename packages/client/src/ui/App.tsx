import { Suspense } from 'react';
import { ConnectingScreen } from './screens/ConnectingScreen.tsx';
import { GameOverScreen } from './screens/GameOverScreen.tsx';
import { HudScreen } from './screens/HudScreen.tsx';
import { LoadingScreen } from './screens/LoadingScreen.tsx';
import { LobbyScreen } from './screens/LobbyScreen.tsx';
import { MenuScreen } from './screens/MenuScreen.tsx';
import { LazyRoomsScreen } from './screens/lazy-screens.ts';
import { useUi } from './UiStoreContext.tsx';

export function App() {
  const screen = useUi((s) => s.screen);
  // `t` reads the i18n module, not React state. Subscribing here re-renders the whole tree (nothing
  // below is memoised) when the language changes, so every text is translated again.
  useUi((s) => s.locale);
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
  }
}
