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
