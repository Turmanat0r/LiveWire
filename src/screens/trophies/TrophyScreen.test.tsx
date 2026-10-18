import { act, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RemoteError } from '../../data/remote';
import { parseTrophyAnglers } from '../../data/trophies';
import { FakeServer, settle } from '../../test/fakes';
import { putEntry, renderApp } from '../../test/render';
import {
  catchRow,
  checkInRow,
  dayRow,
  entryRows,
  EVENT_ID,
  eventRow,
  OTHER_EVENT_ID,
} from '../../test/rows';
import { testSync } from '../../test/sync';

const OLD_ME = 'old-me';

/**
 * This year: second of two, behind a stranger, with a 30″ pike that does not
 * score. Last year, on another phone: first, frozen, with the Big Fish pot
 * and a side bet.
 */
function career() {
  const server = new FakeServer();
  server.put('events', eventRow());
  server.put('event_days', dayRow('2027-09-18'));
  server.put('event_species', {
    event_id: EVENT_ID,
    name: 'Walleye',
    position: 0,
    record_inches: null,
  });
  const me = entryRows({ userId: 'device-1' });
  const them = entryRows({ number: 2, userId: 'device-9' });
  putEntry(server, me);
  putEntry(server, them);
  const [theirs] = them.anglers;
  if (!theirs) throw new Error('the stranger');
  server.put('anglers', { ...theirs, handle: 'Soggy Granite Walleye' });
  const fish = (id: string, anglerId: string, inches: number, over = {}) => {
    server.put('catches', catchRow({ id, angler_id: anglerId, length_inches: inches, ...over }));
  };
  fish('w22', me.captainId, 22);
  fish('w19', me.captainId, 19.5);
  fish('pike', me.captainId, 30, { species: 'Pike' });
  fish('waiting', me.captainId, 25, { status: 'pending' });
  fish('theirs', them.captainId, 24.75);

  const old = { event_id: OTHER_EVENT_ID };
  server.put('events', eventRow({ id: OTHER_EVENT_ID, is_current: false }));
  server.put('event_days', dayRow('2026-09-19', OTHER_EVENT_ID));
  server.put('event_species', { ...old, name: 'Walleye', position: 0, record_inches: null });
  server.put('entries', {
    ...old,
    id: 'old-entry',
    entry_number: 4,
    division: 'solo',
    created_at: '2026-01-01T00:00:00+00:00',
  });
  server.put('anglers', {
    ...old,
    id: OLD_ME,
    entry_id: 'old-entry',
    role: 'solo',
    handle: 'Foggy Old Handle',
    big_fish: true,
    disqualified: false,
    registered_at: '2026-01-01T00:00:00+00:00',
  });
  fish('old26', OLD_ME, 26, { ...old, logged_at: '2026-09-19T16:00:00Z' });
  server.put('results', {
    ...old,
    frozen_at: '2026-09-20T00:00:00Z',
    frozen_by: null,
    record: {
      version: 1,
      species: ['Walleye'],
      divisions: {
        solo: [
          {
            place: 1,
            key: OLD_ME,
            anglerIds: [OLD_ME],
            names: 'Foggy Old Handle',
            bestInches: 26,
            top3Inches: 26,
            fishCount: 1,
          },
          {
            place: 2,
            key: 'x',
            anglerIds: ['x'],
            names: 'Someone',
            bestInches: 20,
            top3Inches: 20,
            fishCount: 1,
          },
        ],
        team: [],
      },
      bigFish: { anglerId: OLD_ME, catchId: 'old26', name: 'Foggy Old Handle', inches: 26 },
      bets: [{ id: 'b1', title: 'Smallest', winnerId: OLD_ME, winner: 'Foggy Old Handle' }],
    },
  });
  server.answers.set('my_trophy_anglers', () => [
    { angler_id: me.captainId, event_id: EVENT_ID, full_days: [] },
    { angler_id: OLD_ME, event_id: OTHER_EVENT_ID, full_days: ['2026-09-19'] },
  ]);
  return { server, me };
}

async function open(server: FakeServer) {
  const sync = testSync(server);
  renderApp('/trophies', sync);
  await act(async () => {
    await sync.start();
    await settle();
  });
  await act(settle);
}

const statOf = (label: string) => {
  const panel = within(screen.getByRole('list', { name: 'Personal bests' }))
    .getByText(label)
    .closest('li');
  if (!panel) throw new Error(`no ${label}`);
  return panel.textContent;
};

const earned = () =>
  within(screen.getByRole('list', { name: 'Badges' }))
    .getAllByRole('listitem')
    .filter((b) => b.textContent.endsWith('Earned'))
    .map((b) => b.querySelector('.trophy-badge__name')?.textContent);

describe('the trophy case', () => {
  it('puts this year beside last year’s frozen result, from another phone', async () => {
    await open(career().server);
    // The pike is longer, but it does not score: the best is last year's walleye.
    expect(statOf('Personal best')).toBe('26.00″Personal bestWalleye');
    expect(statOf('Fish on the board')).toBe('4Fish on the boardapproved, all time');
    expect(statOf('Tournaments')).toBe('2Tournaments1 win');
    expect(statOf('Best finish')).toBe('1stBest finish2 on the podium');
    expect(statOf('Pots and bets won')).toBe('2Pots and bets won1 Big Fish');

    const rows = within(screen.getByRole('list', { name: 'Tournaments fished' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((r) => r.textContent)).toEqual([
      'Montana Kayak Walleye Open 2027as Salty Bedrock Perch · Solo · 3 fish · best 22.00″2ndof 2',
      'Montana Kayak Walleye Open 2026as Foggy Old Handle · Solo · 1 fish · best 26.00″🏅 Big Fish pot · 🤝 Smallest1stof 2',
    ]);
    expect(earned()).toEqual([
      'First Fish',
      'Twenty-Incher',
      'Twenty-Five Club',
      'Mixed Bag',
      'Full Day',
      'In The Pot',
      'Podium',
      'Champion',
      'Veteran',
      'Big Fish',
      'Side Bet',
    ]);
    expect(screen.getByText(/^11 of 15 earned\./)).toBeTruthy();
  });

  it('shows this year with no signal, and says the rest needs some', async () => {
    const { server, me } = career();
    server.answers.set('my_trophy_anglers', () => {
      throw new RemoteError({ kind: 'offline' });
    });
    server.put(
      'check_ins',
      checkInRow({ angler_id: me.captainId, out_at: '2027-09-18T21:00:00+00:00' }),
    );
    await open(server);
    expect(
      within(screen.getByRole('list', { name: 'Tournaments fished' })).getAllByRole('listitem'),
    ).toHaveLength(1);
    expect(screen.getByText(/Earlier tournaments need signal to look up\./)).toBeTruthy();
    expect(statOf('Personal best')).toBe('22.00″Personal bestWalleye');
    // A day checked in and back out, from this phone's own copy.
    expect(earned()).toContain('Full Day');
  });

  it('asks a phone with no entry anywhere to register', async () => {
    const server = new FakeServer();
    server.put('events', eventRow());
    server.answers.set('my_trophy_anglers', () => []);
    await open(server);
    expect(screen.getByText(/This phone is not signed in to an entry/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Register' })).toBeTruthy();
  });
});

describe('trophy case rules', () => {
  it('reads the server’s list of your anglers defensively', () => {
    expect(
      parseTrophyAnglers([
        { angler_id: 'a', event_id: 'e', full_days: ['2027-09-18', 3] },
        { angler_id: 7, event_id: 'e' },
        'nonsense',
      ]),
    ).toEqual([{ anglerId: 'a', eventId: 'e', fullDays: ['2027-09-18'] }]);
    expect(parseTrophyAnglers(null)).toEqual([]);
  });
});
