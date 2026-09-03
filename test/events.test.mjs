// LiveWire tests.
//
//   node test/events.test.mjs            (from the project root)
//   node test/events.test.mjs some.html  (to check a different copy)
//
// No dependencies and nothing to install - it needs only Node.
//
// HOW IT WORKS
// There is no build step and no module system to hook into, so this pulls the
// inline <script> straight out of index.html, runs it inside a Function() with
// stub DOM objects passed in as arguments, and has the script hand its
// internals back through globalThis.__t. That means these tests exercise the
// REAL shipped code - not a copy of it that can drift.
//
// WHAT IT COVERS
// The parts where a mistake is silent and expensive: event scoping, the
// deletion logic that could wipe another event's records, boundary geometry,
// and species scoring. It does NOT cover rendering - there is no browser here,
// so anything visual still needs a human to look at it.
//
// If you add a function you want to test, add it to the globalThis.__t block
// below and it becomes available as t.yourFunction().
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HTML = process.argv[2] || path.join(HERE, '..', 'index.html');
if (!fs.existsSync(HTML)) {
  console.error('Cannot find ' + HTML + '\nRun this from the project root, or pass the path to index.html.');
  process.exit(1);
}
const src = fs.readFileSync(HTML, 'utf8');
const m = src.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('no inline script found'); process.exit(1); }

// Force device-only mode at load; individual tests install a fake backend.
let code = m[1].replace(/const SUPABASE_URL = '[^']*'/, "const SUPABASE_URL = ''");
if (!/const SUPABASE_URL = ''/.test(code)) { console.error('could not neutralise SUPABASE_URL'); process.exit(1); }

code += `
globalThis.__t = {
  get store(){ return store; }, set store(v){ store = v; },
  liveCache, loadedIds, EVENTS, LEGACY_EVENT_ID, DEFAULT_EVENT_ID,
  activeEventId, activeEvent, setActiveEvent, saveConfig, eventById,
  cachedRows, saveCollection, rowEventId, isActiveEventRow, mergeIntoCache,
  loadAnglers, saveAnglers, loadCatches, saveCatches, loadDonations, saveDonations,
  loadCatchesAllEvents, allRows, evaluateFirstPass,
  eventSettings, saveEventSettings, targetSpecies, recordInches, courseBoundary,
  isScoringSpecies, OTHER_SPECIES, evaluateBoundary, boundaryIsUsable,
  pointInPolygon, distanceToPolygonEdgeMiles, normalizeBoundary, parsePointLines,
  describeBoundary, boundaryCenter, milesBetween, offsetLatLng, bearingFrom,
  SPECIES_PRESETS, SPECIES_CUSTOM, speciesPreset,
  updateGuide, renderSpeciesOptions, submittedSpecies,
  allEvents, visibleEvents, storedEvents, saveEventRecord, deleteEventRecord,
  slugifyEventId, parseDateLines, isValidTimeZone,
  registrationCloseFromDate, registrationCloseToDate, isRegistrationClosed,
  registrationCloseText,
  myAnglerIds, populateAnglerSelect, statusClass, statusHtml, lengthHtml, escapeHtml,
  bearerToken, authModeLabel, noteAuthSession, initAuth, SUPABASE_ANON_KEY,
  supabaseBackend,
  get authMode(){ return authMode; },
  get adminUnlocked(){ return adminUnlocked; }, set adminUnlocked(v){ adminUnlocked = v; },
  loadAwardsBudget, saveAwardsBudget, awardsBudgetMap,
  standingsFor, eventDateRangeText, eventRowCounts, eventDayText,
  getMyAnglerId, setMyAnglerId, onRows, readOutbox
};
`;

// ---- stubs ----
function makeStorage(mem) {
  return {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: k => { mem.delete(k); },
    clear: () => mem.clear()
  };
}
const mem = new Map();
const localStorage = makeStorage(mem);
function fakeEl() {
  const el = {
    style: { cssText: '', display: '' }, dataset: {}, value: '', textContent: '', innerHTML: '',
    disabled: false, hidden: false, checked: false, options: [],
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){}, appendChild(){}, focus(){},
    querySelectorAll(){ return []; }, querySelector(){ return null; },
    closest(){ return fakeEl(); }, setAttribute(){}, getAttribute(){ return null; },
    getContext(){ return null; }, isConnected: true
  };
  return el;
}
// getElementById hands back the SAME object for a given id, so a test can set
// a value on one element and read what the code did to another. Without this
// every lookup was a throwaway and nothing about the DOM could be asserted -
// which is how the camera guide broke without a test noticing.
const elById = new Map();
function getEl(id) {
  if (!elById.has(id)) elById.set(id, fakeEl());
  return elById.get(id);
}
// The app's init catches any startup throw and paints a red banner into the
// body. Capturing appendChild turns that into a test assertion.
const startupBanners = [];
const document = {
  getElementById: getEl,
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: () => fakeEl(),
  addEventListener(){},
  body: Object.assign(fakeEl(), { appendChild(n){ startupBanners.push(n.textContent); } }),
  get activeElement(){ return null; },
  title: ''
};
const bootErrors = [];
const quietConsoleWithErrors = { log(){}, warn(){}, error(...a){ bootErrors.push(a.map(String).join(' ')); } };
const window = { localStorage, confirm: () => true, alert(){}, addEventListener(){}, matchMedia: () => ({ matches:false, addEventListener(){} }) };
const navigator = { geolocation: null, onLine: true };
const quietConsole = { log(){}, error(){}, warn(){} };

// A fresh instance of the whole app, with its own in-memory state. Used where a
// test needs a genuinely cold start (a phone opening the page for the first time).
function boot(storageMem) {
  const store = makeStorage(storageMem || new Map());
  const win = Object.assign({}, window, { localStorage: store });
  new Function('window', 'document', 'navigator', 'localStorage', 'console', 'alert', 'confirm', code)
    (win, document, navigator, store, quietConsoleWithErrors, () => {}, () => true);
  return globalThis.__t;
}

const t = boot(mem);
const E1 = t.EVENTS[0].id;   // mkwo-2027, the legacy event
const E2 = t.EVENTS[1].id;   // mkwo-2028

// ---- tiny assert harness ----
let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(name, got, want) {
  if (eq(got, want)) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)); }
}
function section(s){ console.log('\n' + s); }

// Put the cache in a known state, as if the backend had just delivered it.
function seed(anglers, catches, donations, config) {
  t.liveCache.anglers = anglers || [];
  t.liveCache.catches = catches || [];
  t.liveCache.donations = donations || [];
  t.liveCache.config = config || {};
  t.loadedIds.anglers = null; t.loadedIds.catches = null; t.loadedIds.donations = null;
}
async function setEvent(id) { t.liveCache.config = Object.assign({}, t.liveCache.config, { activeEventId: id }); }

// ============================================================
section('1. legacy rows (no eventId) belong to the first event');
seed(
  [{ id: 'a1', name: 'Legacy Angler', division: 'solo' }],                 // no eventId
  [{ id: 'c1', anglerId: 'a1', status: 'approved', species: 'Walleye', division: 'solo', length: 20 }],
  []
);
check('rowEventId falls back to the first event', t.rowEventId({ id: 'x' }), E1);
check('an explicit stamp wins', t.rowEventId({ id: 'x', eventId: E2 }), E2);

// Installing this version onto a store that predates events must change nothing.
const fresh = boot(new Map());
fresh.liveCache.config = {};                      // config with no activeEventId
check('an un-set store defaults to the original event', fresh.activeEventId(), E1);
fresh.liveCache.anglers = [{ id: 'a0', name: 'Existing' }];   // legacy, unstamped
fresh.loadedIds.anglers = null;
check('and its existing roster is still visible',
  (await fresh.loadAnglers()).map(a => a.id), ['a0']);

await setEvent(E1);
check('legacy angler is visible under event 1', (await t.loadAnglers()).map(a => a.id), ['a1']);
await setEvent(E2);
check('legacy angler is hidden under event 2', (await t.loadAnglers()).map(a => a.id), []);

// ============================================================
section('2. the four features read scoped data');
seed(
  [{ id: 'a1', eventId: E1, name: 'Ann', division: 'solo', bigfish: true },
   { id: 'a2', eventId: E2, name: 'Bob', division: 'solo', bigfish: true }],
  [{ id: 'c1', eventId: E1, anglerId: 'a1', anglerName: 'Ann', status: 'approved', species: 'Walleye', division: 'solo', length: 25, location: { withinBounds: true, distanceMiles: 1 }, timestamp: 1 },
   { id: 'c2', eventId: E2, anglerId: 'a2', anglerName: 'Bob', status: 'approved', species: 'Walleye', division: 'solo', length: 30, location: null, timestamp: 2 }],
  [{ id: 'd1', eventId: E1, target: 'solo', amount: 100 },
   { id: 'd2', eventId: E2, target: 'solo', amount: 500 }]
);

await setEvent(E1);
let ang = await t.loadAnglers(), cat = await t.loadCatches(), don = await t.loadDonations();
check('leaderboard sees only event 1', t.standingsFor('solo', cat, ang).map(r => r.name), ['Ann']);
check('GPS check sees only event 1 catches', cat.map(c => c.id), ['c1']);
check('Big Fish pot sees only event 1 anglers', ang.filter(a => a.bigfish).map(a => a.name), ['Ann']);
check('payout sees only event 1 donations', don.reduce((s, d) => s + d.amount, 0), 100);

await setEvent(E2);
ang = await t.loadAnglers(); cat = await t.loadCatches(); don = await t.loadDonations();
check('leaderboard sees only event 2', t.standingsFor('solo', cat, ang).map(r => r.name), ['Bob']);
check('GPS check sees only event 2 catches', cat.map(c => c.id), ['c2']);
check('Big Fish pot sees only event 2 anglers', ang.filter(a => a.bigfish).map(a => a.name), ['Bob']);
check('payout sees only event 2 donations', don.reduce((s, d) => s + d.amount, 0), 500);

// ============================================================
section('3. saving under one event must not touch the other (device-only)');
t.store = null;
seed(
  [{ id: 'a1', eventId: E1, name: 'Ann', division: 'solo' },
   { id: 'a2', eventId: E2, name: 'Bob', division: 'solo' }],
  [], []
);
await setEvent(E2);
const list = await t.loadAnglers();
list.push({ id: 'a3', name: 'Cal', division: 'solo' });
await t.saveAnglers(list);
check('other event survives in the cache',
  t.liveCache.anglers.map(a => a.id).sort(), ['a1', 'a2', 'a3']);
check('other event survives in the local mirror',
  JSON.parse(localStorage.getItem('mkwo:anglers')).map(a => a.id).sort(), ['a1', 'a2', 'a3']);
check('the new row was stamped with the live event',
  t.liveCache.anglers.find(a => a.id === 'a3').eventId, E2);
check('the untouched event-1 row kept its stamp',
  t.liveCache.anglers.find(a => a.id === 'a1').eventId, E1);

// ============================================================
section('4. deletes stay inside the live event (store backend)');
const ops = [];
t.store = {
  label: 'fake', photoBudget: 999999,
  async connect(){}, start(){},
  async applyOp(op){ ops.push(op); },
  photoUrlFor(){ return ''; },
  async getPhoto(){ return ''; },
  async deletePhoto(){}
};
seed(
  [],
  [{ id: 'c1', eventId: E1, anglerId: 'a1', length: 20 },
   { id: 'c2', eventId: E1, anglerId: 'a1', length: 21 },
   { id: 'c9', eventId: E2, anglerId: 'a2', length: 30 }],
  []
);
await setEvent(E1);
const mine = await t.loadCatches();
check('only event 1 catches loaded', mine.map(c => c.id), ['c1', 'c2']);
const kept = mine.filter(c => c.id !== 'c2');       // angler withdraws one catch
ops.length = 0;
await t.saveCatches(kept);
check('exactly one delete was issued',
  ops.filter(o => o.kind === 'delete').map(o => o.id), ['c2']);
check('no delete touched the other event',
  ops.some(o => o.kind === 'delete' && o.id === 'c9'), false);
check('the other event is still in the cache',
  t.liveCache.catches.map(c => c.id).sort(), ['c1', 'c9']);

// ============================================================
section('5. a full-table read is never mistaken for deletions');
// The nightmare case: load under event 2 (empty), save, and confirm event 1 is
// not wiped as "rows the user removed".
seed(
  [{ id: 'a1', eventId: E1, name: 'Ann' }, { id: 'a2', eventId: E1, name: 'Amy' }],
  [], []
);
await setEvent(E2);
ops.length = 0;
const emptyList = await t.loadAnglers();
check('event 2 starts empty', emptyList.length, 0);
emptyList.push({ id: 'b1', name: 'New Angler' });
await t.saveAnglers(emptyList);
check('no deletes issued at all', ops.filter(o => o.kind === 'delete').length, 0);
check('event 1 roster intact',
  t.liveCache.anglers.filter(a => t.rowEventId(a) === E1).map(a => a.id).sort(), ['a1', 'a2']);

// ============================================================
section('6. legacy rows get a real stamp when next written');
seed([{ id: 'a1', name: 'Legacy' }], [], []);
await setEvent(E1);
ops.length = 0;
const legacy = await t.loadAnglers();
legacy[0].phone = '406-555-0100';
await t.saveAnglers(legacy);
check('the write carries the event stamp', ops.find(o => o.id === 'a1').body.eventId, E1);
check('the cache now holds it explicitly', t.liveCache.anglers[0].eventId, E1);

// ============================================================
section('7. awards budget is per event, and the old single value migrates');
seed([], [], [], { awardsBudget: 250 });          // pre-events config shape
await setEvent(E1);
check('legacy budget reads as event 1\'s', await t.loadAwardsBudget(), 250);
await setEvent(E2);
check('event 2 starts at zero', await t.loadAwardsBudget(), 0);
await t.saveAwardsBudget(400);
check('event 2 budget saved', await t.loadAwardsBudget(), 400);
await setEvent(E1);
check('event 1 budget untouched', await t.loadAwardsBudget(), 250);
check('the stale single value was dropped', t.liveCache.config.awardsBudget, undefined);

// ============================================================
section('8. config writes merge instead of replacing');
seed([], [], [], {});
await t.setActiveEvent(E2);
await t.saveAwardsBudget(75);
check('saving a budget kept the live event', t.liveCache.config.activeEventId, E2);
check('and kept the budget', t.awardsBudgetMap()[E2], 75);
ops.length = 0;
await t.saveAwardsBudget(80);
const cfgOp = ops.find(o => o.coll === 'config');
check('the record written to the store carries both fields',
  [cfgOp.body.activeEventId, cfgOp.body.awardsBudgets[E2]], [E2, 80]);

// ============================================================
section('9. the phone\'s own angler id is per event');
mem.clear();
seed([], [], [], {});
await setEvent(E1);
t.setMyAnglerId('a1');
check('event 1 remembers a1', t.getMyAnglerId(), 'a1');
await setEvent(E2);
check('event 2 does not know that angler', t.getMyAnglerId(), null);
t.setMyAnglerId('b1');
check('event 2 remembers b1', t.getMyAnglerId(), 'b1');
await setEvent(E1);
check('switching back restores a1', t.getMyAnglerId(), 'a1');

// Cold start, the way an already-registered phone opens the updated page: only
// the pre-events key is on the device, and nothing is cached in memory yet.
const legacyMem = new Map([['mkwo:myAnglerId', 'old-a']]);
const t2 = boot(legacyMem);
t2.liveCache.config = { activeEventId: E1 };
check('an existing registration still resolves', t2.getMyAnglerId(), 'old-a');
t2.liveCache.config = { activeEventId: E2 };
check('but not into the next event', t2.getMyAnglerId(), null);

// ============================================================
section('10. display helpers');
check('same-month range', t.eventDateRangeText({ dates: ['2027-09-18', '2027-09-19'] }), 'Sep 18–19, 2027');
check('month-crossing range', t.eventDateRangeText({ dates: ['2027-09-30', '2027-10-01'] }), 'Sep 30–Oct 1, 2027');
check('single day', t.eventDateRangeText({ dates: ['2027-09-18'] }), 'Sep 18, 2027');
check('date is not shifted by the local time zone', t.eventDayText('2027-09-18'), 'Sep 18');

// ============================================================
section('11. duplicate-photo detection spans events, scoring does not');
const HASH_A = 'ffffffffffffffff';
const HASH_B = 'fffffffffffffffe';   // 1 bit off A - a near-identical photo
const HASH_C = '0000000000000000';   // nothing like it
const pre = h => ({ hash: h, sharpness: 999, brightness: 128, srcWidth: 2000, srcHeight: 1500 });

seed(
  [],
  [ // last year's winning fish
    { id: 'old1', eventId: E1, anglerId: 'a1', anglerName: 'Ann', species: 'Walleye',
      status: 'approved', division: 'solo', length: 28, precheck: pre(HASH_A), timestamp: Date.UTC(2027, 8, 18, 15) },
    // this year: four approved fish, so the median check has a field to work with
    ...[18, 19, 20, 21, 22].map((len, i) => ({
      id: 'new' + i, eventId: E2, anglerId: 'b' + i, anglerName: 'Angler ' + i, species: 'Walleye',
      status: 'approved', division: 'solo', length: len, precheck: pre(HASH_C), timestamp: Date.UTC(2028, 8, 16, 15)
    }))
  ],
  []
);
await setEvent(E2);

const thisYear = await t.loadCatches();
const everything = await t.loadCatchesAllEvents();
check('the scoped field is this event only', thisYear.length, 5);
check('the duplicate corpus reaches back', everything.length, 6);

// Bob submits last year's photo as his own.
const suspect = { id: 'sus', eventId: E2, anglerId: 'b9', anglerName: 'Bob', species: 'Walleye',
  status: 'pending', division: 'solo', length: 28, precheck: pre(HASH_B), timestamp: Date.UTC(2028, 8, 16, 16) };

const withCorpus = t.evaluateFirstPass(suspect, thisYear, everything);
const dupHit = withCorpus.checks.find(x => /reused|duplicate/i.test(x.label));
check('the reused photo is caught', !!dupHit, true);
check('and flagged, not merely noted', dupHit && dupHit.level, 'flag');
check('the label says it came from an earlier event',
  dupHit && /earlier event/.test(dupHit.label), true);
check('the detail names the year it came from',
  dupHit && /2027/.test(dupHit.detail), true);

// Same call with only this year's field: the old behaviour, blind to it.
const scopedOnly = t.evaluateFirstPass(suspect, thisYear, thisYear);
check('scoping the corpus would have missed it',
  scopedOnly.checks.some(x => /reused|duplicate/i.test(x.label)), false);

// Same person re-entering across events is named as such, not as a stranger.
const selfReuse = Object.assign({}, suspect, { anglerName: 'Ann' });
const selfHit = t.evaluateFirstPass(selfReuse, thisYear, everything).checks
  .find(x => /reused|duplicate/i.test(x.label));
check('a self-reuse across events is recognised',
  selfHit && /this angler's earlier event/.test(selfHit.label), true);

// The median check must NOT see last year's field.
const tall = { id: 'tall', eventId: E2, anglerId: 'b9', anglerName: 'Bob', species: 'Walleye',
  status: 'pending', division: 'solo', length: 31, precheck: pre(HASH_C), timestamp: Date.UTC(2028, 8, 16, 16) };
const medianCheck = t.evaluateFirstPass(tall, thisYear, everything).checks
  .find(x => /above the rest of the field/.test(x.label));
check('the median compares against this event only',
  medianCheck && /across 5 approved/.test(medianCheck.detail), true);

// And the cross-event read must not have poisoned the delete logic.
ops.length = 0;
const keepAll = await t.loadCatches();
await t.loadCatchesAllEvents();                     // read every event...
await t.saveCatches(keepAll);                       // ...then save the scoped list
check('reading across events issues no deletes',
  ops.filter(o => o.kind === 'delete').length, 0);
check('last year is still on record',
  t.liveCache.catches.some(c => c.id === 'old1'), true);

// ============================================================
section('12. course boundary — circle');
const near = (got, want, tol, name) => check(name, Math.abs(got - want) <= tol, true);

seed([], [], [], {});
await setEvent(E1);
const C = { lat: 46.38917, lng: -111.57556 };
await t.saveEventSettings({ course: { kind: 'circle', center: C, radiusMiles: 4 } });

let v = t.evaluateBoundary(C.lat, C.lng);
check('the launch point is in bounds', v.withinBounds, true);
near(v.outsideMiles, 0, 0.001, 'and zero miles outside');

const fiveNorth = C.lat + 5 / 69.0546;
v = t.evaluateBoundary(fiveNorth, C.lng);
check('five miles out of a four mile circle is outside', v.withinBounds, false);
near(v.distanceMiles, 5, 0.05, 'distance from launch is about 5 mi');
near(v.outsideMiles, 1, 0.05, 'which is about 1 mi past the line');

const justInside = C.lat + 3.9 / 69.0546;
check('3.9 miles out is still inside', t.evaluateBoundary(justInside, C.lng).withinBounds, true);

// ============================================================
section('13. course boundary — polygon');
// A square, roughly 6.9 mi tall and 4.8 mi wide at this latitude.
const SQUARE = [
  { lat: 46.40, lng: -111.60 }, { lat: 46.40, lng: -111.50 },
  { lat: 46.30, lng: -111.50 }, { lat: 46.30, lng: -111.60 }
];
check('a point in the middle is inside', t.pointInPolygon(46.35, -111.55, SQUARE), true);
check('a point north of it is outside', t.pointInPolygon(46.45, -111.55, SQUARE), false);
check('a point east of it is outside', t.pointInPolygon(46.35, -111.40, SQUARE), false);

await t.saveEventSettings({ course: { kind: 'polygon', points: SQUARE } });
v = t.evaluateBoundary(46.35, -111.55);
check('the polygon reads as in bounds', v.withinBounds, true);
near(v.outsideMiles, 0, 0.001, 'nothing outside when inside');
// The nearest edge from the centre is east/west: 0.05 deg of longitude at this
// latitude is ~2.38 mi, against ~3.45 mi for 0.05 deg of latitude.
near(v.edgeMiles, 2.38, 0.1, 'and about 2.38 mi of room to the nearest edge');

v = t.evaluateBoundary(46.45, -111.55);
check('north of the square is out of bounds', v.withinBounds, false);
near(v.outsideMiles, 3.45, 0.15, 'about 3.45 mi past the top edge');

v = t.evaluateBoundary(46.35, -111.40);
near(v.outsideMiles, 4.77, 0.2, 'about 4.77 mi past the east edge');

check('a two-point outline is not usable', t.boundaryIsUsable({ kind:'polygon', points: SQUARE.slice(0,2) }), false);
check('a three-point outline is', t.boundaryIsUsable({ kind:'polygon', points: SQUARE.slice(0,3) }), true);

// ============================================================
section('14. no boundary is a third state, not "outside"');
await t.saveEventSettings({ course: { kind: 'none' } });
v = t.evaluateBoundary(46.35, -111.55);
check('withinBounds is null, not false', v.withinBounds, null);
check('a zero-radius circle is unusable', t.boundaryIsUsable({ kind:'circle', center:C, radiusMiles:0 }), false);
check('a circle with no centre is unusable', t.boundaryIsUsable({ kind:'circle', radiusMiles:4 }), false);

// ============================================================
section('15. boundary editor helpers');
check('a circle drops stale polygon points',
  t.normalizeBoundary({ kind:'circle', center:C, radiusMiles:4, points:SQUARE }),
  { kind:'circle', center:{ lat:C.lat, lng:C.lng }, radiusMiles:4 });
check('"none" keeps nothing', t.normalizeBoundary({ kind:'none', center:C }), { kind:'none' });
check('coordinates parse from comma-separated lines',
  t.parsePointLines('46.40, -111.60\n46.30,-111.50'),
  [{ lat:46.40, lng:-111.60 }, { lat:46.30, lng:-111.50 }]);
check('blank and malformed lines are skipped',
  t.parsePointLines('46.40, -111.60\n\n  \nnot a point\n46.30 -111.50').length, 2);
check('a circle describes itself', /4 mile circle/.test(t.describeBoundary({ kind:'circle', center:C, radiusMiles:4 })), true);

// ============================================================
section('16. target species is per event and director-set');
seed([], [], [], {});
await setEvent(E1);
check('it starts from the event default', t.targetSpecies(), 'Walleye');
check('as does the length ceiling', t.recordInches(), 36);

await t.saveEventSettings({ targetSpecies: 'Largemouth Bass', recordInches: 30 });
check('the director override wins', t.targetSpecies(), 'Largemouth Bass');
check('and carries the new ceiling', t.recordInches(), 30);
check('the new species scores', t.isScoringSpecies('Largemouth Bass'), true);
check('the old one no longer does', t.isScoringSpecies('Walleye'), false);
check('"Other" never scores', t.isScoringSpecies(t.OTHER_SPECIES), false);

await setEvent(E2);
check('the other event is untouched', t.targetSpecies(), 'Walleye');
await setEvent(E1);
check('and switching back keeps the override', t.targetSpecies(), 'Largemouth Bass');

// ============================================================
section('17. scoring follows the target species');
seed(
  [{ id:'a1', eventId:E1, name:'Ann', division:'solo', bigfish:true }],
  [{ id:'c1', eventId:E1, anglerId:'a1', anglerName:'Ann', species:'Walleye',
     status:'approved', division:'solo', length:25 },
   { id:'c2', eventId:E1, anglerId:'a1', anglerName:'Ann', species:'Largemouth Bass',
     status:'approved', division:'solo', length:19 },
   { id:'c3', eventId:E1, anglerId:'a1', anglerName:'Ann', species:'Other',
     status:'approved', division:'solo', length:40 }],
  [], {}
);
await setEvent(E1);
let cs = await t.loadCatches(), as = await t.loadAnglers();
check('a walleye event ranks the walleye',
  t.standingsFor('solo', cs, as).map(r => r.best), [25]);

await t.saveEventSettings({ targetSpecies: 'Largemouth Bass' });
check('switching the target re-ranks on the bass',
  t.standingsFor('solo', cs, as).map(r => r.best), [19]);
check('"Other" is never ranked, whatever the target is',
  t.standingsFor('solo', cs, as).every(r => r.best !== 40), true);

await t.saveEventSettings({ targetSpecies: 'Northern Pike' });
check('a species nobody has logged ranks nobody',
  t.standingsFor('solo', cs, as).length, 0);

// ============================================================
section('18. drag-handle geometry');
// Dragging the radius handle reads the new radius straight back out of these
// two, so they have to round-trip cleanly at every bearing.
const HUB = { lat: 46.38917, lng: -111.57556 };
[0, Math.PI/2, Math.PI, -Math.PI/2, 0.7, 2.6].forEach(bearing=>{
  [0.25, 2, 7].forEach(miles=>{
    const p = t.offsetLatLng(HUB, miles, bearing);
    const backMiles = t.milesBetween(HUB.lat, HUB.lng, p.lat, p.lng);
    const backBearing = t.bearingFrom(HUB, p);
    const tag = miles + ' mi @ ' + bearing.toFixed(2) + ' rad';
    check('distance round-trips — ' + tag, Math.abs(backMiles - miles) < 0.01, true);
    // Compare as a wrapped difference so -pi and +pi count as equal.
    const dB = Math.atan2(Math.sin(backBearing - bearing), Math.cos(backBearing - bearing));
    check('bearing round-trips — ' + tag, Math.abs(dB) < 0.001, true);
  });
});
const east = t.offsetLatLng(HUB, 4, Math.PI/2);
check('due east keeps the same latitude', Math.abs(east.lat - HUB.lat) < 1e-9, true);
check('and moves east', east.lng > HUB.lng, true);
const north = t.offsetLatLng(HUB, 4, 0);
check('due north keeps the same longitude', Math.abs(north.lng - HUB.lng) < 1e-9, true);
check('and moves north', north.lat > HUB.lat, true);

// A dragged radius handle lands on the circle it just resized.
const dragged = t.offsetLatLng(HUB, 3.4, 1.1);
const newRadius = t.milesBetween(HUB.lat, HUB.lng, dragged.lat, dragged.lng);
await t.saveEventSettings({ course:{ kind:'circle', center:HUB, radiusMiles:newRadius } });
check('the handle sits exactly on the new edge',
  t.evaluateBoundary(dragged.lat, dragged.lng).outsideMiles < 0.001, true);

// ============================================================
section('19. the species preset list');
const allPresets = t.SPECIES_PRESETS.flatMap(g => g.items);
check('the list is not empty', allPresets.length > 10, true);
check('every group is labelled', t.SPECIES_PRESETS.every(g => !!g.group && g.items.length > 0), true);
check('every entry has a name', allPresets.every(p => typeof p.name === 'string' && p.name.trim()), true);
check('every entry has a plausible ceiling',
  allPresets.every(p => p.inches > 10 && p.inches < 100), true);

const names = allPresets.map(p => p.name);
check('no duplicate species', names.length, new Set(names).size);

// A preset called "Other" would collide with the not-scored bucket, and the
// save handler would reject a species the dropdown itself offered.
check('nothing collides with the not-scored bucket',
  names.some(n => n.toLowerCase() === t.OTHER_SPECIES.toLowerCase()), false);
check('nothing collides with the custom sentinel',
  names.includes(t.SPECIES_CUSTOM), false);

check('a known species resolves', t.speciesPreset('Walleye').inches, 36);
check('one from another group resolves', t.speciesPreset('Redfish').inches, 60);
check('an unknown species does not', t.speciesPreset('Lake Sturgeon'), null);

// The ceiling has to clear the real fish, or genuine catches get flagged.
check('the walleye ceiling clears the record (~35")', t.speciesPreset('Walleye').inches >= 36, true);
check('the largemouth ceiling clears the record (~29.5")',
  t.speciesPreset('Largemouth Bass').inches >= 30, true);
check('the pike ceiling clears the record (~55")',
  t.speciesPreset('Northern Pike').inches >= 55, true);

// Every preset must survive being saved and read back as the scoring species.
seed([], [], [], {});
await setEvent(E1);
for(const p of allPresets){
  await t.saveEventSettings({ targetSpecies: p.name, recordInches: p.inches });
  if(t.targetSpecies() !== p.name || t.recordInches() !== p.inches){
    check('preset round-trips — ' + p.name, false, true);
  }
}
check('every preset round-trips as a saved setting', true, true);

// ============================================================
section('20. the camera guide');
// The bump-board guide is what tells an angler nose-to-the-stop and hands off
// the scale. It went missing for every event that did not score walleye,
// because the whole overlay was keyed on the species rather than just the fish
// outline inside it. These pin that down.
const board = () => elById.get('vf-guide-board').style.display;
const plainBox = () => elById.get('vf-guide-other').style.display;
const fishOutline = () => elById.get('vf-fish-walleye').style.display;
const hint = () => elById.get('vf-hint').textContent;

seed([], [], [], {});
await setEvent(E1);

// A walleye event: the full guide, silhouette included.
await t.saveEventSettings({ targetSpecies: 'Walleye' });
t.renderSpeciesOptions();
check('the dropdown lands on the scoring species', elById.get('sub-species').value, 'Walleye');
t.updateGuide();
check('the board guide is shown', board(), 'block');
check('the plain box is not', plainBox(), 'none');
check('the walleye outline is shown', fishOutline(), '');
check('the hint mentions the outline', /blue outline/.test(hint()), true);

// A bass event: the guide must still be there. This is the regression.
await t.saveEventSettings({ targetSpecies: 'Largemouth Bass' });
t.renderSpeciesOptions();
t.updateGuide();
check('the board guide survives a non-walleye event', board(), 'block');
check('the walleye outline is dropped', fishOutline(), 'none');
check('the plain box stays hidden', plainBox(), 'none');
check('the hint still says nose to the stop', /nose to the stop/.test(hint()), true);
check('but no longer promises an outline', /blue outline/.test(hint()), false);

// "Other (not scored)" is the one case that gets the plain framing box.
elById.get('sub-species').value = t.OTHER_SPECIES;
t.updateGuide();
check('a not-scored fish gets the plain box', plainBox(), 'block');
check('and not the board guide', board(), 'none');
check('the hint just says frame it', /Frame the whole fish/.test(hint()), true);

// startCamera() can reach updateGuide() before the dropdown is built. An empty
// value used to read as "not the scoring species" and hide the guide.
elById.get('sub-species').value = '';
elById.get('sub-species').options = [];
check('an empty dropdown falls back to the scoring species',
  t.submittedSpecies(), 'Largemouth Bass');
t.updateGuide();
check('and the guide is shown, not hidden', board(), 'block');
check('with the plain box off', plainBox(), 'none');

// Same again for a walleye event, outline included.
await t.saveEventSettings({ targetSpecies: 'Walleye' });
elById.get('sub-species').value = '';
t.updateGuide();
check('an empty dropdown still gets the walleye outline', fishOutline(), '');

// A species the angler picked must survive a background repaint.
await t.saveEventSettings({ targetSpecies: 'Walleye' });
elById.get('sub-species').value = t.OTHER_SPECIES;
elById.get('sub-species').options = [{}, {}];
t.renderSpeciesOptions();
check('"Other" is not silently switched back to the scoring species',
  elById.get('sub-species').value, t.OTHER_SPECIES);

// ============================================================
section('21. events the director creates');
seed([], [], [], {});
await setEvent(E1);

check('only the built-ins to start', t.allEvents().length, t.EVENTS.length);
check('and they are flagged as built-in', t.allEvents().every(e => e.builtIn === true), true);

await t.saveEventRecord('mkwo-2029', {
  name:'Montana Kayak Walleye Open', prefix:'MKWO29',
  dates:['2029-09-15','2029-09-16'], timeZone:'America/Denver',
  courseLabel:'Canyon Ferry', courseLabelLong:'Canyon Ferry',
  registrationClose:'2029-06-02T00:00:00-06:00',
  targetSpecies:'Walleye', recordInches:36,
  course:{ kind:'circle', center:{ lat:46.38917, lng:-111.57556 }, radiusMiles:4 }
});
check('a created event joins the list', t.allEvents().length, t.EVENTS.length + 1);
check('and is not flagged built-in', t.eventById('mkwo-2029').builtIn, false);
check('it resolves by id', t.eventById('mkwo-2029').prefix, 'MKWO29');
check('with its dates', t.eventDateRangeText(t.eventById('mkwo-2029')), 'Sep 15–16, 2029');

// A created event has to work as a full event, not a listing.
await setEvent('mkwo-2029');
check('it can be made live', t.activeEventId(), 'mkwo-2029');
check('its species applies', t.targetSpecies(), 'Walleye');
check('its boundary applies', t.courseBoundary().radiusMiles, 4);
check('its prefix drives entry IDs', t.activeEvent().prefix, 'MKWO29');

// Records stamped to it must scope like any other event's.
t.liveCache.anglers = [
  { id:'x1', eventId:'mkwo-2029', name:'New Angler', division:'solo' },
  { id:'x2', eventId:E1, name:'Old Angler', division:'solo' }
];
t.loadedIds.anglers = null;
check('records scope to a created event', (await t.loadAnglers()).map(a=>a.name), ['New Angler']);
await setEvent(E1);
check('and the built-in event is unaffected', (await t.loadAnglers()).map(a=>a.name), ['Old Angler']);

// ============================================================
section('22. editing a built-in event');
await setEvent(E1);
const beforeEdit = t.eventById(E1);
check('starts from the shipped prefix', beforeEdit.prefix, 'MKWO');
await t.saveEventRecord(E1, { prefix:'MKWO27' });
check('the edit takes effect', t.eventById(E1).prefix, 'MKWO27');
check('untouched fields survive', t.eventById(E1).name, beforeEdit.name);
check('as do its dates', t.eventById(E1).dates.length, 2);
check('and it is still a built-in', t.eventById(E1).builtIn, true);
check('the id is never stored inside the record', 'id' in t.storedEvents()[E1], false);
check('nor is the derived builtIn flag', 'builtIn' in t.storedEvents()[E1], false);

// ============================================================
section('23. archiving keeps records, hides the event');
seed([], [], [], {});
await t.saveEventRecord('old-event', {
  name:'Old Open', prefix:'OLD', dates:['2026-08-01'], timeZone:'America/Denver',
  registrationClose:'2026-06-02T00:00:00-06:00', targetSpecies:'Walleye', recordInches:36
});
t.liveCache.catches = [{ id:'oc1', eventId:'old-event', anglerId:'oa', length:22 }];
await setEvent(E1);

check('it is in the switcher to begin with',
  t.visibleEvents().some(e => e.id === 'old-event'), true);
await t.saveEventRecord('old-event', { archived:true });
check('archiving takes it out of the switcher',
  t.visibleEvents().some(e => e.id === 'old-event'), false);
check('but it still resolves by id', !!t.eventById('old-event'), true);

// A second write must MERGE into the record, not replace it. A built-in hides
// this bug - its shipped values backfill whatever the patch left out - so it
// has to be checked on a director-created event, where nothing backfills.
check('archiving keeps the name', t.eventById('old-event').name, 'Old Open');
check('archiving keeps the prefix', t.eventById('old-event').prefix, 'OLD');
check('archiving keeps the dates', t.eventById('old-event').dates, ['2026-08-01']);
check('archiving keeps the time zone', t.eventById('old-event').timeZone, 'America/Denver');
check('and it is still in the full list',
  t.allEvents().some(e => e.id === 'old-event'), true);
check('its records are untouched',
  t.liveCache.catches.filter(c => t.rowEventId(c) === 'old-event').length, 1);
check('and are still reachable by switching to it', (await (async ()=>{
  await setEvent('old-event');
  const n = (await t.loadCatches()).length;
  await setEvent(E1);
  return n;
})()), 1);

// The live event must never vanish from its own switcher, however it got
// archived - that would leave the director looking at a list without it.
await setEvent('old-event');
check('an archived event that is live stays visible',
  t.visibleEvents().some(e => e.id === 'old-event'), true);
await setEvent(E1);

await t.saveEventRecord('old-event', { archived:false });
check('restoring puts it back', t.visibleEvents().some(e => e.id === 'old-event'), true);

// ============================================================
section('24. deleting an event');
seed([], [], [], {});
await setEvent(E1);
await t.saveEventRecord('empty-one', {
  name:'Empty Open', prefix:'EMP', dates:['2030-05-01'], timeZone:'America/Denver',
  registrationClose:'2030-04-01T00:00:00-06:00', targetSpecies:'Walleye', recordInches:36
});
check('it exists', !!t.eventById('empty-one'), true);
await t.deleteEventRecord('empty-one');
check('deleting removes it', t.eventById('empty-one'), null);
check('and it leaves the stored map', 'empty-one' in t.storedEvents(), false);

// A built-in cannot be deleted - it lives in the code and returns on reload.
await t.deleteEventRecord(E1);
check('a built-in survives a delete attempt', !!t.eventById(E1), true);
check('and keeps its shipped values', t.eventById(E1).prefix, 'MKWO');

// ============================================================
section('25. event id generation');
seed([], [], [], {});
check('a slug comes from the name and year',
  t.slugifyEventId('Montana Kayak Walleye Open', '2030'), 'montana-kayak-walleye-open-2030');
check('punctuation and spacing collapse',
  t.slugifyEventId('Bob\'s  Big   Bass Bash!!', '2031'), 'bob-s-big-bass-bash-2031');
check('an empty name still yields an id', t.slugifyEventId('', '2032'), 'event-2032');
check('it avoids colliding with a built-in',
  t.slugifyEventId('mkwo', '2027') === 'mkwo-2027', false);
await t.saveEventRecord('taken-2030', { name:'Taken', prefix:'TK', dates:['2030-01-01'] });
check('and with one already created', t.slugifyEventId('taken', '2030'), 'taken-2030-2');

// ============================================================
section('26. form validation helpers');
check('a good date parses', t.parseDateLines('2029-09-15').map(p=>p.key), ['2029-09-15']);
check('a short form normalises', t.parseDateLines('2029-9-5').map(p=>p.key), ['2029-09-05']);
check('blank lines are ignored', t.parseDateLines('\n2029-09-15\n\n').length, 1);
check('a nonsense line is flagged', !!t.parseDateLines('next tuesday')[0].bad, true);
check('an impossible date is flagged', !!t.parseDateLines('2029-02-31')[0].bad, true);
check('month 13 is flagged', !!t.parseDateLines('2029-13-01')[0].bad, true);
check('a leap day is accepted', t.parseDateLines('2028-02-29').map(p=>p.key), ['2028-02-29']);
check('a non-leap 29 Feb is flagged', !!t.parseDateLines('2029-02-29')[0].bad, true);

check('a real zone is accepted', t.isValidTimeZone('America/Denver'), true);
check('another real zone', t.isValidTimeZone('Europe/London'), true);
check('a made-up zone is rejected', t.isValidTimeZone('Mars/Olympus'), false);
check('an empty zone is rejected', t.isValidTimeZone(''), false);

// Registration close: the form takes the last day open, and stores the instant
// entries stop - the start of the following day, in the event's own zone.
const summer = t.registrationCloseFromDate('2029-06-01', 'America/Denver');
check('a summer close picks up MDT', /^2029-06-02T00:00:00-06:00$/.test(summer), true);
const winter = t.registrationCloseFromDate('2029-12-01', 'America/Denver');
check('a winter close picks up MST', /^2029-12-02T00:00:00-07:00$/.test(winter), true);
check('it round-trips back to the day entered',
  t.registrationCloseToDate(summer, 'America/Denver'), '2029-06-01');
check('including across the winter offset',
  t.registrationCloseToDate(winter, 'America/Denver'), '2029-12-01');
check('a nonsense date yields nothing', t.registrationCloseFromDate('whenever', 'America/Denver'), null);

// And the stored instant has to actually gate registration.
seed([], [], [], {});
await t.saveEventRecord('gate-test', {
  name:'Gate', prefix:'GT', dates:['2029-09-15'], timeZone:'America/Denver',
  registrationClose: summer, targetSpecies:'Walleye', recordInches:36
});
await setEvent('gate-test');
check('registration is open before the deadline (2029 is in the future)',
  t.isRegistrationClosed(), false);
await t.saveEventRecord('gate-test', {
  registrationClose: t.registrationCloseFromDate('2020-06-01', 'America/Denver') });
check('and closed after it', t.isRegistrationClosed(), true);
check('the closing date reads back as the last open day',
  /June 1, 2020/.test(t.registrationCloseText()), true);

// ============================================================
section('27. angler pickers are scoped to the device');
// Every picker in the app listed the whole field, so anyone could submit as,
// check in as, or edit the catches of any other angler.
const ROSTER = [
  { id:'solo1', eventId:E1, name:'Ann',  division:'solo', role:'solo',    teamId:null, tournamentId:'MKWO-001' },
  { id:'cap1',  eventId:E1, name:'Bob',  division:'team', role:'captain', teamId:'t1', tournamentId:'MKWO-002' },
  { id:'par1',  eventId:E1, name:'Cal',  division:'team', role:'partner', teamId:'t1', tournamentId:'MKWO-002P' },
  { id:'solo2', eventId:E1, name:'Dee',  division:'solo', role:'solo',    teamId:null, tournamentId:'MKWO-003' }
];
seed(ROSTER, [], [], {});
await setEvent(E1);
t.adminUnlocked = false;

// A solo angler's device may act only for that angler.
t.setMyAnglerId('solo1');
check('a solo device owns one entry', t.myAnglerIds(ROSTER), ['solo1']);
await t.populateAnglerSelect('sub-angler', 'sub-angler-note');
let opts = elById.get('sub-angler').innerHTML;
check('the picker offers only that angler', (opts.match(/<option/g) || []).length, 1);
check('and it is the right one', /MKWO-001/.test(opts), true);
check('a stranger is not listed', /MKWO-003/.test(opts), false);
check('no warning note when scoped', elById.get('sub-angler-note').textContent, '');

// A team captain's device holds the partner's record too - it is the only
// device that does, so it must be able to act for them.
t.setMyAnglerId('cap1');
check('a captain owns both team entries', t.myAnglerIds(ROSTER).sort(), ['cap1','par1']);
await t.populateAnglerSelect('man-angler', 'man-angler-note');
opts = elById.get('man-angler').innerHTML;
check('the picker offers both teammates', (opts.match(/<option/g) || []).length, 2);
check('the captain is there', /MKWO-002\)/.test(opts), true);
check('so is the partner', /MKWO-002P/.test(opts), true);
check('and still no stranger', /MKWO-001/.test(opts), false);

// The partner's own phone, if they register on it, sees the same pair.
t.setMyAnglerId('par1');
check('the partner sees the same team', t.myAnglerIds(ROSTER).sort(), ['cap1','par1']);

// The director may act for anyone.
t.setMyAnglerId('solo1');
t.adminUnlocked = true;
await t.populateAnglerSelect('checkin-angler', 'checkin-angler-note');
opts = elById.get('checkin-angler').innerHTML;
check('with director access the whole field is listed', (opts.match(/<option/g) || []).length, 4);
check('and the reason is stated',
  /Director access/.test(elById.get('checkin-angler-note').textContent), true);
t.adminUnlocked = false;

// A wiped or replaced phone has no registration to scope to. It keeps the full
// list rather than being locked out mid-event, and says why.
seed(ROSTER, [], [], {});
const wiped = boot(new Map());
wiped.liveCache.config = { activeEventId: E1 };
wiped.liveCache.anglers = ROSTER;
wiped.loadedIds.anglers = null;
check('an unlinked device owns nothing', wiped.myAnglerIds(ROSTER), []);
await wiped.populateAnglerSelect('sub-angler', 'sub-angler-note');
check('so it falls back to the whole field',
  (elById.get('sub-angler').innerHTML.match(/<option/g) || []).length, 4);
check('and says the device is unlinked',
  /no registration on it/.test(elById.get('sub-angler-note').textContent), true);

// ============================================================
section('28. untrusted catch fields are escaped');
// Records are writable by anyone holding the page's anon key, and these render
// in the DIRECTOR's browser - the session that holds the passcode.
const XSS = '<img src=x onerror=alert(1)>';
check('a script payload in status cannot reach the class attribute',
  t.statusClass(XSS), 'pending');
check('an unknown status falls back to pending', t.statusClass('haxxed'), 'pending');
check('real statuses pass through', [t.statusClass('pending'), t.statusClass('approved'), t.statusClass('rejected')],
  ['pending','approved','rejected']);
// The word "onerror" surviving as inert TEXT is fine - what must not survive
// is a real tag. So the test is about angle brackets, not scary substrings:
// the only markup in the output may be the span this function wrote itself.
check('the payload creates no element', /<img/.test(t.statusHtml(XSS)), false);
check('only the intended span is markup',
  t.statusHtml(XSS).replace(/^<span [^>]*>/, '').replace(/<\/span>$/, '').includes('<'),
  false);
check('and the payload is visible as text, escaped',
  /&lt;img/.test(t.statusHtml(XSS)), true);

check('a script payload in length renders as a dash', t.lengthHtml(XSS), '&mdash;');
check('a non-numeric length is a dash', t.lengthHtml('twenty'), '&mdash;');
check('a real length formats', t.lengthHtml(24.5), '24.50&quot;');
check('a numeric string still formats', t.lengthHtml('24.5'), '24.50&quot;');
check('Infinity does not render', t.lengthHtml(Infinity), '&mdash;');

check('escapeHtml neutralises a tag', /<script/.test(t.escapeHtml('<script>')), false);
check('and quotes, for attribute contexts', t.escapeHtml('a"b\'c'), 'a&quot;b&#39;c');

// The species field goes through escapeHtml at every render site now. Again the
// property is "no angle brackets left", not "no alarming words".
check('a species payload keeps no angle brackets', t.escapeHtml(XSS).includes('<'), false);
check('nor a closing one', t.escapeHtml(XSS).includes('>'), false);

// ============================================================
section('29. requests fall back to the shared key');
// This is the property that makes the auth step safe to deploy before
// anonymous sign-in is switched on in the dashboard: with no session, every
// request must go out exactly as it did before.
check('with no session the anon key is used', t.bearerToken(), t.SUPABASE_ANON_KEY);
check('and the mode says so', t.authMode, 'anon-key');
check('which reads as the shared key', t.authModeLabel(), 'shared key');

// initAuth() must be survivable with no SDK present - which is the case here,
// and is also a real state: a phone opening the page with the CDN unreachable.
await t.initAuth();
check('a missing SDK does not throw', true, true);
check('and leaves the fallback in place', t.bearerToken(), t.SUPABASE_ANON_KEY);

// An anonymous session takes over the Authorization header.
t.noteAuthSession({ access_token:'tok-anon-123', user:{ id:'u1', is_anonymous:true } });
check('a session token replaces the key', t.bearerToken(), 'tok-anon-123');
check('the mode is anonymous', t.authMode, 'anonymous');
check('shown as a device identity', t.authModeLabel(), 'device identity');

// A director session is distinguished from an angler's.
t.noteAuthSession({ access_token:'tok-dir-456', user:{ id:'u2', is_anonymous:false, email:'d@example.com' } });
check('a director token is used', t.bearerToken(), 'tok-dir-456');
check('and identified as director', t.authMode, 'director');
check('shown as signed in', t.authModeLabel(), 'signed in as director');

// Older SDK builds omit is_anonymous; no email then means anonymous.
t.noteAuthSession({ access_token:'tok-old', user:{ id:'u3' } });
check('a session with no email reads as anonymous', t.authMode, 'anonymous');
t.noteAuthSession({ access_token:'tok-old2', user:{ id:'u4', email:'x@example.com' } });
check('one with an email reads as director', t.authMode, 'director');

// Signing out must not leave a dead token behind.
t.noteAuthSession(null);
check('clearing the session restores the key', t.bearerToken(), t.SUPABASE_ANON_KEY);
check('and the mode resets', t.authMode, 'anon-key');

// It is not enough for bearerToken() to be right - the REQUEST has to use it,
// and has to re-read it every time. Headers captured once at startup would go
// stale when the token refreshes and start 401ing an hour into an event, which
// is the worst possible moment. So drive the real backend against a stub fetch.
const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init)=>{
  sent.push((init && init.headers && init.headers.Authorization) || '');
  return { ok:true, status:200, async json(){ return []; }, async text(){ return ''; } };
};
try{
  const backend = t.supabaseBackend();

  t.noteAuthSession(null);
  await backend.connect();
  check('a request with no session carries the anon key',
    sent[sent.length-1], 'Bearer ' + t.SUPABASE_ANON_KEY);

  t.noteAuthSession({ access_token:'tok-first', user:{ id:'u1', is_anonymous:true } });
  await backend.connect();
  check('a request carries the session token', sent[sent.length-1], 'Bearer tok-first');

  // The refresh case: same backend instance, new token.
  t.noteAuthSession({ access_token:'tok-refreshed', user:{ id:'u1', is_anonymous:true } });
  await backend.connect();
  check('and picks up a refreshed token without rebuilding the backend',
    sent[sent.length-1], 'Bearer tok-refreshed');

  // Writes go out the same way, not just reads.
  await backend.applyOp({ kind:'set', coll:'catches', id:'c1', body:{ length:22 } });
  check('writes carry the session token too', sent[sent.length-1], 'Bearer tok-refreshed');

  t.noteAuthSession(null);
  await backend.connect();
  check('and revert to the key when the session goes',
    sent[sent.length-1], 'Bearer ' + t.SUPABASE_ANON_KEY);
} finally {
  globalThis.fetch = realFetch;
  t.noteAuthSession(null);
}

// ============================================================
section('30. the page starts up clean');
// Let the init IIFE's promise chain settle before judging it.
await new Promise(r => setTimeout(r, 0));
check('no startup error banner', startupBanners, []);
check('nothing thrown during load',
  bootErrors.filter(e => /ReferenceError|TypeError|is not defined|before initialization/.test(e)), []);

// ============================================================
console.log('\n' + (fail === 0 ? 'ALL PASS' : fail + ' FAILED') + '  (' + pass + ' passed)');
process.exit(fail === 0 ? 0 : 1);
