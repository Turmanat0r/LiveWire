import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fix } from '../../app/location';
import { forgetFix } from '../../app/position';
import type { Row } from '../../data/tables';
import { FakeServer, settle } from '../../test/fakes';
import { putEntry, renderApp } from '../../test/render';
import { catchRow, entryRows, EVENT_ID, eventRow } from '../../test/rows';
import { testSync } from '../../test/sync';

// GPS needs a real phone, and the map needs tiles; these tests are about the rest.
const fixes: (Fix | null)[] = [];
vi.mock('../../app/location', () => ({
  currentFix: () => Promise.resolve(fixes.length > 0 ? fixes.shift() : null),
}));
vi.mock('./CourseMap', () => ({ default: () => null }));

const LAUNCH = { lat: 46.38917, lng: -111.57556 };
const ONE_MILE_LAT = 1 / 69.0546;

beforeEach(() => {
  forgetFix();
  fixes.length = 0;
  vi.restoreAllMocks();
});

function beaconRow(over: Partial<Row<'beacons'>> & { angler_id: string }): Row<'beacons'> {
  return {
    id: crypto.randomUUID(),
    event_id: EVENT_ID,
    note: '',
    lat: LAUNCH.lat,
    lng: LAUNCH.lng,
    accuracy_miles: 0.01,
    position_at: '2027-09-18T16:00:00+00:00',
    raised_at: '2027-09-18T16:00:00+00:00',
    stood_down_at: null,
    stood_down_by: null,
    ...over,
  };
}

function evidenceRow(
  catchId: string,
  lat: number | null,
  boundary: Row<'catch_evidence'>['boundary'],
): Row<'catch_evidence'> {
  return {
    catch_id: catchId,
    event_id: EVENT_ID,
    lat,
    lng: lat === null ? null : LAUNCH.lng,
    accuracy_miles: 0.01,
    boundary,
    captured_at: null,
    clock_offset_ms: null,
    photo_source: 'camera',
    precheck: null,
    ai_review: null,
    filed_by: null,
    filed_by_director: false,
    review_note: '',
    reviewed_at: null,
    reviewed_by: null,
  };
}

function serverWith({ registered = true } = {}) {
  const server = new FakeServer();
  server.put('events', eventRow({ course: { kind: 'circle', center: LAUNCH, radiusMiles: 4 } }));
  const rows = entryRows({ userId: registered ? 'device-1' : null });
  putEntry(server, rows);
  // Somebody else's entry, on another phone.
  const rival = entryRows({ number: 2, userId: 'device-2', names: ['Rival Angler'] });
  putEntry(server, rival);
  return { server, rows, rivalId: rival.captainId };
}

async function open(server: FakeServer, path = '/safety') {
  const sync = testSync(server);
  renderApp(path, sync);
  await act(async () => {
    await sync.start();
    await settle();
  });
  return { sync, user: userEvent.setup() };
}

describe('raising a beacon', () => {
  it('sends the position and the note, and says when it is waiting for signal', async () => {
    const { server, rows } = serverWith();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fixes.push({ lat: 46.4, lng: -111.6, accuracyMiles: 0.01 });
    const { sync, user } = await open(server);
    server.online = false;
    await user.type(screen.getByLabelText('What is wrong? (optional)'), 'Capsized');
    await user.click(screen.getByRole('button', { name: 'Raise a beacon' }));
    await act(settle);
    expect(sync.getState().outbox.items[0]?.steps[0]).toMatchObject({
      kind: 'call',
      fn: 'raise_beacon',
      args: { p_angler_id: rows.captainId, p_lat: 46.4, p_lng: -111.6, p_note: 'Capsized' },
    });
    expect(screen.getByText('Your beacon is waiting for signal')).toBeTruthy();
  });

  it('sends nothing without a fix, and says why', async () => {
    const { server } = serverWith();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { sync, user } = await open(server);
    await user.click(screen.getByRole('button', { name: 'Raise a beacon' }));
    await act(settle);
    expect(screen.getByRole('alert').textContent).toMatch(/a beacon needs a position/);
    expect(sync.getState().outbox.items).toEqual([]);
  });

  it('can be stood down once it is up', async () => {
    const { server, rows } = serverWith();
    server.put('beacons', beaconRow({ angler_id: rows.captainId }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { sync, user } = await open(server);
    expect(screen.getByText('Your beacon is up')).toBeTruthy();
    server.online = false;
    await user.click(screen.getByRole('button', { name: 'Stand down: I am OK' }));
    await act(settle);
    expect(sync.getState().outbox.items[0]?.steps[0]).toMatchObject({
      fn: 'stand_down_beacon',
      args: { p_angler_id: rows.captainId },
    });
    expect(screen.getByText('Standing down')).toBeTruthy();
  });

  it('asks a phone with no entry to register first', async () => {
    const { server } = serverWith({ registered: false });
    await open(server);
    expect(screen.getByRole('link', { name: 'Register on this device first' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Raise a beacon' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Call 911' }).getAttribute('href')).toBe('tel:911');
  });
});

describe('the field’s beacons', () => {
  it('show nearest first, with distance and direction once this phone has a fix', async () => {
    const { server, rivalId } = serverWith();
    const far = entryRows({ number: 3, userId: 'device-3', names: ['Far Away'] });
    putEntry(server, far);
    server.put(
      'beacons',
      beaconRow({ angler_id: far.captainId, lat: LAUNCH.lat + 3 * ONE_MILE_LAT, note: 'Cold' }),
    );
    server.put('beacons', beaconRow({ angler_id: rivalId, lat: LAUNCH.lat + ONE_MILE_LAT }));
    fixes.push({ ...LAUNCH, accuracyMiles: 0.01 });
    const { user } = await open(server);
    await user.click(screen.getByRole('button', { name: 'Check my position' }));
    await act(settle);
    const cards = within(screen.getByRole('list', { name: 'Raised beacons' })).getAllByRole(
      'listitem',
    );
    expect(cards.map((c) => c.querySelector('.beacon-card__where')?.textContent)).toEqual([
      '1.00 mi N',
      '3.00 mi N',
    ]);
    expect(cards[1]?.textContent).toContain('“Cold”');
  });
});

describe('texting the director', () => {
  it('fills in the name and the last position', async () => {
    const { server } = serverWith();
    server.put('event_safety', {
      event_id: EVENT_ID,
      contact_name: 'Tournament director',
      phone: '(406) 555-0142',
      updated_at: '2027-01-01T00:00:00+00:00',
    });
    fixes.push({ lat: 46.40365, lng: -111.57556, accuracyMiles: 0.01 });
    const { user } = await open(server);
    await user.click(screen.getByRole('button', { name: 'Check my position' }));
    await act(settle);
    const href = screen.getByRole('link', { name: 'Text the director' }).getAttribute('href');
    expect(href).toMatch(/^sms:\+14065550142\?&body=/);
    const body = decodeURIComponent(href?.split('body=')[1] ?? '');
    expect(body).toMatch(/^LiveWire: Daniel Turman needs help\. At 46\.40365, -111\.57556/);
    expect(screen.getByRole('link', { name: 'Call' }).getAttribute('href')).toBe(
      'tel:+14065550142',
    );
  });

  it('is not offered when the director has not left a number', async () => {
    const { server } = serverWith();
    await open(server);
    expect(screen.queryByRole('link', { name: 'Text the director' })).toBeNull();
  });
});

describe('where am I', () => {
  it('reads in or out on the phone, and tells the director', async () => {
    const { server, rows } = serverWith();
    fixes.push({ lat: LAUNCH.lat + ONE_MILE_LAT, lng: LAUNCH.lng, accuracyMiles: 0.01 });
    const { user } = await open(server);
    expect(screen.getByText('Not checked yet')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Check my position' }));
    await act(settle);
    expect(screen.getByText('In bounds')).toBeTruthy();
    expect(screen.getByText(/^3\.00 mi inside the line/)).toBeTruthy();
    expect(server.calls.find((c) => c.fn === 'record_position')?.args).toMatchObject({
      p_angler_id: rows.captainId,
    });
  });
});

describe('catch locations', () => {
  it('counts this entry’s catches in, out and with no position', async () => {
    const { server, rows } = serverWith();
    const mine = (id: string, minutes: number) => {
      server.put(
        'catches',
        catchRow({
          id,
          angler_id: rows.captainId,
          logged_at: new Date(Date.UTC(2027, 8, 18, 15, minutes)).toISOString(),
        }),
      );
    };
    mine('in', 0);
    mine('out', 10);
    mine('nowhere', 20);
    server.put(
      'catch_evidence',
      evidenceRow('in', 46.4, {
        kind: 'circle',
        within: true,
        fromLaunchMiles: 1,
        outsideMiles: 0,
      }),
    );
    server.put(
      'catch_evidence',
      evidenceRow('out', 46.5, {
        kind: 'circle',
        within: false,
        fromLaunchMiles: 4.5,
        outsideMiles: 0.5,
      }),
    );
    server.put('catch_evidence', evidenceRow('nowhere', null, { kind: 'unchecked' }));
    await open(server);
    const summary = screen.getByText('In bounds', { selector: 'dt' }).closest('dl');
    expect(summary?.textContent).toBe('In bounds1Flagged1No GPS1');
    expect(screen.getByText('Outside course boundary · 0.5 mi outside the line')).toBeTruthy();
  });
});
