import { describe, expect, it } from 'vitest';
import { serverConfig } from './config';
import { httpFailure, parseSignal } from './supabase';

describe('a signal off the socket', () => {
  it('is taken when it names a table and some of its key columns', () => {
    expect(parseSignal({ table: 'catches', key: { id: 'c1' }, id: 'realtime-id' })).toEqual({
      table: 'catches',
      key: { id: 'c1' },
    });
    expect(
      parseSignal({ table: 'check_ins', key: { angler_id: 'a1', day: '2027-09-18' } }),
    ).toEqual({ table: 'check_ins', key: { angler_id: 'a1', day: '2027-09-18' } });
  });

  it('is ignored when it names a table or a column the app does not know', () => {
    expect(parseSignal({ table: 'auth_users', key: { id: 'x' } })).toBeNull();
    expect(parseSignal({ table: 'catches', key: { length_inches: 30 } })).toBeNull();
    expect(parseSignal({ table: 'catches', key: {} })).toBeNull();
    expect(parseSignal({ table: 'catches', key: { id: { nested: true } } })).toBeNull();
    expect(parseSignal('catches')).toBeNull();
    expect(parseSignal(null)).toBeNull();
  });
});

describe('an answer from the server', () => {
  it('with no status never reached it', () => {
    expect(httpFailure(0, '', '')).toEqual({ kind: 'offline' });
  });

  it('of 401 means the sign-in lapsed', () => {
    expect(httpFailure(401, 'PGRST303', 'JWT expired')).toEqual({ kind: 'signed-out' });
  });

  it('of busy or broken is worth trying again', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(httpFailure(status, 'x', 'y')).toEqual({ kind: 'unavailable', status });
    }
  });

  it('of any other refusal is final, with its reason', () => {
    expect(httpFailure(400, 'event_closed', 'This event is closed to new catches.')).toEqual({
      kind: 'refused',
      key: 'event_closed',
      detail: 'This event is closed to new catches.',
    });
    expect(httpFailure(403, 'not_your_entry', 'No.')).toMatchObject({ kind: 'refused' });
  });
});

describe('the server address', () => {
  it('needs both the address and the key', () => {
    expect(serverConfig({})).toBeNull();
    expect(serverConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(
      serverConfig({
        VITE_SUPABASE_URL: ' https://x.supabase.co ',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'k',
      }),
    ).toEqual({ url: 'https://x.supabase.co', key: 'k' });
  });
});
