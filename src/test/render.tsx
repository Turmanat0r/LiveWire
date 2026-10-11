import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../app/router';
import type { Sync } from '../data/sync';
import type { FakeServer } from './fakes';
import type { entryRows } from './rows';
import { WithSync } from './sync';

/** The whole app at an address, on a sync engine a test controls. */
export function renderApp(path: string, sync: Sync) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <WithSync sync={sync}>
      <RouterProvider router={router} />
    </WithSync>,
  );
  return router;
}

/** Puts an entry on the fake server, as registering or bringing it over would. */
export function putEntry(server: FakeServer, rows: ReturnType<typeof entryRows>): void {
  server.put('entries', rows.entry);
  server.put('entry_private', rows.entryPrivate);
  for (const a of rows.anglers) server.put('anglers', a);
  for (const p of rows.privates) server.put('angler_private', p);
  for (const d of rows.devices) server.put('entry_devices', d);
}
