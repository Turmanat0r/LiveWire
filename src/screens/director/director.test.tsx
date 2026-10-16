import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Row } from '../../data/tables';
import { FakeServer, settle } from '../../test/fakes';
import { putEntry, renderApp } from '../../test/render';
import { catchRow, checkInRow, dayRow, entryRows, EVENT_ID, eventRow } from '../../test/rows';
import { testSync } from '../../test/sync';

afterEach(() => {
  vi.useRealTimers();
});

const EMAIL = 'director@example.com';

function evidence(
  catchId: string,
  over: Partial<Row<'catch_evidence'>> = {},
): Row<'catch_evidence'> {
  return {
    catch_id: catchId,
    event_id: EVENT_ID,
    lat: 46.39,
    lng: -111.57,
    accuracy_miles: 0.01,
    boundary: { kind: 'circle', within: true, fromLaunchMiles: 1, outsideMiles: 0 },
    captured_at: '2027-09-18T16:00:00+00:00',
    clock_offset_ms: 0,
    photo_source: 'camera',
    precheck: {
      hashes: ['f0f0f0f0f0f0f0f0'],
      brightness: 120,
      sharpness: 300,
      srcWidth: 1600,
      srcHeight: 1200,
    },
    ai_review: null,
    filed_by: 'device-1',
    filed_by_director: false,
    review_note: '',
    reviewed_at: null,
    reviewed_by: null,
    ...over,
  };
}

function field() {
  const server = new FakeServer();
  server.directors.set(EMAIL, 'correct horse');
  server.put('events', eventRow());
  server.put('event_days', dayRow('2027-09-18'));
  server.put('event_species', {
    event_id: EVENT_ID,
    name: 'Walleye',
    record_inches: 36,
    position: 0,
  });
  const angler = entryRows({ userId: 'device-1', names: ['Daniel Turman'] });
  putEntry(server, angler);
  // Only the director may read an angler's private details; play that.
  server.canSee = (table) => table !== 'angler_private' || server.account.director || false;
  return { server, angler };
}

async function open(server: FakeServer, path = '/director') {
  const sync = testSync(server);
  renderApp(path, sync);
  await act(async () => {
    await sync.start();
    await settle();
  });
  return { sync, user: userEvent.setup() };
}

async function signIn(user: ReturnType<typeof userEvent.setup>, password = 'correct horse') {
  await user.type(screen.getByLabelText('Email'), EMAIL);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  await act(settle);
}

describe('signing in as the director', () => {
  it('refuses a wrong password, and opens the panel for the right one', async () => {
    const { server } = field();
    const { sync, user } = await open(server);
    await signIn(user, 'wrong');
    expect(screen.getByRole('alert').textContent).toBe(
      'That email and password do not match the director’s account.',
    );
    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await act(settle);
    expect(sync.getState()).toMatchObject({ director: true, email: EMAIL, userId: 'director-1' });
    expect(
      screen.getByText(/Signed in as the tournament director \(director@example\.com\)/),
    ).toBeTruthy();
  });

  it('warns a phone holding an entry that its angler sign-in is replaced', async () => {
    const { server } = field();
    await open(server);
    expect(screen.getByText('This phone holds an angler’s entry')).toBeTruthy();
  });

  it('signs out to an ordinary phone', async () => {
    const { server } = field();
    const { sync, user } = await open(server);
    await signIn(user);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await act(settle);
    expect(sync.getState()).toMatchObject({ director: false, userId: 'device-2' });
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });
});

describe('fish to review', () => {
  it('shows each fish with its badges and first pass, and rules on it at once', async () => {
    const { server, angler } = field();
    server.put(
      'catches',
      catchRow({
        id: 'c1',
        angler_id: angler.captainId,
        status: 'pending',
        length_inches: 23.5,
        logged_at: '2027-09-18T16:05:00+00:00',
      }),
    );
    server.put('catch_evidence', evidence('c1', { photo_source: 'upload', clock_offset_ms: null }));
    const { sync, user } = await open(server);
    await signIn(user);
    const pending = screen.getByRole('list', { name: 'Pending catches' });
    const [card] = within(pending).getAllByRole('listitem');
    if (!card) throw new Error('a pending card');
    expect(card.textContent).toContain('23.50″');
    expect(card.textContent).toContain('Daniel Turman · Walleye · Solo');
    expect(card.textContent).toContain('Uploaded file');
    expect(card.textContent).toContain('Clock unverified');
    expect(card.textContent).toContain('In bounds · 1.0 mi from launch');
    expect(card.textContent).toContain('Fish-I first passClear');

    server.online = false;
    await user.click(within(card).getByRole('button', { name: 'Approve' }));
    await act(settle);
    expect(sync.getState().outbox.items[0]?.steps[0]).toMatchObject({
      fn: 'director_review_catch',
      args: { p_id: 'c1', p_status: 'approved' },
    });
    expect(screen.getByText('Nothing pending review.')).toBeTruthy();
    const all = screen.getByRole('list', { name: 'All catches' });
    expect(within(all).getByText('Approved')).toBeTruthy();
  });

  it('corrects a misread length before the ruling', async () => {
    const { server, angler } = field();
    server.put(
      'catches',
      catchRow({ id: 'c1', angler_id: angler.captainId, status: 'pending', length_inches: 32.5 }),
    );
    server.put('catch_evidence', evidence('c1'));
    const { sync, user } = await open(server);
    await signIn(user);
    const pending = screen.getByRole('list', { name: 'Pending catches' });
    await user.click(within(pending).getByRole('button', { name: 'Fix length or species' }));
    const length = within(pending).getByLabelText('Length (inches)');
    await user.clear(length);
    await user.type(length, '23.25');
    server.online = false;
    await user.click(within(pending).getByRole('button', { name: 'Save' }));
    await act(settle);
    expect(sync.getState().outbox.items[0]?.steps[0]).toMatchObject({
      fn: 'director_correct_catch',
      args: { p_id: 'c1', p_species: 'Walleye', p_length_inches: 23.25 },
    });
    expect(within(pending).getByText('23.25″')).toBeTruthy();
  });

  it('opens a photo full size, with the rulings on it', async () => {
    const { server, angler } = field();
    server.put('catches', catchRow({ id: 'c1', angler_id: angler.captainId, status: 'pending' }));
    server.put('catch_evidence', evidence('c1'));
    const { user } = await open(server);
    await signIn(user);
    const pending = screen.getByRole('list', { name: 'Pending catches' });
    await user.click(
      within(pending).getByRole('button', {
        name: /Open the photo of Daniel Turman’s Walleye full size/,
      }),
    );
    const viewer = screen.getByRole('dialog');
    expect(viewer.getAttribute('aria-label')).toBe('Daniel Turman · 21.50″ Walleye');
    expect(within(viewer).getByRole('button', { name: 'Approve' })).toBeTruthy();
    await user.click(within(viewer).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the overdue alert', () => {
  it('names who launched and has not come back, once the final check-in has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-09-18T15:40:00-06:00'));
    const { server, angler } = field();
    server.put(
      'check_ins',
      checkInRow({
        angler_id: angler.captainId,
        day: '2027-09-18',
        in_at: '2027-09-18T12:30:00+00:00',
        out_at: null,
      }),
    );
    const { user } = await open(server);
    await signIn(user);
    const alert = screen.getByRole('alert', { name: 'Not checked out' });
    expect(alert.textContent).toContain('1 angler has not checked out');
    expect(alert.textContent).toContain('Final check-in was 40 minutes ago.');
    expect(alert.textContent).toContain('Daniel Turman');
    expect(alert.textContent).toContain('No position ever recorded');
  });
});

describe('contestants', () => {
  it('finds an angler who has lost their Tournament ID, by phone or by name', async () => {
    const { server, angler } = field();
    const other = entryRows({
      number: 2,
      userId: 'device-2',
      team: true,
      names: ['Pat Morgan', 'Sam Lee'],
    });
    putEntry(server, other);
    // The sample rows all share one number; these two have their own.
    other.privates.forEach((p, i) => {
      server.put('angler_private', { ...p, phone: `406-555-02${String(i)}0` });
    });
    const { user } = await open(server);
    await signIn(user);
    await user.click(screen.getByRole('button', { name: /Contestants/ }));
    expect(screen.getByRole('button', { name: /Contestants/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    const search = screen.getByLabelText('Find an angler');
    const rows = () =>
      within(screen.getByRole('list', { name: 'Anglers' }))
        .getAllByRole('listitem')
        .map((li) => li.querySelector('.crow__name')?.textContent);
    expect(rows()).toHaveLength(3);

    // By the phone number, however it is typed.
    const phone = angler.privates[0]?.phone ?? '';
    await user.type(search, phone.replace(/\D/g, '').slice(-7));
    expect(rows()).toEqual(['Daniel TurmanFee outstanding']);
    const row = within(screen.getByRole('list', { name: 'Anglers' })).getByRole('listitem');
    expect(row.querySelector('.crow__code')?.textContent).toBe('Tournament ID 7K4M');

    // By part of a name, and by a Tournament ID.
    await user.clear(search);
    await user.type(search, 'sam');
    expect(rows()).toEqual(['Sam LeeFee outstanding']);
    await user.clear(search);
    await user.type(search, '9hcx');
    expect(rows()).toEqual(['Sam LeeFee outstanding']);
  });
});

describe('acting on a contestant', () => {
  async function openRow() {
    const { server, angler } = field();
    server.put('event_days', dayRow('2027-09-19'));
    const sent = await open(server);
    await signIn(sent.user);
    await sent.user.click(screen.getByRole('button', { name: /Contestants/ }));
    server.online = false;
    await sent.user.click(screen.getByRole('button', { name: /Daniel Turman/, expanded: false }));
    const steps = () => sent.sync.getState().outbox.items.flatMap((i) => i.steps);
    const row = () => {
      const li = screen
        .getByRole('list', { name: 'Anglers' })
        .querySelector<HTMLElement>('li.crow');
      if (!li) throw new Error('the angler’s row');
      return li;
    };
    return { ...sent, server, angler, steps, row };
  }

  it('matches a fee, and shows it at once', async () => {
    const { user, angler, steps, row } = await openRow();
    expect(row().textContent).toContain('Fee outstanding');
    await user.click(within(row()).getByRole('button', { name: 'Fee received' }));
    await act(settle);
    expect(steps()).toMatchObject([
      { fn: 'director_set_fee_paid', args: { p_entry_id: angler.entry.id, p_paid: true } },
    ]);
    expect(row().querySelector('.crow__name')?.textContent).toBe('Daniel Turman');
    expect(row().textContent).toContain('Waiting to send.');
  });

  it('disqualifies with a reason, and can reinstate', async () => {
    const { user, angler, steps, row } = await openRow();
    await user.click(within(row()).getByRole('button', { name: 'Disqualify' }));
    await user.type(within(row()).getByLabelText(/Reason/), 'Fish not on a board');
    await user.click(within(row()).getByRole('button', { name: 'Yes, disqualify' }));
    await act(settle);
    expect(steps()).toMatchObject([
      {
        fn: 'director_disqualify',
        args: { p_angler_id: angler.captainId, p_reason: 'Fish not on a board' },
      },
    ]);
    expect(row().textContent).toContain('Disqualified: Fish not on a board');
    await user.click(within(row()).getByRole('button', { name: 'Reinstate' }));
    await act(settle);
    expect(steps()[1]).toMatchObject({ fn: 'director_reinstate' });
  });

  it('checks an angler in and out for them, day by day', async () => {
    const { user, angler, steps, row } = await openRow();
    const days = () =>
      within(row())
        .getAllByRole('listitem')
        .filter((li) => li.closest('.cdays'));
    expect(days()).toHaveLength(2);
    const [first] = days();
    if (!first) throw new Error('two days');
    await user.click(within(first).getByRole('button', { name: 'Check in now' }));
    await act(settle);
    expect(steps()[0]).toMatchObject({
      fn: 'director_set_check_in',
      args: { p_angler_id: angler.captainId, p_day: '2027-09-18', p_out_at: null },
    });
    expect(row().textContent).toContain('Day 1 on water · Day 2 not in');
    const [again] = days();
    if (!again) throw new Error('two days');
    await user.click(within(again).getByRole('button', { name: 'Check out now' }));
    await act(settle);
    expect(row().textContent).toContain('Day 1 complete');
  });

  it('corrects an angler’s details', async () => {
    const { user, angler, steps, row } = await openRow();
    await user.click(within(row()).getByRole('button', { name: 'Edit profile' }));
    const phone = within(row()).getByLabelText('Phone');
    await user.clear(phone);
    await user.type(phone, '406-555-0177');
    await user.click(within(row()).getByRole('button', { name: 'Save' }));
    await act(settle);
    expect(steps()).toMatchObject([
      {
        fn: 'director_update_angler',
        args: {
          p_angler_id: angler.captainId,
          p_phone: '406-555-0177',
          p_full_name: 'Daniel Turman',
        },
      },
    ]);
    expect(row().textContent).toContain('406-555-0177');
  });

  it('removes an entry only after saying what goes with it', async () => {
    const { user, angler, steps, row } = await openRow();
    await user.click(within(row()).getByRole('button', { name: 'Remove' }));
    expect(row().textContent).toMatch(/permanently deletes the entry and 0 catches/);
    await user.click(within(row()).getByRole('button', { name: 'Yes, remove permanently' }));
    await act(settle);
    expect(steps()).toMatchObject([
      { fn: 'director_remove_entry', args: { p_entry_id: angler.entry.id } },
    ]);
    expect(screen.getByText('No anglers registered yet.')).toBeTruthy();
  });

  it('marks every outstanding fee received in one go, after saying how much', async () => {
    const { server } = field();
    putEntry(server, entryRows({ number: 2, userId: 'device-2', names: ['Second Angler'] }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { sync, user } = await open(server);
    await signIn(user);
    await user.click(screen.getByRole('button', { name: /Contestants/ }));
    expect(screen.getByText(/Entry fees outstanding · \$\d+\.\d\d/)).toBeTruthy();
    server.online = false;
    await user.click(screen.getByRole('button', { name: 'Mark all 2 received' }));
    await act(settle);
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/Mark all 2 outstanding entries/));
    expect(sync.getState().outbox.items[0]?.steps).toHaveLength(2);
    expect(screen.queryByText(/Entry fees outstanding/)).toBeNull();
  });
});

describe('the payout calculator', () => {
  function donation(over: Partial<Row<'donations'>> = {}): Row<'donations'> {
    return {
      id: crypto.randomUUID(),
      event_id: EVENT_ID,
      target: 'solo',
      amount_cents: 5000,
      note: 'Bait shop',
      created_at: '2027-09-01T12:00:00+00:00',
      created_by: 'director-1',
      ...over,
    };
  }

  async function openTool(server: FakeServer) {
    const sent = await open(server);
    await signIn(sent.user);
    await sent.user.click(screen.getByRole('button', { name: /Payout calculator/ }));
    return sent;
  }

  it('builds the pools from the fees received, and names anyone in the money who has not paid', async () => {
    const { server, angler } = field();
    putEntry(
      server,
      entryRows({ number: 2, userId: 'device-2', names: ['Paid Angler'], feePaid: true }),
    );
    server.put('catches', catchRow({ angler_id: angler.captainId }));
    server.put('donations', donation());
    await openTool(server);

    expect(screen.getByRole('button', { name: /Payout calculator/ }).textContent).toContain(
      '$90.00 across current pools',
    );
    const solo = screen.getByRole('region', { name: 'Solo division' });
    expect(solo.textContent).toContain('1 entry · $80.00 pool · +$50.00 donated');
    expect(solo.textContent).toContain('1st$40.00');
    expect(
      screen.getByText('Big Fish pot', { selector: '.lbrow__name' }).closest('.lbrow')?.textContent,
    ).toContain('$10.00');
    expect(screen.getByText('Fees outstanding · $40.00')).toBeTruthy();
    expect(screen.getByText('Daniel Turman (1st in the solo division)')).toBeTruthy();
    expect(screen.getByText(/1 solo, 1 Big Fish: not counted in the pools above/)).toBeTruthy();
    expect(
      within(screen.getByRole('list', { name: 'Donations' })).getByText('Bait shop'),
    ).toBeTruthy();
  });

  it('logs, corrects and removes a donation, and sets the awards budget, with no signal', async () => {
    const { server } = field();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { sync, user } = await openTool(server);
    server.online = false;
    const steps = () => sync.getState().outbox.items.flatMap((i) => i.steps);
    const list = () => screen.getByRole('list', { name: 'Donations' });
    expect(screen.getByText('No donations logged yet.')).toBeTruthy();

    await user.type(screen.getByLabelText('Amount ($)'), 'ten');
    await user.click(screen.getByRole('button', { name: 'Add donation' }));
    expect(screen.getByRole('alert').textContent).toBe('Enter a donation amount greater than $0.');

    await user.selectOptions(screen.getByLabelText('Add to'), 'Team division pool');
    await user.clear(screen.getByLabelText('Amount ($)'));
    await user.type(screen.getByLabelText('Amount ($)'), '25');
    await user.type(screen.getByLabelText('From / note (optional)'), 'Sponsor');
    await user.click(screen.getByRole('button', { name: 'Add donation' }));
    await act(settle);
    expect(steps()).toMatchObject([
      {
        fn: 'director_record_donation',
        args: { p_event_id: EVENT_ID, p_target: 'team', p_amount_cents: 2500, p_note: 'Sponsor' },
      },
    ]);
    expect(list().textContent).toContain('$25.00 · Team pool');
    expect(list().textContent).toContain('Waiting to send.');
    expect(screen.getByRole('region', { name: 'Team division' }).textContent).toContain(
      '+$25.00 donated',
    );

    // Corrected: the old one goes and the new one is logged, in one go.
    await user.click(within(list()).getByRole('button', { name: 'Edit' }));
    const amount = within(list()).getByLabelText('Amount ($)');
    await user.clear(amount);
    await user.type(amount, '30');
    await user.click(within(list()).getByRole('button', { name: 'Save' }));
    await act(settle);
    const [, removed, logged] = steps();
    expect(removed).toMatchObject({ fn: 'director_delete_donation' });
    expect(logged).toMatchObject({
      fn: 'director_record_donation',
      args: { p_amount_cents: 3000 },
    });
    expect(within(list()).getAllByRole('listitem')).toHaveLength(1);
    expect(list().textContent).toContain('$30.00 · Team pool');

    await user.click(within(list()).getByRole('button', { name: 'Remove' }));
    await act(settle);
    expect(confirm).toHaveBeenCalledWith(
      'Remove the $30.00 donation to the team pool? It comes out of the pool.',
    );
    expect(steps().at(-1)).toMatchObject({ fn: 'director_delete_donation' });
    expect(screen.getByText('No donations logged yet.')).toBeTruthy();

    await user.type(screen.getByLabelText('Awards budget ($)'), '250');
    await user.click(screen.getByRole('button', { name: 'Save budget' }));
    await act(settle);
    expect(steps().at(-1)).toMatchObject({
      fn: 'director_set_awards_budget',
      args: { p_event_id: EVENT_ID, p_cents: 25_000 },
    });
    expect(screen.getByText('Awards budget').closest('.lbrow')?.textContent).toContain('−$250.00');
    expect(
      screen.getByText('The awards budget is more than the tournament has raised.'),
    ).toBeTruthy();
  });
});
