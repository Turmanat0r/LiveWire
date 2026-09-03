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
    style: { cssText: '' }, dataset: {}, value: '', textContent: '', innerHTML: '',
    disabled: false, hidden: false, checked: false,
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){}, appendChild(){}, focus(){},
    querySelectorAll(){ return []; }, querySelector(){ return null; },
    closest(){ return fakeEl(); }, setAttribute(){}, getAttribute(){ return null; },
    getContext(){ return null; }
  };
  return el;
}
// The app's init catches any startup throw and paints a red banner into the
// body. Capturing appendChild turns that into a test assertion.
const startupBanners = [];
const document = {
  getElementById: () => fakeEl(),
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
section('20. the page starts up clean');
// Let the init IIFE's promise chain settle before judging it.
await new Promise(r => setTimeout(r, 0));
check('no startup error banner', startupBanners, []);
check('nothing thrown during load',
  bootErrors.filter(e => /ReferenceError|TypeError|is not defined|before initialization/.test(e)), []);

// ============================================================
console.log('\n' + (fail === 0 ? 'ALL PASS' : fail + ' FAILED') + '  (' + pass + ' passed)');
process.exit(fail === 0 ? 0 : 1);
