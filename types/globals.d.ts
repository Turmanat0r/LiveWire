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
 * One scene in a catch reel: the title card, a shot, or the end card. Only a
 * shot carries `row` (the catch it was built from), and `image` is attached
 * later, once the photo has actually been fetched.
 */
interface ReelScene {
  kind: string;
  ms: number;
  row?: any;
  image?: any;
}

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
  day: any;
  dateKey: any;
  dayKey: any;
  start: any;
  stop: any;
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
  presenter?: any;
  prefix?: any;
  dates: any[];
  timeZone?: any;
  courseLabel: string;
  courseLabelLong: string;
  registrationClose: string;
  targetSpecies?: any;
  recordInches?: number;
  course?: any;
}

/**
 * A value whose shape has not been written down yet.
 *
 * Exactly `any`, under a name of its own, and the name is the point.
 *
 * Turning on strictNullChecks made every empty `[]` in the app infer as
 * `never[]` - a list that can hold nothing - so the first `push` onto each one
 * failed. The right fix is the real element type, and that is the job of the
 * noImplicitAny pass that comes after this one. Writing plain `any[]` would
 * have compiled just as well, and then been invisible to that pass for ever:
 * noImplicitAny only reports an `any` nobody wrote, and this one somebody did.
 *
 * So every placeholder says what it is. `grep Unshaped` is the list of what is
 * left to describe, and test/lint.mjs prints how many remain on every run.
 */
type Unshaped = any;

/**
 * An object whose fields are not written down yet - but an object, and never
 * null by itself, so `| null` beside it still means something.
 *
 * `Unshaped | null` would NOT: a union with `any` is just `any`, so it would
 * quietly switch null-checking off for exactly the values strictNullChecks was
 * turned on to check. The Supabase client, the active backend, the boundary
 * being drawn - these are the app's nullable state, and whether the code checks
 * them before using them is the whole question. Any field can still be read off
 * one of these, which is what lets them stand in until the real shape is known.
 */
type UnshapedObject = Record<string, any>;

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
 * Loose on purpose, and NOT a placeholder like Unshaped. The data layer moves
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
