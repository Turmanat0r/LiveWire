import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FakeServer, refusal, settle } from '../../test/fakes';
import { putEntry, renderApp } from '../../test/render';
import { dayRow, entryRows, eventRow } from '../../test/rows';
import { testSync } from '../../test/sync';

function serverWithEvent(over: Parameters<typeof eventRow>[0] = {}) {
  const server = new FakeServer();
  server.put('events', eventRow(over));
  server.put('event_days', dayRow('2027-09-18'));
  server.put('event_days', dayRow('2027-09-19'));
  return server;
}

async function open(server: FakeServer) {
  const sync = testSync(server);
  renderApp('/register', sync);
  await act(async () => {
    await sync.start();
    await settle();
  });
  return { sync, user: userEvent.setup() };
}

async function fillSolo(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Your name'), 'Daniel Turman');
  await user.type(screen.getByLabelText('Phone'), '406-555-0100');
  await user.type(screen.getByLabelText('Emergency contact'), 'Shore Contact');
  await user.type(screen.getByLabelText('Emergency contact phone'), '406-555-0199');
  await user.click(screen.getByRole('radio', { name: 'Montana resident' }));
}

const alertText = () => screen.getByRole('alert').textContent;

describe('registering', () => {
  it('heads the screen with the event, as the old register screen did', async () => {
    await open(serverWithEvent());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Montana Kayak Walleye Open',
    );
    expect(screen.getByText('Big Sky Kayak Anglers presents')).toBeTruthy();
  });

  it('files the form, then shows the entry and the codes to write on the board', async () => {
    const server = serverWithEvent();
    server.answers.set('register_entry', () => {
      putEntry(server, entryRows());
      return {};
    });
    const { user } = await open(server);
    await fillSolo(user);
    await user.click(screen.getByRole('button', { name: 'Complete registration' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'You are registered' })).toBeTruthy();
    });
    expect(server.calls[0]?.fn).toBe('register_entry');
    expect(server.calls[0]?.args).toMatchObject({ p_division: 'solo' });
    expect(server.calls[0]?.args['p_captain']).toMatchObject({
      fullName: 'Daniel Turman',
      resident: true,
    });
    expect(screen.getByText('7K4M')).toBeTruthy();
    expect(screen.getByText('MKWO-001')).toBeTruthy();
    expect(screen.getByText('Entry fee not matched up yet')).toBeTruthy();
  });

  it('says what is missing before asking the server', async () => {
    const server = serverWithEvent();
    const { user } = await open(server);
    await user.click(screen.getByRole('button', { name: 'Complete registration' }));
    expect(alertText()).toBe('Enter your first and last name.');
    expect(server.calls).toEqual([]);
  });

  it('passes on the server’s reason when it refuses', async () => {
    const server = serverWithEvent();
    server.answers.set('register_entry', () => {
      throw refusal('already_registered_phone', 'That phone number is already on the roster.');
    });
    const { user } = await open(server);
    await fillSolo(user);
    await user.click(screen.getByRole('button', { name: 'Complete registration' }));
    await waitFor(() => {
      expect(alertText()).toBe('That phone number is already on the roster.');
    });
  });

  it('says plainly that it needs signal', async () => {
    const server = serverWithEvent();
    const { user } = await open(server);
    server.online = false;
    await fillSolo(user);
    await user.click(screen.getByRole('button', { name: 'Complete registration' }));
    await waitFor(() => {
      expect(alertText()).toMatch(/^No signal\. Registering needs signal/);
    });
  });

  it('is closed after the last day, and says until when it was open', async () => {
    await open(serverWithEvent({ registration_closes_at: '2020-06-02T06:00:00Z' }));
    expect(screen.getByText(/Registration closed on June 1, 2020/)).toBeTruthy();
    const submit = screen.getByRole('button', { name: 'Complete registration' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists the field by handle, never by name', async () => {
    const server = serverWithEvent();
    putEntry(server, entryRows({ number: 3, userId: 'device-2', names: ['Secret Name'] }));
    await open(server);
    expect(screen.getByText('Salty Bedrock Perch')).toBeTruthy();
    expect(screen.getByText(/Solo · MKWO-003/)).toBeTruthy();
    expect(screen.queryByText('Secret Name')).toBeNull();
  });
});

describe('bringing an entry onto this phone', () => {
  it('finds it by Tournament ID and phone, or says nothing matched', async () => {
    const server = serverWithEvent();
    let match = false;
    server.answers.set('claim_entry', () => {
      if (!match) return null;
      putEntry(server, entryRows());
      return {};
    });
    const { user } = await open(server);
    await user.click(screen.getByRole('button', { name: 'Sign in to my entry' }));
    await user.type(screen.getByLabelText('Tournament ID'), '7k4m');
    await user.type(screen.getByLabelText('Phone you registered with'), '406-555-0100');
    await user.click(screen.getByRole('button', { name: 'Bring my entry over' }));
    await waitFor(() => {
      expect(alertText()).toMatch(/No entry matches/);
    });
    expect(server.calls[0]?.args).toEqual({ p_code: '7K4M', p_phone: '406-555-0100' });

    match = true;
    await user.click(screen.getByRole('button', { name: 'Bring my entry over' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'You are registered' })).toBeTruthy();
    });
  });

  it('signs the phone out again, leaving the entry on the roster', async () => {
    const server = serverWithEvent();
    const rows = entryRows();
    putEntry(server, rows);
    server.answers.set('leave_entry', () => {
      for (const d of rows.devices) server.remove('entry_devices', d);
      return null;
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user } = await open(server);
    await user.click(screen.getByRole('button', { name: 'Sign this phone out of the entry' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Complete registration' })).toBeTruthy();
    });
    expect(screen.getByText('Salty Bedrock Perch')).toBeTruthy();
  });
});
