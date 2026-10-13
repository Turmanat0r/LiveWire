import { describe, expect, it } from 'vitest';
import { filingItem, parseLength, photoPath, trustedOffset, type Filing } from './filing';

const precheck = {
  hash: 'ab',
  hashes: ['ab', 'cd'],
  brightness: 120,
  sharpness: 300,
  srcWidth: 1920,
  srcHeight: 1440,
  analyzedAt: 1,
};

const filing: Filing = {
  catchId: 'c1',
  messageId: 'm1',
  eventId: 'e1',
  anglerId: 'a1',
  phoneAnglerId: 'a0',
  species: 'Walleye',
  lengthInches: 21.5,
  loggedAt: Date.parse('2027-09-18T15:00:00Z'),
  photo: { at: Date.parse('2027-09-18T14:58:00Z'), source: 'camera', precheck },
  clockOffsetMs: 4000,
  fix: { lat: 46.39, lng: -111.57, accuracyMiles: 0.0123456 },
  boundary: { kind: 'circle', within: true, fromLaunchMiles: 1.2, outsideMiles: 0 },
  announce: true,
};

describe('filing a catch', () => {
  it('files the catch, then its photo, then tells the field, then where the phone is', () => {
    const item = filingItem(filing);
    expect(item.id).toBe('c1');
    expect(item.label).toBe('Walleye, 21.5 in');
    expect(item.steps.map((s) => (s.kind === 'call' ? s.fn : s.kind))).toEqual([
      'file_catch',
      'upload',
      'post_message',
      'record_position',
    ]);
    expect(item.steps[1]).toEqual({ kind: 'upload', path: 'e1/c1.jpg', file: 'photo' });
    expect(item.steps[2]).toMatchObject({ args: { p_catch_id: 'c1', p_body: '' } });
    // The phone's own angler, on the server's clock.
    expect(item.steps[3]).toMatchObject({
      args: { p_angler_id: 'a0', p_lat: 46.39, p_at: '2027-09-18T15:00:04.000Z' },
    });
  });

  it('sends what the photo and the phone knew when it was taken', () => {
    const [first] = filingItem(filing).steps;
    expect(first).toMatchObject({
      kind: 'call',
      args: {
        p_id: 'c1',
        p_species: 'Walleye',
        p_length_inches: 21.5,
        p_logged_at: '2027-09-18T15:00:00.000Z',
        p_captured_at: '2027-09-18T14:58:00.000Z',
        p_photo_source: 'camera',
        p_clock_offset_ms: 4000,
        p_lat: 46.39,
        p_accuracy_miles: 0.012,
        p_boundary: { kind: 'circle', within: true },
        p_precheck: { hash: 'ab', hashes: ['ab', 'cd'] },
      },
    });
  });

  it('says nothing to the field unless asked, and nothing of a missing fix', () => {
    const item = filingItem({ ...filing, announce: false, fix: null });
    expect(item.steps).toHaveLength(2);
    expect(item.steps[0]).toMatchObject({ args: { p_lat: null, p_lng: null } });
  });

  it('names the photo the way the database does', () => {
    expect(photoPath('e1', 'c1')).toBe('e1/c1.jpg');
  });

  it('takes lengths the database will take, to the hundredth', () => {
    expect(parseLength('21.5')).toBe(21.5);
    expect(parseLength(' 18.25 ')).toBe(18.25);
    expect(parseLength('0')).toBeNull();
    expect(parseLength('120')).toBeNull();
    expect(parseLength('abc')).toBeNull();
  });

  it('trusts a clock reading for a day', () => {
    const now = 10 * 24 * 60 * 60_000;
    expect(trustedOffset({ offsetMs: 5, measuredAt: now - 60_000 }, now)).toBe(5);
    expect(trustedOffset({ offsetMs: 5, measuredAt: now - 25 * 60 * 60_000 }, now)).toBeNull();
    expect(trustedOffset(null, now)).toBeNull();
  });
});
