// What the public payout screen shows: each pool, what it holds, and how it
// splits. Built from the server's counts of paid entries and the director's
// donations, never from who paid: that is between the angler and the director.
import type { PoolCounts } from '../../data/pools';
import type { Row } from '../../data/tables';
import { splitPool, type Award, type FeeSchedule, type PayoutShare } from '../../domain/money';
import type { Cents } from '../../domain/types';

/** 1st, 2nd, 3rd, 4th, ... 11th, 12th, 13th, ... 21st. */
export function placeName(place: number): string {
  const teen = place % 100 >= 11 && place % 100 <= 13;
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][place % 10] ?? 'th');
  return `${String(place)}${suffix}`;
}

/** The event's split, as places: [5000, 3000, 2000] is 1st 50%, 2nd 30%, 3rd 20%. */
export function sharesFrom(basisPoints: readonly number[]): PayoutShare[] {
  return basisPoints.map((bp, i) => ({ place: placeName(i + 1), basisPoints: bp }));
}

/** "50/30/20" */
export function splitText(shares: readonly PayoutShare[]): string {
  return shares.map((s) => String(s.basisPoints / 100)).join('/');
}

export interface DivisionPool {
  readonly name: string;
  /** Paid entries: everyone whose fee is in the pool. */
  readonly entries: number;
  /** Paid entries that can still place. */
  readonly eligible: number;
  readonly donatedCents: Cents;
  readonly poolCents: Cents;
  readonly awards: readonly Award[];
  /** Money for places the field is too small to fill. */
  readonly unawardedCents: Cents;
}

export interface Payouts {
  /** Donations to the tournament as a whole: not split, held for the director. */
  readonly generalCents: Cents;
  readonly solo: DivisionPool;
  readonly team: DivisionPool;
  readonly bigFish: {
    readonly anglers: number;
    readonly donatedCents: Cents;
    readonly poolCents: Cents;
  };
}

function donatedTo(
  donations: readonly Pick<Row<'donations'>, 'target' | 'amount_cents'>[],
  target: Row<'donations'>['target'],
): Cents {
  return donations.filter((d) => d.target === target).reduce((s, d) => s + d.amount_cents, 0);
}

function division(
  name: string,
  entries: number,
  eligible: number,
  feeCents: Cents,
  donatedCents: Cents,
  shares: readonly PayoutShare[],
): DivisionPool {
  const poolCents = entries * feeCents + donatedCents;
  const awards = splitPool(eligible, poolCents, shares);
  const awarded = awards.reduce((s, a) => s + a.cents, 0);
  return {
    name,
    entries,
    eligible,
    donatedCents,
    poolCents,
    awards,
    unawardedCents: eligible > 0 ? poolCents - awarded : 0,
  };
}

export function payouts(
  counts: PoolCounts,
  fees: FeeSchedule,
  donations: readonly Pick<Row<'donations'>, 'target' | 'amount_cents'>[],
  shares: readonly PayoutShare[],
): Payouts {
  const bigFishDonated = donatedTo(donations, 'big_fish');
  return {
    generalCents: donatedTo(donations, 'general'),
    solo: division(
      'Solo division',
      counts.soloPaid,
      counts.soloEligible,
      fees.soloCents,
      donatedTo(donations, 'solo'),
      shares,
    ),
    team: division(
      'Team division',
      counts.teamsPaid,
      counts.teamsEligible,
      fees.teamCents,
      donatedTo(donations, 'team'),
      shares,
    ),
    bigFish: {
      anglers: counts.bigFishPaid,
      donatedCents: bigFishDonated,
      poolCents: counts.bigFishPaid * fees.bigFishCents + bigFishDonated,
    },
  };
}
