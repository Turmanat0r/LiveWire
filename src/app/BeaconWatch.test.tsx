import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Row } from '../data/tables';
import { FakeServer, settle } from '../test/fakes';
import { putEntry, renderApp } from '../test/render';
import { entryRows, EVENT_ID, eventRow } from '../test/rows';
import { testSync } from '../test/sync';
import { BEACON_REFRESH_MS } from './BeaconWatch';
import { forgetFix } from './position';

vi.mock('./location', () => ({
  currentFix: () => Promise.resolve({ lat: 46.41, lng: -111.58, accuracyMiles: 0.01 }),
}));
vi.mock('../screens/safety/CourseMap', () => ({ default: () => null }));

beforeEach(() => {
  forgetFix();
});
afterEach(() => {
  vi.useRealTimers();
});

const beacon = (anglerId: string): Row<'beacons'> => ({
  id: crypto.randomUUID(),
  angler_id: anglerId,
  event_id: EVENT_ID,
  note: '',
  lat: 46.4,
  lng: -111.6,
  accuracy_miles: 0.01,
  position_at: '2027-09-18T16:00:00+00:00',
  raised_at: '2027-09-18T16:00:00+00:00',
  stood_down_at: null,
  stood_down_by: null,
});

function server() {
  const s = new FakeServer();
  s.put('events', eventRow());
  const mine = entryRows({ userId: 'device-1' });
  putEntry(s, mine);
  const rival = entryRows({ number: 2, userId: 'device-2', names: ['Rival Angler'] });
  putEntry(s, rival);
  const handle = rival.anglers[0]?.handle ?? '';
  return { s, mine, rival, handle };
}

async function open(s: FakeServer, path: string) {
  const sync = testSync(s);
  const router = renderApp(path, sync);
  await act(async () => {
    await sync.start();
    await settle();
  });
  return { sync, router };
}

describe('beacons on every screen', () => {
  it('puts the field’s beacon in front of everyone, and leaves the details to Safety', async () => {
    const { s, rival, handle } = server();
    s.put('beacons', beacon(rival.captainId));
    await open(s, '/standings');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Beacon raised');
    expect(alert.textContent).toContain(`${handle} needs help`);
    await userEvent.setup().click(screen.getByRole('link', { name: /Beacon raised/ }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('list', { name: 'Raised beacons' })).toBeTruthy();
  });

  it('reminds the angler whose beacon is up to stand it down', async () => {
    const { s, mine } = server();
    s.put('beacons', beacon(mine.captainId));
    await open(s, '/');
    expect(screen.getByText('Your beacon is up')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('a raised beacon', () => {
  it('sends a fresh position every minute while it is up', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { s, mine } = server();
    s.put('beacons', beacon(mine.captainId));
    await open(s, '/');
    expect(s.calls.filter((c) => c.fn === 'record_position')).toHaveLength(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BEACON_REFRESH_MS);
      await settle();
    });
    expect(s.calls.filter((c) => c.fn === 'record_position').map((c) => c.args)).toEqual([
      expect.objectContaining({ p_angler_id: mine.captainId, p_lat: 46.41, p_lng: -111.58 }),
    ]);
  });

  it('takes no fixes when no beacon is up', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const { s } = server();
    await open(s, '/');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BEACON_REFRESH_MS * 3);
    });
    expect(s.calls.filter((c) => c.fn === 'record_position')).toHaveLength(0);
  });
});
