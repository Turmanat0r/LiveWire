import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StampInput } from '../../domain/capture';
import { FakeServer, settle } from '../../test/fakes';
import { putEntry, renderApp } from '../../test/render';
import { dayRow, entryRows, EVENT_ID, eventRow } from '../../test/rows';
import { testSync } from '../../test/sync';

// Pixels and GPS need a real phone; these tests are about the form and the outbox.
const stamps: StampInput[] = [];
vi.mock('../../photo/capture', () => ({
  preparePickedPhoto: (_file: Blob, stamp: StampInput) => {
    stamps.push(stamp);
    return Promise.resolve({
      blob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }),
      url: 'blob:test-photo',
      source: stamp.source,
      at: stamp.at,
      precheck: {
        hash: 'a',
        hashes: ['a'],
        brightness: 120,
        sharpness: 300,
        srcWidth: 1600,
        srcHeight: 1200,
        analyzedAt: 1,
      },
    });
  },
  preparePhoto: () => Promise.reject(new Error('no camera in a test')),
}));
vi.mock('../../app/location', () => ({
  currentFix: () => Promise.resolve({ lat: 46.39, lng: -111.57, accuracyMiles: 0.01 }),
}));

beforeEach(() => {
  stamps.length = 0;
});

function serverWithEntry(team = false) {
  const server = new FakeServer();
  server.put('events', eventRow({ entry_prefix: 'MKWO' }));
  server.put('event_days', dayRow('2027-09-18'));
  server.put('event_species', {
    event_id: EVENT_ID,
    name: 'Walleye',
    record_inches: 36,
    position: 0,
  });
  server.put('event_species', {
    event_id: EVENT_ID,
    name: 'Pike',
    record_inches: null,
    position: 1,
  });
  const rows = entryRows({ team });
  putEntry(server, rows);
  return { server, rows };
}

async function open(server: FakeServer) {
  const sync = testSync(server);
  renderApp('/catch', sync);
  await act(async () => {
    await sync.start();
    await settle();
  });
  return { sync, user: userEvent.setup() };
}

const fish = () => new File([new Uint8Array([1, 2, 3])], 'fish.jpg', { type: 'image/jpeg' });

describe('submitting a catch', () => {
  it('asks for a registration first', async () => {
    const server = new FakeServer();
    server.put('events', eventRow());
    await open(server);
    expect(screen.getByText('Register an angler first to submit a catch.')).toBeTruthy();
  });

  it('files the catch, its photo and the announcement through the outbox', async () => {
    const { server, rows } = serverWithEntry();
    const { sync, user } = await open(server);
    server.online = false;
    await user.type(screen.getByLabelText('Length (inches)'), '21.5');
    await user.upload(screen.getByLabelText('Or choose a photo you already took'), fish());
    await user.click(screen.getByRole('button', { name: 'Submit catch for scoring' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('My catches');
    });
    const [item] = sync.getState().outbox.items;
    expect(item?.steps.map((s) => (s.kind === 'call' ? s.fn : s.kind))).toEqual([
      'file_catch',
      'upload',
      'post_message',
    ]);
    expect(item?.steps[0]).toMatchObject({
      args: {
        p_angler_id: rows.captainId,
        p_species: 'Walleye',
        p_length_inches: 21.5,
        p_photo_source: 'upload',
        p_lat: 46.39,
        p_boundary: { kind: 'unchecked' },
      },
    });
    expect(stamps[0]).toMatchObject({ prefix: 'MKWO', source: 'upload' });
    // On My catches straight away, though nothing has been sent.
    expect(screen.getByText('Waiting to send')).toBeTruthy();
    expect(screen.getByText('Kept on this phone until there is signal.')).toBeTruthy();
  });

  it('needs a length and a photo before anything is filed', async () => {
    const { server } = serverWithEntry();
    const { sync, user } = await open(server);
    await user.click(screen.getByRole('button', { name: 'Submit catch for scoring' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Enter the length/);
    await user.type(screen.getByLabelText('Length (inches)'), '18');
    await user.click(screen.getByRole('button', { name: 'Submit catch for scoring' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Take or choose a photo/);
    expect(sync.getState().outbox.items).toEqual([]);
  });

  it('checks with the angler about a fish longer than the record', async () => {
    const { server } = serverWithEntry();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { sync, user } = await open(server);
    await user.type(screen.getByLabelText('Length (inches)'), '40');
    await user.upload(screen.getByLabelText('Or choose a photo you already took'), fish());
    await user.click(screen.getByRole('button', { name: 'Submit catch for scoring' }));
    expect(confirm).toHaveBeenCalledWith(
      expect.stringMatching(/longer than the Walleye record of 36/),
    );
    expect(sync.getState().outbox.items).toEqual([]);
  });

  it('lets a team’s phone file for the partner, and says so', async () => {
    const { server, rows } = serverWithEntry(true);
    const { sync, user } = await open(server);
    server.online = false;
    await user.selectOptions(screen.getByLabelText('Angler'), rows.partnerId);
    expect(screen.getByText(/Filing for your partner/)).toBeTruthy();
    await user.type(screen.getByLabelText('Length (inches)'), '17');
    await user.selectOptions(screen.getByLabelText('Species'), 'Pike');
    await user.click(screen.getByLabelText(/Tell the field/));
    await user.upload(screen.getByLabelText('Or choose a photo you already took'), fish());
    await user.click(screen.getByRole('button', { name: 'Submit catch for scoring' }));
    await waitFor(() => {
      expect(sync.getState().outbox.items).toHaveLength(1);
    });
    const [item] = sync.getState().outbox.items;
    expect(item?.steps).toHaveLength(2);
    expect(item?.steps[0]).toMatchObject({
      args: { p_angler_id: rows.partnerId, p_species: 'Pike' },
    });
  });
});
