import { describe, expect, it } from 'vitest';
import {
  firstPass,
  parsePhotoCheck,
  stampBadges,
  type ReviewContext,
  type ReviewFish,
} from './review';
import type { Catch } from './types';

const DENVER = 'America/Denver';
const at = (hhmm: string, date = '2027-09-18') => Date.parse(`${date}T${hhmm}:00-06:00`);

const HASH = 'f0f0f0f0f0f0f0f0';
const OTHER_HASH = '0f0f0f0f0f0f0f0f';

function fish(over: Partial<Catch> = {}, review: Partial<ReviewFish> = {}): ReviewFish {
  return {
    fish: {
      id: 'c1',
      anglerId: 'a1',
      division: 'solo',
      species: 'Walleye',
      lengthInches: 22,
      loggedAt: at('10:00'),
      status: 'pending',
      ...over,
    },
    anglerName: 'Daniel Turman',
    photo: { hashes: [HASH], brightness: 120, sharpness: 300, srcWidth: 1600, srcHeight: 1200 },
    hasPosition: true,
    verdict: { kind: 'circle', within: true, fromLaunchMiles: 1, outsideMiles: 0 },
    ...review,
  };
}

function context(field: ReviewFish[] = []): ReviewContext {
  return {
    field,
    records: new Map([['Walleye', 36]]),
    scoringSpecies: ['Walleye', 'Pike'],
    dates: ['2027-09-18', '2027-09-19'],
    timeZone: DENVER,
  };
}

const labels = (r: ReviewFish, ctx = context()) => firstPass(r, ctx).checks.map((c) => c.label);

describe('the first pass', () => {
  it('is clear for a good photo, in hours, inside the line', () => {
    expect(firstPass(fish(), context())).toEqual({ level: 'clear', checks: [] });
  });

  it('asks for a closer look at a soft, dark or small photo', () => {
    const r = fish(
      {},
      { photo: { hashes: [HASH], brightness: 40, sharpness: 12, srcWidth: 600, srcHeight: 480 } },
    );
    expect(firstPass(r, context()).level).toBe('review');
    expect(labels(r)).toEqual([
      'Low-resolution photo',
      'Photo looks soft or out of focus',
      'Photo is very dark',
    ]);
  });

  it('flags a photo filed twice, and says whose', () => {
    const earlier = fish(
      { id: 'c0', anglerId: 'a2', lengthInches: 24 },
      { anglerName: 'Pat Partner' },
    );
    const r = fish();
    expect(firstPass(r, context([earlier, r])).checks[0]).toMatchObject({
      level: 'flag',
      label: 'Possible duplicate of Pat Partner’s entry',
    });
    const different = fish(
      { id: 'c0' },
      {
        photo: {
          hashes: [OTHER_HASH],
          brightness: 120,
          sharpness: 300,
          srcWidth: 1600,
          srcHeight: 1200,
        },
      },
    );
    expect(firstPass(r, context([different, r])).level).toBe('clear');
  });

  it('flags a fish over its own species’ record', () => {
    expect(labels(fish({ lengthInches: 37 }))).toEqual(['Length exceeds the record']);
    // Pike has no record set, so a big one is not flagged against walleye's.
    expect(labels(fish({ species: 'Pike', lengthInches: 40 }))).toEqual([]);
  });

  it('notes a fish far above the field once there is a field', () => {
    const field = [18, 19, 20, 20, 21].map((n, i) =>
      fish({ id: `f${String(i)}`, lengthInches: n, status: 'approved' }, { photo: null }),
    );
    expect(labels(fish({ lengthInches: 31 }), context(field))).toEqual([
      'Well above the rest of the field',
    ]);
  });

  it('flags a fish logged outside fishing hours, and only notes another day', () => {
    expect(labels(fish({ loggedAt: at('14:30') }))).toEqual(['Submitted outside fishing hours']);
    expect(firstPass(fish({ loggedAt: at('10:00', '2027-09-20') }), context()).level).toBe('clear');
    expect(labels(fish({ loggedAt: at('10:00', '2027-09-20') }))).toEqual(['Not an event day']);
  });

  it('flags a fish outside the line, and asks about one with no GPS', () => {
    expect(
      labels(
        fish(
          {},
          { verdict: { kind: 'circle', within: false, fromLaunchMiles: 4.6, outsideMiles: 0.6 } },
        ),
      ),
    ).toEqual(['Outside the course boundary']);
    expect(labels(fish({}, { hasPosition: false }))).toEqual(['No GPS on this submission']);
  });
});

describe('the photo stamp', () => {
  const loggedAt = at('10:00');
  it('says how the photo was taken, and whether its clock can be trusted', () => {
    expect(
      stampBadges({ source: 'camera', capturedAt: loggedAt, clockOffsetMs: 0, loggedAt }),
    ).toEqual([{ tone: 'ok', text: 'In-app camera' }]);
    expect(
      stampBadges({ source: 'upload', capturedAt: loggedAt, clockOffsetMs: null, loggedAt }),
    ).toEqual([
      { tone: 'warn', text: 'Uploaded file' },
      { tone: 'plain', text: 'Clock unverified' },
    ]);
    expect(
      stampBadges({
        source: 'camera',
        capturedAt: loggedAt,
        clockOffsetMs: 6 * 60_000,
        loggedAt,
      })[1],
    ).toEqual({ tone: 'bad', text: 'Clock 6 min behind' });
  });

  it('notices a long wait before filing, and a stamp later than the filing', () => {
    expect(
      stampBadges({
        source: 'camera',
        capturedAt: loggedAt - 45 * 60_000,
        clockOffsetMs: 0,
        loggedAt,
      })[1],
    ).toEqual({ tone: 'warn', text: 'Filed 45 min after capture' });
    expect(
      stampBadges({
        source: 'camera',
        capturedAt: loggedAt + 5 * 60_000,
        clockOffsetMs: 0,
        loggedAt,
      })[1],
    ).toEqual({ tone: 'bad', text: 'Stamped after it was filed' });
  });

  it('reads a stored photo check, old or new', () => {
    expect(parsePhotoCheck({ hash: 'ab', brightness: 1, sharpness: 2 })).toMatchObject({
      hashes: ['ab'],
    });
    expect(parsePhotoCheck({ hashes: ['ab', 'cd'], brightness: 1, sharpness: 2 })?.hashes).toEqual([
      'ab',
      'cd',
    ]);
    expect(parsePhotoCheck(null)).toBeNull();
  });
});
