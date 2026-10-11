import { NavLink, Outlet, useLocation } from 'react-router';
import { SCREENS, TABS, screen } from './screens';
import { SyncStatus } from './SyncStatus';
import { useRouteFocus } from './useRouteFocus';
import { UpdatePrompt } from './UpdatePrompt';
import { Icon } from '../ui/Icon';
import './AppShell.css';

/** The colour theme of the screen whose address matches; an unknown address gets the plain one. */
function themeFor(pathname: string): string {
  if (pathname === '/') return 'home';
  const match = SCREENS.filter((s) => s.path !== '/' && pathname.startsWith(s.path)).sort(
    (a, b) => b.path.length - a.path.length,
  )[0];
  return match?.theme ?? 'default';
}

/**
 * The old app's frame: one column, as wide as a phone and a little wider on a
 * tablet, tinted by the screen it shows, with the tab bar floating over the
 * bottom of it.
 */
export function AppShell() {
  const { pathname } = useLocation();
  useRouteFocus(pathname);

  return (
    <div className="shell" data-theme={themeFor(pathname)}>
      <a className="shell__skip" href="#main">
        Skip to content
      </a>
      <div className="shell__column">
        <main id="main" className="shell__main">
          <SyncStatus />
          <Outlet />
        </main>
      </div>
      <UpdatePrompt />
      <nav className="tab-bar" aria-label="Main">
        <ul className="tab-bar__list">
          {TABS.map(({ id, label }) => {
            const { path } = screen(id);
            return (
              <li key={id}>
                <NavLink to={path} end={path === '/'} className="tab-bar__link">
                  <Icon name={id} />
                  <span>{label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
