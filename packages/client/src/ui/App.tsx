import { ConnectingScreen } from './screens/ConnectingScreen.tsx';
import { LoadingScreen } from './screens/LoadingScreen.tsx';
import { MenuScreen } from './screens/MenuScreen.tsx';
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
    default:
      return null;
  }
}
