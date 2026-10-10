import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './router';
import { SCREENS } from './screens';

// The service worker does not exist in a test page.
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => undefined],
    offlineReady: [false, () => undefined],
    updateServiceWorker: () => Promise.resolve(),
  }),
}));

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('the app shell', () => {
  it('has one main landmark, a labelled nav and a skip link', () => {
    renderAt('/');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe(
      '#main',
    );
  });

  it('marks the tab for the current screen', () => {
    renderAt('/standings');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Standings' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBeNull();
  });

  it('gives every screen an address and exactly one heading of its own', () => {
    for (const s of SCREENS) {
      const { unmount } = render(
        <RouterProvider router={createMemoryRouter(routes, { initialEntries: [s.path] })} />,
      );
      expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([
        s.title,
      ]);
      unmount();
    }
  });

  it('moves focus to the new heading after a navigation', async () => {
    const user = userEvent.setup();
    renderAt('/');
    await user.click(screen.getByRole('link', { name: 'Chat' }));
    expect(document.activeElement?.textContent).toBe('Chat');
    expect(document.title).toBe('Chat · LiveWire');
  });

  it('says so at an address that does not exist', () => {
    renderAt('/no-such-screen');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Not found');
  });
});
