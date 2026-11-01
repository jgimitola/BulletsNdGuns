import { ConnectingScreen } from './screens/ConnectingScreen.tsx';
import { GameOverScreen } from './screens/GameOverScreen.tsx';
import { HudScreen } from './screens/HudScreen.tsx';
import { LoadingScreen } from './screens/LoadingScreen.tsx';
import { LobbyScreen } from './screens/LobbyScreen.tsx';
import { MenuScreen } from './screens/MenuScreen.tsx';
import { RoomsScreen } from './screens/RoomsScreen.tsx';
import { useUi } from './UiStoreContext.tsx';

export function App() {
  const screen = useUi((s) => s.screen);
  switch (screen) {
    case 'connecting':
      return <ConnectingScreen />;
    case 'loading':
      return <LoadingScreen />;
    case 'menu':
      return <MenuScreen />;
    case 'rooms':
      return <RoomsScreen />;
    case 'lobby':
      return <LobbyScreen />;
    case 'level':
      return <HudScreen />;
    case 'gameOver':
      return <GameOverScreen />;
  }
}
