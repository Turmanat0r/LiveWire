// What My catches and the Livewell list: the server's copy of an angler's
// catches, with whatever is still on its way through the outbox laid over
// it, so an angler sees a fish the moment they file it, signal or not.
import type { OutboxItem } from '../../data/local';
import type { Row } from '../../data/tables';

export type CatchStatus = 'waiting' | Row<'catches'>['status'];

export interface CatchRow {
  readonly id: string;
  readonly species: string;
  readonly lengthInches: number;
  readonly loggedAt: string;
  readonly status: CatchStatus;
  /** On the server: where its photo is. */
  readonly photoPath: string | null;
  /** Not on the server yet: the outbox item holding it, photo and all. */
  readonly waiting: OutboxItem | null;
  /** A new length on its way. */
  readonly newLength: number | null;
  readonly photoSending: boolean;
  readonly withdrawing: boolean;
  /** Anything about this catch the server refused, with its reason. */
  readonly refused: readonly OutboxItem[];
}

/** Which catch an outbox item is about, if any. */
export function catchIdOf(item: OutboxItem): string | null {
  const step = item.steps[0];
  if (!step) return null;
  if (step.kind === 'upload' || step.kind === 'remove') {
    return (
      step.path
        .split('/')
        .pop()
        ?.replace(/\.jpg$/, '') ?? null
    );
  }
  if (
    step.fn === 'file_catch' ||
    step.fn === 'amend_catch_length' ||
    step.fn === 'withdraw_catch'
  ) {
    const id = step.args['p_id'];
    return typeof id === 'string' ? id : null;
  }
  if (step.fn === 'post_message') {
    const id = step.args['p_catch_id'];
    return typeof id === 'string' ? id : null;
  }
  return null;
}

function callArg(item: OutboxItem, name: string): unknown {
  const step = item.steps[0];
  return step?.kind === 'call' ? step.args[name] : undefined;
}

export function catchRows(
  catches: Iterable<Row<'catches'>>,
  items: readonly OutboxItem[],
  anglerId: string,
): CatchRow[] {
  const about = new Map<string, OutboxItem[]>();
  for (const item of items) {
    const id = catchIdOf(item);
    if (id) about.set(id, [...(about.get(id) ?? []), item]);
  }
  const working = (id: string) => (about.get(id) ?? []).filter((i) => i.failure === null);
  const refusedOf = (id: string) => (about.get(id) ?? []).filter((i) => i.failure !== null);

  const rows: CatchRow[] = [];
  const onServer = new Set<string>();
  for (const c of catches) {
    if (c.angler_id !== anglerId) continue;
    onServer.add(c.id);
    const pending = working(c.id);
    const amend = pending.find(
      (i) =>
        callArg(i, 'p_length_inches') !== undefined &&
        i.steps[0]?.kind === 'call' &&
        i.steps[0].fn === 'amend_catch_length',
    );
    const newLength = amend ? Number(callArg(amend, 'p_length_inches')) : null;
    rows.push({
      id: c.id,
      species: c.species,
      lengthInches: c.length_inches,
      loggedAt: c.logged_at,
      status: c.status,
      photoPath: c.photo_path,
      waiting: null,
      newLength,
      photoSending: pending.some((i) => i.steps.some((s) => s.kind === 'upload')),
      withdrawing: pending.some((i) =>
        i.steps.some(
          (s) => s.kind === 'remove' || (s.kind === 'call' && s.fn === 'withdraw_catch'),
        ),
      ),
      refused: refusedOf(c.id),
    });
  }
  for (const item of items) {
    const step = item.steps[0];
    if (step?.kind !== 'call' || step.fn !== 'file_catch') continue;
    if (step.args['p_angler_id'] !== anglerId) continue;
    const id = catchIdOf(item);
    if (!id || onServer.has(id)) continue;
    const loggedAt = step.args['p_logged_at'];
    rows.push({
      id,
      species: typeof step.args['p_species'] === 'string' ? step.args['p_species'] : '',
      lengthInches: Number(step.args['p_length_inches']),
      loggedAt: typeof loggedAt === 'string' ? loggedAt : new Date(item.createdAt).toISOString(),
      status: 'waiting',
      photoPath: null,
      waiting: item,
      newLength: null,
      photoSending: true,
      withdrawing: false,
      refused: item.failure ? [item] : [],
    });
  }
  return rows.sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
}
