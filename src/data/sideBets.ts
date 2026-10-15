// Side bets as the screen shows them: the server's, with whatever this phone
// has asked for that is still in the outbox laid over them, so starting,
// joining or calling a bet shows at once, signal or not.
import { useMemo } from 'react';
import { betLeader, type BetLeader } from '../domain/bets';
import { indexAnglers } from '../domain/scoring';
import type { Angler, Catch } from '../domain/types';
import type { OutboxItem } from './local';
import type { Row } from './tables';

export const BET_TITLE_MAX = 70;
export const BET_STAKE_MAX = 40;
/** Per angler, so one person cannot flood the screen. The server holds the same line. */
export const BET_OPEN_MAX = 3;

export interface BetView {
  readonly bet: Row<'bets'>;
  readonly entrants: readonly string[];
  readonly leader: BetLeader | null;
  /** Something about it is still waiting to send. */
  readonly sending: boolean;
  /** What the server turned down about it. */
  readonly refused: readonly OutboxItem[];
}

type Args = Readonly<Record<string, unknown>>;

function str(args: Args, key: string): string | null {
  const v = args[key];
  return typeof v === 'string' ? v : null;
}

function betIdOf(fn: string, args: Args): string | null {
  return fn === 'create_bet' ? str(args, 'p_id') : str(args, 'p_bet_id');
}

/**
 * Open bets first, then settled ones, newest first within each.
 */
export function betViews(
  bets: Iterable<Row<'bets'>>,
  entries: Iterable<Row<'bet_entries'>>,
  items: readonly OutboxItem[],
  eventId: string,
  anglers: readonly Angler[],
  catches: readonly Catch[],
  species: readonly string[],
): BetView[] {
  const byId = new Map<string, Row<'bets'>>();
  for (const b of bets) if (b.event_id === eventId) byId.set(b.id, b);
  const entrants = new Map<string, Set<string>>();
  for (const e of entries) {
    const set = entrants.get(e.bet_id) ?? new Set<string>();
    set.add(e.angler_id);
    entrants.set(e.bet_id, set);
  }
  const sending = new Set<string>();
  const refused = new Map<string, OutboxItem[]>();
  const deleted = new Set<string>();

  for (const item of items) {
    for (const step of item.steps) {
      if (step.kind !== 'call') continue;
      const a: Args = step.args;
      const betId = betIdOf(step.fn, a);
      if (!betId) continue;
      if (item.failure !== null) {
        refused.set(betId, [...(refused.get(betId) ?? []).filter((i) => i !== item), item]);
        continue;
      }
      sending.add(betId);
      const angler = str(a, 'p_angler_id');
      switch (step.fn) {
        case 'create_bet': {
          const scoring = str(a, 'p_scoring');
          if (!byId.has(betId) && angler && scoring) {
            byId.set(betId, {
              id: betId,
              event_id: eventId,
              creator_angler_id: angler,
              title: str(a, 'p_title') ?? '',
              stake: str(a, 'p_stake') ?? '',
              scoring: scoring as Row<'bets'>['scoring'],
              winner_angler_id: null,
              settled_at: null,
              created_at: new Date(item.createdAt).toISOString(),
            });
          }
          break;
        }
        case 'join_bet':
          if (angler) entrants.set(betId, new Set([...(entrants.get(betId) ?? []), angler]));
          break;
        case 'leave_bet':
          if (angler) entrants.get(betId)?.delete(angler);
          break;
        case 'settle_bet': {
          const bet = byId.get(betId);
          const winner = str(a, 'p_winner_angler_id');
          if (bet && winner) byId.set(betId, { ...bet, winner_angler_id: winner });
          break;
        }
        case 'delete_bet':
          deleted.add(betId);
          break;
        default:
          break;
      }
    }
  }

  const anglersById = indexAnglers(anglers);
  const views: BetView[] = [];
  for (const bet of byId.values()) {
    if (deleted.has(bet.id)) continue;
    const ids = [...(entrants.get(bet.id) ?? [])];
    views.push({
      bet,
      entrants: ids,
      leader:
        bet.winner_angler_id === null
          ? betLeader(
              {
                id: bet.id,
                title: bet.title,
                stake: bet.stake,
                scoring: bet.scoring,
                creatorId: bet.creator_angler_id,
                winnerId: bet.winner_angler_id,
              },
              ids,
              catches,
              anglersById,
              species,
            )
          : null,
      sending: sending.has(bet.id),
      refused: refused.get(bet.id) ?? [],
    });
  }
  return views.sort((x, y) => {
    const xs = x.bet.winner_angler_id !== null;
    const ys = y.bet.winner_angler_id !== null;
    if (xs !== ys) return xs ? 1 : -1;
    return y.bet.created_at.localeCompare(x.bet.created_at);
  });
}

/** Why a new bet cannot be started, or null when it can. */
export function newBetProblem(
  title: string,
  stake: string,
  views: readonly BetView[],
  anglerId: string,
): string | null {
  const t = title.trim();
  if (!t) return 'Say what the bet is.';
  if (t.length > BET_TITLE_MAX) {
    return `Keep the title under ${String(BET_TITLE_MAX)} characters.`;
  }
  if (stake.trim().length > BET_STAKE_MAX) {
    return `Keep the stake under ${String(BET_STAKE_MAX)} characters.`;
  }
  const open = views.filter((v) => v.bet.winner_angler_id === null);
  const mine = open.filter((v) => v.bet.creator_angler_id === anglerId).length;
  if (mine >= BET_OPEN_MAX) {
    return `You already have ${String(mine)} bets running. Settle or delete one first.`;
  }
  if (open.some((v) => v.bet.title.trim().toLowerCase() === t.toLowerCase())) {
    return 'There is already an open bet with that name.';
  }
  return null;
}

export function useBetViews(
  bets: ReadonlyMap<string, Row<'bets'>>,
  entries: ReadonlyMap<string, Row<'bet_entries'>>,
  items: readonly OutboxItem[],
  eventId: string | null,
  anglers: readonly Angler[],
  catches: readonly Catch[],
  species: readonly string[],
): BetView[] {
  return useMemo(
    () =>
      eventId
        ? betViews(bets.values(), entries.values(), items, eventId, anglers, catches, species)
        : [],
    [bets, entries, items, eventId, anglers, catches, species],
  );
}
