import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { forgetPoolCounts } from '../../data/pools';
import { FakeServer, settle } from '../../test/fakes';
import { putEntry, renderApp } from '../../test/render';
import { catchRow, entryRows, EVENT_ID, eventRow } from '../../test/rows';
import { testSync } from '../../test/sync';

beforeEach(() => {
  forgetPoolCounts();
});

/**
 * A field of three: Solo One (this phone's), Solo Two, and a team. Fish are
 * approved unless a test says otherwise.
 */
function field() {
  const server = new FakeServer();
  server.put('events', eventRow());
  server.put('event_species', {
    event_id: EVENT_ID,
    name: 'Walleye',
    record_inches: 36,
    position: 0,
  });
  const one = entryRows({ number: 1, userId: 'device-1', names: ['Solo One'] });
  const two = entryRows({ number: 2, userId: 'device-2', names: ['Solo Two'] });
  const team = entryRows({ number: 3, userId: 'device-3', team: true, names: ['Cap', 'Mate'] });
  for (const rows of [one, two, team]) putEntry(server, rows);
  const handle = (rows: typeof one, i = 0) => rows.anglers[i]?.handle ?? '';
  let minute = 0;
  const fish = (
    anglerId: string,
    inches: number,
    over: Partial<Parameters<typeof catchRow>[0]> = {},
  ) => {
    minute += 1;
    server.put(
      'catches',
      catchRow({
        angler_id: anglerId,
        length_inches: inches,
        division: anglerId.startsWith(team.entry.id) ? 'team' : 'solo',
        logged_at: new Date(Date.UTC(2027, 8, 18, 15, minute)).toISOString(),
        ...over,
      }),
    );
  };
  return { server, one, two, team, handle, fish };
}

async function open(server: FakeServer, path: string) {
  const sync = testSync(server);
  renderApp(path, sync);
  await act(async () => {
    await sync.start();
    await settle();
  });
  return { sync, user: userEvent.setup() };
}

const rowsOf = (name: string) =>
  within(screen.getByRole('list', { name }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);

describe('standings', () => {
  it('ranks on the longest fish, then the best three, and marks this phone’s entry', async () => {
    const { server, one, two, handle, fish } = field();
    fish(one.captainId, 24);
    fish(one.captainId, 20);
    fish(two.captainId, 24);
    fish(two.captainId, 22);
    fish(two.captainId, 30, { status: 'pending' });
    await open(server, '/standings');
    expect(rowsOf('Solo standings')).toEqual([
      `1${handle(two)}Best 3 combined: 46.00″24.00″`,
      `2${handle(one)}YouBest 3 combined: 44.00″24.00″`,
    ]);
  });

  it('ranks a team as one, on either partner’s fish, under both handles', async () => {
    const { server, team, handle, fish } = field();
    fish(team.captainId, 21);
    fish(team.partnerId, 25.5);
    const { user } = await open(server, '/standings');
    await user.click(screen.getByRole('button', { name: 'Team' }));
    expect(screen.getByRole('button', { name: 'Team' }).getAttribute('aria-pressed')).toBe('true');
    expect(rowsOf('Team standings')).toEqual([
      `1${handle(team, 0)} & ${handle(team, 1)}Best 3 combined: 46.50″25.50″`,
    ]);
    expect(screen.getByText(/caught by either teammate/)).toBeTruthy();
  });

  it('says so when nobody has an approved fish', async () => {
    const { server } = field();
    await open(server, '/standings');
    expect(screen.getByText('No approved catches yet in this division.')).toBeTruthy();
  });
});

describe('Big Fish', () => {
  it('counts only the anglers in the pot and still eligible', async () => {
    const { server, one, two, team, handle, fish } = field();
    const [twoSolo] = two.anglers;
    const [, mate] = team.anglers;
    if (!twoSolo || !mate) throw new Error('the field has these anglers');
    server.put('anglers', { ...twoSolo, big_fish: false });
    server.put('anglers', { ...mate, disqualified: true });
    fish(one.captainId, 22);
    fish(two.captainId, 30);
    fish(team.partnerId, 28);
    fish(team.captainId, 26);
    await open(server, '/big-fish');
    expect(rowsOf('Big Fish')).toEqual([
      `1${handle(team, 0)}Team division26.00″`,
      `2${handle(one)}YouSolo division22.00″`,
    ]);
    expect(screen.getByText('Optional $10/angler side pot. Winner take all.')).toBeTruthy();
  });
});

describe('payouts', () => {
  it('builds the pools from the server’s counts and the donations', async () => {
    const { server } = field();
    server.answers.set('pool_counts', () => [
      { solo_paid: 2, teams_paid: 1, big_fish_paid: 3, solo_eligible: 2, teams_eligible: 1 },
    ]);
    server.put('donations', {
      id: 'd1',
      event_id: EVENT_ID,
      target: 'solo',
      amount_cents: 4000,
      note: '',
      created_at: '2027-01-01T00:00:00+00:00',
      created_by: null,
    });
    await open(server, '/payouts');
    const solo = screen.getByRole('region', { name: 'Solo division' });
    expect(solo.textContent).toContain(
      'Solo division · 2 entries · $100.00 pool · +$40.00 donated',
    );
    expect(
      within(solo)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['1st$50.00', '2nd$30.00']);
    expect(solo.textContent).toContain('$20.00 of this pool is unawarded');
    expect(screen.getByText(/3 anglers opted in/)).toBeTruthy();
  });

  it('waits for signal rather than guessing', async () => {
    const { server } = field();
    server.online = false;
    await open(server, '/payouts');
    expect(screen.getByText(/They show here once this phone has signal/)).toBeTruthy();
  });
});
