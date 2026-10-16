import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from './AppShell';
import { SCREENS, screen } from './screens';
import { CheckInScreen } from '../screens/CheckInScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { RegisterScreen } from '../screens/register/RegisterScreen';
import { CatchScreen } from '../screens/catch/CatchScreen';
import { LivewellScreen } from '../screens/catches/LivewellScreen';
import { MyCatchesScreen } from '../screens/catches/MyCatchesScreen';
import { PlannedScreen } from '../screens/PlannedScreen';
import { SafetyScreen } from '../screens/safety/SafetyScreen';
import { BigFishScreen } from '../screens/board/BigFishScreen';
import { PayoutsScreen } from '../screens/board/PayoutsScreen';
import { StandingsScreen } from '../screens/board/StandingsScreen';
import { SideBetsScreen } from '../screens/board/SideBetsScreen';
import { ChatScreen } from '../screens/board/ChatScreen';
import { DirectorScreen } from '../screens/director/DirectorScreen';
import { NotFoundScreen } from '../screens/NotFoundScreen';
import { ErrorScreen } from '../screens/ErrorScreen';

/**
 * Real addresses (/standings, /catch), not #hash screens. A shared link opens
 * the right screen, Back walks the app, and the host sends every address to
 * index.html (see vercel.json) so a refresh never 404s.
 */
export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    errorElement: <ErrorScreen />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: screen('register').path, element: <RegisterScreen /> },
      { path: screen('check-in').path, element: <CheckInScreen /> },
      { path: screen('catch').path, element: <CatchScreen /> },
      { path: screen('my-catches').path, element: <MyCatchesScreen /> },
      { path: screen('livewell').path, element: <LivewellScreen /> },
      { path: screen('safety').path, element: <SafetyScreen /> },
      { path: screen('standings').path, element: <StandingsScreen /> },
      { path: screen('big-fish').path, element: <BigFishScreen /> },
      { path: screen('payouts').path, element: <PayoutsScreen /> },
      { path: screen('side-bets').path, element: <SideBetsScreen /> },
      { path: screen('chat').path, element: <ChatScreen /> },
      { path: screen('director').path, element: <DirectorScreen /> },
      ...SCREENS.filter((s) => s.milestone !== null).map((s): RouteObject => ({
        path: s.path,
        element: <PlannedScreen screen={s} />,
      })),
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
];

export function createRouter() {
  return createBrowserRouter(routes);
}
