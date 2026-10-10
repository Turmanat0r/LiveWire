// The shapes the tournament rules work on. Nothing here knows about the
// database, the network or the screen: the data layer maps rows into these,
// and the rules in this folder are pure functions over them.

/** Milliseconds since the Unix epoch. */
export type EpochMs = number;

/** Money, in whole cents. Never a float of dollars. */
export type Cents = number;

/** A calendar date in the event's own time zone, as YYYY-MM-DD. */
export type DateKey = string;

/** A source of numbers in [0, 1). Math.random in the app, seeded in tests. */
export type Random = () => number;

/** A list that always has a first item, and says so to the compiler. */
export type NonEmptyArray<T> = readonly [T, ...T[]];

export type Division = 'solo' | 'team';
export type AnglerRole = 'solo' | 'captain' | 'partner';
export type CatchStatus = 'pending' | 'approved' | 'rejected';

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/**
 * What the rules need to know about an angler. Real names, phone numbers and
 * emergency contacts are not here: they live in a table only the director and
 * the angler can read, and nothing that ranks or pays needs them.
 */
export interface Angler {
  readonly id: string;
  readonly handle: string;
  readonly division: Division;
  readonly role: AnglerRole;
  /** Shared by a team's two anglers; null for a solo entry. */
  readonly teamId: string | null;
  readonly bigFish: boolean;
  /** Whether the director has matched an entry fee to this angler. Money only. */
  readonly feePaid: boolean;
  /** Eligibility. A disqualified angler does not place and is out of the Big Fish pot. */
  readonly disqualified: boolean;
}

export interface Catch {
  readonly id: string;
  readonly anglerId: string;
  readonly division: Division;
  readonly species: string;
  readonly lengthInches: number;
  /** When the catch was logged. Every ranking breaks a tie on the earliest fish. */
  readonly loggedAt: EpochMs;
  readonly status: CatchStatus;
}

/** The not-scored bucket an angler picks for a fish that is not a target species. */
export const OTHER_SPECIES = 'Other';
