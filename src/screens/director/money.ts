// The director's side of the money. The field's payout screen asks the server
// how many entries have paid; the director can read who has, so the pools here
// are worked out from the roster with the same rules, and every fee ticked off
// shows in them at once. Donations not sent yet are laid over the copy too.
import { useMemo } from 'react';
import { useBoard } from '../../data/board';
import type { Contestant } from '../../data/director';
import type { OutboxItem } from '../../data/local';
import type { PoolCounts } from '../../data/pools';
import type { Row } from '../../data/tables';
import { useSync } from '../../data/useSync';
import {
  eligibleEntries,
  outstandingFees,
  paidEntries,
  type EntryCounts,
  type FeeSchedule,
  type PayoutShare,
} from '../../domain/money';
import { bigFishLeader } from '../../domain/scoring';
import type { Angler, Cents } from '../../domain/types';
import { payouts, placeName, sharesFrom, type Payouts } from '../board/payouts';

export type DonationTarget = Row<'donations'>['target'];

export const TARGETS: readonly {
  readonly id: DonationTarget;
  /** In the list: "Solo pool". */
  readonly label: string;
  /** In the picker: "Solo division pool". */
  readonly long: string;
}[] = [
  { id: 'general', label: 'General fund', long: 'General tournament fund (no split)' },
  { id: 'solo', label: 'Solo pool', long: 'Solo division pool' },
  { id: 'team', label: 'Team pool', long: 'Team division pool' },
  { id: 'big_fish', label: 'Big Fish pot', long: 'Big Fish pot' },
];

const isTarget = (value: unknown): value is DonationTarget => TARGETS.some((t) => t.id === value);

export function targetLabel(target: DonationTarget): string {
  return TARGETS.find((t) => t.id === target)?.label ?? target;
}

export interface DonationView {
  readonly id: string;
  readonly target: DonationTarget;
  readonly cents: Cents;
  readonly note: string;
  /** When it was logged, as ISO text. */
  readonly at: string;
  /** Still in the outbox. */
  readonly sending: boolean;
}

/** The event's donations, newest first, with what the outbox holds laid over them. */
export function donationViews(
  rows: Iterable<Row<'donations'>>,
  items: readonly OutboxItem[],
  eventId: string,
): DonationView[] {
  const out = new Map<string, DonationView>();
  for (const d of rows) {
    if (d.event_id !== eventId) continue;
    out.set(d.id, {
      id: d.id,
      target: d.target,
      cents: d.amount_cents,
      note: d.note,
      at: d.created_at,
      sending: false,
    });
  }
  for (const item of items) {
    if (item.failure !== null) continue;
    for (const step of item.steps) {
      if (step.kind !== 'call') continue;
      const { p_id: id, p_event_id: event, p_target: target, p_amount_cents: cents } = step.args;
      if (typeof id !== 'string') continue;
      if (step.fn === 'director_delete_donation') {
        out.delete(id);
      } else if (
        step.fn === 'director_record_donation' &&
        event === eventId &&
        isTarget(target) &&
        typeof cents === 'number'
      ) {
        const note = step.args['p_note'];
        out.set(id, {
          id,
          target,
          cents,
          note: typeof note === 'string' ? note : '',
          at: new Date(item.createdAt).toISOString(),
          sending: true,
        });
      }
    }
  }
  return [...out.values()].sort((x, y) => y.at.localeCompare(x.at) || x.id.localeCompare(y.id));
}

/** An awards budget still in the outbox, the last one set. */
export function queuedAwardsBudget(items: readonly OutboxItem[], eventId: string): Cents | null {
  let cents: Cents | null = null;
  for (const item of items) {
    if (item.failure !== null) continue;
    for (const step of item.steps) {
      if (step.kind !== 'call' || step.fn !== 'director_set_awards_budget') continue;
      const { p_event_id: event, p_cents: set } = step.args;
      if (event === eventId && typeof set === 'number') cents = set;
    }
  }
  return cents;
}

/** The roster as the payout rules see it: here, with who has paid. */
export function rosterAnglers(list: readonly Contestant[]): Angler[] {
  return list.map((c) => ({
    id: c.anglerId,
    handle: c.handle,
    division: c.division,
    role: c.role,
    teamId: c.division === 'team' ? c.entryId : null,
    bigFish: c.bigFish,
    feePaid: c.feePaid,
    disqualified: c.disqualified,
  }));
}

/** What the server's pool_counts would say, from the roster. */
export function rosterPoolCounts(anglers: readonly Angler[]): PoolCounts {
  const paid = paidEntries(anglers);
  const eligible = eligibleEntries(anglers);
  return {
    soloPaid: paid.solo,
    teamsPaid: paid.teams,
    bigFishPaid: paid.bigFish,
    soloEligible: eligible.solo,
    teamsEligible: eligible.teams,
  };
}

export interface Unpaid {
  readonly entryId: string;
  /** "Pat Morgan & Sam Lee" */
  readonly names: string;
  /** "1st in the solo division", "leading the Big Fish pot" */
  readonly why: string;
}

/**
 * Anyone placing, or leading the Big Fish pot, with no fee matched: the one
 * moment the fee genuinely matters, since paying out to an entry that never
 * paid in comes out of everybody else's share.
 */
export function unpaidInTheMoney(
  list: readonly Contestant[],
  places: number,
  bigFishLeaderId: string | null,
): Unpaid[] {
  const out = new Map<string, { names: string[]; why: string }>();
  for (const c of list) {
    if (c.feePaid || c.disqualified) continue;
    const why =
      c.rank > 0 && c.rank <= places
        ? `${placeName(c.rank)} in the ${c.division} division`
        : c.anglerId === bigFishLeaderId
          ? 'leading the Big Fish pot'
          : null;
    if (!why) continue;
    const seen = out.get(c.entryId);
    if (seen) seen.names.push(c.name);
    else out.set(c.entryId, { names: [c.name], why });
  }
  return [...out].map(([entryId, { names, why }]) => ({ entryId, names: names.join(' & '), why }));
}

export interface DirectorMoney {
  readonly model: Payouts;
  readonly shares: readonly PayoutShare[];
  /** Every pool and the general fund together. */
  readonly raisedCents: Cents;
  readonly budgetCents: Cents;
  readonly owed: EntryCounts & { readonly totalCents: Cents };
  readonly unpaid: readonly Unpaid[];
  readonly donations: readonly DonationView[];
}

export function useDirectorMoney(list: readonly Contestant[]): DirectorMoney | null {
  const board = useBoard();
  const rows = useSync((s) => s.tables.donations);
  const items = useSync((s) => s.outbox.items);
  return useMemo(() => {
    if (!board) return null;
    const { event } = board;
    const fees: FeeSchedule = {
      soloCents: event.fee_solo_cents,
      teamCents: event.fee_team_cents,
      bigFishCents: event.fee_big_fish_cents,
    };
    const shares = sharesFrom(event.payout_basis_points);
    const anglers = rosterAnglers(list);
    const donations = donationViews(rows.values(), items, event.id);
    const model = payouts(
      rosterPoolCounts(anglers),
      fees,
      donations.map((d) => ({ target: d.target, amount_cents: d.cents })),
      shares,
    );
    const leader = bigFishLeader(board.catches, board.anglers, board.species);
    return {
      model,
      shares,
      raisedCents:
        model.generalCents + model.solo.poolCents + model.team.poolCents + model.bigFish.poolCents,
      budgetCents: queuedAwardsBudget(items, event.id) ?? event.awards_budget_cents,
      owed: outstandingFees(anglers, fees),
      unpaid: unpaidInTheMoney(list, shares.length, leader?.anglerId ?? null),
      donations,
    };
  }, [board, list, rows, items]);
}
