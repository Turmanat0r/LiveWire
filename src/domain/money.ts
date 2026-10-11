import type { Angler, Cents, NonEmptyArray } from './types';

export interface PayoutShare {
  readonly place: string;
  /** Hundredths of a percent: 5000 is 50%. Integers, so the maths is exact. */
  readonly basisPoints: number;
}

export const DEFAULT_PAYOUT: NonEmptyArray<PayoutShare> = [
  { place: '1st', basisPoints: 5000 },
  { place: '2nd', basisPoints: 3000 },
  { place: '3rd', basisPoints: 2000 },
];

export interface FeeSchedule {
  readonly soloCents: Cents;
  readonly teamCents: Cents;
  readonly bigFishCents: Cents;
}

export interface Award {
  readonly place: string;
  readonly cents: Cents;
}

/**
 * Split a pool across the places the field can fill, to the cent.
 *
 * Each share is floored to a cent and the leftover cents go one at a time to
 * the places that rounding shaved most from, the higher place first on a tie
 * (largest-remainder apportionment). The parts always add up to the whole.
 *
 * An unfilled place is not redistributed: a two-entry division pays 1st and
 * 2nd their own shares, and the 3rd-place money stays unawarded.
 */
export function splitPool(
  eligibleEntries: number,
  poolCents: Cents,
  shares: readonly PayoutShare[] = DEFAULT_PAYOUT,
): Award[] {
  const paid = shares.slice(0, Math.max(0, Math.min(eligibleEntries, shares.length)));
  if (paid.length === 0) return [];
  const cents = Math.max(0, Math.round(poolCents));
  if (cents === 0) return paid.map((s) => ({ place: s.place, cents: 0 }));

  const totalBp = paid.reduce((sum, s) => sum + s.basisPoints, 0);
  const toGive = Math.round((cents * totalBp) / 10_000);
  const parts = paid.map((s, index) => {
    const exact = cents * s.basisPoints;
    return { index, floor: Math.floor(exact / 10_000), remainder: exact % 10_000 };
  });
  const leftover = toGive - parts.reduce((sum, p) => sum + p.floor, 0);
  const topUp = new Set(
    [...parts]
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
      .slice(0, Math.max(0, leftover))
      .map((p) => p.index),
  );
  return paid.map((s, index) => {
    const part = parts[index];
    return { place: s.place, cents: (part?.floor ?? 0) + (topUp.has(index) ? 1 : 0) };
  });
}

export interface EntryCounts {
  /** Solo entries. */
  readonly solo: number;
  /** Team entries: one per team, so a partner is not counted twice. */
  readonly teams: number;
  /** Big Fish is per angler, and both halves of a team have their own record. */
  readonly bigFish: number;
}

function countEntries(anglers: readonly Angler[]): EntryCounts {
  return {
    solo: anglers.filter((a) => a.division === 'solo').length,
    teams: anglers.filter((a) => a.division === 'team' && a.role !== 'partner').length,
    bigFish: anglers.filter((a) => a.bigFish).length,
  };
}

/** What each pool is built from: money that actually arrived. */
export function paidEntries(anglers: readonly Angler[]): EntryCounts {
  return countEntries(anglers.filter((a) => a.feePaid));
}

export function feesFor(counts: EntryCounts, fees: FeeSchedule): Cents {
  return (
    counts.solo * fees.soloCents +
    counts.teams * fees.teamCents +
    counts.bigFish * fees.bigFishCents
  );
}

/** What the roster implies that nobody has matched a payment to yet, priced. */
export function outstandingFees(
  anglers: readonly Angler[],
  fees: FeeSchedule,
): EntryCounts & { readonly totalCents: Cents } {
  const counts = countEntries(anglers.filter((a) => !a.feePaid));
  return { ...counts, totalCents: feesFor(counts, fees) };
}

/**
 * Places each division can actually fill. A disqualified angler forfeits their
 * place but not their fee. A team keeps its place while either member is still
 * eligible, because the other member's fish still rank.
 */
export function eligibleEntries(anglers: readonly Angler[]): { solo: number; teams: number } {
  const paid = anglers.filter((a) => a.feePaid);
  const solo = paid.filter((a) => a.division === 'solo' && !a.disqualified).length;
  const teams = paid.filter((entry) => {
    if (entry.division !== 'team' || entry.role === 'partner') return false;
    if (!entry.disqualified) return true;
    if (!entry.teamId) return false;
    return anglers.some((a) => a.teamId === entry.teamId && a.id !== entry.id && !a.disqualified);
  }).length;
  return { solo, teams };
}

/** "$30", or "$12.50" when there are cents. */
export function dollarsText(cents: Cents): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${String(dollars)}` : `$${dollars.toFixed(2)}`;
}
