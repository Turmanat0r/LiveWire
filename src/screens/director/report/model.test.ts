import { describe, expect, it } from 'vitest';
import type { Row } from '../../../data/tables';
import type { ReportAngler } from '../../../domain/report';
import type { Catch } from '../../../domain/types';
import { EVENT_ID, OTHER_EVENT_ID } from '../../../test/rows';
import { buildReport, carriedDetails, parseReportSettings, withDefaults } from './model';
import { reportText } from './ReportSheet';

const DATES = ['2027-09-18', '2027-09-19'];
const ZONE = 'America/Denver';
const at = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00-06:00`);

const angler = (id: string, over: Partial<ReportAngler> = {}): ReportAngler => ({
  id,
  division: 'solo',
  role: 'solo',
  feePaid: true,
  disqualified: false,
  resident: true,
  ...over,
});

const fish = (id: string, inches: number, over: Partial<Catch> = {}): Catch => ({
  id,
  anglerId: 'a',
  division: 'solo',
  species: 'Walleye',
  lengthInches: inches,
  loggedAt: at('2027-09-18', '09:00'),
  status: 'approved',
  ...over,
});

const report = (row: Partial<Row<'event_reports'>>): Row<'event_reports'> => ({
  event_id: OTHER_EVENT_ID,
  settings: {},
  updated_at: '2026-10-01T00:00:00Z',
  ...row,
});

describe('the report’s answers', () => {
  it('keeps only the fields it knows, read defensively', () => {
    expect(
      parseReportSettings({
        filerName: 'Daniel Turman',
        boats: 12,
        hours: { '2027-09-18': { start: '06:45', stop: 7 }, bad: 'x' },
        died: { Walleye: 2, Pike: 'one' },
        evil: '<script>',
      }),
    ).toEqual({
      filerName: 'Daniel Turman',
      hours: { '2027-09-18': { start: '06:45' } },
      died: { Walleye: 2 },
    });
    expect(parseReportSettings(null)).toEqual({});
  });

  it('carries last year’s filer, not last year’s water', () => {
    const carried = carriedDetails(
      [
        report({ settings: { filerName: 'Old Name', savedAt: 1 } }),
        report({
          event_id: crypto.randomUUID(),
          settings: { filerName: 'Daniel Turman', region: '3', airTemp: '60', savedAt: 2 },
        }),
        report({ event_id: EVENT_ID, settings: { filerName: 'This event', savedAt: 3 } }),
      ],
      EVENT_ID,
    );
    expect(carried).toEqual({ filerName: 'Daniel Turman', region: '3' });
  });

  it('defaults the sponsor and the waterbody from the event, until they are typed', () => {
    const event = {
      presenter: 'Big Sky Kayak Anglers',
      course_label_long: 'Canyon Ferry Reservoir',
    };
    expect(withDefaults({}, { filerName: 'Carried' }, event)).toMatchObject({
      filerName: 'Carried',
      sponsor: 'Big Sky Kayak Anglers',
      waterbody: 'Canyon Ferry Reservoir',
    });
    expect(
      withDefaults({ sponsor: 'Bait Shop', filerName: 'Typed' }, { filerName: 'Carried' }, event),
    ).toMatchObject({
      filerName: 'Typed',
      sponsor: 'Bait Shop',
    });
  });
});

describe('the report', () => {
  const inputs = {
    timeZone: ZONE,
    dates: DATES,
    anglers: [angler('a'), angler('b', { feePaid: false, resident: null })],
    checkIns: [
      {
        anglerId: 'a',
        date: DATES[0] ?? '',
        inAt: at('2027-09-18', '06:30'),
        outAt: at('2027-09-18', '14:15'),
      },
      { anglerId: 'b', date: DATES[0] ?? '', inAt: at('2027-09-18', '06:45'), outAt: null },
    ],
    catches: [
      fish('f1', 24.75),
      fish('f2', 15.5),
      fish('f3', 9, { species: 'Perch', status: 'pending' }),
    ],
    species: ['Walleye'],
    settings: {},
    now: at('2027-09-25', '12:00'),
  };

  it('fills the form from the records, and warns where it cannot vouch for a number', () => {
    const model = buildReport(inputs);
    expect(model.counts).toEqual({ anglers: 2, teams: 0, paid: 1, unpaid: 1 });
    expect(model.boats).toBe(2);
    expect(model.boatsDerived).toBe(true);
    expect(model.days[0]).toMatchObject({
      start: '06:30',
      stop: '14:15',
      hours: 7.75,
      caught: 3,
      released: 3,
    });
    expect(model.winner?.id).toBe('f1');
    expect(model.warnings.map((w) => w.kind)).toEqual(['unpaid', 'residency', 'pending']);
    expect(model.due).toEqual({ due: Date.parse('2027-10-19T00:00:00Z'), daysLeft: 24 });
  });

  it('leaves the day’s released box to the director once any fish died, and takes typed hours and boats', () => {
    const model = buildReport({
      ...inputs,
      settings: { died: { Walleye: 1 }, boats: '1', hours: { '2027-09-18': { stop: '15:00' } } },
    });
    expect(model.died).toBe(1);
    expect(model.days[0]).toMatchObject({ stop: '15:00', hours: 8.5, released: null });
    expect(model.boats).toBe(1);
    expect(model.boatsDerived).toBe(false);
  });

  it('copies out as text, empty boxes said so', () => {
    const text = reportText(buildReport(inputs), 'Montana Kayak Walleye Open', '9/25/2027');
    expect(text).toContain('Contest name: Montana Kayak Walleye Open');
    expect(text).toContain('Contest date(s): 9/18/2027, 9/19/2027');
    expect(text).toContain('Form completed by: (not filled in); date: 9/25/2027');
    expect(text).toContain('Walleye: 2 caught, 2 released, 0 died');
    expect(text).toContain('# of Montana residents: 1 (+1 unanswered)');
  });
});
