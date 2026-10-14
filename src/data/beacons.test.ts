import { describe, expect, it } from 'vitest';
import { beaconPhase, refusedBeacons } from './beacons';
import type { OutboxItem } from './local';

let seq = 0;
function item(fn: 'raise_beacon' | 'stand_down_beacon', failure: OutboxItem['failure'] = null) {
  seq += 1;
  return {
    seq,
    id: `i${String(seq)}`,
    label: fn,
    createdAt: 0,
    attempts: 0,
    failure,
    steps: [{ kind: 'call', fn, args: { p_angler_id: 'me' } }],
  } satisfies OutboxItem;
}

const me = new Set(['me']);

describe('this phone’s beacon', () => {
  it('counts a beacon raised with no signal as on its way up', () => {
    expect(beaconPhase(false, [item('raise_beacon')], me)).toBe('raising');
    expect(beaconPhase(true, [item('raise_beacon')], me)).toBe('up');
  });

  it('follows whatever was asked last', () => {
    expect(beaconPhase(true, [item('stand_down_beacon')], me)).toBe('standing-down');
    expect(beaconPhase(false, [item('stand_down_beacon'), item('raise_beacon')], me)).toBe(
      'raising',
    );
    expect(beaconPhase(true, [item('raise_beacon'), item('stand_down_beacon')], me)).toBe(
      'standing-down',
    );
  });

  it('ignores other entries, and does not wait on what the server refused', () => {
    expect(beaconPhase(false, [item('raise_beacon')], new Set(['someone else']))).toBe('none');
    const refused = item('raise_beacon', { key: 'not_your_entry', detail: 'No.' });
    expect(beaconPhase(false, [refused], me)).toBe('none');
    expect(refusedBeacons([refused], me)).toEqual([refused]);
  });
});
