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
  myAnglerIds, populateAnglerSelect, renderRoster, statusClass, statusHtml, lengthHtml, escapeHtml,
  bearerToken, authModeLabel, noteAuthSession, initAuth, SUPABASE_ANON_KEY,
  supabaseBackend,
  generateHandle, uniqueHandle, displayHandle,
  loadMessages, saveMessages, chatAuthor, chatUnreadCount, chatLastSeen,
  markChatSeen, chatItemHtml, chatBragHtml, announceCatch, CHAT_MAX, canDeleteMessage,
  loadSignals, saveSignals, publishSignal, activeBeacons, myBeacon,
  signalAgeMinutes, signalIsFresh, signalAgeText, compassFrom, SIGNAL_STALE_MINUTES,
  beaconTick, startBeaconTracking, stopBeaconTracking, resumeBeaconTracking,
  loadBets, saveBets, betRecords, betJoins, betHasJoined, betStanding, betCardHtml,
  BET_TITLE_MAX, BET_OPEN_MAX, BET_SCORING, renderDqNotice,
  makeCode, codesInUse, takenCodes, codeBoxHtml, codeNoteHtml, anglerById,
  feePaid, normPhone, pendingNoticeHtml, bigFishEntrants, poolCounts,
  outstandingFees, unpaidInTheMoney, FEE_SOLO, FEE_TEAM, FEE_BIGFISH,
  overdueCheckouts, sortOverdue, eventTimeParts, FINAL_CHECKIN_SECONDS,
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
  reportSettings, saveReportSettings, lastFiledDetails, REPORT_FILER_FIELDS,
  residencyCounts, reportFieldCounts, reportableCatches, catchDayKey,
  contestDayHours, catchesPerDay, speciesTally, sizeDistribution, winningFish,
  reportDueDate, reportDueText, reportWarnings, FWP_DEADLINE_DAYS,
  reportClockText, clockToMinutes, reportDayRow, buildReportModel,
  stripEntities, sizeColumns, sheetValue, resetReportForm, SHEET_BLANK, pickedResidency,
  reportWithDefaults, fillReportInputs,
  PAGE_WIDTH_PX, PAGE_HEIGHT_PX, spillText, reportSpillPages,
  setReportPageView, scaleReportPages,
  get reportPageView(){ return reportPageView; },
  renderFwpReport, renderReportSheet, reportSheetText,
  get appDocument(){ return document; },
  SIZE_SMALL_MIN, SIZE_SMALL_MAX, SIZE_LARGE_MIN, SIZE_LARGE_MAX,
  noteServerClock, noteResponseClock, clockSkewMs, clockIsTrusted, skewText,
  CLOCK_SKEW_TOLERANCE_MS, CAPTURE_LAG_TOLERANCE_MS, lagText,
  photoStamp, photoStampLines, stampClockText, drawPhotoStamp,
  captureBadges, captureBadgeHtml, PHOTO_SOURCE_CAMERA, PHOTO_SOURCE_UPLOAD,
  renderClockNotice, encodeToBudget,
  get serverClockOffset(){ return serverClockOffset; },
  set serverClockOffset(v){ serverClockOffset = v; },
  loadAwardsBudget, saveAwardsBudget, awardsBudgetMap,
  standingsFor, byLengthThenEarliest, bySmallestThenEarliest, catchTime,
  canActFor, reviewCatch, showAdminTool,
  galleryOrder, galleryTileHtml, galleryTime, openLightbox, closeLightbox, hideLightbox,
  buildResults, bigFishWinner, frozenResults, saveFrozenResults, setupTodos,
  loadBetsAllEvents, renderResultsAdmin, renderSetupTodos,
  reelRows, reelPlan, reelSceneAt, reelMimeType, reelFileExt, reelFileName,
  catchPhotoFileName, reelSupported, REEL_MAX_SHOTS,
  personKey, myEntryIds, dayKeyIn, trophyEventRow, trophyStats, trophyBadges,
  TROPHY_BADGES, trophyEventInfo, trophyHistoryHtml, placingText,
  loadAnglersAllEvents, isScoringSpecies,
  screenHash, screenFromHash, historyApi, pushScreenState, handlePopState, initHistory,
  goto, screens, get currentScreen(){ return currentScreen; },
  splitFor, PAYOUT_SHARES, eventDateRangeText, eventRowCounts, eventDayText,
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
    // Real code clears an <img> src this way to let a big photo out of memory.
    removeAttribute(name){ delete this[name]; },
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
section('17b. ties, and why they must not follow row order');
// Rows come back from Postgres in whatever order it likes, and that order
// CHANGES when a row is updated - so approving one catch could silently
// reorder a tie somewhere else, and two phones could show different boards
// from identical data. This is the regression test for that: the same fish in
// a different order must rank the same way every time.
const tieAnglers = [
  { id: 'ta', handle: 'Alpha', division: 'solo' },
  { id: 'tb', handle: 'Bravo', division: 'solo' }
];
const fish = (id, who, len, ts) => ({ id, anglerId: who, division: 'solo',
  status: 'approved', species: 'Walleye', length: len, timestamp: ts });
await setEvent(E1);
await t.saveEventSettings({ targetSpecies: 'Walleye' });

// Identical fish. Bravo landed theirs first, so Bravo takes it.
const rowsA = [fish('c1', 'ta', 24, 5000), fish('c2', 'tb', 24, 1000)];
const rowsB = [fish('c2', 'tb', 24, 1000), fish('c1', 'ta', 24, 5000)];
const rank = rows => t.standingsFor('solo', rows, tieAnglers).map(r => r.name);
check('a dead tie goes to the fish landed first', rank(rowsA), ['Bravo', 'Alpha']);
check('and the row order cannot change that', rank(rowsB), rank(rowsA));

// Tied on best AND on best-3 combined - the case that used to fall through to
// arrival order with nothing left to decide it.
const deepA = [fish('x1','ta',24,100), fish('x2','ta',20,101),
               fish('y1','tb',24,200), fish('y2','tb',20,201)];
const deepB = [fish('y1','tb',24,200), fish('y2','tb',20,201),
               fish('x1','ta',24,100), fish('x2','ta',20,101)];
check('tied on best and on best-3, the earlier best fish wins',
  rank(deepA), ['Alpha', 'Bravo']);
check('still independent of row order', rank(deepB), rank(deepA));

// best-3 must still outrank the timestamp: a later fish with more behind it wins.
const depth = [fish('d1','ta',24,100),
               fish('d2','tb',24,900), fish('d3','tb',23,901), fish('d4','tb',22,902)];
check('a bigger best-3 still beats an earlier fish',
  rank(depth), ['Bravo', 'Alpha']);

// bestAt is the time of the BEST fish, not the earliest fish in the bag.
const bag = t.standingsFor('solo',
  [fish('b1','ta',18,10), fish('b2','ta',26,900)], tieAnglers)[0];
check('bestAt tracks the best fish, not the first one', bag.bestAt, 900);

// A missing timestamp must never WIN a tie by accident.
check('a catch with no timestamp sorts last, not first',
  rank([fish('n1','ta',24,undefined), fish('n2','tb',24,7000)]), ['Bravo', 'Alpha']);
check('and a junk timestamp is treated the same way',
  rank([fish('j1','ta',24,'not-a-time'), fish('j2','tb',24,7000)]), ['Bravo', 'Alpha']);
// Two of them tie on everything, including having no time at all. The order
// still has to be total - MAX_SAFE_INTEGER minus itself is 0, not NaN, so this
// falls through to the key rather than going undefined.
const noTime = rank([fish('z1','tb',24,undefined), fish('z2','ta',24,undefined)]);
check('two untimed fish still sort to a fixed order', noTime.length, 2);
check('and it does not depend on row order',
  rank([fish('z2','ta',24,undefined), fish('z1','tb',24,undefined)]), noTime);

// The single-fish comparator, shared by Big Fish and the state form.
check('the winning fish is the longest',
  (t.winningFish(rowsA, tieAnglers) || {}).id, 'c2');
check('and a tie there goes to the earlier catch too',
  (t.winningFish(rowsB, tieAnglers) || {}).id, 'c2');
check('the form and the leaderboard agree on who won',
  (t.winningFish(rowsA, tieAnglers) || {}).anglerId,
  tieAnglers.find(a => a.handle === rank(rowsA)[0]).id);
// Big Fish ranks single fish with the same comparator.
check('sorting single fish is longest, then earliest, then id',
  [fish('m3','ta',22,50), fish('m1','tb',24,900), fish('m2','ta',24,300)]
    .sort(t.byLengthThenEarliest).map(c => c.id), ['m2', 'm1', 'm3']);
// Same length AND the same instant - only the id is left to decide. Without a
// final fallback here the order would be arrival order again, which is the
// whole thing this rule exists to stop.
check('two identical fish at the same instant still get a fixed order',
  [{ id: 'm9', length: 24, timestamp: 500 }, { id: 'm4', length: 24, timestamp: 500 }]
    .sort(t.byLengthThenEarliest).map(c => c.id), ['m4', 'm9']);
check('and reversing the input does not change it',
  [{ id: 'm4', length: 24, timestamp: 500 }, { id: 'm9', length: 24, timestamp: 500 }]
    .sort(t.byLengthThenEarliest).map(c => c.id), ['m4', 'm9']);
// The smallest-fish side bet pays out, so its ties need settling too - same
// rule, read from the other end of the tape.
const smalls = [{ id:'s3', length:12, timestamp:100 },
                { id:'s1', length:9,  timestamp:900 },
                { id:'s2', length:9,  timestamp:400 }];
check('the smallest fish wins that bet, earliest breaking the tie',
  smalls.slice().sort(t.bySmallestThenEarliest).map(c => c.id), ['s2', 's1', 's3']);
check('and it does not depend on row order',
  smalls.slice().reverse().sort(t.bySmallestThenEarliest).map(c => c.id), ['s2', 's1', 's3']);
check('a smallest-bet tie at the same instant still resolves',
  [{ id:'sb', length:9, timestamp:5 }, { id:'sa', length:9, timestamp:5 }]
    .sort(t.bySmallestThenEarliest).map(c => c.id), ['sa', 'sb']);
check('catchTime reads a real timestamp', t.catchTime({ timestamp: 42 }), 42);
check('and pushes a missing one to the back',
  t.catchTime({}) > Date.now() * 1000, true);

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

// A wiped or replaced phone has no registration to scope to. It used to be
// handed the WHOLE FIELD - on the grounds that there was no way back to your
// entry and being locked out mid-event was worse. There is a way back now
// ("Sign in to my entry"), so that fallback had stopped being a trade-off and
// become an open door: anyone who opened the link could read, re-measure and
// withdraw other people's catches from the manage screen.
seed(ROSTER, [], [], {});
const wiped = boot(new Map());
wiped.liveCache.config = { activeEventId: E1 };
wiped.liveCache.anglers = ROSTER;
wiped.loadedIds.anglers = null;
check('an unlinked device owns nothing', wiped.myAnglerIds(ROSTER), []);
await wiped.populateAnglerSelect('sub-angler', 'sub-angler-note');
check('and is offered nobody to act as',
  (elById.get('sub-angler').innerHTML.match(/<option value="[^"]+"/g) || []).length, 0);
check('the whole field is NOT listed',
  /solo1|cap1|par1/.test(elById.get('sub-angler').innerHTML), false);
check('and it is told how to sign in rather than left guessing',
  /Sign in to my entry/.test(elById.get('sub-angler-note').textContent), true);

// The write path checks again, because a <select> is markup anyone can edit.
check('an unlinked device may not act for anyone',
  wiped.canActFor('solo1', ROSTER), false);
t.setMyAnglerId('cap1');
check('a captain may act for themselves', t.canActFor('cap1', ROSTER), true);
check('and for their partner, who shares the entry',
  t.canActFor('par1', ROSTER), true);
check('but not for a stranger', t.canActFor('solo1', ROSTER), false);
check('and not for an empty id', t.canActFor('', ROSTER), false);
t.adminUnlocked = true;
check('the director may act for anyone', t.canActFor('solo1', ROSTER), true);
t.adminUnlocked = false;

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
section('29b. reading a table that outgrew one response');
// Supabase caps how many rows one response may carry, and it truncates
// SILENTLY - a short read is a normal 200 and looks exactly like a small
// table. The catches table grows with every event, so without paging, fish
// would just stop reaching the leaderboard a season or two in.
{
  const realFetch2 = globalThis.fetch;
  // Serve `total` rows out of a fake table, honouring limit/offset, and cap
  // each page at `cap` rows however much was asked for - which is what a
  // server-side Max rows setting does.
  const serve = (total, cap)=>{
    const seen = [];
    globalThis.fetch = async (url)=>{
      seen.push(String(url));
      const q = new URL(String(url), 'https://x.invalid');
      const limit = Number(q.searchParams.get('limit'));
      const offset = Number(q.searchParams.get('offset') || 0);
      const n = Math.min(cap, limit, Math.max(0, total - offset));
      const rows = [];
      for(let i = 0; i < n; i++) rows.push({ id: 'r' + (offset + i), data: { n: offset + i } });
      return { ok: true, status: 200,
        headers: { get: (h)=> h.toLowerCase() === 'content-range'
          ? offset + '-' + (offset + n - 1) + '/' + total : null },
        async json(){ return rows; }, async text(){ return ''; } };
    };
    return seen;
  };
  try{
    const backend = t.supabaseBackend();

    let seen = serve(2500, 1000);
    let rows = await backend.fetchAll('catches');
    check('a table larger than one page comes back whole', rows.length, 2500);
    check('with no row fetched twice', new Set(rows.map(r => r.id)).size, 2500);
    check('and the last row is really there',
      rows.some(r => r.id === 'r2499'), true);
    // 2500 rows in pages of 1000 is exactly three reads. A fourth would mean
    // the count header was ignored and we paged until the server ran dry -
    // correct, but a wasted round trip on every poll, on every phone.
    check('the row count is used, so there is no wasted final read', seen.length, 3);
    check('every read is ordered, or the pages would not line up',
      seen.every(u => u.indexOf('order=id.asc') > -1), true);
    check('and the first one asks for the count',
      seen.length > 0, true);

    // The nastier case: the server caps pages BELOW what we asked for. Stepping
    // by the requested limit would skip every row in the gap.
    seen = serve(2500, 400);
    rows = await backend.fetchAll('catches');
    check('a server-side cap below our page size loses nothing', rows.length, 2500);
    check('and still no duplicates', new Set(rows.map(r => r.id)).size, 2500);

    // Exactly one page, and exactly one page plus one.
    serve(1000, 1000);
    check('a table of exactly one page is not truncated',
      (await backend.fetchAll('catches')).length, 1000);
    serve(1001, 1000);
    check('nor is one a single row over', (await backend.fetchAll('catches')).length, 1001);

    serve(0, 1000);
    check('an empty table reads as empty', (await backend.fetchAll('catches')).length, 0);

    // A server that will not count still has to be paged correctly.
    globalThis.fetch = async (url)=>{
      const q = new URL(String(url), 'https://x.invalid');
      const offset = Number(q.searchParams.get('offset') || 0);
      const n = Math.min(1000, Math.max(0, 1500 - offset));
      const rows = [];
      for(let i = 0; i < n; i++) rows.push({ id: 'u' + (offset + i), data: {} });
      return { ok: true, status: 200,
        headers: { get: ()=> '*/*' },       // count refused
        async json(){ return rows; }, async text(){ return ''; } };
    };
    check('a server that refuses to count is paged until it runs dry',
      (await backend.fetchAll('catches')).length, 1500);
  } finally {
    globalThis.fetch = realFetch2;
  }
}

// ============================================================
section('29c. splitting a pool without losing a cent');
// 50/30/20 of an odd pool does not divide evenly. Rounding each share on its
// own used to hand out a cent MORE than the pool held, or strand one - money
// that gets read out loud at a prizegiving.
{
  const cents = (n) => Math.round(n * 100);
  const paid  = (rows) => rows.reduce((s, r) => s + cents(r.amount), 0);

  // The headline invariant: with all three places filled, the parts add up to
  // the whole. Swept across a range of realistic pools, cent by cent.
  let worstOver = 0, worstUnder = 0, checked = 0;
  for (let c = 0; c <= 5000; c++) {
    const pool = 100 + c / 100;
    const drift = paid(t.splitFor(3, pool)) - cents(pool);
    if (drift > worstOver) worstOver = drift;
    if (drift < worstUnder) worstUnder = drift;
    checked++;
  }
  check('every pool from $100.00 to $150.00 was checked', checked, 5001);
  check('no pool ever pays out more than it holds', worstOver, 0);
  check('and none ever strands a cent', worstUnder, 0);

  // The two cases that were actually wrong before.
  check('$300.05 splits exactly', paid(t.splitFor(3, 300.05)), 30005);
  check('$300.01 splits exactly', paid(t.splitFor(3, 300.01)), 30001);
  // A leftover cent goes to the largest remainder, which is 1st place here.
  check('the odd cent goes to the biggest share',
    t.splitFor(3, 300.01).map(r => r.amount), [150.01, 90.00, 60.00]);

  // A round pool still splits the obvious way.
  check('a round pool is unchanged',
    t.splitFor(3, 300).map(r => r.amount), [150, 90, 60]);

  // An unfilled place must NOT be redistributed - it stays unawarded, and the
  // screen says so. Spreading it would quietly pay 2nd place more than the
  // rules promise.
  const two = t.splitFor(2, 300);
  check('two eligible pay two places', two.map(r => r.place), ['1st', '2nd']);
  check('and the third place is not shared out', paid(two), cents(240));
  const one = t.splitFor(1, 300);
  check('one eligible pays one place', one.map(r => r.amount), [150]);
  check('leaving the rest of the pool unawarded', paid(one), cents(150));

  check('nobody eligible pays nobody', t.splitFor(0, 300), []);
  check('more than three eligible still pays three', t.splitFor(9, 300).length, 3);
  check('an empty pool pays out nothing',
    t.splitFor(3, 0).map(r => r.amount), [0, 0, 0]);
  check('and a junk pool does not produce NaN dollars',
    t.splitFor(3, undefined).every(r => isFinite(r.amount)), true);
  // Not reachable through the UI - donations and fees are both floored at zero
  // - but a negative pool must never turn into a negative payout row that
  // reads as money owed BY a winner.
  check('a negative pool pays nothing rather than going negative',
    t.splitFor(3, -50).map(r => r.amount), [0, 0, 0]);

  // The shares themselves must stay 50/30/20 and add to the whole pool.
  check('the shares are 50/30/20', t.PAYOUT_SHARES.map(x => x.share), [0.5, 0.3, 0.2]);
  check('and they account for all of it',
    Math.round(t.PAYOUT_SHARES.reduce((s, x) => s + x.share, 0) * 100), 100);
}

// ============================================================
section('29d. judging a fish');
// The list buttons and the full-size photo panel both apply a verdict, so they
// go through one function - two copies of "what reject means" is how a fish
// ends up rejected in one place and approved in another.
{
  await setEvent(E1);
  const judged = [
    { id: 'j1', eventId: E1, anglerId: 'jx', anglerName: 'Jo', species: 'Walleye',
      length: 21, status: 'pending', timestamp: 1000 },
    { id: 'j2', eventId: E1, anglerId: 'jx', anglerName: 'Jo', species: 'Walleye',
      length: 22, status: 'pending', timestamp: 2000 }
  ];
  seed([], judged, [], {});

  check('approving marks it approved', await t.reviewCatch('j1', 'approve'), true);
  check('and it sticks', (await t.loadCatches()).find(c => c.id === 'j1').status, 'approved');
  check('rejecting marks it rejected', await t.reviewCatch('j2', 'reject'), true);
  check('and that sticks too', (await t.loadCatches()).find(c => c.id === 'j2').status, 'rejected');
  check('a rejected catch is still on the list, not gone',
    (await t.loadCatches()).length, 2);

  check('deleting removes it', await t.reviewCatch('j1', 'delete'), true);
  check('and it is really gone', (await t.loadCatches()).some(c => c.id === 'j1'), false);

  // The lightbox passes whatever the button carried; an unknown verdict must
  // change nothing rather than fall through to a default.
  check('an unknown action is refused', await t.reviewCatch('j2', 'maybe'), false);
  check('and changes nothing',
    (await t.loadCatches()).find(c => c.id === 'j2').status, 'rejected');
  check('a catch that is gone is refused', await t.reviewCatch('j1', 'approve'), false);
  check('and an id nobody has', await t.reviewCatch('nope', 'approve'), false);
}

// ============================================================
section('29e. the director panel opens on the fish');
// Pending catches used to sit outside the tool switcher, below whichever tool
// was open - so choosing Contestants put the review queue underneath it and it
// read as part of that screen.
{
  t.showAdminTool('review');
  check('the review tool is shown',
    elById.get('admin-tool-review').style.display, 'block');
  check('and contestants is not',
    elById.get('admin-tool-contestants').style.display, 'none');
  t.showAdminTool('contestants');
  check('choosing contestants hides the review queue',
    elById.get('admin-tool-review').style.display, 'none');
  check('rather than leaving it stacked underneath',
    elById.get('admin-tool-contestants').style.display, 'block');
  // Every tool the switcher lists has to exist, or selecting it throws and the
  // panel is stuck on whatever was open.
  ['gps','payout','contestants','event','positions','report','review'].forEach(tool=>{
    check('the ' + tool + ' tool has a card', !!elById.get('admin-tool-' + tool), true);
  });
}

// ============================================================
section('29f. the fish gallery');
// A wall of every approved fish, the viewer's own first.
{
  const gAnglers = [
    { id: 'g1', name: 'Ann Realname', handle: 'Salty Perch', tournamentId: 'MK-1' },
    { id: 'g2', name: 'Bob Realname', handle: 'Rogue Pike', tournamentId: 'MK-2' },
    { id: 'g3', name: 'Cy Realname', handle: 'Cheat', tournamentId: 'MK-3', disqualified: true }
  ];
  const gc = (id, who, status, ts, len) => ({ id, anglerId: who, anglerName:
    (gAnglers.find(a => a.id === who) || {}).name, species: 'Walleye',
    length: len || 20, division: 'solo', status, timestamp: ts });
  const gCatches = [
    gc('c-old-mine', 'g1', 'approved', 1000),
    gc('c-new-mine', 'g1', 'approved', 5000),
    gc('c-pending',  'g1', 'pending',  6000),
    gc('c-rejected', 'g1', 'rejected', 7000),
    gc('c-new-them', 'g2', 'approved', 9000),
    gc('c-old-them', 'g2', 'approved', 2000),
    gc('c-dq',       'g3', 'approved', 9500)
  ];
  const ids = (rows) => rows.map(r => r.id);

  const gal = t.galleryOrder(gCatches, gAnglers, ['g1']);
  check('your own fish come first, newest first within them',
    ids(gal).slice(0, 2), ['c-new-mine', 'c-old-mine']);
  check('then everyone else, also newest first',
    ids(gal).slice(2), ['c-new-them', 'c-old-them']);
  check('a pending fish is not on the wall', ids(gal).indexOf('c-pending'), -1);
  check('nor is a rejected one', ids(gal).indexOf('c-rejected'), -1);
  check('nor a disqualified angler\u2019s, same as the leaderboard',
    ids(gal).indexOf('c-dq'), -1);
  check('your own are flagged', gal.filter(r => r.mine).map(r => r.id),
    ['c-new-mine', 'c-old-mine']);

  // THE PRIVACY PROPERTY. The gallery is public, so the function returns a
  // projection rather than the catch records - the real name is not in the
  // object, so it cannot leak from one however the tile is later rendered.
  check('no real name survives into the gallery',
    /Realname/.test(JSON.stringify(gal)), false);
  check('the angler is their handle', gal[0].handle, 'Salty Perch');
  check('and the tile prints the handle', /Salty Perch/.test(t.galleryTileHtml(gal[0])), true);
  check('never the real name', /Realname/.test(t.galleryTileHtml(gal[0])), false);
  check('the projection carries only what the wall needs',
    Object.keys(gal[0]).sort().join(','),
    'division,handle,id,length,mine,species,timestamp');

  // Determinism, same as every other ordering in the app.
  check('the row order of the input cannot change the wall',
    ids(t.galleryOrder(gCatches.slice().reverse(), gAnglers, ['g1'])), ids(gal));
  check('two fish at the same instant still get a fixed order',
    ids(t.galleryOrder([gc('z2','g2','approved',3000), gc('z1','g2','approved',3000)],
      gAnglers, [])), ['z1', 'z2']);

  // catchTime() makes an undated fish enormous so it sorts LAST earliest-first.
  // Newest-first needs the opposite sentinel or that same fish leaps to the
  // front of the gallery, above everything real.
  check('an undated fish sinks to the bottom rather than topping the wall',
    ids(t.galleryOrder([gc('dated','g2','approved',100), gc('undated','g2','approved',undefined)],
      gAnglers, [])), ['dated', 'undated']);
  check('galleryTime reads a real timestamp', t.galleryTime({ timestamp: 42 }), 42);
  check('and floors a missing one rather than maximising it',
    t.galleryTime({}), 0);
  check('a junk timestamp is floored too', t.galleryTime({ timestamp: 'soon' }), 0);

  check('nobody signed in still sees the whole wall',
    ids(t.galleryOrder(gCatches, gAnglers, [])).length, 4);
  check('and none of it is marked as theirs',
    t.galleryOrder(gCatches, gAnglers, []).some(r => r.mine), false);
  check('an empty event is an empty wall', t.galleryOrder([], gAnglers, ['g1']), []);
  check('and missing arguments do not throw', t.galleryOrder(null, null, null), []);
  // A catch whose angler has left the roster still has a photo worth showing,
  // but it must not fall back to anything identifying.
  check('an unknown angler reads as unknown, not as a name',
    t.galleryOrder([gc('orphan','gone','approved',1)], gAnglers, [])[0].handle,
    'Unknown angler');
}

// ============================================================
section('29g. the pop-out shows a different thing to each side');
// One panel, two audiences. The director's review lists open it on a real name
// with the boundary verdict and the clock-skew flags; the gallery opens the
// same fish for the whole field, where the angler is a handle and the review
// notes are nobody else's business. Getting that backwards publishes either a
// real name or a decision that has already been made.
{
  await setEvent(E1);
  const lbAnglers = [{ id:'lb1', name:'Dana Realname', handle:'Quiet Heron',
                       tournamentId:'MK-9' }];
  const lbCatch = { id:'lbc1', eventId:E1, anglerId:'lb1', anglerName:'Dana Realname',
    species:'Walleye', length:23.5, division:'solo', status:'approved', timestamp:4000,
    location:{ withinBounds:false, outsideMiles:0.4 },
    capture:{ at: 1000, source:'camera', clockOffsetMs: 0 } };
  seed(lbAnglers, [lbCatch], [], {});

  await t.openLightbox('lbc1', { mode:'public' });
  const pubTitle = elById.get('lightbox-title').textContent;
  const pubMeta = elById.get('lightbox-meta').innerHTML;
  check('the public pop-out names the handle', /Quiet Heron/.test(pubTitle), true);
  check('and never the real name', /Realname/.test(pubTitle), false);
  check('nor does the meta line', /Realname/.test(pubMeta), false);
  check('it still says what the fish was', /Walleye/.test(pubMeta), true);
  check('the length is on it', /23\.50/.test(pubTitle), true);
  // The boundary verdict is a review note on a fish already judged. Publishing
  // it reopens a decision in front of the whole field.
  check('the boundary verdict stays with the director',
    /outside the line/.test(pubMeta), false);
  check('and so do the capture flags', /Logged/.test(pubMeta), false);
  // A PENDING fish, opened publicly. The gallery only ever lists approved ones,
  // so this is the mode guard being tested rather than the listing rule - if
  // the buttons keyed off status alone, any viewer could rule on a fish.
  seed(lbAnglers, [Object.assign({}, lbCatch, { id:'lbp', status:'pending' })], [], {});
  await t.openLightbox('lbp', { mode:'public' });
  check('a viewer is offered no verdict buttons, even on a pending fish',
    /data-lb-act="approve"/.test(elById.get('lightbox-actions').innerHTML), false);
  check('they get a way out instead',
    /data-lb-act="close"/.test(elById.get('lightbox-actions').innerHTML), true);
  await t.openLightbox('lbp', { mode:'director' });
  check('the director does get them',
    /data-lb-act="approve"/.test(elById.get('lightbox-actions').innerHTML), true);
  seed(lbAnglers, [lbCatch], [], {});

  await t.openLightbox('lbc1', { mode:'director' });
  const dirTitle = elById.get('lightbox-title').textContent;
  check('the director sees the real name', /Dana Realname/.test(dirTitle), true);
  check('and the boundary verdict is back',
    /outside the line/.test(elById.get('lightbox-meta').innerHTML), true);

  // An unknown mode must fall to the SAFE side. A typo in a call site should
  // cost a director some information, never publish a real name.
  await t.openLightbox('lbc1', { mode:'wharrgarbl' });
  check('an unrecognised mode is treated as public',
    /Realname/.test(elById.get('lightbox-title').textContent), false);
  await t.openLightbox('lbc1', {});
  check('and so is no mode at all',
    /Realname/.test(elById.get('lightbox-title').textContent), false);
  await t.openLightbox('lbc1');
  check('and no options object at all',
    /Realname/.test(elById.get('lightbox-title').textContent), false);

  // Walking a gallery: the arrows only appear when there is somewhere to go.
  seed(lbAnglers, [lbCatch,
    Object.assign({}, lbCatch, { id:'lbc2', timestamp:5000 }),
    Object.assign({}, lbCatch, { id:'lbc3', timestamp:6000 })], [], {});
  await t.openLightbox('lbc2', { mode:'public', sequence:['lbc1','lbc2','lbc3'] });
  check('the position in the wall is shown',
    elById.get('lightbox-count').textContent, '2 of 3');
  check('and the arrows are offered', elById.get('lightbox-nav').hidden, false);
  check('back is available in the middle', elById.get('lightbox-prev').disabled, false);
  check('so is forward', elById.get('lightbox-next').disabled, false);

  await t.openLightbox('lbc1', { mode:'public', sequence:['lbc1','lbc2','lbc3'] });
  check('there is nothing before the first', elById.get('lightbox-prev').disabled, true);
  await t.openLightbox('lbc3', { mode:'public', sequence:['lbc1','lbc2','lbc3'] });
  check('nor anything after the last', elById.get('lightbox-next').disabled, true);

  await t.openLightbox('lbc1', { mode:'public' });
  check('a fish opened on its own has no arrows',
    elById.get('lightbox-nav').hidden, true);

  elById.get('lightbox-img').src = 'blob:something-big';
  t.closeLightbox();
  check('closing drops the image so a big photo is not held in memory',
    elById.get('lightbox-img').src, undefined);
  check('and forgets which fish was open', elById.get('photo-lightbox').hidden, true);
}

// ============================================================
section('29h. the browser Back button');
// The app is one page pretending to be twelve. Without history entries, Back
// from three screens deep leaves it altogether - out to whatever was open
// before the tournament, or, installed to a home screen, to a dead stop.
{
  // A history stack good enough to walk. The real window.addEventListener in
  // this harness is a no-op, so popstate is delivered by calling the handler,
  // which is the part with the logic in it.
  function fakeHistory(){
    const stack = [];
    return {
      stack,
      pushState(st, _title, url){ stack.push({ st: st, url: url }); },
      replaceState(st, _title, url){
        const top = stack[stack.length - 1];
        const keep = url === undefined && top ? top.url : url;
        if(top) stack[stack.length - 1] = { st: st, url: keep };
        else stack.push({ st: st, url: keep });
      },
      back(){
        if(stack.length < 2) return null;
        stack.pop();
        return stack[stack.length - 1];
      }
    };
  }
  const savedHist = t.appWindow.history;
  const savedLoc2 = t.appWindow.location;
  // Deliver the entry Back landed on, the way a browser would.
  const goBack = (h)=>{ const at = h.back(); t.handlePopState({ state: at && at.st }); return at; };

  try{
    // ---- reading the address bar ----
    check('a known screen is recognised', t.screenFromHash('#leaderboard'), 'leaderboard');
    check('with a slash too', t.screenFromHash('#/leaderboard'), 'leaderboard');
    check('and without the hash', t.screenFromHash('gallery'), 'gallery');
    check('an empty hash names nothing', t.screenFromHash('#'), null);
    check('nor does an empty string', t.screenFromHash(''), null);
    check('nor null', t.screenFromHash(null), null);
    check('nor undefined', t.screenFromHash(undefined), null);
    // It is fed straight off the address bar, so anything unrecognised has to
    // read as "no opinion" rather than being trusted.
    check('a screen that does not exist is refused', t.screenFromHash('#wharrgarbl'), null);
    check('and so is a payload', t.screenFromHash('#<script>alert(1)</script>'), null);
    check('and a path traversal', t.screenFromHash('#../../etc/passwd'), null);
    check('every real screen round-trips',
      t.screens.every(n => t.screenFromHash(t.screenHash(n)) === n), true);

    // ---- with no history API at all ----
    delete t.appWindow.history;
    check('a browser with no history API is detected', t.historyApi(), null);
    check('and recording a move simply reports it did not',
      t.pushScreenState('home', false), false);
    t.goto('leaderboard');
    check('but the app still navigates', t.currentScreen, 'leaderboard');

    // A file:// page - the app opened straight off a phone or a USB stick -
    // throws SecurityError on pushState in several browsers. Not being able to
    // RECORD the move is not a reason to refuse to make it.
    t.appWindow.history = {
      pushState(){ throw new Error('SecurityError'); },
      replaceState(){ throw new Error('SecurityError'); }
    };
    check('a history API that throws is still detected as present',
      t.historyApi() !== null, true);
    check('recording reports the failure rather than raising it',
      t.pushScreenState('gallery', false), false);
    t.goto('gallery');
    check('and the navigation happens anyway', t.currentScreen, 'gallery');
    t.initHistory();
    check('opening the app does not die on it either', t.currentScreen, 'gallery');

    // ---- with one ----
    const h = fakeHistory();
    t.appWindow.history = h;
    t.appWindow.location = { hash: '' };
    t.goto('home', { replace: true });
    check('the opening screen takes one entry', h.stack.length, 1);

    t.goto('leaderboard');
    t.goto('gallery');
    check('each move adds an entry', h.stack.length, 3);
    check('and the address bar names the screen', h.stack[2].url, '#gallery');
    check('the entry remembers which screen it is',
      h.stack[2].st && h.stack[2].st.screen, 'gallery');

    // Re-tapping the tab you are already on is not a move. Without this the
    // stack fills with copies of one screen and Back appears to do nothing.
    t.goto('gallery');
    t.goto('gallery');
    check('standing still adds nothing', h.stack.length, 3);

    // ---- walking back ----
    goBack(h);
    check('Back returns to the previous screen', t.currentScreen, 'leaderboard');
    goBack(h);
    check('and the one before that', t.currentScreen, 'home');
    check('without pushing the entries it came out of', h.stack.length, 1);

    // An entry this app did not write - a restored session, say - has no state
    // object, so the hash is the fallback.
    t.appWindow.location = { hash: '#bigfish' };
    t.handlePopState({ state: null });
    check('an entry with no state falls back to the address bar',
      t.currentScreen, 'bigfish');
    // And if that names nothing either, home rather than a blank app.
    t.appWindow.location = { hash: '#nonsense' };
    t.handlePopState({ state: null });
    check('and to home when the address bar is no help', t.currentScreen, 'home');
    t.handlePopState({ state: { screen: 'not-a-screen' } });
    check('a state naming an unknown screen is refused too', t.currentScreen, 'home');

    // ---- opening straight onto a screen ----
    t.appWindow.location = { hash: '#gallery' };
    t.goto('home', { replace: true });
    const before = h.stack.length;
    t.initHistory();
    check('a link into a screen opens on it', t.currentScreen, 'gallery');
    check('and replaces the opening entry rather than stacking behind it',
      h.stack.length, before);

    t.appWindow.location = { hash: '' };
    t.goto('home', { replace: true });
    t.initHistory();
    check('opening with no hash stays on home', t.currentScreen, 'home');

    // ---- the photo panel ----
    await setEvent(E1);
    const hAnglers = [{ id:'h1', name:'Nav Tester', handle:'Drifting Reed' }];
    seed(hAnglers, [{ id:'hc1', eventId:E1, anglerId:'h1', anglerName:'Nav Tester',
      species:'Walleye', length:20, division:'solo', status:'approved', timestamp:1 }], [], {});
    t.goto('gallery');
    const atGallery = h.stack.length;
    await t.openLightbox('hc1', { mode:'public' });
    check('opening a fish full screen takes an entry of its own',
      h.stack.length, atGallery + 1);
    check('and marks it as the panel', h.stack[h.stack.length-1].st.lightbox, true);

    // Walking the arrows must not leave a trail to press Back through.
    await t.openLightbox('hc1', { mode:'public' });
    await t.openLightbox('hc1', { mode:'public' });
    check('walking between fish adds no more', h.stack.length, atGallery + 1);

    // Back closes the photo and leaves you on the screen behind it.
    goBack(h);
    check('Back closes the panel', elById.get('photo-lightbox').hidden, true);
    check('rather than leaving the screen', t.currentScreen, 'gallery');
    check('and the panel gives its entry back', h.stack.length, atGallery);

    // The Close button has to go the same way, or the entry outlives the panel
    // and the next Back appears to do nothing.
    await t.openLightbox('hc1', { mode:'public' });
    check('the panel takes an entry again', h.stack.length, atGallery + 1);
    // closeLightbox() calls history.back() itself, so the stack has already
    // moved by the time we hand it the popstate a browser would have fired.
    t.closeLightbox();
    t.handlePopState({ state: h.stack[h.stack.length-1].st });
    check('closing by button spends the same entry', h.stack.length, atGallery);
    check('and the panel is shut', elById.get('photo-lightbox').hidden, true);
  } finally {
    if(savedHist === undefined) delete t.appWindow.history;
    else t.appWindow.history = savedHist;
    if(savedLoc2 === undefined) delete t.appWindow.location;
    else t.appWindow.location = savedLoc2;
    t.hideLightbox();
    t.goto('home');
  }
}

// ============================================================
section('29i. the trophy case');
// Personal bests, a row per event, and badges. The interesting part is joining
// one person's entries across events: ids are per-event, handles get re-rolled,
// and names are typed by hand.
{
  const A = (over) => Object.assign({ division:'solo', checkins:{} }, over);
  const C = (over) => Object.assign({ status:'approved', species:'Walleye',
    division:'solo', length:20, timestamp:1000 }, over);

  // Same person, two events, two entry ids, two handles, name typed differently.
  const tAnglers = [
    A({ id:'e1-me', eventId:'ev-2027', phone:'(406) 555-0101', name:'Dan Turman',
        handle:'Old Reel', bigfish:true,
        checkins:{ day1:{ in:1, out:2 }, day2:{ in:3, out:0 } } }),
    A({ id:'e2-me', eventId:'ev-2029', phone:'406-555-0101', name:'Daniel Turman',
        handle:'New Reel' }),
    A({ id:'e1-rival', eventId:'ev-2027', phone:'4065550202', name:'Rival' }),
    A({ id:'e2-rival', eventId:'ev-2029', phone:'4065550202', name:'Rival' })
  ];
  const tCatches = [
    // 2027: three walleye, one on day two.
    C({ id:'k1', eventId:'ev-2027', anglerId:'e1-me', length:22, timestamp:Date.UTC(2027,8,18,15) }),
    C({ id:'k2', eventId:'ev-2027', anglerId:'e1-me', length:18, timestamp:Date.UTC(2027,8,18,17) }),
    C({ id:'k3', eventId:'ev-2027', anglerId:'e1-me', length:26, timestamp:Date.UTC(2027,8,19,16) }),
    C({ id:'k4', eventId:'ev-2027', anglerId:'e1-me', length:40, species:'Other',
        timestamp:Date.UTC(2027,8,19,18) }),
    C({ id:'k5', eventId:'ev-2027', anglerId:'e1-me', length:99, status:'pending',
        timestamp:Date.UTC(2027,8,19,19) }),
    C({ id:'r1', eventId:'ev-2027', anglerId:'e1-rival', length:30, timestamp:1 }),
    // 2029: one, and it wins.
    C({ id:'k6', eventId:'ev-2029', anglerId:'e2-me', length:31, timestamp:Date.UTC(2029,8,15,15) }),
    C({ id:'r2', eventId:'ev-2029', anglerId:'e2-rival', length:12, timestamp:1 })
  ];
  const info = (id) => ({ name: id === 'ev-2027' ? 'Open 2027' : 'Open 2029',
    year: id === 'ev-2027' ? '2027' : '2029',
    targetSpecies:'Walleye', timeZone:'America/Denver' });

  // ---- identity ----
  check('a phone is normalised to ten digits',
    t.personKey({ phone:'(406) 555-0101' }), t.personKey({ phone:'+1 406 555 0101' }));
  check('no phone means no key', t.personKey({ phone:'' }), null);
  check('and neither does a missing angler', t.personKey(null), null);
  const ids = t.myEntryIds(tAnglers, ['e1-me']);
  check('signing in to one entry finds the other year\u2019s too',
    Array.from(ids).sort(), ['e1-me','e2-me']);
  check('and does not drag in anybody else', ids.has('e1-rival'), false);
  // An entry with no number cannot be matched to another year - better than
  // guessing on a name that was typed twice and spelled two ways.
  const noPhone = [A({ id:'np1', eventId:'ev-2027' }), A({ id:'np2', eventId:'ev-2029' })];
  check('an entry with no phone still counts for its own event',
    Array.from(t.myEntryIds(noPhone, ['np1'])), ['np1']);
  check('nobody signed in matches nothing', Array.from(t.myEntryIds(tAnglers, [])), []);

  // ---- the numbers ----
  const st = t.trophyStats(tAnglers, tCatches, [], ['e1-me'], info);
  check('both tournaments are in the history', st.events, 2);
  check('newest first', st.history.map(r => r.eventId), ['ev-2029','ev-2027']);
  check('approved fish are counted, across both', st.fish, 5);
  check('a pending fish is not', /k5/.test(JSON.stringify(st)), false);
  check('the personal best is the longest that scored, across both years', st.best, 31);
  // 40" was logged as Other. It is a real fish and it counts as one caught -
  // it just never scored, so it must not become a personal best.
  check('a non-scoring species never becomes the personal best',
    st.longest.species, 'Walleye');
  check('best 3 combined is per tournament, not all-time', st.bestTop3, 66);
  // Denver is UTC-6: the four approved fish fall two on the 18th and two on
  // the 19th, so the best day is 2 - a UTC reading would say 3.
  check('the best single day is counted in the event\u2019s own zone', st.bestDay, 2);
  check('a division win is recorded', st.wins, 1);
  check('and the best finish overall', st.bestPlacing, 1);
  check('the podium count is separate from the wins', st.podiums, 2);
  check('a Big Fish buy-in is remembered', st.bigFishBuyIns, 1);
  check('a day checked in AND out counts as a full day', st.fullDays, 1);
  check('species seen are listed once each', st.species, ['Other','Walleye']);

  const y27 = st.history.find(r => r.eventId === 'ev-2027');
  check('the 2027 row counts every approved fish', y27.fish, 4);
  check('but only walleye scored', y27.scoring, 3);
  check('it placed second behind the rival\u2019s 30-incher', y27.placing, 2);
  check('out of the field that ranked', y27.entrants, 2);
  const y29 = st.history.find(r => r.eventId === 'ev-2029');
  check('and 2029 was a win', y29.placing, 1);

  // ---- scoring a past event against ITS species ----
  // The live event's target must not decide a past event's board. Told 2027 was
  // a pike year, its walleye stop scoring - and the count has to follow.
  const pikeInfo = (id) => Object.assign({}, info(id),
    { targetSpecies: id === 'ev-2027' ? 'Northern Pike' : 'Walleye' });
  const st2 = t.trophyStats(tAnglers, tCatches, [], ['e1-me'], pikeInfo);
  check('a past event is scored against the species IT was fished for',
    st2.history.find(r => r.eventId === 'ev-2027').scoring, 0);
  check('while the other year is untouched',
    st2.history.find(r => r.eventId === 'ev-2029').scoring, 1);
  check('and isScoringSpecies still defaults to the live event',
    t.isScoringSpecies('Northern Pike', 'Northern Pike'), true);
  // Not just the count - the PLACING has to follow it too. Told 2027 was a pike
  // year, a field of walleye ranks nobody, so the row cannot still claim a
  // second place it was given by this year's species.
  check('and the placing follows the same species',
    st2.history.find(r => r.eventId === 'ev-2027').placing, 0);
  check('with nobody ranked at all that year',
    st2.history.find(r => r.eventId === 'ev-2027').entrants, 0);

  // ---- edges ----
  const empty = t.trophyStats([], [], [], [], info);
  check('a blank slate is not an error', empty.events, 0);
  check('with no personal best', empty.best, 0);
  check('and no best finish', empty.bestPlacing, 0);
  check('missing arguments do not throw', t.trophyStats(null, null, null, null, null).events, 0);
  // Registered but never landed anything: the event still belongs in the
  // history, or an angler's first tournament vanishes from their own record.
  const dnf = t.trophyStats([A({ id:'d1', eventId:'ev-2029', phone:'4065559999' })],
    [], [], ['d1'], info);
  check('a tournament fished with no fish still shows up', dnf.events, 1);
  check('unranked rather than placed', dnf.history[0].placing, 0);

  // A disqualified entry keeps its fish count and loses its placing.
  const dqA = [A({ id:'x1', eventId:'ev-2029', phone:'4065558888', disqualified:true })];
  const dqRow = t.trophyStats(dqA,
    [C({ id:'x', eventId:'ev-2029', anglerId:'x1', length:33 })], [], ['x1'], info);
  check('a disqualified entry still shows the fish it caught', dqRow.history[0].fish, 1);
  check('but takes no placing', dqRow.history[0].placing, 0);
  check('and the row says so', dqRow.history[0].disqualified, true);
  check('the printed row does not offer it a place',
    /1st/.test(t.trophyHistoryHtml(dqRow.history[0])), false);

  // A day is the event's OWN calendar day. These three are all 18 September in
  // Denver and split 18/19 in UTC, so reading them in the wrong zone turns one
  // good day into two ordinary ones.
  const lateAnglers = [A({ id:'l1', eventId:'ev-2027', phone:'4065556666' })];
  const lateCatches = [
    C({ id:'l-a', eventId:'ev-2027', anglerId:'l1', timestamp:Date.UTC(2027,8,18,20) }),
    C({ id:'l-b', eventId:'ev-2027', anglerId:'l1', timestamp:Date.UTC(2027,8,19,3) }),
    C({ id:'l-c', eventId:'ev-2027', anglerId:'l1', timestamp:Date.UTC(2027,8,19,5) })
  ];
  check('three fish either side of UTC midnight are one Denver day',
    t.trophyStats(lateAnglers, lateCatches, [], ['l1'], info).bestDay, 3);
  check('and the same three read as two days in UTC',
    t.trophyStats(lateAnglers, lateCatches, [], ['l1'],
      (id)=> Object.assign({}, info(id), { timeZone:'UTC' })).bestDay, 2);

  // ---- day keys ----
  check('a day is the event\u2019s own calendar day',
    t.dayKeyIn(Date.UTC(2027, 8, 19, 3), 'America/Denver'), '2027-09-18');
  check('and the same instant is the next day in UTC',
    t.dayKeyIn(Date.UTC(2027, 8, 19, 3), 'UTC'), '2027-09-19');
  check('a zone this browser has never heard of falls back rather than throwing',
    t.dayKeyIn(Date.UTC(2027, 8, 19, 3), 'Mars/Olympus'), '2027-09-19');

  // ---- badges ----
  const badges = t.trophyBadges(st);
  const has = (id) => (badges.find(b => b.id === id) || {}).earned;
  check('every badge is decided', badges.length, t.TROPHY_BADGES.length);
  check('first fish', has('first-fish'), true);
  check('twenty-incher', has('twenty'), true);
  check('twenty-five club', has('twentyfive'), true);
  check('and thirty, on the 31', has('thirty'), true);
  check('mixed bag, from the Other', has('mixed-bag'), true);
  check('champion', has('champion'), true);
  check('veteran, on two tournaments', has('veteran'), true);
  check('not fifty fish', has('fifty-fish'), false);
  check('a locked badge still says what it takes',
    !!(badges.find(b => b.id === 'fifty-fish') || {}).need, true);
  // The bug this rule exists for: a 40" pike in a walleye event is a real fish
  // and it counts among the fish caught, but treating it as a personal best
  // would put it above every walleye on the board and hand out the thirty-inch
  // badge for a species nobody was fishing for.
  const otherOnly = t.trophyStats(
    [A({ id:'o1', eventId:'ev-2029', phone:'4065557777' })],
    [C({ id:'o-big', eventId:'ev-2029', anglerId:'o1', length:40, species:'Other' }),
     C({ id:'o-small', eventId:'ev-2029', anglerId:'o1', length:12 })], [], ['o1'], info);
  check('a huge non-scoring fish is still a fish caught', otherOnly.fish, 2);
  check('but the personal best is the scoring one', otherOnly.best, 12);
  check('and it earns no size badge',
    t.trophyBadges(otherOnly).find(b => b.id === 'thirty').earned, false);
  check('nor the twenty', t.trophyBadges(otherOnly).find(b => b.id === 'twenty').earned, false);

  // A third place is a podium and is not a championship. With a fixture that
  // has both, either rule passes - so this one has only the podium.
  const podiumOnly = t.trophyStats(
    [A({ id:'p1', eventId:'ev-2029', phone:'4065554444' }),
     A({ id:'w1', eventId:'ev-2029', phone:'4065554445' }),
     A({ id:'w2', eventId:'ev-2029', phone:'4065554446' })],
    [C({ id:'pp', eventId:'ev-2029', anglerId:'p1', length:15 }),
     C({ id:'ww1', eventId:'ev-2029', anglerId:'w1', length:25 }),
     C({ id:'ww2', eventId:'ev-2029', anglerId:'w2', length:20 })], [], ['p1'], info);
  check('third place is third', podiumOnly.bestPlacing, 3);
  check('it counts as a podium', podiumOnly.podiums, 1);
  check('but it is not a win', podiumOnly.wins, 0);
  check('so the podium badge is earned',
    t.trophyBadges(podiumOnly).find(b => b.id === 'podium').earned, true);
  check('and the champion badge is not',
    t.trophyBadges(podiumOnly).find(b => b.id === 'champion').earned, false);

  check('a blank slate earns nothing',
    t.trophyBadges(empty).some(b => b.earned), false);
  check('and still lists them all to aim at', t.trophyBadges(empty).length,
    t.TROPHY_BADGES.length);
  // Every badge has to be checkable against the record, or the first thing an
  // angler does is ask why somebody else has one.
  check('every badge explains itself',
    t.TROPHY_BADGES.every(b => b.id && b.name && b.need && typeof b.earned === 'function'), true);
  check('and no two share an id',
    new Set(t.TROPHY_BADGES.map(b => b.id)).size, t.TROPHY_BADGES.length);

  check('placings read as ordinals',
    [1,2,3,4].map(t.placingText), ['1st','2nd','3rd','4th']);
}

// ============================================================
section('29j. the highlight reel');
// Compiles the angler's own photos into a video to post.
{
  const rAnglers = [
    { id:'me', name:'Real Name Here', handle:'Quiet Heron' },
    { id:'them', name:'Someone Else', handle:'Loud Osprey' }
  ];
  const rc = (id, who, len) => ({ id, anglerId:who, anglerName:
    (rAnglers.find(a => a.id === who) || {}).name, species:'Walleye', division:'solo',
    status:'approved', length:len, timestamp:len * 100 });
  const rCatches = [
    rc('m-small','me',18), rc('m-big','me',27), rc('m-mid','me',22),
    rc('m-pending','me',40), rc('t1','them',31)
  ];
  rCatches.find(c => c.id === 'm-pending').status = 'pending';

  const rows = t.reelRows(rCatches, rAnglers, ['me']);
  check('the reel is your fish, biggest first',
    rows.map(r => r.id), ['m-big','m-mid','m-small']);
  // THE RULE THE WHOLE FEATURE RESTS ON. A wall inside the app is one thing;
  // a file about to go on the internet is another, and only one of those did
  // anybody agree to.
  check('somebody else\u2019s fish never reaches the reel',
    rows.some(r => r.id === 't1'), false);
  check('nor does a fish still waiting on the director',
    rows.some(r => r.id === 'm-pending'), false);
  check('and no real name travels with it',
    /Real Name Here/.test(JSON.stringify(rows)), false);
  check('nobody signed in gets no reel', t.reelRows(rCatches, rAnglers, []), []);

  // ---- the running order ----
  const plan = t.reelPlan(rows);
  check('a title, every fish, and an end card', plan.scenes.length, rows.length + 2);
  check('opening on the title', plan.scenes[0].kind, 'title');
  check('and closing on the end card',
    plan.scenes[plan.scenes.length - 1].kind, 'end');
  check('the shots are counted', plan.shots, 3);
  check('every scene lasts long enough to be seen',
    plan.scenes.every(sc => sc.ms > 0), true);
  check('and the total is the sum of them',
    plan.totalMs, plan.scenes.reduce((n, sc) => n + sc.ms, 0));
  // Past about thirty seconds a social app truncates it and the reel ends
  // mid-fish, so the tail is dropped on purpose and the count says so.
  const many = [];
  for(let i = 0; i < 30; i++) many.push({ id:'x' + i, length: 30 - i, species:'Walleye' });
  const capped = t.reelPlan(many);
  check('a long season is capped', capped.shots, t.REEL_MAX_SHOTS);
  check('and says how many it left off', capped.dropped, 30 - t.REEL_MAX_SHOTS);
  check('the cap keeps the biggest fish', capped.scenes[1].row.id, 'x0');
  check('a reel of everything still fits in half a minute',
    capped.totalMs <= 35000, true);
  check('no fish at all is still a valid plan', t.reelPlan([]).shots, 0);
  check('and missing rows do not throw', t.reelPlan(null).shots, 0);

  // ---- the clock ----
  check('the title is on screen at the start',
    t.reelSceneAt(plan, 0).scene.kind, 'title');
  check('the first fish follows it',
    t.reelSceneAt(plan, plan.scenes[0].ms + 1).scene.kind, 'shot');
  check('and it is the biggest one',
    t.reelSceneAt(plan, plan.scenes[0].ms + 1).scene.row.id, 'm-big');
  check('the very last millisecond is still inside the reel',
    t.reelSceneAt(plan, plan.totalMs - 1).scene.kind, 'end');
  // Past the end must read as nothing, or the recorder never stops.
  check('past the end there is no scene', t.reelSceneAt(plan, plan.totalMs), null);
  check('and well past it too', t.reelSceneAt(plan, plan.totalMs + 9999), null);
  check('a boundary lands on the NEXT scene, never between two',
    t.reelSceneAt(plan, plan.scenes[0].ms).scene.kind, 'shot');
  check('progress runs from zero', t.reelSceneAt(plan, 0).progress, 0);
  check('an empty plan has no scene anywhere', t.reelSceneAt({ scenes: [] }, 0), null);

  // ---- the file ----
  check('a webm mime yields a webm file', t.reelFileExt('video/webm;codecs=vp9'), 'webm');
  check('an mp4 mime yields an mp4 file', t.reelFileExt('video/mp4;codecs=avc1'), 'mp4');
  check('and an unknown one falls back to webm', t.reelFileExt(''), 'webm');
  const evt = { prefix:'MKWO', dates:['2027-09-18','2027-09-19'] };
  check('the reel is named so it can be found again',
    t.reelFileName(evt, 'Quiet Heron', 'mp4'), 'MKWO-2027-Quiet-Heron-highlights.mp4');
  check('a handle with punctuation cannot break the filename',
    /^[A-Za-z0-9._-]+$/.test(t.reelFileName(evt, 'O\'Malley / #1', 'mp4')), true);
  check('and neither can a missing event',
    /^[A-Za-z0-9._-]+$/.test(t.reelFileName(null, null, 'webm')), true);
  check('a saved photo is named after the fish',
    t.catchPhotoFileName(evt, { species:'Walleye', length:22.5 }),
    'MKWO-Walleye-22.50in.jpg');
  check('a photo of something odd still gets a usable name',
    /^[A-Za-z0-9._-]+\.jpg$/.test(t.catchPhotoFileName(evt, { species:'Bass / Other' })), true);

  // ---- what the browser can do ----
  // Node has no MediaRecorder, which is the same answer an old browser gives:
  // the card must say so rather than offering a button that cannot work.
  check('a browser with no recorder is detected', t.reelSupported(), false);
  check('and asking for a mime type does not throw', t.reelMimeType(), '');

  // MP4 over WebM, deliberately. WebM records fine in Chrome and then will not
  // upload from a phone to most social apps, which makes a working recorder
  // useless at the only moment that matters. Proven against a recorder that
  // claims to support both.
  const savedRec = globalThis.MediaRecorder;
  try{
    globalThis.MediaRecorder = { isTypeSupported: ()=> true };
    check('mp4 wins when both are offered', /mp4/.test(t.reelMimeType()), true);
    globalThis.MediaRecorder = { isTypeSupported: (m)=> m.indexOf('webm') !== -1 };
    check('webm is taken when mp4 is refused', /webm/.test(t.reelMimeType()), true);
    globalThis.MediaRecorder = { isTypeSupported: ()=> false };
    check('and nothing is claimed when nothing is supported', t.reelMimeType(), '');
    globalThis.MediaRecorder = {};
    check('a recorder that cannot be asked reports nothing', t.reelMimeType(), '');
  } finally {
    if(savedRec === undefined) delete globalThis.MediaRecorder;
    else globalThis.MediaRecorder = savedRec;
  }
}

// ============================================================
section('29k. freezing a result, and what the trophy case remembers');
// The trophy case looks backwards. Working a finished event out again from the
// catches every time means a cleanup next year quietly rewrites what somebody's
// trophy case says about this year.
{
  const FA = (over) => Object.assign({ division:'solo', checkins:{} }, over);
  const FC = (over) => Object.assign({ status:'approved', species:'Walleye',
    division:'solo', length:20, timestamp:1000 }, over);
  const fInfo = (id) => ({ name:'Open', year:'2027', targetSpecies:'Walleye',
    timeZone:'America/Denver', results: null });

  const fAnglers = [
    FA({ id:'f-me', eventId:'ev-f', phone:'4065551111', handle:'Old Handle', bigfish:true }),
    FA({ id:'f-rival', eventId:'ev-f', phone:'4065552222', handle:'Rival', bigfish:true })
  ];
  const fCatches = [
    FC({ id:'fc1', eventId:'ev-f', anglerId:'f-me', length:28 }),
    FC({ id:'fc2', eventId:'ev-f', anglerId:'f-rival', length:24 })
  ];
  const fBets = [
    { kind:'bet', id:'b-won', eventId:'ev-f', title:'First fish', creatorId:'f-rival',
      winnerId:'f-me', settledAt: 5 },
    { kind:'bet', id:'b-open', eventId:'ev-f', title:'Longest of the day',
      creatorId:'f-me', winnerId:null },
    { kind:'bet', id:'b-theirs', eventId:'ev-f', title:'Smallest', creatorId:'f-me',
      winnerId:'f-rival', settledAt: 6 },
    { kind:'join', id:'j1', eventId:'ev-f', betId:'b-won', anglerId:'f-me' }
  ];

  // ---- the record ----
  const rec = t.buildResults(fAnglers, fCatches, fBets, 'Walleye');
  check('the solo board is frozen in order',
    rec.divisions.solo.map(r => r.anglerIds[0]), ['f-me','f-rival']);
  check('an empty division is still recorded', rec.divisions.team, []);
  check('the Big Fish pot has a winner', rec.bigFish.anglerId, 'f-me');
  check('with the fish that took it', rec.bigFish.catchId, 'fc1');
  check('settled side bets are kept', rec.bets.map(b => b.id).sort(), ['b-theirs','b-won']);
  // An open bet has no winner, and freezing it as though it had would put a
  // prize in somebody's trophy case that nobody awarded.
  check('an unsettled bet is not', rec.bets.some(b => b.id === 'b-open'), false);
  check('the species it was scored against is recorded', rec.targetSpecies, 'Walleye');
  check('and when it was called', typeof rec.frozenAt, 'number');

  // ---- the Big Fish rule ----
  check('only a buy-in can take the pot',
    t.bigFishWinner([FA({ id:'n', bigfish:false })],
      [FC({ id:'nc', anglerId:'n', length:40 })], 'Walleye'), null);
  check('and only the scoring species',
    t.bigFishWinner(fAnglers, [FC({ id:'x', anglerId:'f-me', length:40, species:'Other' })],
      'Walleye'), null);
  check('a pending fish cannot take it',
    t.bigFishWinner(fAnglers, [FC({ id:'y', anglerId:'f-me', length:40, status:'pending' })],
      'Walleye'), null);
  check('an empty pot has no winner', t.bigFishWinner([], [], 'Walleye'), null);

  // Somebody winning the pot is not the same as YOU winning it. With a fixture
  // where you happen to win, "was there a winner" and "was it me" pass alike.
  const theirPot = t.buildResults(fAnglers,
    [FC({ id:'tp', eventId:'ev-f', anglerId:'f-rival', length:33 })], fBets, 'Walleye');
  check('the pot went to the rival', theirPot.bigFish.anglerId, 'f-rival');
  const notMine = t.trophyStats(fAnglers,
    [FC({ id:'tp', eventId:'ev-f', anglerId:'f-rival', length:33 })], fBets, ['f-me'],
    (id)=> Object.assign({}, fInfo(id), { results: theirPot }));
  check('and your trophy case does not claim it',
    notMine.history[0].bigFishWon, false);
  check('nor does the badge', t.trophyBadges(notMine).find(b => b.id === 'big-fish').earned, false);

  // ---- what the trophy row shows ----
  const live = t.trophyStats(fAnglers, fCatches, fBets, ['f-me'], fInfo);
  const row = live.history[0];
  check('the row names the handle carried THAT year', row.handle, 'Old Handle');
  check('the Big Fish pot is credited', row.bigFishWon, true);
  check('and only the side bet actually won', row.betsWon, ['First fish']);
  check('not the one somebody else won', row.betsWon.indexOf('Smallest'), -1);
  check('nor the one still open', row.betsWon.indexOf('Longest of the day'), -1);
  check('an unfrozen row says so', row.frozen, false);
  check('the totals roll up', [live.bigFishWins, live.betsWon], [1, 1]);
  check('and there are badges for them',
    t.trophyBadges(live).filter(b => (b.id === 'big-fish' || b.id === 'side-bet') && b.earned).length, 2);

  // ---- frozen wins over derived ----
  // The rival's fish is amended to 99" AFTER the freeze. The live board would
  // move; the frozen one must not, because the placing an angler was told on
  // the day has to stay the placing they were told.
  const amended = fCatches.map(c=>
    c.id === 'fc2' ? Object.assign({}, c, { length:99 }) : c);
  const stillLive = t.trophyStats(fAnglers, amended, fBets, ['f-me'], fInfo);
  check('without a freeze, a later amendment moves the placing',
    stillLive.history[0].placing, 2);

  const frozenInfo = (id) => Object.assign({}, fInfo(id), { results: rec });
  const held = t.trophyStats(fAnglers, amended, fBets, ['f-me'], frozenInfo);
  check('with one, it does not', held.history[0].placing, 1);
  check('the row says it is frozen', held.history[0].frozen, true);
  check('and the Big Fish credit is frozen with it', held.history[0].bigFishWon, true);
  // A bet settled after the freeze is not in the frozen record, so it must not
  // appear either - the frozen copy is the whole answer, not a starting point.
  const laterBets = fBets.concat([{ kind:'bet', id:'b-late', eventId:'ev-f',
    title:'Added later', creatorId:'f-rival', winnerId:'f-me', settledAt: 9 }]);
  check('a bet settled after the freeze is not backdated into it',
    t.trophyStats(fAnglers, fCatches, laterBets, ['f-me'], frozenInfo)
      .history[0].betsWon, ['First fish']);
  check('while an unfrozen event does pick it up',
    t.trophyStats(fAnglers, fCatches, laterBets, ['f-me'], fInfo)
      .history[0].betsWon, ['Added later','First fish']);

  // A freeze taken against a different species governs the row's fish count
  // too, or the count and the board would disagree.
  const pikeFrozen = (id) => Object.assign({}, fInfo(id),
    { results: t.buildResults(fAnglers, fCatches, fBets, 'Northern Pike') });
  check('a frozen event is counted against the species it was frozen on',
    t.trophyStats(fAnglers, fCatches, fBets, ['f-me'], pikeFrozen).history[0].scoring, 0);

  // ---- the round trip through config ----
  await setEvent(E1);
  check('nothing is frozen to begin with', t.frozenResults(E1), null);
  await t.saveFrozenResults(E1, rec);
  check('a frozen record survives being saved', t.frozenResults(E1).bigFish.anglerId, 'f-me');
  check('and reaches the event info the trophy case reads',
    !!t.trophyEventInfo(E1).results, true);
  check('another event is untouched', t.frozenResults(E2), null);
  // Two frozen at once: saving the second must not wipe the first, which a
  // fresh object rather than a copy would do silently.
  await t.saveFrozenResults(E2, t.buildResults(fAnglers, fCatches, fBets, 'Northern Pike'));
  check('a second freeze does not wipe the first',
    t.frozenResults(E1).targetSpecies, 'Walleye');
  check('and the second is its own', t.frozenResults(E2).targetSpecies, 'Northern Pike');
  await t.saveFrozenResults(E2, null);
  check('thawing one leaves the other frozen', !!t.frozenResults(E1), true);
  await t.saveFrozenResults(E1, null);
  check('and it can be thawed again', t.frozenResults(E1), null);
}

// ============================================================
section('29l. the reminder that outlives this conversation');
// A commit message is not a reminder, and neither is a comment nobody opens
// between tournaments. This lives on the screen the next event gets set up on,
// and only while there is still time to act.
{
  const openEvt = { registrationClose:'2027-06-02T00:00:00-06:00' };
  const beforeClose = Date.UTC(2027, 0, 1);
  const afterClose = Date.UTC(2027, 8, 1);
  const roster = [{ id:'a', phone:'4065551234' }, { id:'b', phone:'4065559999' }];

  const todos = t.setupTodos(openEvt, roster, beforeClose);
  check('while registration is open, there is something to do', todos.length > 0, true);
  check('accounts are on the list', todos.some(x => x.id === 'accounts'), true);
  check('and configuring reset email with them', todos.some(x => x.id === 'smtp'), true);
  check('each one says what it costs to leave',
    todos.every(x => x.title && x.detail && x.deadline), true);
  check('and carries the date it stops being cheap',
    todos.every(x => x.deadline === new Date(openEvt.registrationClose).getTime()), true);

  // Once registration has closed the moment has passed: doing it now would give
  // half the field an account and half none, which is worse than either.
  check('after registration closes it stops nagging',
    t.setupTodos(openEvt, roster, afterClose), []);
  check('an event with no close date does not nag either',
    t.setupTodos({}, roster, beforeClose), []);
  check('nor does a junk one', t.setupTodos({ registrationClose:'soon' }, roster, beforeClose), []);

  // A shared phone number is the actual bug, so finding one on the roster
  // raises the item rather than leaving it as a someday.
  const shared = [{ id:'a', phone:'(406) 555-1234' }, { id:'b', phone:'406-555-1234' }];
  const sharedTodos = t.setupTodos(openEvt, shared, beforeClose);
  const acct = sharedTodos.find(x => x.id === 'accounts');
  check('a shared number is spotted', /already 1 phone number/.test(acct.detail), true);
  check('and raises the item', acct.severity, 'now');
  check('while a clean roster leaves it as a soon',
    t.setupTodos(openEvt, roster, beforeClose).find(x => x.id === 'accounts').severity, 'soon');
  // Matched on the collision phrasing, not the word "already" - that also
  // appears in the standing copy about signInWithPassword.
  check('an entry with no phone is not a collision',
    /shared by more than one entry/.test(
      t.setupTodos(openEvt, [{ id:'a' }, { id:'b' }], beforeClose)
        .find(x => x.id === 'accounts').detail), false);
  check('but two sharing one is',
    /shared by more than one entry/.test(
      t.setupTodos(openEvt, shared, beforeClose)
        .find(x => x.id === 'accounts').detail), true);
  check('and an empty roster does not throw',
    t.setupTodos(openEvt, null, beforeClose).length > 0, true);
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

// Moderation affordances. `mine` covers BOTH halves of a team - which is right
// for "show this as mine" and wrong for "let this device delete it" - so the
// delete button reads meId, the posting identity, and nothing else.
const chatCtx = (over)=> Object.assign(
  { anglerById:{}, catches:[], mine:new Set(['a1','a1mate']), meId:'a1',
    isDirector:false, repliesByParent:{} }, over || {});
const msgFrom = (who)=> ({ id:'m-'+who, anglerId:who, kind:'chat', text:'x', timestamp:1 });
const canDel = (msg, over)=> /data-chat-act="delete"/.test(t.chatItemHtml(msg, chatCtx(over), false));

check('you can delete your own', canDel(msgFrom('a1')), true);
check('not someone elses', canDel(msgFrom('a2')), false);
// The bug this rule exists for: one half of a team could clear the other's
// messages, because a partner's entry is in `mine`.
check('and not your team partners, even though you share an entry',
  canDel(msgFrom('a1mate')), false);
check('but the director can delete anything',
  canDel(msgFrom('a2'), { isDirector:true }), true);
check('a device with no entry signed in can delete nothing',
  canDel(msgFrom('a1'), { meId:null }), false);

// The same rule the write path runs, checked directly - the button is markup,
// so the handler asks this again before it writes.
check('the author may delete', t.canDeleteMessage(msgFrom('a1'), 'a1', false), true);
check('a stranger may not', t.canDeleteMessage(msgFrom('a2'), 'a1', false), false);
check('a partner may not', t.canDeleteMessage(msgFrom('a1mate'), 'a1', false), false);
check('the director may', t.canDeleteMessage(msgFrom('a2'), 'a1', true), true);
check('a missing message is never deletable',
  t.canDeleteMessage(null, 'a1', true), false);
check('and no identity plus no director access deletes nothing',
  t.canDeleteMessage(msgFrom('a1'), null, false), false);
check('an undefined id cannot match an authorless message',
  t.canDeleteMessage({ id:'m0' }, undefined, false), false);
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
check('a new entry is pending', t.feePaid({ pending: true }), false);
check('a confirmed one is not', t.feePaid({ pending: false }), true);
check('confirming deletes the flag rather than setting it false',
  t.feePaid({ name: 'Ann' }), true);

// THE compatibility property. Every angler registered before this existed
// carries no flag, and reading a missing flag as pending would empty the
// standings of a tournament already under way.
check('an angler from before this existed still counts', t.feePaid({ id: 'old' }), true);
check('and so does one that is nothing at all', t.feePaid(undefined), true);

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

// ---- what an unmatched fee does NOT do any more ----
// This section used to assert the opposite: that an entry with no fee matched
// to it stayed out of the standings until the director ticked it off. That gate
// is gone. It was doing two jobs - fee tracking and blocking duplicate
// registrations - and the second is now handled by the roster gate, the
// name/phone checks and the database's unique indexes. What was left was money
// gating a leaderboard, which meant a missed tick showed up as an angler asking
// why their fish was not on the board, mid-event, at a ramp.
//
// Eligibility is `disqualified` and always was. Fees are money. See feePaid().
const confirmBoard = t.standingsFor('solo', cAll, aAll);
check('an entry with no fee matched still ranks', confirmBoard.map(r => r.name),
  ['Pending Handle', 'Legacy Handle', 'Paid Handle']);
check('and it ranks on the fish, not on the paperwork',
  Math.max.apply(null, cAll.map(c => c.length)), 30);
check('the paid angler still ranks too',
  confirmBoard.some(r => r.name === 'Paid Handle'), true);
check('and so does the legacy one',
  confirmBoard.some(r => r.name === 'Legacy Handle'), true);

// ---- what it must NOT gate ----
// Blocking a pending angler from fishing would strand anyone whose fee has not
// cleared by the ramp. They log catches, and now those catches score.
check('a pending angler is still on the roster', aAll.map(a => a.id).sort(), ['no', 'ok', 'old']);
check('and their catch is still stored', cAll.some(c => c.anglerId === 'no'), true);
check('and they are in the Big Fish pot if they opted in',
  t.bigFishEntrants([{ id: 'x', bigfish: true, pending: true }]).length, 1);
check('and they can hold the winning fish',
  (t.winningFish([{ id: 'w', anglerId: 'no', status: 'approved', species: 'Walleye', length: 30 }],
                 aAll) || {}).id, 'w');

// ---- what it still gates: money ----
// A pool is money that ARRIVED. An entry nobody has matched a payment to must
// not inflate what the field thinks it is playing for.
check('an unmatched entry is not counted in a pool',
  t.poolCounts([{ id: 'p', division: 'solo', pending: true }]).solo, 0);
check('a matched one is', t.poolCounts([{ id: 'p', division: 'solo' }]).solo, 1);

const owing = t.outstandingFees([
  { id: 'o1', division: 'solo', role: 'solo', pending: true },
  { id: 'o2', division: 'solo', role: 'solo', pending: true, bigfish: true },
  { id: 'o3', division: 'team', role: 'captain', teamId: 'T', pending: true },
  { id: 'o4', division: 'team', role: 'partner', teamId: 'T', pending: true, bigfish: true },
  { id: 'o5', division: 'solo', role: 'solo' }                       // already paid
]);
check('outstanding counts solo entries', owing.solo, 2);
check('and bills a team once, not once per half', owing.teams, 1);
check('but Big Fish per angler, including the partner', owing.bigfish, 2);
check('entries are registrations, so the partner is not one', owing.entries, 3);
check('and the total is real money',
  owing.total, 2 * t.FEE_SOLO + 1 * t.FEE_TEAM + 2 * t.FEE_BIGFISH);
check('the fees are the published ones',
  [t.FEE_SOLO, t.FEE_TEAM, t.FEE_BIGFISH], [30, 50, 10]);
check('a fully paid roster owes nothing',
  t.outstandingFees([{ id: 'q', division: 'solo' }]).total, 0);
check('and reports no entries outstanding',
  t.outstandingFees([{ id: 'q', division: 'solo' }]).entries, 0);

// ---- the one moment it has to be caught ----
// Paying an entry that never paid in comes out of everybody else's share, and
// this is the last point at which that is visible.
const moneyRoster = [
  { id: 'm1', name: 'Owes Money', handle: 'Owes Handle', division: 'solo', pending: true },
  { id: 'm2', name: 'Paid Up', handle: 'Paid Handle', division: 'solo' }
];
const moneyCatches = [
  { id: 'mc1', anglerId: 'm1', division: 'solo', status: 'approved', species: 'Walleye', length: 28 },
  { id: 'mc2', anglerId: 'm2', division: 'solo', status: 'approved', species: 'Walleye', length: 20 }
];
const inMoney = t.unpaidInTheMoney(moneyRoster, moneyCatches);
check('an unpaid angler in the money is named', inMoney.map(x => x.angler.name), ['Owes Money']);
check('and so is the placing that puts them there',
  inMoney[0].why, '1st in the solo division');
check('a paid field raises nothing',
  t.unpaidInTheMoney([moneyRoster[1]], [moneyCatches[1]]), []);
// Off the podium is not "in the money", so a long roster of unpaid stragglers
// does not bury the one that matters.
const deepField = [
  { id: 'd1', name: 'First', division: 'solo' }, { id: 'd2', name: 'Second', division: 'solo' },
  { id: 'd3', name: 'Third', division: 'solo' }, { id: 'd4', name: 'Fourth', division: 'solo', pending: true }
];
const deepCatches = deepField.map((a, i) => ({
  id: 'dc' + i, anglerId: a.id, division: 'solo', status: 'approved',
  species: 'Walleye', length: 30 - i
}));
check('an unpaid angler off the podium is not in the money',
  t.unpaidInTheMoney(deepField, deepCatches), []);
// Big Fish is winner-take-all, so its leader is in the money whatever the
// division standings say.
// Three paid anglers ahead of them, so the pot is the ONLY thing putting this
// one in the money - otherwise the division placing is what gets reported and
// the Big Fish path is never exercised.
const potMoneyRoster = [
  { id: 'q1', name: 'Paid A', division: 'solo' },
  { id: 'q2', name: 'Paid B', division: 'solo' },
  { id: 'q3', name: 'Paid C', division: 'solo' },
  { id: 'bf', name: 'Pot Leader', division: 'solo', bigfish: true, pending: true }];
const potMoneyCatches = [
  { id: 'pc1', anglerId: 'q1', division: 'solo', status: 'approved', species: 'Walleye', length: 32 },
  { id: 'pc2', anglerId: 'q2', division: 'solo', status: 'approved', species: 'Walleye', length: 31 },
  { id: 'pc3', anglerId: 'q3', division: 'solo', status: 'approved', species: 'Walleye', length: 30 },
  { id: 'pc4', anglerId: 'bf', division: 'solo', status: 'approved', species: 'Walleye', length: 22 }
];
const potFlag = t.unpaidInTheMoney(potMoneyRoster, potMoneyCatches);
check('an unpaid Big Fish leader is flagged', potFlag.map(x => x.angler.name), ['Pot Leader']);
check('and told why', potFlag[0].why, 'leading the Big Fish pot');
// Named once, however many ways they are in the money.
const doubleUp = t.unpaidInTheMoney(
  [{ id: 'x1', name: 'Both', division: 'solo', bigfish: true, pending: true }],
  [{ id: 'xc', anglerId: 'x1', division: 'solo', status: 'approved', species: 'Walleye', length: 25 }]);
check('someone in the money twice is listed once', doubleUp.length, 1);

// A disqualified angler cannot be in the money, so their unpaid fee is not a
// payout problem - it is already handled.
check('a disqualified unpaid angler is not in the money',
  t.unpaidInTheMoney(
    [{ id: 'dq1', name: 'Out', division: 'solo', pending: true, disqualified: true }],
    [{ id: 'dqc', anglerId: 'dq1', division: 'solo', status: 'approved', species: 'Walleye', length: 30 }]), []);

// ---- what the FIELD is allowed to see ----
// The roster is public: every angler reads it. It used to print "unconfirmed"
// next to a handle, which published one person's payment status to everybody
// for no good reason. With the scoring gate gone there is not even a bad reason
// left, and money is between the angler and the director.
seed([
  { id:'pr1', name:'Owes Money', handle:'Owes Handle', division:'solo', role:'solo',
    tournamentId:'MKWO-001', anglerCode:'7K4M', pending:true },
  { id:'pr2', name:'Paid Up', handle:'Paid Handle', division:'solo', role:'solo',
    tournamentId:'MKWO-002', anglerCode:'9QRT' }
], [], [], {});
await t.renderRoster();
const rosterHtml = t.appDocument.getElementById('reg-roster').innerHTML;
check('the public roster lists both anglers',
  rosterHtml.indexOf('Owes Handle') > -1 && rosterHtml.indexOf('Paid Handle') > -1, true);
check('and says nothing about who has paid',
  /unpaid|unconfirmed|not matched|fee/i.test(rosterHtml), false);
// Same rule as everywhere else public: handles out, real names never.
check('nor does it leak a real name', /Owes Money|Paid Up/.test(rosterHtml), false);

// ---- disqualification ----
// The other gate on the same line, and until a sabotage run went looking for it
// there was no test on this at all: removing the disqualified check left every
// board unchanged and every test green. Taking someone's placing away is one of
// the few director actions that cannot be quietly undone, so it is checked.
const dqAnglers = [
  { id: 'clean', name: 'Clean', handle: 'Clean Handle', division: 'solo' },
  { id: 'dqd', name: 'Cheat', handle: 'Cheat Handle', division: 'solo', disqualified: true }
];
const dqCatches = [
  { id: 'dc1', anglerId: 'clean', division: 'solo', status: 'approved', species: 'Walleye', length: 20 },
  { id: 'dc2', anglerId: 'dqd', division: 'solo', status: 'approved', species: 'Walleye', length: 29 }
];
const dqBoard = t.standingsFor('solo', dqCatches, dqAnglers);
check('a disqualified angler does not rank', dqBoard.map(r => r.name), ['Clean Handle']);
check('even holding the longest fish in the division',
  Math.max.apply(null, dqCatches.map(c => c.length)), 29);
check('and their fish is not somebody else\'s best either',
  dqBoard.every(r => r.best !== 29), true);
// Their entry fee stays in the pool - forfeiting a placing is not a refund.
check('but they are still a confirmed entry', t.poolCounts(dqAnglers).solo, 2);

// ---- the Big Fish pot ----
// $10 a head, winner take all. Opting in is what puts an angler in the pot, and
// disqualification is what takes them out - an unmatched fee does neither. It
// used to: this section asserted the pot "takes confirmed buy-ins only", which
// meant a missed tick quietly removed somebody from a pot they had entered.
// unpaidInTheMoney() is what covers the real risk now, by naming an unpaid
// angler who is actually leading it.
const potRoster = [
  { id: 'p1', bigfish: true },
  { id: 'p2', bigfish: true, pending: true },
  { id: 'p3', bigfish: true, disqualified: true },
  { id: 'p4', bigfish: false },
  { id: 'p5', bigfish: true }                       // legacy, no flag
];
check('the pot takes everyone who opted in',
  t.bigFishEntrants(potRoster).map(a => a.id), ['p1', 'p2', 'p5']);
check('an unmatched fee does not remove a buy-in',
  t.bigFishEntrants(potRoster).some(a => a.id === 'p2'), true);
check('but a disqualified one is out',
  t.bigFishEntrants(potRoster).some(a => a.id === 'p3'), false);
check('someone who never opted in stays out',
  t.bigFishEntrants(potRoster).some(a => a.id === 'p4'), false);
check('and a legacy entry is in', t.bigFishEntrants(potRoster).some(a => a.id === 'p5'), true);
check('an empty roster is an empty pot', t.bigFishEntrants([]), []);
// The pot's MONEY is still only what arrived, which is the distinction the
// whole change rests on: on the board, not in the bank.
// p1, p3 and p5 all paid. p3 is disqualified, and a forfeited place is not a
// refund - their $10 stays in the pot. Only p2's unmatched fee is missing.
check('but the pot money counts only matched buy-ins',
  t.poolCounts(potRoster).bigfish, 3);

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
check('an angler with no fee matched is told so', /not matched up/i.test(notice), true);
check('and told it is about the fee, not a mistake they made', /fee/i.test(notice), true);
// The old notice told them they were OUT of the standings until ticked off.
// That is no longer true, and telling an angler their fish do not count when
// they do is the worst possible version of this message.
check('and told plainly that their catches score', /catches score normally/i.test(notice), true);
check('and that a paid-up angler need do nothing', /nothing to do/i.test(notice), true);
check('and it never claims they are out of the standings',
  /not appear|do not score|will not appear/i.test(notice), false);
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
section('49. who is still on the water');
{
// The app always knew who checked in and never checked out. It never said so,
// and finding out meant scrolling a roster reading two-line summaries. At 1500
// on a cold reservoir the question is not "what is each angler's status" but
// "who is unaccounted for".

// Build a real Date at a given local time on an event day, so the timezone
// conversion inside eventTimeParts is exercised rather than bypassed.
const DAY1 = t.EVENTS[0].dates[0];
function atEventTime(dateKey, hhmm) {
  // Denver is UTC-6 in September. Constructing in UTC and letting the formatter
  // convert back is what proves the two agree.
  const [Y, M, D] = dateKey.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(Y, M - 1, D, h + 6, m, 0));
}
check('the harness and the app agree on the clock',
  t.eventTimeParts(atEventTime(DAY1, '15:30')).dateKey, DAY1);
check('and on the time of day',
  t.eventTimeParts(atEventTime(DAY1, '15:30')).seconds, 15 * 3600 + 30 * 60);
check('the deadline is 1500', t.FINAL_CHECKIN_SECONDS, 15 * 3600);

const IN_ONLY  = { day1: { in: 1, out: null }, day2: { in: null, out: null } };
const IN_OUT   = { day1: { in: 1, out: 2 },    day2: { in: null, out: null } };
const NEVER_IN = { day1: { in: null, out: null }, day2: { in: null, out: null } };
const roster = [
  { id: 'still-out', name: 'Ann Miller',  checkins: IN_ONLY },
  { id: 'came-back', name: 'Bob Reyes',   checkins: IN_OUT },
  { id: 'no-launch', name: 'Cal Fisher',  checkins: NEVER_IN },
  { id: 'no-record', name: 'Dee Winter' }                       // no checkins at all
];

// Before the deadline, an angler who is still out is simply still fishing.
check('nothing is overdue at 1400',
  t.overdueCheckouts(roster, atEventTime(DAY1, '14:00')).length, 0);
check('nothing is overdue one minute before the deadline',
  t.overdueCheckouts(roster, atEventTime(DAY1, '14:59')).length, 0);

const late = t.overdueCheckouts(roster, atEventTime(DAY1, '15:30'));
check('after it, the one who never checked out is listed',
  late.map(x => x.angler.id), ['still-out']);
check('someone who checked out is not', late.some(x => x.angler.id === 'came-back'), false);
// Never checked in means never launched. Listing them would send the director
// looking for somebody who is at home.
check('someone who never launched is not', late.some(x => x.angler.id === 'no-launch'), false);
check('and a record with no check-ins at all does not throw',
  late.some(x => x.angler.id === 'no-record'), false);
check('how overdue is measured from the deadline', late[0].overdueSeconds, 30 * 60);

// Off an event day this must stay silent, or every practice run ends in an alert.
// Deliberately 16:00 local, PAST the deadline, so the event-day guard is the
// only thing that can refuse it. At 14:00 the deadline guard would have caught
// it and this would pass without testing anything.
check('a day that is not an event day reports nothing',
  t.overdueCheckouts(roster, new Date(Date.UTC(2027, 0, 5, 23, 0, 0))).length, 0);
check('and that time really is past the deadline',
  t.eventTimeParts(new Date(Date.UTC(2027, 0, 5, 23, 0, 0))).seconds > t.FINAL_CHECKIN_SECONDS, true);

// Day 2 is tracked separately - day 1 being complete says nothing about today.
const day2Roster = [{ id: 'd2', name: 'Eve Frost',
  checkins: { day1: { in: 1, out: 2 }, day2: { in: 5, out: null } } }];
const DAY2 = t.EVENTS[0].dates[1];
const onDay2 = t.overdueCheckouts(day2Roster, atEventTime(DAY2, '15:30'));
check('day 1 being complete does not clear day 2', onDay2.map(x => x.angler.id), ['d2']);
check('and day 2 is read on day 2', (onDay2[0] || {}).dayKey, 'day2');
check('while on day 1 that angler was accounted for',
  t.overdueCheckouts(day2Roster, atEventTime(DAY1, '15:30')).length, 0);

// ---- order ----
// They all missed the same deadline, so the tiebreak that matters is who was
// last SEEN. A stale fix is worse news than a fresh one.
const three = [
  { angler: { id: 'a', name: 'Fresh' } },
  { angler: { id: 'b', name: 'Stale' } },
  { angler: { id: 'c', name: 'Never' } }
];
const tNow = Date.now();
const sigs = [
  { id: 'a', at: tNow - 2 * 60 * 1000 },
  { id: 'b', at: tNow - 90 * 60 * 1000 }
];
check('the oldest position comes first, and no position at all comes before that',
  t.sortOverdue(three, sigs).map(x => x.angler.id), ['c', 'b', 'a']);
check('with no signals at all it falls back to alphabetical',
  t.sortOverdue(three, []).map(x => x.angler.name), ['Fresh', 'Never', 'Stale']);
check('an empty list sorts to an empty list', t.sortOverdue([], sigs), []);
}

// ============================================================
section('50. the Montana FWP contest report');
{
// A form that goes to the state, due within 30 days of the last day fished.
// The rule the whole feature follows is that it never guesses a number - so
// most of what is checked here is that it declines to, and says which records
// it had to leave out.

const RDAY1 = t.EVENTS[0].dates[0];
const RDAY2 = t.EVENTS[0].dates[1];
function atDay(dateKey, hhmm) {
  const [Y, M, D] = dateKey.split('-').map(Number);
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(Y, M - 1, D, h + 6, m, 0)).getTime();   // Denver, September
}

// ---- residency ----
// The one number on the form nothing in the app could ever work out on its own,
// so it is asked at registration. Anyone who entered before that question
// existed has to read as unknown rather than as a non-resident.
const resRoster = [
  { id: 'r1', name: 'Ann', resident: true },
  { id: 'r2', name: 'Bo', resident: false },
  { id: 'r3', name: 'Cy' },                                   // registered before the question
  { id: 'r4', name: 'Di', resident: true, pending: true }     // never paid
];
const res = t.residencyCounts(resRoster);
check('Montana residents are counted', res.resident, 2);
check('non-residents are counted', res.nonresident, 1);
check('an unanswered entry is neither', res.unknown, 1);
check('and it is named so it can be fixed', res.unknownAnglers.map(a => a.name), ['Cy']);
// The state is counting people who fished. Whether the director has ticked a
// PayPal payment off against an entry says nothing about whether somebody
// launched, so everyone on the roster is counted.
check('an entry with no fee matched is still counted',
  res.resident + res.nonresident + res.unknown, 4);

// A missing field and an explicit false are different answers. Reading one as
// the other is the exact mistake that would put a wrong number on the form.
check('undefined is not false',
  t.residencyCounts([{ id: 'x' }]).nonresident, 0);
check('false is not undefined',
  t.residencyCounts([{ id: 'x', resident: false }]).unknown, 0);

// An unanswered question has to come back as null, not as a guess. The form
// refuses to submit on this, which is the only thing standing between a
// distracted angler and a wrong number on a state form. The stub DOM has
// nothing selected, which is exactly the case that matters.
check('nothing picked is null, never a default',
  t.pickedResidency('#reg-resident'), null);
check('and the same for the partner', t.pickedResidency('#reg-partner-resident'), null);

// The form refusing to submit is the front door, and it lives inside a click
// handler this harness cannot reach - see test/README.md. So the thing worth
// pinning down is what happens if that door is ever left open: a null must
// read as UNANSWERED and raise a warning, never as a quiet Montana resident.
check('a null residency is unknown, not a resident',
  t.residencyCounts([{ id: 'n', resident: null }]).unknown, 1);
check('and it is counted as neither', 
  t.residencyCounts([{ id: 'n', resident: null }]).resident +
  t.residencyCounts([{ id: 'n', resident: null }]).nonresident, 0);
check('so the report says so out loud',
  t.reportWarnings([{ id: 'n', resident: null }], [], []).some(w => w.indexOf('residency') > -1), true);

// ---- the head of the form ----
const headRoster = [
  { id: 'h1', name: 'Solo One', division: 'solo', role: 'solo' },
  { id: 'h2', name: 'Cap', division: 'team', role: 'captain', teamId: 'T1' },
  { id: 'h3', name: 'Mate', division: 'team', role: 'partner', teamId: 'T1' },
  { id: 'h4', name: 'Unpaid', division: 'solo', role: 'solo', pending: true }
];
const headCounts = t.reportFieldCounts(headRoster);
check('anglers are people, so both halves of a team count', headCounts.anglers, 4);
check('teams are entries, so a team of two counts once', headCounts.teams, 1);
// The one box on the form that is actually about money.
check('paid counts only the entries with a fee matched', headCounts.paid, 3);
check('and the shortfall is reported rather than hidden', headCounts.unpaid, 1);

// ---- which catches are reportable ----
// A rejected catch is usually the same fish photographed twice. Counting those
// would tell the state more fish came out of the water than actually did.
const mixed = [
  { id: 'm1', status: 'approved', species: 'Walleye', length: 20, timestamp: atDay(RDAY1, '09:00') },
  { id: 'm2', status: 'pending', species: 'Walleye', length: 18, timestamp: atDay(RDAY1, '11:00') },
  { id: 'm3', status: 'rejected', species: 'Walleye', length: 20, timestamp: atDay(RDAY1, '09:05') }
];
check('a rejected catch is left out', t.reportableCatches(mixed).map(c => c.id), ['m1', 'm2']);
check('a pending one is counted', t.reportableCatches(mixed).length, 2);

// ---- fish per day ----
const perDay = t.catchesPerDay(mixed, [RDAY1, RDAY2]);
check('fish land on the day they were caught', perDay.counts[RDAY1], 2);
check('a day with nothing on it still gets a row', perDay.counts[RDAY2], 0);
check('and nothing fell outside the event', perDay.offDays, 0);

// Read in the EVENT's time zone, not the reader's. 9pm in Montana is still
// today, and a phone in another zone must not move the fish to tomorrow.
const lateFish = [{ id: 'late', status: 'approved', species: 'Walleye', length: 19,
                    timestamp: atDay(RDAY1, '21:30') }];
check('a 9pm catch belongs to the day it was landed',
  t.catchesPerDay(lateFish, [RDAY1, RDAY2]).counts[RDAY1], 1);
check('and catchDayKey agrees', t.catchDayKey(lateFish[0]), RDAY1);

// A test entry logged in July is real data in the species totals but belongs
// on no day row. Reported, not quietly dropped.
const strayFish = [{ id: 'stray', status: 'approved', species: 'Walleye', length: 19,
                     timestamp: Date.UTC(2027, 6, 4, 18, 0) }];
check('a catch outside the event dates is counted apart',
  t.catchesPerDay(strayFish, [RDAY1, RDAY2]).offDays, 1);
check('and it is on no day row',
  t.catchesPerDay(strayFish, [RDAY1, RDAY2]).counts[RDAY1], 0);

// ---- hours fished ----
// First line in the water to last boat off it, which is what check-in and
// check-out already record.
const hoursRoster = [
  { id: 'w1', name: 'Early', checkins: { day1: { in: atDay(RDAY1, '06:15'), out: atDay(RDAY1, '14:00') } } },
  { id: 'w2', name: 'Late',  checkins: { day1: { in: atDay(RDAY1, '07:00'), out: atDay(RDAY1, '14:45') } } }
];
const hrs = t.contestDayHours(hoursRoster, [RDAY1, RDAY2]);
const day = (i) => hrs[i] || {};
check('the day starts at the first check-in', t.reportClockText(day(0).start), '06:15');
check('and ends at the last check-out', t.reportClockText(day(0).stop), '14:45');
check('the span is the two of them', Number((day(0).hours || 0).toFixed(2)), 8.5);
// An angler whose fee has not been matched was still on the water, and the form
// asks for the hours the field fished. They used to be left out of this, which
// meant a missed tick shortened the contest hours filed with the state.
check('an entry with no fee matched still counts toward the hours',
  t.reportClockText(t.contestDayHours(
    hoursRoster.concat([{ id: 'w3', name: 'Owes', pending: true,
      checkins: { day1: { in: atDay(RDAY1, '05:30'), out: atDay(RDAY1, '15:15') } } }]),
    [RDAY1])[0].start), '05:30');
check('a day nobody fished has no hours', day(1).hours, null);
check('and no start to show either', day(1).start, null);

// Half a day recorded is not a day. A total built from one end of it would be
// worse than no total.
const halfDay = [{ id: 'p1', checkins: { day1: { in: atDay(RDAY1, '06:00'), out: null } } }];
check('checked in and never out gives no total',
  t.contestDayHours(halfDay, [RDAY1]).hours, undefined);
check('really - no total', (t.contestDayHours(halfDay, [RDAY1])[0] || {}).hours, null);

// ---- clock parsing and overrides ----
check('a time reads as minutes', t.clockToMinutes('07:15'), 7 * 60 + 15);
check('midnight is zero, not falsy-broken', t.clockToMinutes('00:00'), 0);
check('an hour past 23 is not a time', t.clockToMinutes('24:00'), null);
check('nor is a minute past 59', t.clockToMinutes('07:60'), null);
check('nor is an empty box', t.clockToMinutes(''), null);
check('nor is nonsense', t.clockToMinutes('morning'), null);

const derivedDay = t.contestDayHours(hoursRoster, [RDAY1])[0];
const plain = t.reportDayRow(derivedDay, {});
check('with nothing typed the check-ins stand', [plain.start, plain.stop], ['06:15', '14:45']);
check('and it is not marked as overridden', plain.overridden, false);

// The permit's hours win over what the field actually did, and the total has to
// follow the override rather than the times it replaced.
const overridden = t.reportDayRow(derivedDay, { hours: { day1: { start: '07:00', stop: '15:00' } } });
check('a typed start replaces the check-in', overridden.start, '07:00');
check('a typed stop replaces the check-out', overridden.stop, '15:00');
check('the total is rebuilt from the typed pair, not carried over', overridden.hours, 8);
check('and the row says it was overridden', overridden.overridden, true);

const halfOverride = t.reportDayRow(derivedDay, { hours: { day1: { stop: '16:00' } } });
check('overriding one end keeps the other', halfOverride.start, '06:15');
check('and still totals correctly', Number(halfOverride.hours.toFixed(2)), 9.75);

// ---- species ----
const speciesCatches = [
  { id: 's1', status: 'approved', species: 'Walleye', length: 22, timestamp: atDay(RDAY1, '08:00') },
  { id: 's2', status: 'approved', species: 'Walleye', length: 19, timestamp: atDay(RDAY1, '09:00') },
  { id: 's3', status: 'approved', species: 'Yellow Perch', length: 10, timestamp: atDay(RDAY1, '10:00') },
  { id: 's4', status: 'rejected', species: 'Walleye', length: 30, timestamp: atDay(RDAY1, '11:00') }
];
const tally = t.speciesTally(speciesCatches, {});
check('one row per species, most caught first', tally.map(r => r.species), ['Walleye', 'Yellow Perch']);
const walleyeRow = (rows) => rows.find(r => r.species === 'Walleye') || {};
check('rejected fish are not in the count', walleyeRow(tally).caught, 2);
check('and with nothing dead, everything was released', walleyeRow(tally).released, 2);
check('the longest of each species is carried', walleyeRow(tally).longest, 22);

const withDeaths = t.speciesTally(speciesCatches, { Walleye: 1 });
check('a death comes off the released count', walleyeRow(withDeaths).released, 1);
check('and is reported as a death', walleyeRow(withDeaths).died, 1);

// More deaths than fish is a typo, and it would print a negative number on a
// form going to the state.
const overDeaths = t.speciesTally(speciesCatches, { Walleye: 99 });
check('deaths cannot exceed the catch', walleyeRow(overDeaths).died, 2);
check('so released can never go negative', walleyeRow(overDeaths).released, 0);
check('and a negative death count is floored at zero',
  walleyeRow(t.speciesTally(speciesCatches, { Walleye: -5 })).died, 0);

// ---- size distribution ----
// The form's two tables overlap: 8-23 and 12-30+. Filling both from the same
// fish would report it twice, so each species goes in whichever ONE table has
// columns for its whole range.
const sized = [
  { id: 'z1', status: 'approved', species: 'Walleye', length: 12.9 },
  { id: 'z2', status: 'approved', species: 'Walleye', length: 25 },
  { id: 'z3', status: 'approved', species: 'Yellow Perch', length: 9.5 },
  { id: 'z4', status: 'approved', species: 'Yellow Perch', length: 11 }
];
// Looked up by species rather than by position, and never indexed blindly: a
// sabotage that empties a table has to turn this section red, not kill the run
// on `undefined.counts` and hide every test after it.
const EMPTY_ROW = { counts: {}, split: null };
const row = (rows, name) => rows.find(r => r.species === name) || EMPTY_ROW;
const fishIn = (r) => Object.values(r.counts).reduce((a, b) => a + b, 0);

const dist = t.sizeDistribution(sized);
check('a species that fits 8-23 goes in the small table',
  dist.small.map(r => r.species), ['Yellow Perch']);
check('a species reaching past 23 goes in the large one',
  dist.large.map(r => r.species), ['Walleye']);
check('lengths land in the whole-inch column below them',
  row(dist.small, 'Yellow Perch').counts[9], 1);
check('so 12.9 inches is a 12, not a 13', row(dist.large, 'Walleye').counts[12], 1);
check('and 11 inches is its own column', row(dist.small, 'Yellow Perch').counts[11], 1);
check('nothing was double counted',
  fishIn(row(dist.small, 'Yellow Perch')) + fishIn(row(dist.large, 'Walleye')), 4);
check('neither row was marked as split',
  [row(dist.small, 'Yellow Perch').split, row(dist.large, 'Walleye').split], [false, false]);

// The last column on the large table is "30+", so a fish longer than the table
// has to fold into it rather than fall off the end.
const monster = t.sizeDistribution([
  { id: 'big', status: 'approved', species: 'Walleye', length: 34 },
  { id: 'big2', status: 'approved', species: 'Walleye', length: 30 }
]);
check('a 34-inch fish folds into the 30+ column',
  row(monster.large, 'Walleye').counts[t.SIZE_LARGE_MAX], 2);
check('and there is no column past it',
  Object.keys(row(monster.large, 'Walleye').counts).map(Number).filter(c => c > t.SIZE_LARGE_MAX), []);

// One species holding both an 8-incher and a 24-incher fits neither table.
// Splitting it is the only way to report every fish exactly once.
const spanning = t.sizeDistribution([
  { id: 'sp1', status: 'approved', species: 'Walleye', length: 9 },
  { id: 'sp2', status: 'approved', species: 'Walleye', length: 26 }
]);
check('a species spanning both tables appears in both',
  [spanning.small.length, spanning.large.length], [1, 1]);
check('the short fish is in the small table', row(spanning.small, 'Walleye').counts[9], 1);
check('the long one is in the large table', row(spanning.large, 'Walleye').counts[26], 1);
check('and both rows are flagged as a split',
  [row(spanning.small, 'Walleye').split, row(spanning.large, 'Walleye').split], [true, true]);
check('still exactly two fish between them',
  fishIn(row(spanning.small, 'Walleye')) + fishIn(row(spanning.large, 'Walleye')), 2);

// The form asks for 8 inches and up. Smaller fish are real and stay in the
// totals, but there is no column for them, so they are counted and named.
const tiddlers = t.sizeDistribution([
  { id: 'tt1', status: 'approved', species: 'Yellow Perch', length: 6 },
  { id: 'tt2', status: 'approved', species: 'Yellow Perch', length: 8 }
]);
check('a fish under 8 inches is counted apart', tiddlers.under8, 1);
check('and is on neither table', row(tiddlers.small, 'Yellow Perch').counts[6], undefined);
check('while an 8-inch fish is on one', row(tiddlers.small, 'Yellow Perch').counts[8], 1);
check('a rejected fish is in no size table',
  t.sizeDistribution([{ id: 'r', status: 'rejected', species: 'Walleye', length: 20 }]).large, []);

check('the small table runs 8 to 23',
  [t.sizeColumns(t.SIZE_SMALL_MIN, t.SIZE_SMALL_MAX)[0],
   t.sizeColumns(t.SIZE_SMALL_MIN, t.SIZE_SMALL_MAX).slice(-1)[0]], [8, 23]);
check('and the large one 12 to 30',
  [t.sizeColumns(t.SIZE_LARGE_MIN, t.SIZE_LARGE_MAX)[0],
   t.sizeColumns(t.SIZE_LARGE_MIN, t.SIZE_LARGE_MAX).slice(-1)[0]], [12, 30]);

// ---- the winning fish ----
// Has to be the same fish that took the trophy, or the form and the payout
// disagree in writing.
const winRoster = [
  { id: 'a', name: 'Winner' },
  { id: 'b', name: 'Cheat', disqualified: true }
];
const winCatches = [
  { id: 'w-dq', anglerId: 'b', status: 'approved', species: 'Walleye', length: 31 },
  { id: 'w-pending', anglerId: 'a', status: 'pending', species: 'Walleye', length: 29 },
  { id: 'w-other', anglerId: 'a', status: 'approved', species: 'Northern Pike', length: 40 },
  { id: 'w-real', anglerId: 'a', status: 'approved', species: 'Walleye', length: 24.5 }
];
check('the winning fish is the longest that actually scored',
  (t.winningFish(winCatches, winRoster) || {}).id, 'w-real');
// An unmatched fee used to take the trophy away, silently. Now it does not -
// it is a payout question, and unpaidInTheMoney() is what raises it.
check('an entry with no fee matched can hold the winning fish',
  (t.winningFish(
    [{ id: 'w-owes', anglerId: 'z', status: 'approved', species: 'Walleye', length: 33 }],
    [{ id: 'z', name: 'Owes', pending: true }]) || {}).id, 'w-owes');
check('with no scoring catch at all there is no winner',
  t.winningFish([{ id: 'x', anglerId: 'a', status: 'approved', species: 'Northern Pike', length: 40 }], winRoster), null);

// ---- the deadline ----
const dueEvent = { dates: ['2027-09-18', '2027-09-19'] };
check('thirty days runs from the LAST day fished',
  t.reportDueDate(dueEvent).toISOString().slice(0, 10), '2027-10-19');
check('and thirty is the number', t.FWP_DEADLINE_DAYS, 30);
const dueAt = t.reportDueDate(dueEvent).getTime();
check('a fortnight out it counts down',
  t.reportDueText(dueEvent, dueAt - 14 * 86400000).indexOf('14 days from now') > -1, true);
check('on the day it says so',
  t.reportDueText(dueEvent, dueAt).indexOf('Due today') > -1, true);
check('one day counts as a day, not days',
  t.reportDueText(dueEvent, dueAt - 86400000).indexOf('1 day from now') > -1, true);
check('and past it, it says how late',
  t.reportDueText(dueEvent, dueAt + 3 * 86400000).indexOf('3 days ago') > -1, true);
check('an event with no dates has no deadline', t.reportDueDate({ dates: [] }), null);
check('and says so rather than throwing',
  t.reportDueText({ dates: [] }, Date.now()).indexOf('no dates set') > -1, true);

// ---- warnings ----
// The promise the whole feature rests on: a count that had to leave records out
// says which ones, rather than quietly being wrong.
check('a clean tournament raises nothing',
  t.reportWarnings([{ id: 'q', resident: true }], [], [RDAY1]), []);
const warned = t.reportWarnings(
  [{ id: 'q1', resident: true }, { id: 'q2', pending: true }, { id: 'q3' }],
  [{ id: 'c1', status: 'pending', species: 'Walleye', length: 20, timestamp: atDay(RDAY1, '09:00') },
   { id: 'c2', status: 'approved', species: 'Walleye', length: 20, timestamp: Date.UTC(2027, 6, 4, 18, 0) }],
  [RDAY1, RDAY2]);
check('four things are wrong and four are reported', warned.length, 4);
check('the unmatched fee is one', warned.some(w => w.indexOf('no fee matched') > -1), true);
check('the unanswered residency is another', warned.some(w => w.indexOf('residency') > -1), true);
check('so is a catch still awaiting review', warned.some(w => w.indexOf('awaiting review') > -1), true);
check('and so is one logged outside the dates',
  warned.some(w => w.indexOf('outside the event dates') > -1), true);

// ---- entity stripping ----
// Course and presenter labels are written for markup. A form field is plain
// text, and "Silos &middot; Ponds" in a mailing address is a bug.
check('a middot comes back as a dot', t.stripEntities('Silos &middot; Ponds'), 'Silos · Ponds');
check('an ampersand comes back as one', t.stripEntities('Trailer &amp; Ironworks'), 'Trailer & Ironworks');
check('a line break becomes a space', t.stripEntities('Montana Kayak<br>Walleye Open'), 'Montana Kayak Walleye Open');
check('and nothing is left of an empty label', t.stripEntities(''), '');
check('a null does not throw', t.stripEntities(null), '');

// ---- blanks on the sheet ----
// An unfilled box and a box holding nothing look identical on paper, so the
// sheet names them instead of leaving a gap.
check('an empty value is called out', t.sheetValue('')[1], true);
check('and given words', t.sheetValue('')[0], 'not filled in');
check('whitespace is still empty', t.sheetValue('   ')[1], true);
check('a real value is left alone', t.sheetValue('Helena, MT'), ['Helena, MT', false]);
check('a zero is a real value, not a blank', t.sheetValue(0), ['0', false]);
check('and a caller can name the blank itself',
  t.sheetValue('', 'not recorded')[0], 'not recorded');

// ---- the whole model ----
seed(
  [{ id: 'b1', name: 'One', division: 'solo', role: 'solo', resident: true,
     checkins: { day1: { in: atDay(RDAY1, '06:00'), out: atDay(RDAY1, '14:00') } } },
   { id: 'b2', name: 'Two', division: 'team', role: 'captain', teamId: 'T', resident: false,
     checkins: { day1: { in: atDay(RDAY1, '06:30'), out: atDay(RDAY1, '14:30') } } },
   { id: 'b3', name: 'Three', division: 'team', role: 'partner', teamId: 'T', resident: true,
     checkins: { day1: { in: atDay(RDAY1, '06:30'), out: atDay(RDAY1, '14:30') } } }],
  [{ id: 'bc1', anglerId: 'b1', status: 'approved', species: 'Walleye', length: 21,
     timestamp: atDay(RDAY1, '09:00') }],
  [], {}
);
const anglersNow = await t.loadAnglers();
const catchesNow = await t.loadCatches();
const model = t.buildReportModel(anglersNow, catchesNow, {});
check('the model counts three anglers', model.counts.anglers, 3);
check('and one team', model.counts.teams, 1);
check('boats default to one per angler', model.boats, 3);
check('and the sheet says that is a default', model.boatsDerived, true);
check('a typed boat count wins',
  t.buildReportModel(anglersNow, catchesNow, { boats: 2 }).boats, 2);
check('and is no longer a default',
  t.buildReportModel(anglersNow, catchesNow, { boats: 2 }).boatsDerived, false);
check('zero boats is a real answer, not an empty box',
  t.buildReportModel(anglersNow, catchesNow, { boats: 0 }).boatsDerived, false);
check('the waterbody starts from the course label, with its entities stripped',
  model.waterbody.indexOf('&') === -1 && model.waterbody.length > 0, true);
check('the winning fish is on the model', (model.winner || {}).id, 'bc1');
check('one fish caught', model.caught, 1);
check('none died', model.died, 0);
check('so day one released what it caught', (model.days[0] || {}).released, 1);

// With a death recorded there is nothing that says WHICH day it happened on,
// so the per-day released column is left for the director rather than guessed.
const withDeath = t.buildReportModel(anglersNow, catchesNow, { died: { Walleye: 1 } });
check('a recorded death empties the per-day released column', (withDeath.days[0] || {}).released, null);
check('but the day still knows what it caught', (withDeath.days[0] || {}).caught, 1);
check('and the total released is still right', withDeath.caught - withDeath.died, 0);

// ---- saved settings ----
await t.saveReportSettings({ filerName: 'Daniel Turman', waterTemp: '58' });
check('the report saves per event', t.reportSettings().filerName, 'Daniel Turman');
check('and remembers the rest of it', t.reportSettings().waterTemp, '58');
await setEvent(E2);
check('another event starts with a blank form', t.reportSettings().filerName, undefined);
check('but carries the filer forward', t.lastFiledDetails().filerName, 'Daniel Turman');
check('without carrying the water temperature', t.lastFiledDetails().waterTemp, undefined);
await setEvent(E1);
check('and the first event still holds its own', t.reportSettings().waterTemp, '58');

// ---- defaults reach the sheet, not just the boxes ----
// The boxes used to show a carried-forward filer name and a sponsor taken from
// the presenter line while the SHEET printed "not filled in" for both, because
// nothing is saved until a field loses focus and a director who agreed with a
// default never touched it. One form cannot say two things.
const defaulted = t.reportWithDefaults({});
check('the sponsor falls back to the presenter line',
  defaulted.sponsor, 'Turmanator Trailer & Ironworks');
// The form asks who sponsored the contest, not how they were announced at it.
check('without the banner word on the end',
  t.reportWithDefaults({}).sponsor.indexOf('presents'), -1);
check('with its entities already stripped', defaulted.sponsor.indexOf('&amp;'), -1);
check('and the waterbody to the course label',
  defaulted.waterbody, 'Silos to the Ponds, Canyon Ferry');
check('a saved value beats the default',
  t.reportWithDefaults({ waterbody: 'Hauser Lake' }).waterbody, 'Hauser Lake');
// reportWithDefaults() is also where last year's contact details come in. It
// has to be checked HERE and not only through lastFiledDetails(), or the two
// can be wired apart without a test noticing.
await t.saveReportSettings({ filerName: 'Carried Forward' });
await setEvent(E2);
check('and the filer carries into the next event through the same door',
  t.reportWithDefaults({}).filerName, 'Carried Forward');
check('while a name typed for this event wins',
  t.reportWithDefaults({ filerName: 'This Year' }).filerName, 'This Year');
await setEvent(E1);

const defaultModel = t.buildReportModel(anglersNow, catchesNow, {});
check('and the sheet is built from the same defaults',
  defaultModel.waterbody, defaulted.waterbody);
t.resetReportForm();
await t.renderFwpReport();
const untouched = t.appDocument.getElementById('report-sheet').innerHTML;
check('so an untouched sponsor prints rather than reading as unfilled',
  untouched.indexOf('Turmanator') > -1, true);

// ---- page view ----
// The question it answers is "how many sheets of paper is this", so that is
// what is checked: the arithmetic, the wording, and that the scale never
// flatters the paper by showing the form larger than it prints.
check('the page is US Letter at the CSS inch', [t.PAGE_WIDTH_PX, t.PAGE_HEIGHT_PX], [816, 1056]);

check('nothing over means nothing said', t.spillText([]), '');
check('one page over is counted in sheets, not pixels',
  t.spillText([1]).indexOf('3 sheets rather than 2') > -1, true);
check('and named in the singular', t.spillText([1]).indexOf('Page 1 holds') > -1, true);
check('two pages over come out as four sheets',
  t.spillText([1, 2]).indexOf('4 sheets rather than 2') > -1, true);
check('and read as a list', t.spillText([1, 2]).indexOf('Pages 1 and 2 hold') > -1, true);
check('three read as a list too', t.spillText([1, 2, 3]).indexOf('Pages 1, 2 and 3 hold') > -1, true);
// The footers being wrong is the part that actually embarrasses a filing, so
// it is the part the message has to mention.
check('the warning says the footers end up wrong',
  t.spillText([1]).indexOf('footers end up on the wrong ones') > -1, true);

// The measurement itself needs a laid-out page, which there is no browser here
// to provide - so the pages are handed in directly. scrollHeight is the only
// thing the real code reads off them.
const pv = t.appDocument.getElementById('report-sheet');
// Each fake page keeps its own class list rather than logging calls, so the
// mark coming OFF is as visible as it going on.
const fakePage = (h) => {
  const classes = new Set();
  return {
    scrollHeight: h, classes,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) }
  };
};
const realQuery = pv.querySelectorAll;
const shortPage = fakePage(900), tallPage = fakePage(1200);
pv.querySelectorAll = () => [shortPage, tallPage];

t.setReportPageView(false);
check('with the page view off nothing is measured', t.reportSpillPages(), []);

t.setReportPageView(true);
check('the page view is on', t.reportPageView, true);
check('a page taller than the sheet is the one flagged', t.reportSpillPages(), [2]);
check('and it is marked on the page itself', tallPage.classes.has('overflowing'), true);
check('while the one that fits is left alone', shortPage.classes.has('overflowing'), false);

// The mark has to come off again. Left on, a page trimmed back to fit keeps its
// red end-of-sheet line for the rest of the session and the director stops
// believing any of them.
tallPage.scrollHeight = 900;
check('trimming it back clears the spill', t.reportSpillPages(), []);
check('and takes the mark off the page', tallPage.classes.has('overflowing'), false);
tallPage.scrollHeight = 1200;

// Exactly a sheet is a fit. Off-by-one here would warn on every clean form.
pv.querySelectorAll = () => [fakePage(t.PAGE_HEIGHT_PX)];
check('a page that exactly fills the sheet is not a spill', t.reportSpillPages(), []);
// A scale transform leaves sub-pixel rounding behind, hence the slack.
pv.querySelectorAll = () => [fakePage(t.PAGE_HEIGHT_PX + 2)];
check('and neither is two pixels of rounding', t.reportSpillPages(), []);
pv.querySelectorAll = () => [fakePage(t.PAGE_HEIGHT_PX + 3)];
check('three is', t.reportSpillPages(), [1]);

// Scaling down to a narrow screen is the whole trick; scaling UP would show
// the form bigger than the paper and mislead about what fits.
pv.style.transform = '';
t.appDocument.getElementById('report-frame').clientWidth = 408;   // half a page
t.scaleReportPages();
check('a narrow screen halves the sheet', pv.style.transform, 'scale(0.5)');
t.appDocument.getElementById('report-frame').clientWidth = 2000;  // a big monitor
t.scaleReportPages();
check('a wide one never blows it up past life size', pv.style.transform, 'scale(1)');

t.setReportPageView(false);
check('turning it off drops the transform entirely', pv.style.transform, '');
check('and the frame stops carrying a height',
  t.appDocument.getElementById('report-frame').style.height, '');
pv.querySelectorAll = realQuery;

// ---- the render path ----
// There is no browser here, so this cannot say the sheet LOOKS right. It can
// say it was built without throwing and that the numbers reached the page,
// which is the half that fails silently - a renderer that throws leaves the
// card blank with the error in a console nobody on a boat ramp is reading.
t.resetReportForm();
await t.renderFwpReport();
const sheet = t.appDocument.getElementById('report-sheet').innerHTML;
check('the sheet was built', sheet.length > 0, true);

// The sheet is a rebuild of the state's form, so the WORDING is the thing to
// pin down: a director reads the two side by side, and a box that has been
// paraphrased is a box they have to stop and think about. Every label below is
// copied off the June 2016 form.
[['FISHING CONTEST REPORT', 'the title'],
 ['Please return within', 'the return instruction'],
 ['P.O. Box 200701', 'the Helena address'],
 ['Contest Name', 'the contest name box'],
 ['Contest Date(s) M/D/Y', 'the date box'],
 ['Waterbody:', 'the waterbody box'],
 ['Total # of Anglers:', 'the angler count'],
 ['# of Teams', 'the team count'],
 ['# Paid:', 'the paid count'],
 ['# of Montana Residents:', 'the resident count'],
 ['# of Non-Residents:', 'the non-resident count'],
 ['# of Boats (if applicable):', 'the boat count'],
 ['Size of Winning Fish:', 'the winning fish'],
 ['Form Completed By:', 'the filer'],
 ['Mailing Address:', 'the mailing address'],
 ['Contest Sponsor:', 'the sponsor'],
 ['HOURS FISHED:', 'the hours heading'],
 ['# Fish Released', 'the released column'],
 ['NUMBER OF FISH CAUGHT:', 'the fish heading'],
 ['Minimum Length Required for Contest', 'the minimum length column'],
 ['Number Died', 'the mortality column'],
 ['OTHER INFORMATION: (if required)', 'the other-information heading'],
 ['OPTIONAL INFORMATION:', 'the optional heading'],
 ['Body of Water:', 'the body of water line'],
 ['Semi-turbid', 'the clarity options'],
 ['Degrees F', 'the temperature units'],
 ['SIZE DISTRIBUTION OF FISH CAUGHT:', 'the size heading'],
 ['Please record all fish caught that were 8 inches or longer.', 'the 8-inch instruction'],
 ['Please record all fish caught that were 12 inches or longer.', 'the 12-inch instruction'],
 ['List Species', 'the size table row label'],
 ['Size in Inches', 'the size table column head'],
 ['Page 1 of 2', 'the first page footer'],
 ['Page 2 of 2', 'the second page footer']
].forEach(([text, what]) => {
  check('the form wording is kept for ' + what, sheet.indexOf(text) > -1, true);
});

check('the winning fish is printed to two places', sheet.indexOf('21.00&quot;') > -1, true);
// The words alone are not the behaviour: they have to be inside .rblank, which
// is what the print stylesheet hides so the posted copy has a genuinely empty
// box. Asserting the text on its own passed even with the wrapper stripped.
check('an unfilled box is marked so the printed copy leaves it empty',
  sheet.indexOf('<span class="rblank">' + t.SHEET_BLANK + '</span>') > -1, true);
// The form has four day rows and six species rows whether or not there is
// anything to put in them, so a one-day tournament still prints its shape.
check('the day rows are padded to the four the form has',
  (sheet.match(/<tr>/g) || []).length >= 4, true);
check('and the page breaks between the two sheets', sheet.indexOf('fwp-break') > -1, true);

// ---- the grid actually lines up ----
// Every row of a fixed-layout table has to span the same number of columns. A
// colspan that is one out does not throw and does not look broken in isolation
// - it skews every row below it, which on a form that gets posted to the state
// is a page nobody can read across. Counted here because nothing else can see
// it without a browser.
// `exact` matters: the size tables carry BOTH fwp-table and fwp-size, and a
// loose match would drag them into the square-table check they are exempt from.
function tableRows(html, cls, exact){
  const open = exact ? '<table class="' + cls + '">' : '<table class="[^\"]*' + cls + '[^\"]*">';
  const table = new RegExp(open + '([\\s\\S]*?)</table>', 'g');
  const out = [];
  let m;
  while ((m = table.exec(html)) !== null){
    const rows = m[1].split('<tr>').slice(1).map(r => {
      let width = 0;
      const cells = r.match(/<t[hd][^>]*>/g) || [];
      cells.forEach(c => {
        const span = /colspan="(\d+)"/.exec(c);
        width += span ? Number(span[1]) : 1;
      });
      return width;
    });
    out.push(rows);
  }
  return out;
}
tableRows(sheet, 'fwp-grid').forEach((widths, i) => {
  check('grid table ' + (i + 1) + ' has rows of one width',
    widths.every(w => w === widths[0]), true);
  check('and that width is the form\'s six columns', widths[0], 6);
});
tableRows(sheet, 'fwp-table', true).forEach((widths, i) => {
  check('data table ' + (i + 1) + ' is square', widths.every(w => w === widths[0]), true);
});
// The size tables carry a rowspan on the species cell, so their first header
// row is one narrower by design - it is checked against the inch count instead.
const sizeWidths = tableRows(sheet, 'fwp-size');
const smallCols = t.sizeColumns(t.SIZE_SMALL_MIN, t.SIZE_SMALL_MAX).length;
// Row 0 is the "List Species" cell plus a "Size in Inches" cell spanning the
// rest. If that colspan and the inch headers below it ever disagree, the table
// prints with a column hanging off the end - and the tests said nothing until
// this line compared them.
check('the 8-inch table header spans every one of its columns',
  (sizeWidths[0] || [])[0], smallCols + 1);
check('the 8-inch table has a column per inch from 8 to 23',
  (sizeWidths[0] || [])[1], smallCols);
check('and its body rows carry the species cell too',
  (sizeWidths[0] || [])[2], t.sizeColumns(t.SIZE_SMALL_MIN, t.SIZE_SMALL_MAX).length + 1);
const largeCols = t.sizeColumns(t.SIZE_LARGE_MIN, t.SIZE_LARGE_MAX).length;
check('the 12-inch table header spans every one of its columns',
  (sizeWidths[1] || [])[0], largeCols + 1);
check('the 12-inch table runs to the 30+ column',
  (sizeWidths[1] || [])[1], largeCols);
check('and it is labelled as a catch-all', sheet.indexOf('>30+<') > -1, true);

// The copy button has to produce the same report without a printer. It reads
// the rendered sheet, so a change to one cannot leave the other behind.
const asText = t.reportSheetText(t.buildReportModel(
  await t.loadAnglers(), await t.loadCatches(), t.reportSettings()));
check('the text copy carries the contest name',
  asText.indexOf('Montana Kayak Walleye Open') > -1, true);
check('and no markup came with it', /<[a-z]/i.test(asText), false);
check('nor any raw entities', asText.indexOf('&quot;') === -1 && asText.indexOf('&amp;') === -1, true);
check('and it kept the numbers', asText.indexOf('Total # of Anglers:') > -1, true);
}

// ============================================================
section('51. the timestamp burned into a submission photo');
{
// The photo IS the evidence in a catch-photo-release tournament, and until now
// it carried no time of its own. A JSON field beside it can be edited by
// whoever holds the record, and an EXIF tag is stripped by every messaging app
// a photo passes through on the way to a dispute - so the time goes into the
// pixels.
//
// Which is only worth something if the clock behind it is worth something, and
// a phone's clock is a setting. Most of what is checked here is that the app
// knows the difference between a time it has verified and one it has not.

const NOW = Date.UTC(2027, 8, 18, 15, 30, 0);   // day 1 of the first event, 09:30 Denver

// ---- the server's clock ----
t.serverClockOffset = null;
check('with no server seen, the offset is unknown - not zero', t.clockSkewMs(), null);
check('and "is it trusted" answers unknown too, which is a third answer',
  t.clockIsTrusted(), null);

check('a Date header sets the offset',
  t.noteServerClock(new Date(NOW + 300000).toUTCString(), NOW), true);
check('and it reads as the server being ahead', t.clockSkewMs(), 300000);
check('which is not trusted', t.clockIsTrusted(), false);

check('a clock inside tolerance is trusted',
  t.noteServerClock(new Date(NOW + 30000).toUTCString(), NOW) && t.clockIsTrusted(), true);
check('the tolerance is two minutes', t.CLOCK_SKEW_TOLERANCE_MS, 120000);
// Exactly at the line is a pass. A header with whole-second resolution plus
// time in flight would otherwise warn on a perfectly set phone.
t.noteServerClock(new Date(NOW + t.CLOCK_SKEW_TOLERANCE_MS).toUTCString(), NOW);
check('exactly at the tolerance still counts as trusted', t.clockIsTrusted(), true);
t.noteServerClock(new Date(NOW + t.CLOCK_SKEW_TOLERANCE_MS + 1000).toUTCString(), NOW);
check('a second past it does not', t.clockIsTrusted(), false);

// A header the app cannot read must leave the previous answer alone rather than
// silently resetting the offset to zero, which would read as a perfect clock.
const before = t.clockSkewMs();
check('an unparseable header teaches it nothing', t.noteServerClock('not a date', NOW), false);
check('and leaves what it already knew', t.clockSkewMs(), before);
check('so does a missing one', t.noteServerClock('', NOW), false);
check('and a null one', t.noteServerClock(null, NOW), false);

// This took down every Supabase call the first time it was written: a response
// without readable headers threw, inside the one function every read and write
// goes through. A clock reading may never cost a registration.
check('a response with no headers does not throw', t.noteResponseClock({}), false);
check('nor does a headers object with no get', t.noteResponseClock({ headers: {} }), false);
check('nor does nothing at all', t.noteResponseClock(null), false);
check('nor does a header that throws when read',
  t.noteResponseClock({ headers: { get(){ throw new Error('nope'); } } }), false);
check('a real one still works',
  t.noteResponseClock({ headers: { get: () => new Date(NOW).toUTCString() } }), true);

// ---- how skew reads ----
check('behind the server reads as behind', t.skewText(2400000).indexOf('behind') > -1, true);
check('ahead of it reads as ahead', t.skewText(-2400000).indexOf('ahead') > -1, true);
check('and it is said in whole minutes', t.skewText(2400000), '40 min behind');
// The Date header has whole-second resolution, so claiming seconds of skew
// would imply a precision it does not have.
check('under a minute is said as that, not as 0 min', t.skewText(20000), 'under a minute');
check('nothing known says nothing', t.skewText(null), '');

// ---- the lines that get drawn ----
t.serverClockOffset = 0;
const camLines = t.photoStampLines(t.PHOTO_SOURCE_CAMERA, NOW, 0);
check('the stamp leads with the event, the day and the time',
  camLines[0].indexOf('MKWO') === 0 && camLines[0].indexOf('Day 1') > -1, true);
check('the time carries a zone, so it cannot be misread',
  /M[DS]T|UTC/.test(camLines[0]), true);
check('the hour is the event zone, not the reader',
  camLines[0].indexOf('09:30') > -1, true);
// Across midnight, so the DATE differs between the event zone and UTC: 23:00
// on the 18th in Denver is already the 19th in UTC.
const midnightish = t.stampClockText(Date.UTC(2027, 8, 19, 5, 0));   // 23:00 Denver, 18th
check('a stamp near midnight keeps the event day, not the calendar\'s',
  midnightish.indexOf('09/18/2027') > -1 && midnightish.indexOf('23:00') > -1, true);
check('and does not roll over to the UTC date',
  midnightish.indexOf('09/19') , -1);

// The check above cannot tell "event zone" from "reader zone" on a machine set
// to Mountain time - and the machine this was written on is. Dropping the
// timeZone option entirely still passed here, and only failed under TZ=UTC.
// So: an event in a zone nowhere near either, which no machine's own setting
// can make right by accident.
await t.saveEventRecord('stamp-tz', {
  name: 'Zone Check', prefix: 'ZC', dates: ['2027-09-18', '2027-09-19'],
  timeZone: 'Pacific/Honolulu', targetSpecies: 'Walleye', recordInches: 36
});
await t.setActiveEvent('stamp-tz');
// Honolulu is UTC-10 all year, so there is no DST to argue about: 05:00Z on
// the 18th is 19:00 on the 17th there.
const hawaii = t.stampClockText(Date.UTC(2027, 8, 18, 5, 0));
check('the stamp reads in the EVENT zone, whatever the reader is set to',
  hawaii.indexOf('09/17/2027') > -1 && hawaii.indexOf('19:00') > -1, true);
// And the day number comes off the same clock, or a catch lands on the wrong
// tournament day.
check('and the day number is read on that clock too',
  t.photoStampLines(t.PHOTO_SOURCE_CAMERA, Date.UTC(2027, 8, 18, 5, 0), 0)[0].indexOf('Day'), -1);
check('while an instant that IS on day 1 there gets the day',
  t.photoStampLines(t.PHOTO_SOURCE_CAMERA, Date.UTC(2027, 8, 18, 20, 0), 0)[0].indexOf('Day 1') > -1, true);

// A zone this browser has never heard of must not stop a catch being logged.
await t.saveEventRecord('stamp-tz', { timeZone: 'Mars/Olympus_Mons' });
const fallback = t.stampClockText(Date.UTC(2027, 8, 18, 5, 0));
check('an unknown zone falls back to UTC rather than throwing',
  fallback.indexOf('UTC') > -1, true);
check('and still carries a readable time', fallback.indexOf('2027-09-18 05:00') > -1, true);

await t.deleteEventRecord('stamp-tz');
await t.setActiveEvent(E1);
check('an in-app capture says so', camLines[1], 'In-app camera');
// A trusted clock adds no third line. A stamp that carried "clock OK" on every
// photo would train the eye to skip the line that matters.
check('a clock that checks out adds nothing', camLines.length, 2);

// An uploaded file could have been shot at any time, and the stamp must not
// pretend its time is the time of capture.
const upLines = t.photoStampLines(t.PHOTO_SOURCE_UPLOAD, NOW, 0);
check('an uploaded file is named as one', upLines[1].indexOf('Uploaded file') === 0, true);
check('and its time is called the time of submission',
  upLines[1].indexOf('time of submission') > -1, true);

// The two cases the stamp must never state a bare time for.
check('an unverified clock is printed as unverified',
  t.photoStampLines(t.PHOTO_SOURCE_CAMERA, NOW, null)[2], 'Device clock unverified');
const skewed = t.photoStampLines(t.PHOTO_SOURCE_CAMERA, NOW, 2400000);
check('and a skewed one prints how far out it is',
  skewed[2], 'Device clock 40 min behind vs server');
check('a clock inside tolerance is not called out',
  t.photoStampLines(t.PHOTO_SOURCE_CAMERA, NOW, 60000).length, 2);

// A catch logged outside the event dates has no day number to print, and
// inventing "Day 0" would be worse than leaving it off.
const offDay = t.photoStampLines(t.PHOTO_SOURCE_CAMERA, Date.UTC(2027, 6, 4, 18, 0), 0);
check('a photo taken off the event days carries no day number',
  offDay[0].indexOf('Day') , -1);
check('but still carries the time', offDay[0].indexOf('2027') > -1, true);

// ---- the stamp object ----
t.serverClockOffset = 300000;
const stamp = t.photoStamp(t.PHOTO_SOURCE_CAMERA, NOW);
check('the stamp records when', stamp.at, NOW);
check('and where it came from', stamp.source, t.PHOTO_SOURCE_CAMERA);
// Frozen onto the record, not read back later: the clock offset at the moment
// of the shot is the one that describes the photo.
check('and the clock offset as it stood', stamp.clockOffsetMs, 300000);
check('and it carries the lines that were drawn', stamp.lines.length, 3);

// ---- what the director is told ----
check('a catch from before stamping says so, rather than nothing',
  t.captureBadges({ timestamp: NOW }).map(b => b.text), ['No photo stamp']);

const clean = t.captureBadges({
  timestamp: NOW, capture: { at: NOW, source: t.PHOTO_SOURCE_CAMERA, clockOffsetMs: 0 } });
check('a clean in-app capture is one green badge', clean.map(b => b.text), ['In-app camera']);
check('and it is marked as good', clean[0].tone, 'ok');

const upload = t.captureBadges({
  timestamp: NOW, capture: { at: NOW, source: t.PHOTO_SOURCE_UPLOAD, clockOffsetMs: 0 } });
check('an upload is flagged as weaker evidence', upload[0].text, 'Uploaded file');
check('but only as a caution, never as a rejection', upload[0].tone, 'warn');

const unver = t.captureBadges({
  timestamp: NOW, capture: { at: NOW, source: t.PHOTO_SOURCE_CAMERA, clockOffsetMs: null } });
check('an unverified clock is neutral, not an accusation',
  unver.map(b => b.tone), ['ok', 'plain']);

const bad = t.captureBadges({
  timestamp: NOW, capture: { at: NOW, source: t.PHOTO_SOURCE_CAMERA, clockOffsetMs: 2400000 } });
check('a skewed clock is called out', bad[1].text, 'Clock 40 min behind');
check('and marked as bad', bad[1].tone, 'bad');

// The gap between shooting and filing. Paddling back into signal is normal;
// hours is a different question.
const lagged = t.captureBadges({
  timestamp: NOW + 3 * 3600000,
  capture: { at: NOW, source: t.PHOTO_SOURCE_CAMERA, clockOffsetMs: 0 } });
check('a long gap between capture and filing is surfaced',
  lagged[1].text, 'Filed 3.0 hr after capture');
check('the tolerance is twenty minutes', t.CAPTURE_LAG_TOLERANCE_MS, 20 * 60 * 1000);
check('and a gap inside it is not mentioned',
  t.captureBadges({ timestamp: NOW + 10 * 60000,
    capture: { at: NOW, source: t.PHOTO_SOURCE_CAMERA, clockOffsetMs: 0 } }).length, 1);

// A photo stamped AFTER the record holding it cannot have happened. It means
// the clock moved between the two, which is a sharper tell than a long gap.
const impossible = t.captureBadges({
  timestamp: NOW, capture: { at: NOW + 3600000, source: t.PHOTO_SOURCE_CAMERA, clockOffsetMs: 0 } });
check('a photo stamped after it was filed is called impossible',
  impossible[1].text, 'Stamped after it was filed');
check('and marked as bad', impossible[1].tone, 'bad');

check('minutes read as minutes', t.lagText(45 * 60000), '45 min');
check('and hours as hours once minutes stop helping', t.lagText(3 * 3600000), '3.0 hr');
check('a long haul drops the decimal', t.lagText(14 * 3600000), '14 hr');

// The badges end up in innerHTML, so a species or a source that ever carried a
// quote has to come out escaped.
check('badge text is escaped',
  t.captureBadgeHtml({ timestamp: NOW }).indexOf('<span class="badge"') === 0, true);

// ---- the drawing ----
// There is no canvas here, so this checks the contract rather than the pixels:
// it must draw every line, and it must never throw on a context it cannot use.
const drawn = [];
// measureText scales with the font actually set, so the shrink-to-fit path is
// exercised rather than stepped over. A fake that returned a constant width
// would have let a stamp run clean off the edge of the photo and still pass.
let fakeFont = '';
const fontPx = () => Number((/(\d+(?:\.\d+)?)px/.exec(fakeFont) || [0, 0])[1]);
const fakeCtx = {
  save(){}, restore(){}, fillRect(){},
  measureText: (txt) => ({ width: String(txt).length * fontPx() * 0.6 }),
  fillText(text){ drawn.push(text); },
  set font(v){ fakeFont = v; }, get font(){ return fakeFont; },
  set fillStyle(v){}, get fillStyle(){ return ''; },
  set textBaseline(v){}, get textBaseline(){ return ''; }
};
t.drawPhotoStamp(fakeCtx, 1400, 1050, ['one', 'two', 'three']);
check('every line is drawn', drawn, ['one', 'two', 'three']);
check('and sized off the short edge of the photo', fontPx(), 27);

// A normal stamp line fits every rung of the encode ladder unshrunk - worth
// pinning down, because a shrink that fired on ordinary photos would waste the
// resolution the ladder just paid for.
const normalLine = 'MKWO · Day 1 · 09/18/2027 09:30 MDT';
t.drawPhotoStamp(fakeCtx, 320, 240, [normalLine]);
check('an ordinary line is not shrunk even on the smallest rung', fontPx(), 10);
t.drawPhotoStamp(fakeCtx, 1400, 1050, [normalLine]);
check('nor on a full-size board photo', fontPx(), 27);

// The case that DOES overflow, and it is reachable: the event prefix is typed
// by the director, and a long one pushes the first line past a small frame.
// The first version of this test used a line that fitted, so it asserted
// nothing - dropping the shrink entirely still passed.
const longLine = 'CANYONFERRYWALLEYECLASSIC · Day 1 · 09/18/2027 09:30 MDT';
t.drawPhotoStamp(fakeCtx, 240, 240, [longLine]);
check('a line too wide for the frame is shrunk until it fits',
  fontPx() * longLine.length * 0.6 <= 240, true);
check('and it really did shrink, rather than start small', fontPx() < 10, true);

// A floor, because past a certain size the stamp stops being readable at all
// and a clipped one is then the lesser problem.
t.drawPhotoStamp(fakeCtx, 240, 240, ['x'.repeat(400)]);
check('but never below the point of being legible', fontPx(), 7);
drawn.length = 0;
drawn.length = 0;
t.drawPhotoStamp(null, 1400, 1050, ['x']);
check('a missing context is a no-op, not a throw', drawn, []);
t.drawPhotoStamp(fakeCtx, 1400, 1050, []);
check('and so is having nothing to say', drawn, []);
t.drawPhotoStamp(fakeCtx, 1400, 1050, null);
check('and so is a null line list', drawn, []);

// ---- the stamp actually reaching the photo ----
// The two sabotages that got through the first time: removing the draw call
// altogether, and drawing the stamp BEFORE the image so the photo covers it.
// Both need a canvas to catch, so one is handed in.
{
const calls = [];
const canvasCtx = {
  drawImage(){ calls.push('drawImage'); },
  fillRect(){ calls.push('fillRect'); },
  fillText(txt){ calls.push('fillText:' + txt); },
  measureText: (txt) => ({ width: String(txt).length * 8 }),
  save(){}, restore(){}, font: '', fillStyle: '', textBaseline: ''
};
let rungsOverBudget = 0;
const fakeCanvas = {
  width: 0, height: 0,
  getContext: () => canvasCtx,
  // Over budget while rungsOverBudget lasts, which walks encodeToBudget down
  // its ladder - the whole point being that each rung redraws from scratch.
  toDataURL: () => (rungsOverBudget-- > 0 ? 'x'.repeat(9000000) : 'data:image/jpeg;base64,AAAA')
};
const realCreate = t.appDocument.createElement;
t.appDocument.createElement = (tag) => (tag === 'canvas' ? fakeCanvas : realCreate(tag));

const shot = t.photoStamp(t.PHOTO_SOURCE_CAMERA, NOW);
t.encodeToBudget({}, 1400, 1050, shot);
check('the photo is drawn', calls.indexOf('drawImage') > -1, true);
check('and the stamp is drawn onto it',
  calls.filter(c => c.indexOf('fillText:') === 0).length, shot.lines.length);
// Order matters and nothing else would notice: a stamp drawn first is simply
// painted over by the photo, and the file still saves, still looks fine, and
// carries no time at all.
check('the stamp goes on AFTER the image, not under it',
  calls.indexOf('drawImage') < calls.indexOf('fillText:' + shot.lines[0]), true);

// Each rung of the ladder starts from a blank canvas. A stamp drawn once
// outside the loop survives only if the first rung happens to fit the budget -
// so on a weak signal, exactly when it matters, it would vanish.
calls.length = 0;
rungsOverBudget = 2;
t.encodeToBudget({}, 1400, 1050, shot);
const rungs = calls.filter(c => c === 'drawImage').length;
check('a photo that needs three rungs draws three times', rungs, 3);
check('and is stamped on every one of them',
  calls.filter(c => c.indexOf('fillText:') === 0).length, shot.lines.length * rungs);

// No stamp asked for, none drawn. fitPhoto() re-encodes an already-stamped
// photo and must not stamp it twice.
calls.length = 0;
rungsOverBudget = 0;
t.encodeToBudget({}, 1400, 1050);
check('an unstamped encode draws no text at all',
  calls.filter(c => c.indexOf('fillText:') === 0).length, 0);
check('but still draws the photo', calls.indexOf('drawImage') > -1, true);

t.appDocument.createElement = realCreate;
}

// ---- the notice the angler can act on ----
const note = t.appDocument.getElementById('sub-clock-note');
t.serverClockOffset = null;
t.renderClockNotice();
check('an unverified clock is not nagged about', note.style.display, 'none');
t.serverClockOffset = 60000;
t.renderClockNotice();
check('nor is one inside tolerance', note.style.display, 'none');
t.serverClockOffset = 2400000;
t.renderClockNotice();
check('a skewed one is raised before the shot', note.style.display, 'block');
check('with how far out it is', note.textContent.indexOf('40 min behind') > -1, true);
check('and what to do about it',
  note.textContent.indexOf('automatic date and time') > -1, true);
t.serverClockOffset = null;
}

// ============================================================
console.log('\n' + (fail === 0 ? 'ALL PASS' : fail + ' FAILED') + '  (' + pass + ' passed)');
process.exit(fail === 0 ? 0 : 1);
