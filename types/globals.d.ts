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
  hours: number;
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
