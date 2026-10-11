import { describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './router';
import { SCREENS } from './screens';
import { FakeServer, settle } from '../test/fakes';
import { putEntry } from '../test/render';
import { dayRow, entryRows, eventRow } from '../test/rows';
import { testSync, WithSync } from '../test/sync';

function renderAt(path: string, sync = testSync()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <WithSync sync={sync}>
      <RouterProvider router={router} />
    </WithSync>,
  );
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
        <WithSync sync={testSync()}>
          <RouterProvider router={createMemoryRouter(routes, { initialEntries: [s.path] })} />
        </WithSync>,
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

  it('says on every screen whether the phone is connected', () => {
    renderAt('/standings');
    expect(screen.getByRole('status').textContent).toBe('Not connected to a tournament server');
  });
});

describe('the home screen', () => {
  it('shows the tournament every phone is on', async () => {
    const server = new FakeServer();
    server.put('events', eventRow());
    server.put('event_days', dayRow('2027-09-18'));
    server.put('event_days', dayRow('2027-09-19'));
    const sync = testSync(server);
    renderAt('/', sync);
    await act(async () => {
      await sync.start();
      await settle();
    });

    expect(screen.getByRole('heading', { name: 'Montana Kayak Walleye Open' })).toBeTruthy();
    expect(screen.getByText('Big Sky Kayak Anglers presents')).toBeTruthy();
    expect(screen.getByText('Sep 18–19, 2027')).toBeTruthy();
    // The test event's registration closes in September 2027.
    expect(screen.getByText('Registration open')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Register now' }).getAttribute('href')).toBe(
      '/register',
    );
  });

  it('says when there is no tournament yet', async () => {
    const sync = testSync(new FakeServer());
    renderAt('/', sync);
    await act(async () => {
      await sync.start();
      await settle();
    });
    expect(screen.getByRole('heading', { name: 'No tournament yet' })).toBeTruthy();
  });

  it('shows the angler this phone is, with the codes to write on the board', async () => {
    const server = new FakeServer();
    server.put('events', eventRow());
    putEntry(server, entryRows({ team: true, names: ['Daniel Turman', 'Pat Partner'] }));
    const sync = testSync(server);
    renderAt('/', sync);
    await act(async () => {
      await sync.start();
      await settle();
    });

    expect(screen.getByText('Daniel Turman')).toBeTruthy();
    expect(screen.getByText('DT')).toBeTruthy();
    expect(screen.getByText('Team with Pat Partner · MKWO-001')).toBeTruthy();
    expect(screen.getByText('Team TQ7M · Tournament ID 7K4M')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Registration details' })).toBeTruthy();
  });
});
