import { ConnectingScreen } from './screens/ConnectingScreen.tsx';
import { GameOverScreen } from './screens/GameOverScreen.tsx';
import { HudScreen } from './screens/HudScreen.tsx';
import { LoadingScreen } from './screens/LoadingScreen.tsx';
import { MatchInProgressScreen } from './screens/MatchInProgressScreen.tsx';
import { MenuScreen } from './screens/MenuScreen.tsx';
import { useUi } from './UiStoreContext.tsx';

export function App() {
  const screen = useUi((s) => s.screen);
  const matchInProgress = useUi((s) => s.matchInProgress);
  if (matchInProgress) return <MatchInProgressScreen />;
  switch (screen) {
    case 'connecting':
      return <ConnectingScreen />;
    case 'loading':
      return <LoadingScreen />;
    case 'menu':
      return <MenuScreen />;
    case 'level':
      return <HudScreen />;
    case 'gameOver':
      return <GameOverScreen />;
  }
}
