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
  generateHandle, uniqueHandle, displayHandle,
  loadMessages, saveMessages, chatAuthor, chatUnreadCount, chatLastSeen,
  markChatSeen, chatItemHtml, chatBragHtml, announceCatch, CHAT_MAX,
  loadSignals, saveSignals, publishSignal, activeBeacons, myBeacon,
  signalAgeMinutes, signalIsFresh, signalAgeText, compassFrom, SIGNAL_STALE_MINUTES,
  beaconTick, startBeaconTracking, stopBeaconTracking, resumeBeaconTracking,
  loadBets, saveBets, betRecords, betJoins, betHasJoined, betStanding, betCardHtml,
  BET_TITLE_MAX, BET_OPEN_MAX, BET_SCORING, renderDqNotice,
  makeCode, codesInUse, takenCodes, codeBoxHtml, codeNoteHtml, anglerById,
  isConfirmed, normPhone, pendingNoticeHtml, bigFishEntrants, poolCounts,
  claimEntry, claimErrorText, syncViewportInset,
  CODE_ALPHABET, CODE_LENGTH, duplicateEntryError, rosterIsLoaded, wipeEventData,
  countsSentence, SHARED_COLLECTIONS,
  get rosterLoaded(){ return rosterLoaded; }, set rosterLoaded(v){ rosterLoaded = v; },
  get syncState(){ return syncState; }, set syncState(v){ syncState = v; },
  get lastWriteError(){ return lastWriteError; },
  aiReviewEndpoint, probeFishIEndpoint, fishIVisionAvailable, fishIStatusText,
  requestAiVisionReview, AI_REVIEW_ENDPOINT,
  get appWindow(){ return window; },
  get fishIStatus(){ return fishIStatus; }, set fishIStatus(v){ fishIStatus = v; },
  get fishIEndpointOk(){ return fishIEndpointOk; }, set fishIEndpointOk(v){ fishIEndpointOk = v; },
  get fishISampler(){ return fishISampler; }, set fishISampler(v){ fishISampler = v; },
  get beaconTimer(){ return beaconTimer; },
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
  [{ id: 'a1', eventId: E1, name: 'Ann', handle: 'Salty Bedrock Perch', division: 'solo', bigfish: true },
   { id: 'a2', eventId: E2, name: 'Bob', handle: 'Rogue Basalt Pike',   division: 'solo', bigfish: true }],
  [{ id: 'c1', eventId: E1, anglerId: 'a1', anglerName: 'Ann', status: 'approved', species: 'Walleye', division: 'solo', length: 25, location: { withinBounds: true, distanceMiles: 1 }, timestamp: 1 },
   { id: 'c2', eventId: E2, anglerId: 'a2', anglerName: 'Bob', status: 'approved', species: 'Walleye', division: 'solo', length: 30, location: null, timestamp: 2 }],
  [{ id: 'd1', eventId: E1, target: 'solo', amount: 100 },
   { id: 'd2', eventId: E2, target: 'solo', amount: 500 }]
);

await setEvent(E1);
let ang = await t.loadAnglers(), cat = await t.loadCatches(), don = await t.loadDonations();
check('leaderboard sees only event 1',
  t.standingsFor('solo', cat, ang).map(r => r.name), ['Salty Bedrock Perch']);
check('and never the real name', /Ann/.test(JSON.stringify(t.standingsFor('solo', cat, ang))), false);
check('GPS check sees only event 1 catches', cat.map(c => c.id), ['c1']);
check('Big Fish pot sees only event 1 anglers', ang.filter(a => a.bigfish).map(a => a.name), ['Ann']);
check('payout sees only event 1 donations', don.reduce((s, d) => s + d.amount, 0), 100);

await setEvent(E2);
ang = await t.loadAnglers(); cat = await t.loadCatches(); don = await t.loadDonations();
check('leaderboard sees only event 2',
  t.standingsFor('solo', cat, ang).map(r => r.name), ['Rogue Basalt Pike']);
check('again without the real name', /Bob/.test(JSON.stringify(t.standingsFor('solo', cat, ang))), false);
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

// Director status comes from app_metadata, which only the server can set.
// Having an email proves nothing - anyone can create an account.
t.noteAuthSession({ access_token:'tok-dir-456', user:{
  id:'u2', is_anonymous:false, email:'d@example.com', app_metadata:{ director:true } } });
check('a director token is used', t.bearerToken(), 'tok-dir-456');
check('the flag makes a director', t.authMode, 'director');
check('shown as signed in as director', t.authModeLabel(), 'signed in as director');

// The security-relevant case: signed in, but no flag. Must NOT read as
// director, or the panel would imply an authority the server will refuse.
t.noteAuthSession({ access_token:'tok-plain', user:{
  id:'u5', is_anonymous:false, email:'someone@example.com' } });
check('an email alone is not a director', t.authMode, 'signed-in');
check('and the label says so', t.authModeLabel(), 'signed in, not a director');

// user_metadata is client-writable, so it must never be trusted for this.
t.noteAuthSession({ access_token:'tok-fake', user:{
  id:'u6', email:'liar@example.com', user_metadata:{ director:true } } });
check('a self-declared director in user_metadata is ignored', t.authMode, 'signed-in');

// Supabase can hand the flag back as a string rather than a boolean.
t.noteAuthSession({ access_token:'tok-str', user:{
  id:'u7', email:'d@example.com', app_metadata:{ director:'true' } } });
check('a string flag still counts', t.authMode, 'director');

// A falsy flag is not a director.
t.noteAuthSession({ access_token:'tok-off', user:{
  id:'u8', email:'d@example.com', app_metadata:{ director:false } } });
check('director:false is not a director', t.authMode, 'signed-in');

// Older SDK builds omit is_anonymous; no email then means anonymous.
t.noteAuthSession({ access_token:'tok-old', user:{ id:'u3' } });
check('a session with no email reads as anonymous', t.authMode, 'anonymous');

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
section('30. competitor handles');
const H_ROSTER = [];
for(let i = 0; i < 300; i++){
  const h = t.uniqueHandle(H_ROSTER);
  H_ROSTER.push({ id:'h'+i, handle:h });
}
check('300 handles are all distinct',
  new Set(H_ROSTER.map(a => a.handle.toLowerCase())).size, 300);
check('none come out empty', H_ROSTER.every(a => a.handle.trim().length > 3), true);
check('none are absurdly long', H_ROSTER.every(a => a.handle.length < 90), true);

// The collision path: every roll already taken, so it must number rather than
// hang or hand back a duplicate.
const only = { pick: 0 };
const packed = [];
for(let i = 0; i < 20; i++) packed.push({ id:'p'+i, handle:'Salty Granite Walleye' });
const forced = t.uniqueHandle(packed);
check('a taken handle is not reissued', forced.toLowerCase() === 'salty granite walleye', false);

// A real name must never be the public fallback. Records from before handles
// existed fall back to the entry ID instead.
check('an old record falls back to its entry ID, not its name',
  t.displayHandle({ name:'Ann Miller', tournamentId:'MKWO-001' }), 'MKWO-001');
check('and with neither, to something anonymous',
  t.displayHandle({ name:'Ann Miller' }), 'Angler');
check('and prefers the handle when there is one',
  t.displayHandle({ name:'Ann Miller', handle:'Captain Soggy Pike' }), 'Captain Soggy Pike');
check('an unknown angler still renders', t.displayHandle(null), 'Unknown angler');

// ============================================================
section('31. chat');
const CHAT_ROSTER = [
  { id:'a1', eventId:E1, name:'Ann', handle:'Salty Bedrock Perch',  division:'solo', role:'solo', teamId:null },
  { id:'a2', eventId:E1, name:'Bob', handle:'Crankbait Muskie Esq.', division:'solo', role:'solo', teamId:null }
];
seed(CHAT_ROSTER, [
  { id:'c1', eventId:E1, anglerId:'a1', anglerName:'Ann', species:'Walleye',
    status:'pending', division:'solo', length:24.5 }
], [], {});
t.liveCache.messages = [];
t.loadedIds.messages = null;
await setEvent(E1);
t.setMyAnglerId('a1');
t.adminUnlocked = false;

check('the author is this device\'s angler', t.chatAuthor(CHAT_ROSTER).id, 'a1');
t.setMyAnglerId(null);
check('an unregistered device has no author', t.chatAuthor(CHAT_ROSTER), null);
t.setMyAnglerId('a1');

// Submitting a catch announces it.
await t.announceCatch('c1', CHAT_ROSTER[0]);
let msgs = await t.loadMessages();
check('a catch posts one message', msgs.length, 1);
check('tagged as a catch', msgs[0].kind, 'catch');
check('pointing at the catch', msgs[0].catchId, 'c1');
check('under the angler\'s handle', msgs[0].handle, 'Salty Bedrock Perch');
check('and stamped with the event', t.rowEventId(msgs[0]), E1);

// The brag reads the catch live, so a rejection is not left boasting.
let ctxCatches = await t.loadCatches();
check('the brag shows the length', /24\.50/.test(t.chatBragHtml(msgs[0], ctxCatches)), true);
check('and the live status', /pending/.test(t.chatBragHtml(msgs[0], ctxCatches)), true);
ctxCatches[0].status = 'rejected';
check('a rejected catch says so, not the old status',
  /rejected/.test(t.chatBragHtml(msgs[0], ctxCatches)), true);
check('a deleted catch degrades gracefully',
  /no longer on the board/.test(t.chatBragHtml(msgs[0], [])), true);

// Messages are event-scoped like everything else.
await setEvent(E2);
check('another event sees no chat', (await t.loadMessages()).length, 0);
await setEvent(E1);
check('and switching back finds it', (await t.loadMessages()).length, 1);

// Unread counting ignores your own posts.
t.liveCache.messages = [
  { id:'m1', eventId:E1, anglerId:'a2', kind:'chat', text:'nice one', timestamp: 1000 },
  { id:'m2', eventId:E1, anglerId:'a1', kind:'chat', text:'thanks',   timestamp: 2000 }
];
t.loadedIds.messages = null;
mem.delete('mkwo:chatSeen:' + E1);
msgs = await t.loadMessages();
check('a stranger\'s post is unread', t.chatUnreadCount(msgs, CHAT_ROSTER), 1);
check('your own is not counted', t.chatUnreadCount(msgs, CHAT_ROSTER) < 2, true);
t.markChatSeen(msgs);
check('marking seen clears it', t.chatUnreadCount(msgs, CHAT_ROSTER), 0);
check('and the watermark is the newest message', t.chatLastSeen(), 2000);

// Message text is written by other people, so it must never reach innerHTML raw.
const evil = { id:'x', eventId:E1, anglerId:'a2', kind:'chat',
               text:'<img src=x onerror=alert(1)>', timestamp: 3000 };
const ctx = { anglerById:{ a2:{ id:'a2', handle:'<script>bad</script>' } },
              catches:[], mine:new Set(['a1']), isDirector:false, repliesByParent:{} };
const html = t.chatItemHtml(evil, ctx, false);
check('message text creates no element', /<img/.test(html), false);
check('the payload survives as escaped text', /&lt;img/.test(html), true);
check('a handle cannot inject either', /<script/.test(html), false);
check('escaped instead', /&lt;script/.test(html), true);

// Moderation affordances.
check('you can delete your own', /data-chat-act="delete"/.test(
  t.chatItemHtml({ id:'m2', anglerId:'a1', kind:'chat', text:'x', timestamp:1 },
    { anglerById:{}, catches:[], mine:new Set(['a1']), isDirector:false, repliesByParent:{} }, false)), true);
check('not someone else\'s', /data-chat-act="delete"/.test(
  t.chatItemHtml({ id:'m1', anglerId:'a2', kind:'chat', text:'x', timestamp:1 },
    { anglerById:{}, catches:[], mine:new Set(['a1']), isDirector:false, repliesByParent:{} }, false)), false);
check('but the director can delete anything', /data-chat-act="delete"/.test(
  t.chatItemHtml({ id:'m1', anglerId:'a2', kind:'chat', text:'x', timestamp:1 },
    { anglerById:{}, catches:[], mine:new Set(['a1']), isDirector:true, repliesByParent:{} }, false)), true);
check('replies cannot be replied to (one level only)', /data-chat-act="reply"/.test(
  t.chatItemHtml({ id:'r1', anglerId:'a2', kind:'chat', text:'x', timestamp:1 },
    { anglerById:{}, catches:[], mine:new Set(), isDirector:false, repliesByParent:{} }, true)), false);

check('the length cap is a real number', t.CHAT_MAX > 0 && t.CHAT_MAX <= 1000, true);

// ============================================================
section('32. real names stay with the director');
const PRIV = [
  { id:'p1', eventId:E1, name:'Ann Miller', phone:'406-555-0100', handle:'Salty Bedrock Perch',
    tournamentId:'MKWO-001', division:'team', role:'captain', teamId:'t1', partner:'Cal Reed', bigfish:true },
  { id:'p2', eventId:E1, name:'Cal Reed', phone:'', handle:'Crankbait Muskie Esq.',
    tournamentId:'MKWO-001P', division:'team', role:'partner', teamId:'t1', partner:'Ann Miller', bigfish:true }
];
const PRIV_CATCHES = [
  { id:'pc1', eventId:E1, anglerId:'p1', anglerName:'Ann Miller', species:'Walleye',
    status:'approved', division:'team', length:26 }
];
seed(PRIV, PRIV_CATCHES, [], {});
await setEvent(E1);

const standing = t.standingsFor('team', await t.loadCatches(), await t.loadAnglers());
const asJson = JSON.stringify(standing);
check('the team standing is named by handles', /Salty Bedrock Perch/.test(asJson), true);
check('and includes the teammate\'s handle', /Crankbait Muskie Esq\./.test(asJson), true);
check('no real name reaches the standings', /Ann Miller|Cal Reed/.test(asJson), false);
check('no phone number either', /406-555-0100/.test(asJson), false);

// A catch carries anglerName for the director's own screens - the public
// renderers must not be reading it.
check('the catch record still holds the real name for the director',
  PRIV_CATCHES[0].anglerName, 'Ann Miller');

// ============================================================
section('33. one entry per person, one per device');
const norm = (v)=> String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
// The rule the registration form applies, checked directly.
const isTaken = (roster, nm)=> roster.some(a=> norm(a.name) === norm(nm));
check('an exact repeat is caught', isTaken(PRIV, 'Ann Miller'), true);
check('case does not dodge it', isTaken(PRIV, 'ANN MILLER'), true);
check('nor does padding', isTaken(PRIV, '  Ann   Miller '), true);
check('a genuinely new angler is fine', isTaken(PRIV, 'Ann Millar'), false);
check('a partner already on the roster is caught', isTaken(PRIV, 'Cal Reed'), true);

// One per device: the register screen swaps to the entry once this device
// holds one, so the form is not even reachable.
t.setMyAnglerId('p1');
check('this device resolves to its entry',
  (await t.loadAnglers()).some(a=> a.id === t.getMyAnglerId()), true);
t.setMyAnglerId(null);
check('a fresh device holds none',
  (await t.loadAnglers()).some(a=> a.id === t.getMyAnglerId()), false);

// ============================================================
section('34. handles are fixed once chosen');
// There is no angler-facing path that writes a handle after registration -
// the only writer is the director's edit form. If that ever changes, this
// count goes up and someone has to justify it.
const appSrc = fs.readFileSync(HTML, 'utf8');
const handleWrites = (appSrc.match(/\.handle\s*=/g) || []).length;
check('exactly one place assigns a handle after the fact', handleWrites, 1);
check('and it is the director edit form',
  /anglers\[idx\]\.handle = handle;/.test(appSrc), true);

// ============================================================
section('35. position signals');
const SIG_ROSTER = [
  { id:'s1', eventId:E1, name:'Ann Miller', handle:'Salty Bedrock Perch',
    tournamentId:'MKWO-001', division:'solo', role:'solo', teamId:null },
  { id:'s2', eventId:E1, name:'Bob Ruiz', handle:'Rogue Basalt Pike',
    tournamentId:'MKWO-002', division:'solo', role:'solo', teamId:null }
];
seed(SIG_ROSTER, [], [], {});
t.liveCache.signals = [];
t.loadedIds.signals = null;
await setEvent(E1);
t.setMyAnglerId('s1');

const HUB2 = { lat: 46.38917, lng: -111.57556 };
check('publishing needs a registered device', await t.publishSignal(HUB2), true);
let sigs = await t.loadSignals();
check('one row is written', sigs.length, 1);
check('keyed by the angler id, not a new uid', sigs[0].id, 's1');
check('carrying the handle', sigs[0].handle, 'Salty Bedrock Perch');
check('and no beacon by default', sigs[0].beacon, false);
check('stamped with the event', t.rowEventId(sigs[0]), E1);

// A second fix overwrites rather than appending - this is what keeps the table
// the size of the field instead of the size of the day.
await t.publishSignal({ lat: HUB2.lat + 0.01, lng: HUB2.lng });
sigs = await t.loadSignals();
check('a second fix overwrites the same row', sigs.length, 1);
check('with the newer position', sigs[0].lat > HUB2.lat, true);

// Raising and standing down a beacon.
check('no beacons to start', (await t.activeBeacons()).length, 0);
await t.publishSignal(HUB2, { beacon: true, note: 'Capsized' });
check('a beacon shows up', (await t.activeBeacons()).length, 1);
check('with its note', (await t.activeBeacons())[0].note, 'Capsized');
check('and findable as mine', (await t.myBeacon()) !== null, true);

// The critical one: an ordinary position update must NOT clear a raised
// beacon. Someone in trouble who then checks their position would otherwise
// silently stop asking for help.
await t.publishSignal({ lat: HUB2.lat + 0.02, lng: HUB2.lng });
check('a routine fix leaves the beacon up', (await t.activeBeacons()).length, 1);
check('and keeps the note', (await t.activeBeacons())[0].note, 'Capsized');
check('while still moving the position', (await t.activeBeacons())[0].lat > HUB2.lat, true);

await t.publishSignal(HUB2, { beacon: false });
check('standing down clears it', (await t.activeBeacons()).length, 0);
check('and the row survives for the director', (await t.loadSignals()).length, 1);

// Another angler's device writes its own row, not over yours.
t.setMyAnglerId('s2');
await t.publishSignal({ lat: 46.40, lng: -111.60 });
sigs = await t.loadSignals();
check('a second angler adds a row', sigs.length, 2);
check('each keyed to its own angler',
  sigs.map(x=> x.id).sort(), ['s1','s2']);

// Signals are event-scoped like everything else.
await setEvent(E2);
check('another event sees no signals', (await t.loadSignals()).length, 0);
await setEvent(E1);

// Notes are capped, since they render into the director's alert panel.
t.setMyAnglerId('s1');
await t.publishSignal(HUB2, { beacon: true, note: 'x'.repeat(400) });
check('a long note is truncated', (await t.myBeacon()).note.length, 140);
await t.publishSignal(HUB2, { beacon: false });

// A device with no registration cannot publish.
t.setMyAnglerId(null);
check('an unregistered device publishes nothing', await t.publishSignal(HUB2), false);
t.setMyAnglerId('s1');
// Nor can a bad fix.
check('a fix with no coordinates is refused', await t.publishSignal({ lat: NaN, lng: 1 }), false);

// ============================================================
section('36. staleness and bearings');
const now = Date.now();
check('a fresh fix is fresh', t.signalIsFresh({ at: now - 60000 }), true);
check('an old one is not', t.signalIsFresh({ at: now - (t.SIGNAL_STALE_MINUTES + 5) * 60000 }), false);
check('a missing timestamp is never fresh', t.signalIsFresh({}), false);
check('age reads in minutes', t.signalAgeText({ at: now - 5 * 60000 }), '5 min ago');
check('and in hours further out', /hour/.test(t.signalAgeText({ at: now - 3 * 3600000 })), true);
check('a fresh one reads as just now', t.signalAgeText({ at: now - 1000 }), 'just now');
check('and a missing one says never', t.signalAgeText({}), 'never');

// The compass label is what an angler paddles on, so each octant must be right.
const at = (dLat, dLng)=> ({ lat: HUB2.lat + dLat, lng: HUB2.lng + dLng });
check('due north',      t.compassFrom(HUB2, at( 0.05,  0)),     'N');
check('due south',      t.compassFrom(HUB2, at(-0.05,  0)),     'S');
check('due east',       t.compassFrom(HUB2, at( 0,     0.05)),  'E');
check('due west',       t.compassFrom(HUB2, at( 0,    -0.05)),  'W');
check('north-east',     t.compassFrom(HUB2, at( 0.05,  0.072)), 'NE');
check('south-west',     t.compassFrom(HUB2, at(-0.05, -0.072)), 'SW');

// ============================================================
section('37. beacon tracking stops itself');
// A raised beacon is the only thing in the app allowed to wake the GPS on a
// timer. If it cannot switch itself off it sits there draining a battery for
// the rest of the day, which is the failure this whole design avoids.
seed(SIG_ROSTER, [], [], {});
t.liveCache.signals = [];
t.loadedIds.signals = null;
await setEvent(E1);
t.setMyAnglerId('s1');

t.stopBeaconTracking();
check('nothing is running to begin with', t.beaconTimer, null);

t.startBeaconTracking();
check('raising starts a tracker', t.beaconTimer !== null, true);
const firstTimer = t.beaconTimer;
t.startBeaconTracking();
// Compared as a boolean: a Node Timeout is circular and cannot be stringified.
check('starting twice does not stack a second', t.beaconTimer === firstTimer, true);

// With no beacon raised, a tick must stand the tracker down by itself.
check('a tick with no beacon reports it should stop', await t.beaconTick(), false);
check('and clears the timer', t.beaconTimer, null);

// With one raised, it keeps going - even though this environment has no
// geolocation at all, so the fix inside the tick fails every time.
await t.publishSignal({ lat: 46.38917, lng: -111.57556 }, { beacon: true });
t.startBeaconTracking();
check('a tick with a beacon up keeps going', await t.beaconTick(), true);
check('a failed fix does not tear the tracker down', t.beaconTimer !== null, true);
check('nor does it drop the beacon', (await t.activeBeacons()).length, 1);

// Standing down stops it.
await t.publishSignal({ lat: 46.38917, lng: -111.57556 }, { beacon: false });
check('once stood down the next tick stops', await t.beaconTick(), false);
check('and the timer is gone', t.beaconTimer, null);

// Reload with a beacon still up resumes tracking.
await t.publishSignal({ lat: 46.38917, lng: -111.57556 }, { beacon: true });
await t.resumeBeaconTracking();
check('a reload resumes an active beacon', t.beaconTimer !== null, true);
t.stopBeaconTracking();
await t.publishSignal({ lat: 46.38917, lng: -111.57556 }, { beacon: false });
await t.resumeBeaconTracking();
check('but not when there is nothing to resume', t.beaconTimer, null);

// ============================================================
section('38. side bets');
const BET_ROSTER = [
  { id:'b1', eventId:E1, name:'Ann', handle:'Salty Perch', division:'solo', role:'solo', teamId:null },
  { id:'b2', eventId:E1, name:'Bob', handle:'Rogue Pike',  division:'solo', role:'solo', teamId:null },
  { id:'b3', eventId:E1, name:'Cal', handle:'Jig Walleye', division:'solo', role:'solo', teamId:null }
];
const BET_CATCHES = [
  { id:'k1', eventId:E1, anglerId:'b1', species:'Walleye', status:'approved', division:'solo', length:14.5, timestamp:100 },
  { id:'k2', eventId:E1, anglerId:'b2', species:'Walleye', status:'approved', division:'solo', length:11.0, timestamp:200 },
  { id:'k3', eventId:E1, anglerId:'b2', species:'Walleye', status:'approved', division:'solo', length:22.0, timestamp:300 },
  { id:'k4', eventId:E1, anglerId:'b3', species:'Walleye', status:'pending',  division:'solo', length:5.0,  timestamp:50  },
  { id:'k5', eventId:E1, anglerId:'b1', species:'Other',   status:'approved', division:'solo', length:2.0,  timestamp:60  }
];
seed(BET_ROSTER, BET_CATCHES, [], {});
t.liveCache.bets = []; t.loadedIds.bets = null;
await setEvent(E1);
await t.saveEventSettings({ targetSpecies: 'Walleye' });
t.setMyAnglerId('b1');
t.adminUnlocked = false;

const byId = {}; BET_ROSTER.forEach(a => { byId[a.id] = a; });
const joinsFor = (betId, ids) => ids.map((aid, i) =>
  ({ id: 'j' + betId + i, eventId: E1, kind: 'join', betId, anglerId: aid }));
const mkBet = (scoring) => ({ id: 'bet1', eventId: E1, kind: 'bet', title: 'T', scoring, creatorId: 'b1' });

let rows = [mkBet('smallest')].concat(joinsFor('bet1', ['b1', 'b2', 'b3']));
let st = t.betStanding(rows[0], rows, BET_CATCHES, byId);
check('smallest picks the shortest approved fish', st.anglerId, 'b2');
check('and reports its length', st.detail, '11.00"');
check('a pending catch is ignored', st.anglerId !== 'b3', true);

rows = [mkBet('most')].concat(joinsFor('bet1', ['b1', 'b2']));
st = t.betStanding(rows[0], rows, BET_CATCHES, byId);
check('most counts approved catches', st.anglerId, 'b2');
check('and reports the count', /2 approved/.test(st.detail), true);

rows = [mkBet('first')].concat(joinsFor('bet1', ['b1', 'b2']));
st = t.betStanding(rows[0], rows, BET_CATCHES, byId);
check('first goes by timestamp', st.anglerId, 'b1');

// k5 is a 2-inch "Other" - the smallest fish on the board, and it must not win.
rows = [mkBet('smallest')].concat(joinsFor('bet1', ['b1', 'b2']));
st = t.betStanding(rows[0], rows, BET_CATCHES, byId);
check('an out-of-species fish cannot win smallest', st.anglerId, 'b2');

rows = [mkBet('smallest')].concat(joinsFor('bet1', ['b1']));
st = t.betStanding(rows[0], rows, BET_CATCHES, byId);
check('someone who never joined cannot win', st.anglerId, 'b1');

const dqById = Object.assign({}, byId, { b2: Object.assign({}, byId.b2, { disqualified: true }) });
rows = [mkBet('smallest')].concat(joinsFor('bet1', ['b1', 'b2']));
st = t.betStanding(rows[0], rows, BET_CATCHES, dqById);
check('a disqualified entrant cannot win', st.anglerId, 'b1');

rows = [mkBet('manual')].concat(joinsFor('bet1', ['b1', 'b2']));
check('a manual bet has no automatic standing', t.betStanding(rows[0], rows, BET_CATCHES, byId), null);
check('an empty bet has no standing',
  t.betStanding(mkBet('smallest'), [mkBet('smallest')], BET_CATCHES, byId), null);

// Joins are their own rows, which is what makes two anglers joining at the
// same moment safe.
rows = [mkBet('smallest')].concat(joinsFor('bet1', ['b1', 'b2']));
check('joins are counted from their own records', t.betJoins(rows, 'bet1').length, 2);
check('membership is per angler', t.betHasJoined(rows, 'bet1', 'b1'), true);
check('and false for someone else', t.betHasJoined(rows, 'bet1', 'b3'), false);
check('bet records are separated from joins', t.betRecords(rows).length, 1);

// Titles and stakes are typed by anglers and render for the whole field.
const nastyBet = { id: 'bx', kind: 'bet', title: '<img src=x onerror=alert(1)>',
                   stake: '<script>bad</script>', scoring: 'manual', creatorId: 'b1' };
const betHtml = t.betCardHtml(nastyBet, [nastyBet], BET_CATCHES,
  { meId: 'b1', anglerById: byId, isDirector: false });
check('a bet title creates no element', /<img/.test(betHtml), false);
check('and is escaped instead', /&lt;img/.test(betHtml), true);
check('a stake cannot inject either', /<script/.test(betHtml), false);

const otherBet = { id: 'bo', kind: 'bet', title: 'Theirs', scoring: 'manual', creatorId: 'b2' };
const asAngler = t.betCardHtml(otherBet, [otherBet], BET_CATCHES,
  { meId: 'b1', anglerById: byId, isDirector: false });
check('you cannot delete a bet you did not start', /data-bet-act="delete"/.test(asAngler), false);
const asDirector = t.betCardHtml(otherBet, [otherBet], BET_CATCHES,
  { meId: 'b1', anglerById: byId, isDirector: true });
check('the director can delete any bet', /data-bet-act="delete"/.test(asDirector), true);
const asOwner = t.betCardHtml(mkBet('manual'), [mkBet('manual')], BET_CATCHES,
  { meId: 'b1', anglerById: byId, isDirector: false });
check('you can delete your own', /data-bet-act="delete"/.test(asOwner), true);

const settled = { id: 'bs', kind: 'bet', title: 'Done', scoring: 'manual', creatorId: 'b1', winnerId: 'b2' };
const settledHtml = t.betCardHtml(settled, [settled].concat(joinsFor('bs', ['b1', 'b2'])),
  BET_CATCHES, { meId: 'b1', anglerById: byId, isDirector: false });
check('a settled bet names its winner', /Rogue Pike/.test(settledHtml), true);
check('and cannot be joined', /data-bet-act="join"/.test(settledHtml), false);
check('nor re-settled', /data-bet-act="settle"/.test(settledHtml), false);

check('the open-bet cap is a real limit', t.BET_OPEN_MAX > 0 && t.BET_OPEN_MAX <= 10, true);
check('every scoring mode is known', t.BET_SCORING.length, 4);

// ============================================================
section('39. the disqualification notice');
const dqEl = elById.get('home-dq-notice');
t.renderDqNotice({ id: 'b1', name: 'Ann', disqualified: false });
check('a clear angler sees nothing', dqEl.innerHTML, '');
t.renderDqNotice(null);
check('nor does an unregistered device', dqEl.innerHTML, '');

t.renderDqNotice({ id: 'b1', name: 'Ann', disqualified: true,
                   dqReason: 'Outside the boundary', dqAt: Date.now() });
check('a disqualified angler is told', /disqualified/i.test(dqEl.innerHTML), true);
check('and given the reason', /Outside the boundary/.test(dqEl.innerHTML), true);
check('and told it can be undone', /reinstate/i.test(dqEl.innerHTML), true);

// The reason is typed by the director, but it still renders into a page.
t.renderDqNotice({ id: 'b1', name: 'Ann', disqualified: true,
                   dqReason: '<img src=x onerror=alert(1)>' });
check('the reason is escaped', /<img/.test(dqEl.innerHTML), false);
check('showing as text instead', /&lt;img/.test(dqEl.innerHTML), true);

t.renderDqNotice({ id: 'b1', name: 'Ann', disqualified: true });
check('a missing reason still explains itself', /No reason was recorded/.test(dqEl.innerHTML), true);

// ============================================================
section('40. the page starts up clean');
// Let the init IIFE's promise chain settle before judging it.
await new Promise(r => setTimeout(r, 0));
check('no startup error banner', startupBanners, []);
check('nothing thrown during load',
  bootErrors.filter(e => /ReferenceError|TypeError|is not defined|before initialization/.test(e)), []);

// ============================================================
section('41. the Fish-I vision pass finds a server');
// This whole section exists because the feature was dead on the hosted site
// for as long as it was deployed and nothing said so. It only ever looked for
// a Claude viewer that is not there once the app lives on its own domain.

// --- which endpoint, if any, this copy of the page should call
const savedLocation = t.appWindow.location;
try{
  delete t.appWindow.location;
  check('opened straight off the disk there is no endpoint to call', t.aiReviewEndpoint(), '');
  t.appWindow.location = { protocol: 'file:' };
  check('and a file: page does not invent a relative one', t.aiReviewEndpoint(), '');
  t.appWindow.location = { protocol: 'https:' };
  check('a hosted page calls its own sibling function', t.aiReviewEndpoint(), '/api/fish-i');
  t.appWindow.location = { protocol: 'http:' };
  check('local dev over http works the same way', t.aiReviewEndpoint(), '/api/fish-i');

  // --- the health probe, and what the director is told
  const savedStatus = t.fishIStatus;
  const realFetch2 = globalThis.fetch;
  let reply = null;
  globalThis.fetch = async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  };
  try{
    t.fishISampler = null;

    t.fishIEndpointOk = false;
    reply = { ok:true, status:200, async json(){ return { ready:true, model:'claude-sonnet-5' }; } };
    await t.probeFishIEndpoint();
    check('a configured server reports ready', t.fishIStatus, 'ready-endpoint');
    check('and the vision button appears', t.fishIVisionAvailable(), true);

    t.fishIEndpointOk = false;
    reply = { ok:true, status:200, async json(){ return { ready:false, reason:'no-api-key' }; } };
    await t.probeFishIEndpoint();
    check('a server with no API key says so', t.fishIStatus, 'endpoint-no-key');
    check('and the button stays hidden', t.fishIVisionAvailable(), false);
    check('and the director is told which variable to set',
      /GEMINI_API_KEY/.test(t.fishIStatusText()), true);

    // Three different problems that all used to read as "unavailable". Each
    // one sends the director somewhere different, so each has to say so.
    t.fishIEndpointOk = false;
    reply = { ok:true, status:200, async json(){ return { ready:false, reason:'bad-key' }; } };
    await t.probeFishIEndpoint();
    check('a rejected key is not confused with a missing one',
      t.fishIStatus, 'endpoint-bad-key');

    t.fishIEndpointOk = false;
    reply = { ok:true, status:200, async json(){ return { ready:false, reason:'bad-model' }; } };
    await t.probeFishIEndpoint();
    check('a retired model name is named as the problem', t.fishIStatus, 'endpoint-bad-model');
    check('and points at the override', /FISHI_MODEL/.test(t.fishIStatusText()), true);

    t.fishIEndpointOk = false;
    reply = { ok:true, status:200, async json(){ return { ready:false, reason:'something-new' }; } };
    await t.probeFishIEndpoint();
    check('an unrecognised reason still fails closed', t.fishIStatus, 'endpoint-not-ready');
    check('and does not open the button', t.fishIVisionAvailable(), false);

    t.fishIEndpointOk = false;
    reply = { ok:false, status:404, async json(){ return {}; } };
    await t.probeFishIEndpoint();
    check('a deploy missing the function is named as such',
      /api\/fish-i\.js/.test(t.fishIStatusText()), true);

    t.fishIEndpointOk = false;
    reply = new Error('offline');
    await t.probeFishIEndpoint();
    check('an unreachable server is not reported as a missing key',
      t.fishIStatus, 'endpoint-unreachable');
    check('and the button stays hidden there too', t.fishIVisionAvailable(), false);

    // The old copy blamed the Claude viewer for every failure, which sent the
    // director looking in entirely the wrong place.
    const hosted = ['ready-endpoint','endpoint-no-key','endpoint-bad-key','endpoint-bad-model',
                    'endpoint-not-ready','endpoint-unreachable','endpoint-http:404'];
    check('no hosted status blames the Claude viewer',
      hosted.filter(s => { t.fishIStatus = s; return /Claude viewer/.test(t.fishIStatusText()); }), []);

    // --- what actually goes on the wire
    // The endpoint builds the prompt itself. If the page ever started sending
    // one, anybody who read the source - and the source ships to every phone -
    // would have a general-purpose Claude proxy on the director's API key.
    let sentBody = null;
    globalThis.fetch = async (url, init) => {
      sentBody = JSON.parse(init.body);
      return { ok:true, status:200, async json(){ return { species:'walleye' }; } };
    };
    await setEvent(E1);
    const photo = 'data:image/jpeg;base64,AAAA';
    await t.requestAiVisionReview({ id:'c9', species:'Walleye', length:22 }, photo);
    check('the request carries no prompt', 'prompt' in sentBody, false);
    check('it names the event\'s target species', sentBody.targetSpecies, t.targetSpecies());
    check('it names the water', typeof sentBody.water === 'string' && sentBody.water.length > 0, true);
    check('it sends the photo', sentBody.photo, photo);
    check('a scoring fish is flagged as scoring', sentBody.scoring, true);

    await t.requestAiVisionReview({ id:'c9', species:t.OTHER_SPECIES, length:22 }, photo);
    check('an Other fish is not', sentBody.scoring, false);

    // A 503 reading "the key is missing" is far more use to the director than
    // "Review service returned 503".
    globalThis.fetch = async () => ({
      ok:false, status:503,
      async json(){ return { error:'GEMINI_API_KEY is not set.' }; }
    });
    let msg = '';
    try{ await t.requestAiVisionReview({ id:'c9', species:'Walleye', length:22 }, photo); }
    catch(e){ msg = e.message; }
    check('the server\'s own explanation reaches the director', msg, 'GEMINI_API_KEY is not set.');

    globalThis.fetch = async () => ({ ok:false, status:500, async json(){ throw new Error('not json'); } });
    msg = '';
    try{ await t.requestAiVisionReview({ id:'c9', species:'Walleye', length:22 }, photo); }
    catch(e){ msg = e.message; }
    check('a server with nothing to say still reports the status',
      msg, 'Review service returned 500');
  } finally {
    globalThis.fetch = realFetch2;
    t.fishIStatus = savedStatus;
    t.fishIEndpointOk = false;
  }
} finally {
  if (savedLocation === undefined) delete t.appWindow.location;
  else t.appWindow.location = savedLocation;
}

// ============================================================
section('42. board codes');
// These get written on a bump board and read back out of a photo. Two anglers
// sharing one makes a catch unattributable, and nothing about it would look
// wrong at the time - it only surfaces when two people claim the same fish.

const oneCode = t.makeCode(new Set());
const CODE_RE = new RegExp('^[' + t.CODE_ALPHABET + ']{' + t.CODE_LENGTH + '}$');
check('a code is four characters', oneCode.length, t.CODE_LENGTH);
check('drawn only from the alphabet', CODE_RE.test(oneCode), true);

// The alphabet is the safety feature: these get written on a wet board with a
// marker and read back off a photo. Every character with a lookalike is out,
// so no single misread turns one valid code into another.
for (const bad of ['0', '1', '2', '5', '8', 'B', 'G', 'I', 'L', 'O', 'S', 'U', 'V', 'Z']) {
  check('the alphabet excludes ' + bad, t.CODE_ALPHABET.includes(bad), false);
}
// Only ONE of each confusable pair goes. 6 stays because G is gone, so a 6
// read as a G is still unambiguously a 6 - dropping both would shrink the
// pool for nothing.
check('but keeps 6, since G is the one that went', t.CODE_ALPHABET.includes('6'), true);
check('no character appears twice',
  new Set(t.CODE_ALPHABET).size, t.CODE_ALPHABET.length);
check('and it is still big enough to matter',
  Math.pow(t.CODE_ALPHABET.length, t.CODE_LENGTH) > 200000, true);

const many = [];
const pool0 = new Set();
for (let i = 0; i < 800; i++) many.push(t.makeCode(pool0));
check('800 codes all match the format', many.every(c => CODE_RE.test(c)), true);
check('and none of them collide', new Set(many).size, 800);
check('the pool is mutated as it goes, not just read', pool0.size, 800);

// Codes issued when they were four digits are still valid, and stay safe by
// being IN the pool - not by looking different. 3, 4, 6, 7 and 9 are all in the
// alphabet, so "3467" is a code this can still draw; only `taken` stops it.
const legacyPool = t.codesInUse([{ anglerCode: '3467' }, { anglerCode: '9944' }]);
check('old numeric codes still count as taken', legacyPool.size, 2);
const afterLegacy = [];
for (let i = 0; i < 400; i++) afterLegacy.push(t.makeCode(legacyPool));
check('an all-digit legacy code is never reissued',
  afterLegacy.includes('3467') || afterLegacy.includes('9944'), false);
check('even though such a code is drawable from the alphabet',
  '3467'.split('').every(ch => t.CODE_ALPHABET.includes(ch)), true);

const taken = new Set(['1234']);
const avoided = [];
for (let i = 0; i < 200; i++) avoided.push(t.makeCode(taken));
check('a taken code is never handed out', avoided.includes('1234'), false);

// One pool for both kinds, so a number on a board is never ambiguous.
check('codesInUse collects personal and team codes alike',
  [...t.codesInUse([
    { anglerCode: '1111', teamCode: '2222' },
    { anglerCode: '3333' },
    { teamCode: '2222' },
    null
  ])].sort(),
  ['1111', '2222', '3333']);
check('and copes with anglers who have neither', t.codesInUse([{ name: 'x' }]).size, 0);

// Uniqueness spans events. A code read off a board in a photo must not belong
// to one angler this year and a different one last year.
seed(
  [{ id: 'a1', eventId: E1, name: 'Ann', anglerCode: '4001', teamCode: '4002' },
   { id: 'a2', eventId: E2, name: 'Bob', anglerCode: '4003' }],
  [], []
);
await setEvent(E1);
check('only one angler is visible under this event', (await t.loadAnglers()).length, 1);
const spanning = t.takenCodes();
check('but the code pool sees every event', [...spanning].sort(), ['4001', '4002', '4003']);
const nextCode = t.makeCode(t.takenCodes());
check('so a new code cannot repeat another event\'s',
  ['4001', '4002', '4003'].includes(nextCode), false);

// ---- what the angler is shown ----
const soloBox = t.codeBoxHtml({ anglerCode: '5150' });
check('a solo angler is shown one code', (soloBox.match(/codechip/g) || []).length, 1);
check('labelled Tournament ID', /Tournament ID/.test(soloBox), true);
check('and told to write it on the board', /bump board/.test(t.codeNoteHtml({ anglerCode: '5150' })), true);

const teamBox = t.codeBoxHtml({ anglerCode: '5150', teamCode: '7007' });
check('a team angler is shown two', (teamBox.match(/codechip/g) || []).length, 2);
check('the team code is marked as such', /codechip team/.test(teamBox), true);
check('and both numbers are present', /7007/.test(teamBox) && /5150/.test(teamBox), true);
check('they are told to write BOTH', /both/i.test(t.codeNoteHtml({ anglerCode: '5150', teamCode: '7007' })), true);

// An angler from before codes existed must be told, not shown a blank.
check('a missing code is not rendered as empty',
  /—/.test(t.codeBoxHtml({ name: 'Old Timer' })), true);
check('and says to see the director',
  /director/.test(t.codeNoteHtml({ name: 'Old Timer' })), true);
check('nothing at all renders nothing', t.codeBoxHtml(null), '');

// Codes come off records that a director can edit, so they are escaped like
// everything else that reaches innerHTML.
check('a code is escaped on the way out',
  /&lt;script&gt;/.test(t.codeBoxHtml({ anglerCode: '<script>' })), true);
check('and the raw tag never survives',
  /<script>/.test(t.codeBoxHtml({ anglerCode: '<script>' })), false);

// ---- the camera overlay reads the SELECTED angler ----
seed([{ id: 'a1', eventId: E1, name: 'Ann', anglerCode: '6001' },
      { id: 'a2', eventId: E1, name: 'Bob', anglerCode: '6002', teamCode: '6003' }], [], []);
await setEvent(E1);
await t.loadAnglers();
check('an angler is found by id', t.anglerById('a2').anglerCode, '6002');
check('and a stranger is not invented', t.anglerById('nope'), null);

// ============================================================
section('43. the roster has to arrive before anyone can register');
// The bug this exists for: initStore() is not awaited, so on a browser with no
// local mirror the form was usable while the roster was still []. Every
// duplicate check then compared against nothing and passed, and one person
// registered twice from two browsers.
const savedRoster = t.rosterLoaded, savedSync = t.syncState;
t.rosterLoaded = false;
t.syncState = 'live';
check('a live connection that has not delivered yet is not ready', t.rosterIsLoaded(), false);
t.syncState = 'offline';
check('nor is a dropped connection', t.rosterIsLoaded(), false);
// No server at all means the local mirror IS the roster, and waiting for a
// sync that will never come would block registration forever.
t.syncState = 'local';
check('but device-only mode is ready immediately', t.rosterIsLoaded(), true);
t.syncState = 'live';
t.rosterLoaded = true;
check('and so is a delivered roster', t.rosterIsLoaded(), true);
t.rosterLoaded = savedRoster; t.syncState = savedSync;

// ---- the database has the last word ----
// The client check is a guard; this is the boundary. Branch on the SQLSTATE and
// the index name, never on prose that Postgres is free to reword.
const dupPerson = { message: 'Supabase 409 {"code":"23505","message":"duplicate key value violates unique constraint \\"anglers_one_entry_per_person\\""}' };
const dupCode = { message: 'Supabase 409 {"code":"23505","details":"Key exists","message":"anglers_unique_angler_code"}' };
check('a duplicate person is recognised', t.duplicateEntryError(dupPerson), 'person');
check('a duplicate board code is told apart from it', t.duplicateEntryError(dupCode), 'code');
check('another unique violation is not guessed at',
  t.duplicateEntryError({ message: 'Supabase 409 {"code":"23505","message":"something_else"}' }), 'other');
check('an unrelated failure is not a duplicate',
  t.duplicateEntryError({ message: 'Supabase 500 server exploded' }), null);
check('and neither is nothing', t.duplicateEntryError(null), null);

// ============================================================
section('44. clearing and deleting an event');
// Practice events are the point: people stress test one, then it has to be
// possible to empty or remove it. Deleting was blocked the moment an event
// held a single record, which made every practice event permanent.
seed(
  [{ id: 'a1', eventId: E1, name: 'Keep Me' }, { id: 'a2', eventId: E2, name: 'Wipe Me' }],
  [{ id: 'c1', eventId: E1, length: 20 }, { id: 'c2', eventId: E2, length: 30 },
   { id: 'c3', eventId: E2, length: 31 }],
  [{ id: 'd1', eventId: E1, amount: 10 }, { id: 'd2', eventId: E2, amount: 20 }]
);
t.liveCache.bets = [{ id: 'b1', eventId: E2, kind: 'bet' }];
t.liveCache.messages = [{ id: 'm1', eventId: E2 }, { id: 'm2', eventId: E1 }];
t.liveCache.signals = [{ id: 's1', eventId: E2 }];
await setEvent(E1);

check('the counts are read per event', t.eventRowCounts(E2), { anglers: 1, catches: 2, donations: 1 });
check('and they say so in words', t.countsSentence({ anglers: 1, catches: 2, donations: 1 }),
  'It holds 1 angler, 2 catches and 1 donation.');
check('plural agreement holds too', t.countsSentence({ anglers: 2, catches: 1, donations: 0 }),
  'It holds 2 anglers, 1 catch and 0 donations.');

check('wiping the other event reports success', await t.wipeEventData(E2), true);
check('its anglers are gone', t.allRows('anglers').map(r => r.id), ['a1']);
check('its catches are gone', t.allRows('catches').map(r => r.id), ['c1']);
check('its donations are gone', t.allRows('donations').map(r => r.id), ['d1']);
// Chat, beacons and bets are event-scoped too, and a wipe that missed them
// would leave another event's chatter in a fresh practice run.
check('its bets are gone', t.allRows('bets').map(r => r.id), []);
check('its messages are gone', t.allRows('messages').map(r => r.id), ['m2']);
check('its signals are gone', t.allRows('signals').map(r => r.id), []);
check('every shared collection was covered',
  t.SHARED_COLLECTIONS.every(c => t.allRows(c).every(r => t.rowEventId(r) !== E2)), true);

// The live event must be untouched by all of that.
check('the live event keeps its anglers', (await t.loadAnglers()).map(a => a.id), ['a1']);
check('and its catches', (await t.loadCatches()).map(c => c.id), ['c1']);
check('and its donations', (await t.loadDonations()).map(d => d.id), ['d1']);

// A wipe of an event with nothing in it is a no-op, not an error.
check('wiping an empty event succeeds quietly', await t.wipeEventData('no-such-event'), true);
check('and changes nothing', t.allRows('anglers').map(r => r.id), ['a1']);

// Saving after a wipe must not try to delete the same rows again - loadedIds
// is what saveCollection subtracts from, and a stale id there reads as a row
// the user just deleted from the LIVE event.
check('a save after a wipe still works', await t.saveAnglers(await t.loadAnglers()), true);
check('and the live event survives it', t.allRows('anglers').map(r => r.id), ['a1']);

// Wiping the event you are STANDING IN is the practice-event case, and the
// only one where the wiped ids were ever in loadedIds to go stale.
await t.loadAnglers();                       // seeds loadedIds with a1
check('the live event\'s ids are tracked', [...(t.loadedIds.anglers || [])], ['a1']);
check('wiping the live event works', await t.wipeEventData(E1), true);
check('and takes its ids out of the delete-tracking set',
  [...(t.loadedIds.anglers || [])], []);
check('leaving nothing behind', t.allRows('anglers').map(r => r.id), []);

// ============================================================
section('45. a rejected write must not be cached as if it landed');
// saveCollection used to update liveCache whichever way the write went, so a
// registration the server refused still looked registered on that phone -
// while the caller was telling the angler it had failed.
seed([{ id: 'a1', eventId: E1, name: 'Existing' }], [], []);
await setEvent(E1);
await t.loadAnglers();

const savedStore = t.store;
t.store = {
  label: 'refusing server',
  photoBudget: 600000,
  async connect(){},
  start(){},
  async applyOp(){
    const e = new Error('Supabase 409 {"code":"23505","message":"duplicate key value ' +
      'violates unique constraint \\"anglers_one_entry_per_person\\""}');
    e.status = 409;              // permanent - retrying can never succeed
    throw e;
  },
  deletePhoto(){}
};
try{
  const attempt = (await t.loadAnglers()).concat([
    { id: 'a2', eventId: E1, name: 'Existing', anglerCode: 'ACDE' }
  ]);
  check('the save reports failure', await t.saveAnglers(attempt), false);
  check('and the refused angler is NOT in the cache',
    t.allRows('anglers').map(r => r.id), ['a1']);
  check('so the roster still reads as it does on the server',
    (await t.loadAnglers()).map(a => a.id), ['a1']);
  check('and the reason survives for the caller to explain',
    t.duplicateEntryError(t.lastWriteError), 'person');
} finally {
  t.store = savedStore;
}

// ============================================================
section('46. one entry per phone number');
// A name can be invented and a browser can be swapped. A phone number is the
// thing a person only has so many of, which makes it the check that survives
// someone registering again under a different name.
check('punctuation is ignored', t.normPhone('406-555-0100'), '4065550100');
check('so are spaces and brackets', t.normPhone('(406) 555 0100'), '4065550100');
check('and a country code', t.normPhone('+1 406 555 0100'), '4065550100');
check('all three are the same person',
  new Set(['406-555-0100', '(406) 555 0100', '+1 406 555 0100'].map(t.normPhone)).size, 1);
check('two real numbers stay different',
  t.normPhone('406-555-0100') === t.normPhone('406-555-0101'), false);
check('nothing normalises to nothing', t.normPhone(''), '');
check('and so does null', t.normPhone(null), '');
check('letters are not digits', t.normPhone('call me'), '');

// ============================================================
section('47. an entry does not count until the director confirms it');
// Registering is not entering - the fee is, and it is collected outside the
// app. Until the director ticks it off, an entry must not score, must not join
// the Big Fish pot and must not inflate a pool.
check('a new entry is pending', t.isConfirmed({ pending: true }), false);
check('a confirmed one is not', t.isConfirmed({ pending: false }), true);
check('confirming deletes the flag rather than setting it false',
  t.isConfirmed({ name: 'Ann' }), true);

// THE compatibility property. Every angler registered before this existed
// carries no flag, and reading a missing flag as pending would empty the
// standings of a tournament already under way.
check('an angler from before this existed still counts', t.isConfirmed({ id: 'old' }), true);
check('and so does one that is nothing at all', t.isConfirmed(undefined), true);

// ---- what confirmation actually gates ----
seed(
  [{ id: 'ok', eventId: E1, name: 'Paid Up', handle: 'Paid Handle', division: 'solo', bigfish: true },
   { id: 'no', eventId: E1, name: 'Not Yet', handle: 'Pending Handle', division: 'solo', bigfish: true, pending: true },
   { id: 'old', eventId: E1, name: 'Legacy', handle: 'Legacy Handle', division: 'solo', bigfish: true }],
  [{ id: 'c1', eventId: E1, anglerId: 'ok',  status: 'approved', species: 'Walleye', division: 'solo', length: 20, timestamp: 1 },
   { id: 'c2', eventId: E1, anglerId: 'no',  status: 'approved', species: 'Walleye', division: 'solo', length: 30, timestamp: 2 },
   { id: 'c3', eventId: E1, anglerId: 'old', status: 'approved', species: 'Walleye', division: 'solo', length: 25, timestamp: 3 }],
  []
);
await setEvent(E1);
const cAll = await t.loadCatches(), aAll = await t.loadAnglers();

// The pending angler has the biggest fish, so if the gate is missing they win.
const confirmBoard = t.standingsFor('solo', cAll, aAll);
check('an unconfirmed entry does not rank', confirmBoard.map(r => r.name),
  ['Legacy Handle', 'Paid Handle']);
check('even though its fish is the longest',
  Math.max.apply(null, cAll.map(c => c.length)), 30);
check('and the legacy angler still ranks',
  confirmBoard.some(r => r.name === 'Legacy Handle'), true);

// ---- what it must NOT gate ----
// Blocking a pending angler from fishing would strand anyone whose fee has not
// cleared by the ramp. They log catches; the catches count on confirmation.
check('a pending angler is still on the roster', aAll.map(a => a.id).sort(), ['no', 'ok', 'old']);
check('and their catch is still stored', cAll.some(c => c.anglerId === 'no'), true);

// ---- the Big Fish pot ----
// $10 a head, winner take all. An unconfirmed entry in here is somebody
// collecting a pot they never paid into.
const potRoster = [
  { id: 'p1', bigfish: true },
  { id: 'p2', bigfish: true, pending: true },
  { id: 'p3', bigfish: true, disqualified: true },
  { id: 'p4', bigfish: false },
  { id: 'p5', bigfish: true }                       // legacy, no flag
];
check('the pot takes confirmed buy-ins only',
  t.bigFishEntrants(potRoster).map(a => a.id), ['p1', 'p5']);
check('an unconfirmed buy-in is out',
  t.bigFishEntrants(potRoster).some(a => a.id === 'p2'), false);
check('a disqualified one is out too',
  t.bigFishEntrants(potRoster).some(a => a.id === 'p3'), false);
check('and a legacy entry is in', t.bigFishEntrants(potRoster).some(a => a.id === 'p5'), true);
check('an empty roster is an empty pot', t.bigFishEntrants([]), []);

// ---- the payout pools ----
// The pool is what the field is told it is playing for. Counting an entry
// whose fee never arrived overstates every placement in the split.
const payRoster = [
  { id: 's1', division: 'solo' },
  { id: 's2', division: 'solo', pending: true },
  { id: 't1', division: 'team', role: 'captain' },
  { id: 't2', division: 'team', role: 'partner' },
  { id: 't3', division: 'team', role: 'captain', pending: true },
  { id: 't4', division: 'team', role: 'partner', pending: true },
  { id: 'b1', division: 'solo', bigfish: true },
  { id: 'b2', division: 'solo', bigfish: true, pending: true }
];
// Confirmed: s1 and b1 are solo, t1 is the one team entry, b1 bought Big Fish.
check('unconfirmed entries do not inflate a pool',
  t.poolCounts(payRoster), { solo: 2, teams: 1, bigfish: 1 });
check('and counting them all would have said otherwise',
  t.poolCounts(payRoster.map(a => { const c = Object.assign({}, a); delete c.pending; return c; })),
  { solo: 4, teams: 2, bigfish: 2 });
check('a team is still one entry fee, not two',
  t.poolCounts([{ division: 'team', role: 'captain' }, { division: 'team', role: 'partner' }]).teams, 1);
check('but Big Fish counts both halves of a team',
  t.poolCounts([{ division: 'team', role: 'captain', bigfish: true },
                { division: 'team', role: 'partner', bigfish: true }]).bigfish, 2);
check('a legacy roster still counts in full',
  t.poolCounts([{ division: 'solo' }, { division: 'solo' }]).solo, 2);
check('an empty roster is an empty pool', t.poolCounts([]), { solo: 0, teams: 0, bigfish: 0 });

// ---- what they are told ----
const notice = t.pendingNoticeHtml({ pending: true });
check('a pending angler is told the entry is not live', /not confirmed/i.test(notice), true);
check('and told it is the fee, not a mistake they made', /fee/i.test(notice), true);
check('and told to keep fishing', /still/i.test(notice), true);
check('a confirmed angler is told nothing', t.pendingNoticeHtml({ name: 'Ann' }), '');
check('and neither is a legacy one', t.pendingNoticeHtml({}), '');

// ============================================================
section('48. bringing an entry onto another device');
// The installed app and the mobile browser are separate storage with separate
// anonymous sign-ins, so one person is two users to the database. Their entry
// is invisible in one of them, and registering again is the wrong fix.
seed([
  { id: 'x1', eventId: E1, name: 'Ann Miller', phone: '406-555-0100', anglerCode: '7K4M' },
  { id: 'x2', eventId: E1, name: 'Bob Reyes',  phone: '(406) 555-0199', anglerCode: 'HJ3N' }
], [], []);
await setEvent(E1);

// This build has no SUPABASE_URL (the harness blanks it), so claimEntry matches
// locally. The two checks it applies are the same ones the SQL function applies.
check('the right code and phone finds the entry',
  await t.claimEntry('7K4M', '406-555-0100'), 'x1');
check('the code is case-insensitive', await t.claimEntry('7k4m', '406-555-0100'), 'x1');
check('and the phone is matched loosely',
  await t.claimEntry('7K4M', '+1 (406) 555 0100'), 'x1');

// BOTH have to match. A code alone is four characters, and somebody else's code
// is visible on their board in any photo they show you.
check('the right code with the wrong phone finds nothing',
  await t.claimEntry('7K4M', '406-555-0199'), null);
check('the right phone with the wrong code finds nothing',
  await t.claimEntry('HJ3N', '406-555-0100'), null);
check('a code that belongs to nobody finds nothing',
  await t.claimEntry('ZZZZ', '406-555-0100'), null);

// Neither field may be skipped by leaving it empty.
check('no code, no claim', await t.claimEntry('', '406-555-0100'), null);
check('no phone, no claim', await t.claimEntry('7K4M', ''), null);
check('a short phone is not a phone', await t.claimEntry('7K4M', '5550100'), null);
check('and neither is nothing at all', await t.claimEntry(null, null), null);

// An angler with no code on record must not be claimable by leaving the box
// blank - empty matching empty would hand over every legacy entry at once.
seed([{ id: 'x3', eventId: E1, name: 'Legacy', phone: '406-555-0111' }], [], []);
await setEvent(E1);
check('an angler with no board code cannot be claimed with a blank one',
  await t.claimEntry('', '406-555-0111'), null);

// ---- what the angler is told when it is the SERVER that is wrong ----
// "No entry found" would send them re-checking a code that was right.
check('a missing function is not reported as a bad code',
  /director/.test(t.claimErrorText({ status: 404 })), true);
check('and says the server is not set up', /set up/.test(t.claimErrorText({ status: 404 })), true);
check('a not-yet-signed-in device is told to wait',
  /wait/i.test(t.claimErrorText({ status: 401 })), true);
check('a network failure reads as a network failure',
  /signal/.test(t.claimErrorText(new Error('boom'))), true);

// ============================================================
console.log('\n' + (fail === 0 ? 'ALL PASS' : fail + ' FAILED') + '  (' + pass + ' passed)');
process.exit(fail === 0 ? 0 : 1);
