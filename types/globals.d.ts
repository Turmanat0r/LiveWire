// The globals LiveWire does not declare itself, because something else puts
// them on the page.
//
// WHY THIS FILE IS SEPARATE
// It holds declarations and no runtime code at all - nothing here is emitted,
// and nothing here can be. That matters because it is the one place both the
// app and (later) the service worker can share a type without either one being
// able to import the other's code by accident.
//
// THESE ARE `any` ON PURPOSE, FOR NOW. Giving them real shapes is worth doing
// and is not this pass's job: the first TypeScript pass changed the toolchain
// without changing the app, and an invented type is worse than an honest `any`
// because it reads as verified when nobody checked it against the real API.
// Each one below says what it actually is, so the next pass has somewhere to
// start.

// Leaflet, loaded from vendor/leaflet-1.9.4/leaflet.js by a plain <script> tag.
// Used on the boundary editor and the position screens, and allowed to be
// missing: every screen that draws a map falls back to a text readout computed
// on the phone, so the code tests for `typeof L` before using it.
// 20 references.
declare const L: any;

// The Supabase client, from vendor/supabase-js-2.115.0.min.js. Holds this
// device's anonymous session - without it every write policy in the database
// refuses the phone. The app re-injects the tag and retries if it is absent,
// so this is read defensively rather than assumed.
// 7 references.
declare const supabase: any;

// The Claude viewer's shared store, present only when the page is opened as a
// published Artifact inside Claude. One of the three backends the app can run
// on; absent in every normal browser, so every use is guarded.
// 8 references.
declare const claude: any;

// Set by src/livewire.ts on its first line and read by src/boot-guard.ts, which
// shows a plain failure screen when the application never arrived. Declared on
// Window rather than as a bare global because both files touch it through
// `window`, and because a bare `declare const` would let either one read it
// without the other having set it.
interface Window {
  __livewireStarted?: boolean;
}

// --- element shapes, so the casts in the app say something true -------------
//
// `document.getElementById` is declared as returning HTMLElement, which is all
// the DOM knows: the id is a string and any element could carry it. So reading
// `.value` off one is a type error even though the app is right that the
// element is a field. The casts are erased at compile time and change nothing
// at runtime - they are how the code states what it already knew.
//
// These are named rather than written inline so that the claim is checkable.
// `as HTMLInputElement` on a <select> would compile and would be a lie; the
// union below is true of all three, which is what the app actually relies on.

/** An element the person types or chooses a value in: input, select or textarea. */
type ValueElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** Anything that can be disabled - the above, plus buttons. */
type DisableableElement = ValueElement | HTMLButtonElement;

// --- shapes the app relies on and never wrote down ---------------------------

/**
 * An Error carrying the HTTP status that caused it. The Supabase layer throws
 * these, and callers read `.status` to tell a refusal from a duplicate from a
 * request that never left the phone. Optional because a plain Error is still an
 * Error - the code checks before it reads.
 */
interface HttpError extends Error {
  status?: number;
  /** Postgres error code, when the server sends one - 23505 is a duplicate entry. */
  code?: string;
}

/**
 * One scene in a highlight reel: the title card, a shot, or the end card. A
 * shot always carries `row`, the gallery tile it was built from; `image` is
 * attached later, once the photo has actually been fetched, and is null for
 * one that would not load. Checking `kind` is enough to know which you have.
 */
type ReelScene =
  | { kind: 'title'; ms: number }
  | { kind: 'end'; ms: number }
  | { kind: 'shot'; ms: number; row: GalleryRow; image?: ReelPhoto | null };

/**
 * A photo ready to draw into the reel, and the blob: address to hand back when
 * it is done with - empty for a photo that was already on this device.
 */
type ReelPhoto = { img: HTMLImageElement; revoke: string };

/** A photo after resizing: the data URL, and the size it came in at. */
interface ResizedImage {
  dataUrl: string;
  srcWidth: number;
  srcHeight: number;
}

/** A field with placeholder text. A <select> has no placeholder, so it is not one. */
type PlaceholderElement = HTMLInputElement | HTMLTextAreaElement;

/**
 * What evaluateBoundary decided about a position.
 *
 * `withinBounds` is null, not false, when no usable boundary is set - "outside
 * the course" and "there is no course" are different answers and the screens
 * say different things about them. The two distances are absent unless the
 * boundary's shape can produce them, which is why they are optional.
 */
interface BoundaryVerdict {
  withinBounds: boolean | null;
  outsideMiles: number;
  distanceMiles?: number;
  edgeMiles?: number;
}

/**
 * A position fix, with whatever the boundary made of it merged in. Resolves to
 * null when the device has no geolocation at all, which is a normal answer and
 * not an error - the catch is still filed, just without a position.
 */
interface GeoFix extends Partial<BoundaryVerdict> {
  lat: number;
  lng: number;
  /**
   * MILES, not the metres the browser reports. currentPosition() divides by
   * METRES_PER_MILE on the way out, because every screen that shows this shows
   * it in miles. The name says so to stop the two being confused - this field
   * was written as `accuracy` when these types were first drafted and the
   * compiler caught it, which is the whole argument for having them.
   */
  accuracyMiles?: number;
}

/**
 * One day of the FWP report: the hours fished, and what was caught and released
 * in them. The director can override the clock times, which is what
 * `overridden` records.
 */
interface ReportDayRow {
  /** 1 for the first contest day. */
  day: number;
  /** 'YYYY-MM-DD'. */
  dateKey: string;
  /** 'day1', 'day2' - the key check-ins and the director's corrections are filed under. */
  dayKey: string;
  /** Clock text, '05:30', as the form shows it. Empty when nobody checked in. */
  start: string;
  stop: string;
  overridden: boolean;
  /**
   * Null when the times do not make a span - a stop before its start, or a
   * clock that did not parse. This was declared as a plain number when the
   * type was first drafted, and turning on strictNullChecks caught it.
   */
  hours: number | null;
  /** Filled in per day once the catches have been counted. */
  caught?: number;
  /** Null on a day something died: see the note at the assignment. */
  released?: number | null;
}

/**
 * A tournament as the event form builds it, before it is saved. The last three
 * are filled in after the literal - the species preset is looked up, and the
 * course is copied from the live event only if the director asked for it - so
 * they are optional here rather than absent.
 */
interface EventRecord {
  name: string;
  nameHtml: string;
  presenter: string;
  prefix: string;
  /** 'YYYY-MM-DD', one per contest day, in order. */
  dates: string[];
  timeZone: string;
  courseLabel: string;
  courseLabelLong: string;
  registrationClose: string;
  targetSpecies?: string;
  recordInches?: number;
  /** Only on a new event: an edit never touches the course. */
  course?: Boundary;
}

/** Whatever setTimeout and setInterval hand back, for clearing later. */
type TimerId = ReturnType<typeof setTimeout>;

/**
 * The id of whatever is selected, open or being edited - or nothing.
 *
 * Both kinds of nothing, on purpose. These are reset to null in code, but they
 * are also read straight off `element.dataset.id`, which is undefined when the
 * attribute is absent. Narrowing that to one or the other would mean changing
 * what the code stores, and every check that reads it is a truthiness test that
 * treats the two the same already.
 */
type MaybeId = string | null | undefined;

/**
 * What has been read from the server so far, one entry per shared collection.
 *
 * Null means "not loaded yet", which is a different answer from an empty list
 * and the code treats it differently: an empty list is a tournament with no
 * catches, null is a phone that has not heard back. `config` is the one shared
 * settings record rather than a list of them.
 */
interface LiveCache {
  anglers: Row[] | null;
  catches: Row[] | null;
  donations: Row[] | null;
  messages: Row[] | null;
  signals: Row[] | null;
  bets: Row[] | null;
  config: RowFields | null;
}

/**
 * The ids each collection held when this device last loaded it. A delete is only
 * ever of something in here, so a catch another angler files between this
 * phone's load and its save is never mistaken for one the user removed. Null
 * until the first load, for the same reason as LiveCache.
 */
interface LoadedIds {
  anglers: Set<string> | null;
  catches: Set<string> | null;
  donations: Set<string> | null;
  messages: Set<string> | null;
  signals: Set<string> | null;
  bets: Set<string> | null;
}

/** A point on the water. */
interface LatLng {
  lat: number;
  lng: number;
}

/**
 * A course boundary, in exactly one of its three shapes.
 *
 * `kind` is what tells them apart, and checking it is enough for TypeScript to
 * know which fields exist: a circle has a centre and a radius, an outline has
 * its corner points, and "none" has neither. Before this was written down the
 * compiler could not see that a circle always has a centre, so every read of
 * one after `clean.kind === 'circle'` was a possible crash as far as it knew.
 */
type Boundary =
  | { kind: 'none' }
  | { kind: 'circle'; center: LatLng; radiusMiles: number }
  | { kind: 'polygon'; points: LatLng[] };

// ============================================================================
// THE DATA LAYER
//
// The shapes everything else in the app is built on: which collections exist,
// what a stored record is, what a write waiting in the outbox looks like, and
// the one interface both backends have to present. None of it was written down
// before, and two backends had to agree on it anyway.
// ============================================================================

/**
 * The six collections every device shares. One record per THING - a catch, an
 * angler, one person joining one side bet - never one record holding a list,
 * because writes are last-writer-wins and a list would lose whichever of two
 * simultaneous additions arrived first.
 */
type SharedCollection = 'anglers' | 'catches' | 'donations' | 'messages' | 'signals' | 'bets';

/** Everything the store moves: the six shared collections, and the one config record. */
type CollectionName = SharedCollection | 'config';

/**
 * The fields of a stored record, apart from the id it is filed under.
 *
 * Loose on purpose, and not a shape waiting to be written. The data layer moves
 * records without ever looking inside them - which fields a catch or an angler
 * carries is the business of the code that reads one, and those get types of
 * their own when that code does. A layer whose whole job is not to care about
 * the contents is described accurately by a type that does not either.
 */
type RowFields = { [field: string]: any };

/** A stored record as the app holds it: its fields, plus the id it is filed under. */
type Row = RowFields & { id: string };

/**
 * A write waiting to reach the server. It sits in the outbox in local storage
 * until it goes, which is what makes losing signal on the water never lose a
 * catch. There are exactly three kinds, and each backend branches on `kind`:
 *
 *   set     write a record, whole
 *   delete  remove one; there is nothing to send but which
 *   photo   a catch photo, stored apart from the catch so that a leaderboard,
 *           the standings and the payouts never move a single image byte
 */
type OutboxOp =
  | { kind: 'set'; coll: CollectionName; id: string; body: RowFields }
  | { kind: 'delete'; coll: CollectionName; id: string }
  | { kind: 'photo'; coll: 'photos'; id: string; body: { data: string } };

/** What a backend calls whenever a collection's rows arrive, first load or later. */
type RowsHandler = (coll: CollectionName, rows: Row[]) => void;

/**
 * What a backend offers the app. There are two - the tournament server
 * (Supabase) and the Claude viewer's shared store - and everything above this
 * layer talks to whichever one is active through these and nothing else.
 *
 * Both factories are declared as returning this, which is the point of writing
 * it down: until then nothing checked that the two agreed, and they had to.
 */
interface Backend {
  /** How the sync indicator names it: "tournament server", "shared store". */
  label: string;
  /** The largest photo, in bytes of data URL, this backend will store. */
  photoBudget: number;
  connect(): Promise<unknown>;
  applyOp(op: OutboxOp): Promise<unknown>;
  start(onRows: RowsHandler): unknown;
  /** An address for the photo, or '' where there is no address to give. */
  photoUrlFor(catchId: string): string;
  getPhoto(catchId: string): Promise<string>;
  deletePhoto(catchId: string): Promise<unknown>;
  /** Only the tournament server can page through a whole table on demand. */
  fetchAll?: (table: string) => Promise<Row[]>;
}

/** What the sync indicator says. "local" is a phone with no server configured at all. */
type SyncState = 'connecting' | 'live' | 'offline' | 'local';

/**
 * This device's sign-in, as the Supabase SDK hands it over - the fields the app
 * actually reads, and no more. First drafted with only `user`, which the
 * compiler rejected four times over.
 */
interface AuthSession {
  /** Sent as the bearer token on every request once this device has signed in. */
  access_token?: string;
  user?: {
    id?: string;
    email?: string;
    /** The SDK's own flag. Older builds omit it, and then no email means anonymous. */
    is_anonymous?: boolean;
    /**
     * WHERE DIRECTOR STATUS LIVES, AND WHY HERE. app_metadata can only be set by
     * the server. user_metadata sits right beside it and would be worthless: a
     * client can write its own, so anyone could simply declare themselves the
     * director. Older rows stored it as the string 'true', so both are read.
     */
    app_metadata?: { director?: boolean | string };
  } | null;
}

// --- the two outside libraries the data layer talks to ----------------------
//
// Neither is described in full. Each interface below is the part of the library
// the app actually calls, found by reading every call - so it is a statement
// about this app rather than a copy of someone else's documentation, and it
// cannot drift out of date on a method the app has never used.

/** What every Supabase auth call hands back: a session on success, an error on failure. */
interface SupabaseAuthResult {
  data?: { session?: AuthSession | null } | null;
  error?: { message?: string } | null;
}

/** The Supabase client, as far as the app uses it: signing in, and no further. */
interface SupabaseClient {
  auth: {
    getSession(): Promise<SupabaseAuthResult>;
    signInAnonymously(): Promise<SupabaseAuthResult>;
    signInWithPassword(credentials: { email: string; password: string }): Promise<SupabaseAuthResult>;
    signOut(): Promise<unknown>;
    /** Fires on a token refresh as well as a sign-in, so the bearer token never goes stale. */
    onAuthStateChange(handler: (event: string, session: AuthSession | null) => void): unknown;
  };
}

/** One document in the Claude viewer's shared store, as read back. */
interface ArtifactDocSnapshot {
  exists: boolean;
  data(): RowFields | undefined;
}

/** A whole collection in the Claude viewer's shared store, as read back. */
interface ArtifactQuerySnapshot {
  docs: { id: string; data(): RowFields }[];
}

/** A handle on one document in the Claude viewer's shared store. */
interface ArtifactDocRef {
  get(): Promise<ArtifactDocSnapshot>;
  set(data: RowFields): Promise<unknown>;
  delete(): Promise<unknown>;
  onSnapshot(handler: (snap: ArtifactDocSnapshot) => void, onError?: (err: HttpError) => void): unknown;
}

/**
 * The Claude viewer's shared store: documents addressed by 'collection/id',
 * and live updates on a document or a whole collection. Present only when the
 * page is opened as a published Artifact inside Claude.
 */
interface ArtifactDb {
  doc(path: string): ArtifactDocRef;
  collection(name: string): {
    onSnapshot(handler: (snap: ArtifactQuerySnapshot) => void, onError?: (err: HttpError) => void): unknown;
  };
}

/**
 * The one kind of outbox write that carries a photo. Named so that code looking
 * for a pending upload can say that is what it found - a plain OutboxOp might
 * be a delete, which has no body at all.
 */
type PhotoOp = Extract<OutboxOp, { kind: 'photo' }>;

// ============================================================================
// ANGLERS AND CATCHES
//
// The two records the whole tournament is made of. Each is built from the
// literal that creates it - registration for an angler, submission for a
// catch - and then from every field the compiler found the app reading or
// writing later: a check-in, a DQ, an approval. Neither is guessed at.
//
// These are `type`, not `interface`, and that is load-bearing. The data layer
// stores Row, which allows any field. An object type written this way can be
// handed to it as one; an interface could not, because TypeScript only lets a
// type with no index signature of its own stand in for one that has one when
// it is a plain object type.
// ============================================================================

/** Only an approved catch counts. Pending is waiting for the director. */
type CatchStatus = 'pending' | 'approved' | 'rejected';

/** A solo entry, or one half of a team - the captain paid, the partner rides along. */
type AnglerRole = 'solo' | 'captain' | 'partner';

type Division = 'solo' | 'team';

/** One contest day: when the angler checked in and out. Null until it happens. */
type CheckinDay = { in: number | null; out: number | null };

/** Every contest day's check-ins, keyed 'day1', 'day2'. */
type Checkins = Record<string, CheckinDay>;

// ---- the first pass: measurements, and the verdict worked out from them -------
//
// These were one type in the first draft, which was wrong twice. What a catch
// STORES (under the field name `precheck`, for history's sake) is the photo's
// measurements - its fingerprints, brightness, sharpness, original size. The
// verdict is worked out from those every time the director's list is drawn and
// is never stored at all. And the verdict's levels are not the checks' levels:
// a verdict is clear, review or flag, while a single check can be anything from
// ok to bad. The compiler found both, one of them by turning up a 'clear' that
// no search for level comparisons had.

/** How one check came out, from nothing to see to plainly wrong. */
type FirstPassLevel = 'ok' | 'info' | 'warn' | 'review' | 'flag' | 'bad';

/** One thing the first pass looked at, and what it made of it. */
type FirstPassCheck = { level: FirstPassLevel; label: string; detail: string };

/** The first pass's overall call: nothing to see, look at this, or this looks wrong. */
type FirstPassOutcome = 'clear' | 'review' | 'flag';

/**
 * The automated first pass on a catch: a photo too small, too blurry, reused
 * from another catch, or taken outside the boundary, flagged for the director
 * to judge. Worked out from the stored PhotoAnalysis each time; never stored.
 */
type FirstPassVerdict = { level: FirstPassOutcome; checks: FirstPassCheck[] };

/**
 * A catch photo's measurements, taken in the browser when it was filed - no
 * network, no model. Stored on the catch as `precheck`.
 */
type PhotoAnalysis = {
  /** The fingerprint of the whole frame. The same as hashes[0], kept for older readers. */
  hash: string;
  /** One fingerprint per crop window, so a cropped reuse of a photo is caught too. */
  hashes: string[];
  brightness: number;
  sharpness: number;
  /** The ORIGINAL photo's size, taken before it was shrunk to store. */
  srcWidth: number;
  srcHeight: number;
  analyzedAt: number;
};

/**
 * When and how a photo was taken, kept beside the stamp burned into its pixels
 * so the director's list can be sorted without opening every photo - never
 * instead of the stamp, which is why the stamp is drawn at all.
 */
type PhotoCapture = { at: number; source: string; clockOffsetMs: number | null };

/** A registered angler. One per person: a team entry is two of these. */
type Angler = {
  id: string;
  name: string;
  phone: string;
  division: Division;
  /** The other half of a team, by name. Empty for a solo entry. */
  partner: string;
  bigfish: boolean;
  tournamentId: string;
  role: AnglerRole;
  /** Shared by both halves of a team. Null for a solo entry. */
  teamId: string | null;
  /**
   * This angler's own code. Two anglers on one team have different ones.
   * Optional because records from before codes existed have none until a
   * backfill gives them one; null because makeCode() gives up and returns null
   * when it cannot find a code nobody else holds.
   */
  anglerCode?: string | null;
  /** The code a team shares. */
  teamCode: string | null;
  emergencyName: string;
  emergencyPhone: string;
  /** Only ever read by the FWP contest report. */
  resident: boolean | null;
  /**
   * PRESENT MEANS UNPAID, ABSENT MEANS PAID - it is deleted, never set false.
   * That keeps every record in the one shape feePaid() expects. It gates money
   * and nothing else. First drafted as a required boolean; the compiler pointed
   * at the `delete` that makes it optional.
   */
  pending?: boolean;
  handle: string;
  registeredAt: number;
  checkins: Checkins;
  /** Set by the director. A disqualified angler's catches stop counting. */
  disqualified?: boolean;
  dqReason?: string;
  /** Null once a DQ is lifted. */
  dqAt?: number | null;
};

/** A fish, filed from the water. */
type Catch = {
  id: string;
  anglerId: string;
  anglerName: string;
  division: Division;
  /** Null unless somebody else's device filed this one - then, who. */
  filedBy: FiledBy | null;
  species: string;
  length: number;
  hasPhoto: boolean;
  photoUrl: string;
  /** The photo's measurements. See PhotoAnalysis - the name is historical. */
  precheck: PhotoAnalysis | null;
  location: GeoFix | null;
  capture: PhotoCapture | null;
  timestamp: number;
  status: CatchStatus;
  /** Fish-I's look at the photo, once the director has asked for one. */
  aiReview?: AiReview;
};

/**
 * Who filed a catch on someone else's behalf - a teammate, or the director at
 * the weigh-in - and when. First drafted as a plain string; filedByFor() has
 * always returned this.
 */
type FiledBy = {
  /** Null when the device filing it has no angler of its own on the roster. */
  anglerId: string | null;
  name: string;
  director: boolean;
  at: number;
};

/**
 * What Fish-I, the vision pass, made of a catch photo.
 *
 * A TRUST, NOT A GUARANTEE. This is the answer an AI model was asked to give,
 * and nothing makes it follow the shape. So every field is optional, and the
 * screen that shows it still checks each one - `r.boardVisible === false`,
 * `typeof r.speciesConfidence === 'number'` - rather than leaning on this.
 * A review that failed carries only `error` and `reviewedAt`.
 */
type AiReview = {
  reviewedAt: number;
  error?: string;
  /** The species Fish-I thinks it is looking at. */
  species?: string;
  /** Does the fish in the photo match the species that was claimed? */
  matchesClaim?: boolean;
  /** 0 to 1. */
  speciesConfidence?: number;
  boardVisible?: boolean;
  noseAtStop?: boolean;
  tailInFrame?: boolean;
  fishFlat?: boolean;
  handBlocking?: boolean;
  concerns?: string[];
  /** Anything else it wanted to say, in a sentence. */
  notes?: string;
};

/** A catch known to have a position. */
type LocatedCatch = Catch & { location: GeoFix };

/**
 * Whether someone may act for an angler - file a catch, check them in - and
 * who that angler is.
 *
 * Four outcomes, not a yes/no with an angler that might be there, because one
 * of the refusals still carries an angler: 'not-yours' is a real angler on the
 * roster that this device is not allowed to act for. Written this way round,
 * checking `ok` is enough for the compiler to know an angler is present -
 * which is what the code filing a catch has always relied on.
 */
type ActionGuardResult =
  | { ok: true; code: 'ok'; angler: Angler; message: string }
  | { ok: false; code: 'no-angler' | 'not-registered'; angler: null; message: string }
  | { ok: false; code: 'not-yours'; angler: Angler; message: string };

// --- the smaller shapes the anglers-and-catches code passes around ------------

/** What gets burned into a photo's pixels, and kept beside them. */
type PhotoStamp = {
  at: number;
  /** Where the photo came from: the in-app camera, or a file off the camera roll. */
  source: string;
  /** Null until this device has heard the server's time; the stamp says so then. */
  clockOffsetMs: number | null;
  /** The text drawn onto the photo, one entry per line. */
  lines: string[];
};

/**
 * Whether the photo stored now is still the one that was submitted. Unchecked
 * when the catch predates fingerprints - nothing recorded, nothing to compare.
 */
type PhotoIntegrity = { checked: boolean; match: boolean; distance: number };

/** How far apart two photos' fingerprints are, and whether the nearest was a crop. */
type HashDistance = { distance: number; cropped: boolean };

/** An angler still on the water after the day's final check-in. */
type OverdueCheckout = { angler: Angler; dayKey: string; overdueSeconds: number };

/** One line of the standings: an angler, or a team as one, with their fish. */
type StandingsGroup = { key: string; name: string; fish: Catch[]; anglerIds: string[] };

/**
 * Something whose pixels can be read, and whose size is known. The canvas API's
 * own CanvasImageSource was the first choice and the wrong one: it includes
 * sources with no width or height, and the photo analysis needs both.
 */
type PixelSource = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

// ============================================================================
// THE DIRECTOR'S TOOLS
// ============================================================================

/**
 * What the director enters on the Montana FWP contest report form, as saved.
 *
 * Every field is optional: the form is filled in over the course of an event,
 * and saved as it goes. The filer's details also carry over from the last
 * report filed, so a director does not type their own address twice.
 *
 * `boats` and `minLength` arrive from a text box and are stored as typed, so
 * they can be a string, a number or blank - the report reads them through
 * Number() and treats blank as "not set".
 */
type ReportSettings = {
  filerName?: string;
  filerAddress?: string;
  filerEmail?: string;
  filerPhone?: string;
  sponsor?: string;
  region?: string;
  waterbody?: string;
  boats?: string | number | null;
  minLength?: string | number | null;
  airTemp?: string;
  waterTemp?: string;
  waterLevel?: string;
  clarity?: string;
  otherInfo?: string;
  comments?: string;
  /** Fish that died, by species. The only mortality the director records. */
  died?: Record<string, number>;
  /** Clock times the director corrected, by contest day. */
  hours?: Record<string, { start?: string; stop?: string }>;
  savedAt?: number;
};

/**
 * A tournament: dates, water, species, boundary. The built-in ones are written
 * into EVENTS; a director can add more, and edit either kind. Built-ins cannot
 * be deleted, only archived.
 */
type TournamentEvent = {
  id: string;
  name: string;
  /** The name with a line break in it, for the home screen's two-line title. */
  nameHtml: string;
  presenter: string;
  /** Leads every tournament id this event hands out - MKWO-001 and so on. */
  prefix: string;
  /** 'YYYY-MM-DD', one per contest day, in order. */
  dates: string[];
  /** An IANA name, 'America/Denver'. Every clock in the event is read in this. */
  timeZone: string;
  courseLabel: string;
  courseLabelLong: string;
  targetSpecies: string;
  recordInches: number;
  course: Boundary;
  /** An ISO instant. Registration closes at the very start of it. */
  registrationClose: string;
  /** Written into EVENTS rather than added by the director. */
  builtIn?: boolean;
  /** Out of the event switcher, with everything it holds kept. */
  archived?: boolean;
};

/**
 * The boundary the director is drawing, before it is saved.
 *
 * NOT a Boundary, on purpose. A saved boundary is exactly one shape; a draft
 * keeps what it has of every shape at once, so switching a circle to an outline
 * and back again does not throw away the centre that was already placed.
 * normalizeBoundary() is what turns one of these into a Boundary.
 */
type BoundaryDraft = {
  /** Set from the mode buttons, which carry 'none', 'circle' or 'polygon'. */
  kind: string;
  /** Null once cleared, rather than removed. */
  center?: LatLng | null;
  radiusMiles?: number;
  points?: LatLng[];
};

/** One species an event scores, and the length past which a catch is implausible. */
type SpeciesEntry = { name: string; recordInches: number };

/**
 * Money given towards the payouts, and which pot it goes into. `target` is a
 * key of DONATION_TARGET_LABEL - the general fund, or one division's pool.
 */
type Donation = {
  id: string;
  target: string;
  amount: number;
  note: string;
  timestamp: number;
};

/**
 * A Leaflet map event, as far as the app reads one: where it happened, and the
 * marker or map it happened to - which is Leaflet's own, and as untyped as
 * Leaflet is. See LeafletObject.
 */
type LeafletEvent = { latlng: LatLng; target: LeafletObject };

/** A boundary that actually draws something: a circle or an outline, never 'none'. */
type UsableBoundary = Exclude<Boundary, { kind: 'none' }>;

/**
 * One row of the director's contestant list: an angler, their catches, and
 * how those stand. `best` is the longest approved LENGTH, in inches - 0 with
 * none - not the catch itself. `rank` is 0 for a disqualified angler.
 */
type ContestantRow = {
  angler: Angler;
  mine: Catch[];
  approved: number;
  pending: number;
  rejected: number;
  best: number;
  rank: number;
};

/**
 * One finishing place in a tournament's result - who, and what they caught -
 * as the result stores it. Slimmer than a live standings row on purpose: a
 * frozen result is permanent, so it keeps only what it has to show. `top3` is
 * the sum of their three longest fish.
 */
type ResultPlace = { key: string; anglerIds: string[]; best: number; top3: number };

/**
 * Something the director still has to do before registration opens, as the
 * setup list shows it. `severity` says whether it blocks opening or only
 * matters; `deadline` is registration close, which the list counts down to.
 */
type SetupTodo = {
  id: string;
  title: string;
  detail: string;
  deadline: number;
  severity: string;
};

/**
 * One species' row in an FWP size table: how many fish fell in each inch.
 * The key is the inch mark; the last column also holds everything above it.
 */
type SizeRow = {
  species: string;
  counts: Record<number, number>;
  /** Set on both halves of a species too spread out for one table. */
  split?: boolean;
};

/**
 * One line of the event form's dates box: the date it parsed to, or the text
 * that would not parse, so the form can point at exactly the line that is wrong.
 */
type ParsedDateLine = { key?: string; bad?: string };

// ============================================================================
// EVERYTHING ELSE: THE FIELD'S OWN SCREENS
//
// Chat, side bets, positions and beacons, and the maps they are drawn on. The
// three records below were the last of the six shared collections still moving
// as plain Row. Each is written from the literal that creates it - one place
// for a message, one for a position, two for a bet - and from every field the
// compiler found read back.
// ============================================================================

/**
 * One chat message. `catch` messages are posted by the app when a catch is
 * filed, and carry which one; `chat` messages are typed. Either can be a reply,
 * one level deep.
 */
type ChatMessage = {
  id: string;
  /**
   * Who posted it. Null only if a catch were ever announced with no angler to
   * name - the code that posts one allows for it, so the type does too.
   */
  anglerId: string | null;
  /** Copied at posting time, so an old message survives its author's handle changing. */
  handle: string;
  kind: 'chat' | 'catch';
  text: string;
  /** The catch a `catch` message is about. The brag is read from the catch itself. */
  catchId?: string;
  /** The message this one answers, or null for a new conversation. */
  replyTo: string | null;
  timestamp: number;
};

/**
 * A side bet. The app keeps score, never money - `stake` is whatever the
 * anglers typed, "a round at the ramp", and nothing reads it but a person.
 * `scoring` is one of BET_SCORING: smallest, most, first, or manual.
 */
type Bet = {
  id: string;
  kind: 'bet';
  title: string;
  stake: string;
  scoring: string;
  creatorId: string;
  /** Null until somebody calls it. */
  winnerId: string | null;
  settledAt: number | null;
  timestamp: number;
};

/**
 * One angler in one bet. Its own record rather than a list inside the bet:
 * two anglers joining at once would otherwise write the same record, and
 * last-writer-wins would quietly drop one of them.
 */
type BetJoin = {
  id: string;
  kind: 'join';
  betId: string;
  anglerId: string;
  timestamp: number;
};

/** The bets collection holds both, told apart by `kind`. */
type BetRow = Bet | BetJoin;

/** A bet somebody has called. Frozen results and the trophy case keep only these. */
type SettledBet = Bet & { winnerId: string };

/**
 * Where an angler last was. One per angler, filed under their id, so a new fix
 * overwrites the last rather than the table growing all day.
 */
type Signal = {
  id: string;
  anglerId: string;
  handle: string;
  lat: number;
  lng: number;
  /** Null when the fix came without one. */
  accuracyMiles: number | null;
  at: number;
  /** Raised means somebody needs help. Only an explicit stand-down lowers it. */
  beacon: boolean;
  beaconAt: number | null;
  /** What the angler said when they raised it, up to 140 characters. */
  note: string;
};

/**
 * Anything Leaflet hands back - a map, a layer, a marker.
 *
 * NOT a placeholder. Leaflet ships no types and this app installs none (see
 * `L` at the top of this file), so whatever it returns is exactly as unknown
 * as `L` is. The name says which library the value came from; a guess at its
 * methods would read as checked when nothing had checked it.
 */
type LeafletObject = any;

/** One live map, as ensureMap() keeps it: the element, the map, and its two layers. */
type MapEntry = {
  el: HTMLElement;
  map: LeafletObject;
  /** The course outline. */
  boundary: LeafletObject;
  /** Everything else: catches, beacons, you, the editor's handles. */
  pins: LeafletObject;
  /** Each screen frames the course once, then leaves the view where the user puts it. */
  fittedCourse?: boolean;
  fittedPositions?: boolean;
  /** The boundary editor's own state, kept on the map it belongs to. */
  wiredBoundary?: boolean;
  radiusHandle?: LeafletObject | null;
};

/**
 * The Claude viewer's sampler, as far as Fish-I uses it: ask a question about a
 * photo and get JSON back. What comes back is the model's answer, which is why
 * it is typed as a review that may be missing any of its fields - see AiReview.
 */
interface FishISampler {
  json(prompt: string, opts: { images: Blob; modelTier: string }): Promise<Partial<AiReview>>;
}
