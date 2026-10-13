import { describe, expect, it } from 'vitest';
import { ageText, overdueAnglers, sortOverdue, type CheckIn } from './safety';

const DENVER = 'America/Denver';
const DATES = ['2027-09-18', '2027-09-19'];
const at = (hhmm: string, date = '2027-09-18') => Date.parse(`${date}T${hhmm}:00-06:00`);

const checkIns: CheckIn[] = [
  { anglerId: 'out', date: '2027-09-18', inAt: at('06:30'), outAt: null },
  { anglerId: 'back', date: '2027-09-18', inAt: at('06:30'), outAt: at('14:10') },
  { anglerId: 'never', date: '2027-09-18', inAt: null, outAt: null },
  { anglerId: 'yesterday', date: '2027-09-17', inAt: at('06:30', '2027-09-17'), outAt: null },
];

describe('overdueAnglers', () => {
  it('is empty until the final check-in has passed', () => {
    expect(overdueAnglers(checkIns, at('14:59'), DATES, DENVER)).toEqual([]);
  });

  it('names who launched today and has not come back', () => {
    expect(overdueAnglers(checkIns, at('15:20'), DATES, DENVER)).toEqual([
      { anglerId: 'out', overdueSeconds: 20 * 60 },
    ]);
  });

  it('works on every day of a longer event, not just the first two', () => {
    const three = [...DATES, '2027-09-20'];
    const day3: CheckIn[] = [
      { anglerId: 'x', date: '2027-09-20', inAt: at('07:00', '2027-09-20'), outAt: null },
    ];
    expect(overdueAnglers(day3, at('16:00', '2027-09-20'), three, DENVER)).toHaveLength(1);
  });
});

describe('sortOverdue', () => {
  it('puts never-seen first, then the stalest position, then by name', () => {
    const now = at('15:30');
    const seen = new Map([
      ['fresh', now - 5 * 60_000],
      ['stale', now - 90 * 60_000],
    ]);
    const list = ['fresh', 'stale', 'zed', 'amy'].map((anglerId) => ({ anglerId }));
    expect(sortOverdue(list, seen, (id) => id, now).map((x) => x.anglerId)).toEqual([
      'amy',
      'zed',
      'stale',
      'fresh',
    ]);
  });
});

describe('ageText', () => {
  const now = Date.UTC(2027, 8, 18, 18, 0);
  const ago = (minutes: number) => now - minutes * 60_000;
  it('says how long ago a position was taken, as the old app did', () => {
    expect(ageText(null, now)).toBe('never');
    expect(ageText(ago(0.5), now)).toBe('just now');
    expect(ageText(ago(12), now)).toBe('12 min ago');
    expect(ageText(ago(61), now)).toBe('1 hour ago');
    expect(ageText(ago(150), now)).toBe('3 hours ago');
    expect(ageText(ago(25 * 60), now)).toBe('over a day ago');
  });
});
