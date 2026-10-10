import { NavLink, Outlet, useLocation } from 'react-router';
import { SCREENS, TABS, screen } from './screens';
import { useRouteFocus } from './useRouteFocus';
import { UpdatePrompt } from './UpdatePrompt';
import { Icon } from '../ui/Icon';
import './AppShell.css';

/** The screen whose address matches, or home. Used for the colour theme. */
function themeFor(pathname: string): string {
  const match = SCREENS.filter((s) => s.path !== '/' && pathname.startsWith(s.path)).sort(
    (a, b) => b.path.length - a.path.length,
  )[0];
  return match?.theme ?? 'home';
}

export function AppShell() {
  const { pathname } = useLocation();
  useRouteFocus(pathname);

  return (
    <div className="shell" data-theme={themeFor(pathname)}>
      <a className="shell__skip" href="#main">
        Skip to content
      </a>
      <UpdatePrompt />
      <main id="main" className="shell__main">
        <Outlet />
      </main>
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
