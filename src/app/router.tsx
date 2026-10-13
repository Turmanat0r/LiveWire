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
