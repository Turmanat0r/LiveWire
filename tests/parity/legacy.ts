// The old app, loaded as an oracle.
//
// The rebuild has to keep every tournament rule exactly as the old app applies
// it: placings, ties, payouts to the cent, the course boundary, the clock,
// handles, photo fingerprints. The surest way to prove that is to run both on
// the same random inputs and compare every answer, which is what the tests in
// this folder do. This file loads the old build (app/livewire.js, compiled from
// the repository root) the same way its own tests did: as one script inside a
// Function, with a stub page around it.
//
// Deleted at cutover, with the old app.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Where the old app's build is. LEGACY_APP_JS wins when set (CI checks the old
 * repository, Turmanat0r/Live-Wire, out and points at it). Otherwise a checkout
 * of it beside this one, under either of the names it has had.
 */
function legacyBuildPath(): string {
  const fromEnv = process.env['LEGACY_APP_JS'];
  if (fromEnv) return fromEnv;
  const candidates = [
    '../../../Live-Wire/app/livewire.js',
    '../../../LiveWire/app/livewire.js',
  ].map((rel) => fileURLToPath(new URL(rel, import.meta.url)));
  return candidates.find((p) => existsSync(p)) ?? candidates[0] ?? '';
}

export interface LegacyAngler {
  id: string;
  name: string;
  handle: string;
  division: 'solo' | 'team';
  role: 'solo' | 'captain' | 'partner';
  teamId: string | null;
  bigfish: boolean;
  pending?: true;
  disqualified?: boolean;
  resident?: boolean;
  checkins?: Record<string, { in: number | null; out: number | null }>;
  /** The trophy case reads these; nothing else here does. */
  eventId?: string;
  phone?: string;
}

export interface LegacyCatch {
  id: string;
  anglerId: string;
  division: 'solo' | 'team';
  species: string;
  length: number;
  timestamp: number;
  status: string;
  eventId?: string;
}

export interface LegacyLatLng {
  lat: number;
  lng: number;
}

export type LegacyBoundary =
  | { kind: 'none' }
  | { kind: 'circle'; center: LegacyLatLng; radiusMiles: number }
  | { kind: 'polygon'; points: LegacyLatLng[] };

export interface LegacyApi {
  standingsFor(
    division: string,
    catches: LegacyCatch[],
    anglers: LegacyAngler[],
    target: string[],
  ): {
    key: string;
    anglerIds: string[];
    best: number;
    bestAt: number;
    top3sum: number;
    count: number;
  }[];
  bigFishWinner(
    anglers: LegacyAngler[],
    catches: LegacyCatch[],
    target: string[],
  ): { anglerId: string; catchId: string; length: number } | null;
  betStanding(
    bet: { kind: 'bet'; id: string; scoring: string },
    rows: { kind: 'join'; id: string; betId: string; anglerId: string }[],
    catches: LegacyCatch[],
    anglerById: Record<string, LegacyAngler>,
  ): { anglerId: string; detail: string } | null;
  splitFor(eligible: number, poolDollars: number): { place: string; amount: number }[];
  poolCounts(anglers: LegacyAngler[]): { solo: number; teams: number; bigfish: number };
  outstandingFees(anglers: LegacyAngler[]): {
    solo: number;
    teams: number;
    bigfish: number;
    total: number;
  };
  milesBetween(lat1: number, lng1: number, lat2: number, lng2: number): number;
  evaluateBoundary(
    lat: number,
    lng: number,
    boundary: LegacyBoundary,
  ): {
    withinBounds: boolean | null;
    outsideMiles: number;
    distanceMiles?: number;
    edgeMiles?: number;
  };
  offsetLatLng(centre: LegacyLatLng, miles: number, bearingRad: number): LegacyLatLng;
  bearingFrom(centre: LegacyLatLng, point: LegacyLatLng): number;
  compassFrom(from: LegacyLatLng, to: LegacyLatLng): string;
  eventTimeParts(now: number): { dateKey: string; seconds: number };
  formatCountdown(seconds: number): string;
  eventDateRangeText(evt: { dates: string[] }): string;
  overdueCheckouts(
    anglers: LegacyAngler[],
    now: number,
  ): { angler: LegacyAngler; overdueSeconds: number }[];
  sortOverdue(
    list: { angler: LegacyAngler; dayKey: string; overdueSeconds: number }[],
    signals: { id: string; at: number }[],
  ): { angler: LegacyAngler }[];
  generateHandle(): string;
  uniqueHandle(anglers: { handle: string }[]): string;
  normPhone(v: string): string;
  hammingHex(a: string, b: string): number;
  photoHashDistance(
    a: { hash: string; hashes: string[] },
    b: { hash: string; hashes: string[] },
  ): { distance: number; cropped: boolean };
  reportFieldCounts(anglers: LegacyAngler[]): {
    anglers: number;
    teams: number;
    paid: number;
    unpaid: number;
  };
  residencyCounts(anglers: LegacyAngler[]): {
    resident: number;
    nonresident: number;
    unknown: number;
    unknownAnglers: LegacyAngler[];
  };
  contestDayHours(anglers: LegacyAngler[], dates: string[]): LegacyDayHours[];
  catchesPerDay(
    catches: LegacyCatch[],
    dates: string[],
  ): { counts: Record<string, number>; offDays: number };
  speciesTally(
    catches: LegacyCatch[],
    died?: Record<string, number>,
  ): { species: string; caught: number; longest: number; died: number; released: number }[];
  sizeDistribution(catches: LegacyCatch[]): {
    small: LegacySizeRow[];
    large: LegacySizeRow[];
    under8: number;
  };
  winningFish(catches: LegacyCatch[], anglers: LegacyAngler[]): LegacyCatch | null;
  reportDueDate(evt: { dates: string[] }): Date | null;
  reportDayRow(
    day: LegacyDayHours,
    settings?: { hours?: Record<string, { start?: string; stop?: string }> },
  ): {
    day: number;
    dateKey: string;
    dayKey: string;
    start: string;
    stop: string;
    overridden: boolean;
    hours: number | null;
  };
  trophyStats(
    anglers: LegacyAngler[],
    catches: LegacyCatch[],
    bets: { kind: 'bet'; id: string; eventId: string; title: string; winnerId: string | null }[],
    myIds: string[],
    infoFor: (eventId: string) => LegacyTrophyInfo,
  ): LegacyTrophyStats;
  trophyBadges(
    stats: LegacyTrophyStats,
  ): { id: string; name: string; icon: string; need: string; earned: boolean }[];
}

export interface LegacyTrophyInfo {
  name: string;
  year: string;
  targetSpecies: string[];
  timeZone: string;
  results: {
    targetSpecies: string[];
    divisions: Record<'solo' | 'team', { anglerIds: string[] }[]>;
    bigFish: { anglerId: string } | null;
    bets: { title: string; winnerId: string | null }[];
  } | null;
}

export interface LegacyTrophyRow {
  eventId: string;
  name: string;
  year: string;
  handle: string;
  frozen: boolean;
  bigFishWon: boolean;
  betsWon: string[];
  division: string;
  fish: number;
  scoring: number;
  best: number;
  bestCatch: LegacyCatch | null;
  top3: number;
  bestDay: number;
  placing: number;
  entrants: number;
  disqualified: boolean;
  bigfish: boolean;
  fullDays: number;
  species: string[];
}

export interface LegacyTrophyStats {
  history: LegacyTrophyRow[];
  events: number;
  fish: number;
  species: string[];
  longest: LegacyCatch | null;
  best: number;
  bestTop3: number;
  bestDay: number;
  mostInEvent: number;
  fullDays: number;
  bigFishBuyIns: number;
  bestPlacing: number;
  wins: number;
  podiums: number;
  bigFishWins: number;
  betsWon: number;
}

export interface LegacyDayHours {
  day: number;
  dateKey: string;
  dayKey: string;
  start: number | null;
  stop: number | null;
  hours: number | null;
}

export interface LegacySizeRow {
  species: string;
  counts: Record<number, number>;
  split: boolean;
}

const EXPORTS: readonly (keyof LegacyApi)[] = [
  'standingsFor',
  'bigFishWinner',
  'betStanding',
  'splitFor',
  'poolCounts',
  'outstandingFees',
  'milesBetween',
  'evaluateBoundary',
  'offsetLatLng',
  'bearingFrom',
  'compassFrom',
  'eventTimeParts',
  'formatCountdown',
  'eventDateRangeText',
  'overdueCheckouts',
  'sortOverdue',
  'generateHandle',
  'uniqueHandle',
  'normPhone',
  'hammingHex',
  'photoHashDistance',
  'reportFieldCounts',
  'residencyCounts',
  'contestDayHours',
  'catchesPerDay',
  'speciesTally',
  'sizeDistribution',
  'winningFish',
  'reportDueDate',
  'reportDayRow',
  'trophyStats',
  'trophyBadges',
];

function fakeElement(): Record<string, unknown> {
  return {
    style: {},
    dataset: {},
    value: '',
    textContent: '',
    disabled: false,
    hidden: false,
    checked: false,
    options: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    focus() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    closest: () => fakeElement(),
    setAttribute() {},
    getAttribute: () => null,
    removeAttribute() {},
    getContext: () => null,
    isConnected: true,
  };
}

let cached: LegacyApi | null = null;

export function loadLegacy(): LegacyApi {
  if (cached) return cached;
  const buildPath = legacyBuildPath();
  if (!existsSync(buildPath)) {
    throw new Error(
      `The old app is not built, so there is nothing to compare against: ${buildPath}\n` +
        'Run `npm ci && npm run build` in a checkout of Turmanat0r/Live-Wire beside this one, or set LEGACY_APP_JS ' +
        'to its app/livewire.js, then run these tests again.',
    );
  }
  const built = readFileSync(buildPath, 'utf8');
  // Device-only: no database, so loading it sends nothing anywhere.
  const offline = built.replace(/const SUPABASE_URL = '[^']*'/, "const SUPABASE_URL = ''");
  if (offline === built) throw new Error('Could not switch the old app off its database');
  const code = `${offline}\nglobalThis.__legacy = { ${EXPORTS.join(', ')} };\n`;

  const elements = new Map<string, Record<string, unknown>>();
  const memory = new Map<string, string>();
  const storage = {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
    clear: () => {
      memory.clear();
    },
  };
  const document = {
    getElementById(id: string) {
      let el = elements.get(id);
      if (!el) {
        el = fakeElement();
        elements.set(id, el);
      }
      return el;
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => fakeElement(),
    addEventListener() {},
    body: fakeElement(),
    activeElement: null,
    title: '',
  };
  const window = {
    localStorage: storage,
    confirm: () => true,
    alert() {},
    addEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  const navigator = { geolocation: null, onLine: true };
  const quiet = { log() {}, warn() {}, error() {} };
  // The clock and the overdue alert start intervals at boot. Nothing here needs
  // them, and they would keep the test process alive.
  const noInterval = () => 0;

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function(
    'window',
    'document',
    'navigator',
    'localStorage',
    'console',
    'alert',
    'confirm',
    'setInterval',
    code,
  ) as (...args: unknown[]) => void;
  run(
    window,
    document,
    navigator,
    storage,
    quiet,
    () => undefined,
    () => true,
    noInterval,
  );

  const api = (globalThis as { __legacy?: LegacyApi }).__legacy;
  if (!api) throw new Error('The old app loaded but did not hand back its functions');
  for (const name of EXPORTS) {
    if (typeof api[name] !== 'function') throw new Error(`The old app has no function ${name}`);
  }
  cached = api;
  return api;
}

/** Run with Math.random and Date.now fixed, so both apps see the same world. */
export function withFixed<T>(opts: { random?: () => number; now?: number }, fn: () => T): T {
  const realRandom = Math.random;
  const realNow = Date.now;
  if (opts.random) Math.random = opts.random;
  if (opts.now !== undefined) {
    const now = opts.now;
    Date.now = () => now;
  }
  try {
    return fn();
  } finally {
    Math.random = realRandom;
    Date.now = realNow;
  }
}
