import { describe, expect, it } from 'vitest';
import { eventRow } from '../../test/rows';
import { draftFrom, eventArgs, newDraft, parseSplit, type EventDraft } from './eventForm';

const DRAFT: EventDraft = {
  name: ' Montana Kayak Walleye Open ',
  presenter: 'Big Sky Kayak Anglers',
  prefix: 'mkwo28',
  timeZone: 'America/Denver',
  days: ['2028-09-17', '', '2028-09-16', '2028-09-16'],
  lastDay: '2028-06-01',
  linesIn: '07:00',
  linesOut: '14:00',
  finalCheckIn: '15:00',
  courseLabel: 'Canyon Ferry',
  courseLabelLong: 'Canyon Ferry Reservoir · Silos to the Ponds',
  feeSolo: '30',
  feeTeam: '$50.00',
  feeBigFish: '10',
  split: '50/30/20',
};

describe('the event form', () => {
  it('turns what was typed into the save’s arguments', () => {
    const checked = eventArgs('id-1', DRAFT);
    expect(checked).toEqual({
      ok: true,
      args: {
        p_id: 'id-1',
        p_name: 'Montana Kayak Walleye Open',
        p_presenter: 'Big Sky Kayak Anglers',
        p_entry_prefix: 'MKWO28',
        p_time_zone: 'America/Denver',
        // The end of June 1 in Montana.
        p_registration_closes_at: '2028-06-02T06:00:00.000Z',
        p_days: ['2028-09-16', '2028-09-17'],
        p_lines_in: '07:00',
        p_lines_out: '14:00',
        p_final_check_in: '15:00',
        p_course_label: 'Canyon Ferry',
        p_course_label_long: 'Canyon Ferry Reservoir · Silos to the Ponds',
        p_fee_solo_cents: 3000,
        p_fee_team_cents: 5000,
        p_fee_big_fish_cents: 1000,
        p_payout_basis_points: [5000, 3000, 2000],
      },
    });
  });

  it('reads an event back exactly as it was saved', () => {
    const event = eventRow({ registration_closes_at: '2027-06-02T06:00:00+00:00' });
    const draft = draftFrom(event, ['2027-09-19', '2027-09-18']);
    expect(draft).toMatchObject({
      prefix: 'MKWO',
      days: ['2027-09-18', '2027-09-19'],
      lastDay: '2027-06-01',
      linesIn: '07:00',
      feeSolo: '30',
      split: '50/30/20',
    });
    const again = eventArgs(event.id, draft);
    expect(again.ok && again.args['p_registration_closes_at']).toBe('2027-06-02T06:00:00.000Z');
  });

  it('starts a new event from the live one’s money and clock, with no dates', () => {
    const fresh = newDraft(eventRow({ fee_solo_cents: 3550 }));
    expect(fresh).toMatchObject({ name: '', prefix: '', days: [''], feeSolo: '35.50' });
  });

  it('names the box that is wrong', () => {
    const problem = (over: Partial<EventDraft>) => {
      const checked = eventArgs('id', { ...DRAFT, ...over });
      return checked.ok ? null : checked.problem;
    };
    expect(problem({ name: '  ' })).toBe('Give the tournament a name.');
    expect(problem({ prefix: 'M' })).toMatch(/2 to 10 letters and numbers/);
    expect(problem({ timeZone: 'Mars/Olympus' })).toMatch(/time zone/);
    expect(problem({ days: [''] })).toBe('Give every fishing day a date.');
    expect(
      problem({
        days: [
          '2028-09-01',
          '2028-09-02',
          '2028-09-03',
          '2028-09-04',
          '2028-09-05',
          '2028-09-06',
          '2028-09-07',
          '2028-09-08',
        ],
      }),
    ).toBe('An event runs for one to seven days.');
    expect(problem({ lastDay: '' })).toMatch(/last day registration is open/);
    expect(problem({ linesIn: '15:00' })).toMatch(/Lines in comes before lines out/);
    expect(problem({ feeTeam: 'fifty' })).toMatch(/entry fee in dollars/);
    expect(problem({ split: '60/50' })).toMatch(/payout split/);
  });

  it('reads a payout split however it is typed', () => {
    expect(parseSplit('50/30/20')).toEqual([5000, 3000, 2000]);
    expect(parseSplit('60% 40%')).toEqual([6000, 4000]);
    expect(parseSplit('33.33, 33.33, 33.33')).toEqual([3333, 3333, 3333]);
    expect(parseSplit('100')).toEqual([10_000]);
    expect(parseSplit('')).toBeNull();
    expect(parseSplit('50/0/50')).toBeNull();
    expect(parseSplit('70/40')).toBeNull();
  });
});
