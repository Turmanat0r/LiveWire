import { describe, expect, it } from 'vitest';
import { dateRangeText, dayPhase, formatCountdown, zonedParts } from './time';

const DENVER = 'America/Denver';
const DATES = ['2027-09-18', '2027-09-19'];
// 18 Sep 2027 is MDT, UTC-6.
const at = (hhmm: string, date = '2027-09-18') => Date.parse(`${date}T${hhmm}:00-06:00`);

describe('zonedParts', () => {
  it('reads the date and time on the event’s clock, not the phone’s', () => {
    expect(zonedParts(at('23:30'), DENVER)).toEqual({
      dateKey: '2027-09-18',
      secondsOfDay: 23 * 3600 + 1800,
    });
    expect(zonedParts(at('23:30'), 'UTC').dateKey).toBe('2027-09-19');
  });
});

describe('dayPhase', () => {
  it('walks a tournament day: before lines in, fishing, return window, complete', () => {
    expect(dayPhase(at('06:00'), DATES, DENVER)).toEqual({
      kind: 'before-lines-in',
      day: 1,
      linesInIn: 3600,
    });
    expect(dayPhase(at('13:00'), DATES, DENVER)).toEqual({
      kind: 'fishing',
      day: 1,
      linesOutIn: 3600,
      finalCheckInIn: 7200,
    });
    expect(dayPhase(at('14:30'), DATES, DENVER)).toEqual({
      kind: 'return-window',
      day: 1,
      finalCheckInIn: 1800,
    });
    expect(dayPhase(at('15:00', '2027-09-19'), DATES, DENVER)).toEqual({
      kind: 'complete',
      day: 2,
    });
    expect(dayPhase(at('12:00', '2027-09-20'), DATES, DENVER)).toEqual({ kind: 'not-event-day' });
  });

  it('follows the event’s own schedule', () => {
    const early = {
      linesInMinutes: 6 * 60,
      linesOutMinutes: 12 * 60,
      finalCheckInMinutes: 13 * 60,
    };
    expect(dayPhase(at('12:30'), DATES, DENVER, early).kind).toBe('return-window');
  });
});

describe('formatting', () => {
  it('formats a countdown and never goes negative', () => {
    expect(formatCountdown(3725)).toBe('01:02:05');
    expect(formatCountdown(-5)).toBe('00:00:00');
  });

  it('writes a date range the way people say it', () => {
    expect(dateRangeText(['2027-09-18', '2027-09-19'])).toBe('Sep 18–19, 2027');
    expect(dateRangeText(['2027-09-30', '2027-10-01'])).toBe('Sep 30–Oct 1, 2027');
    expect(dateRangeText(['2027-09-18'])).toBe('Sep 18, 2027');
    expect(dateRangeText([])).toBe('');
  });
});
