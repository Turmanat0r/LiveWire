import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { screen } from '../app/screens';
import type { OutboxItem } from '../data/local';
import { useMyEntry } from '../data/myEntry';
import { useEventDates } from '../data/selectors';
import type { Row } from '../data/tables';
import { useSync, useSyncEngine } from '../data/useSync';
import { clockText, dayLabelText, timeOfDayText } from '../domain/time';
import { Page } from '../ui/Page';
import '../ui/forms.css';
import './CheckInScreen.css';

type Act = 'check_in' | 'check_out';

/** The outbox item checking this angler in or out on this day, if one is there. */
function queued(
  items: readonly OutboxItem[],
  fn: Act,
  anglerId: string,
  day: string,
): OutboxItem | undefined {
  return items.find((item) => {
    const step = item.steps[0];
    return (
      step?.kind === 'call' &&
      step.fn === fn &&
      step.args['p_angler_id'] === anglerId &&
      step.args['p_day'] === day
    );
  });
}

/** A check-in or check-out for the outbox, stamped with the phone's time now. */
function checkItem(fn: Act, anglerId: string, handle: string, day: string, index: number) {
  return {
    id: crypto.randomUUID(),
    label: `${fn === 'check_in' ? 'Check in' : 'Check out'} · ${handle} · Day ${String(index + 1)}`,
    createdAt: Date.now(),
    steps: [
      {
        kind: 'call' as const,
        fn,
        args: { p_angler_id: anglerId, p_day: day, p_at: new Date().toISOString() },
      },
    ],
  };
}

function stampOf(item: OutboxItem | undefined): string | null {
  const step = item?.steps[0];
  const at = step?.kind === 'call' ? step.args['p_at'] : null;
  return typeof at === 'string' ? at : null;
}

/**
 * Who launched and who came back: the record the overdue list is read from at
 * the final check-in. Taps go to the outbox, because the ramp is where the
 * signal gives out, and the screen shows them at once with the phone's time.
 */
export function CheckInScreen() {
  const event = useSync((s) => s.event);
  const dates = useEventDates(event);
  const mine = useMyEntry();
  const title = screen('check-in').title;
  if (!event) {
    return (
      <Page title={title}>
        <p>No tournament is open yet.</p>
      </Page>
    );
  }
  return (
    <Page title={title}>
      <p>
        Lines in {clockText(event.lines_in)}, lines out {clockText(event.lines_out)}, and back for
        final check-in by {clockText(event.final_check_in)} each day. Everyone checks out, to
        confirm a safe return to the ramp.
      </p>
      {mine ? (
        <CheckInDays event={event} dates={dates} anglers={mine.anglers} meId={mine.me.angler.id} />
      ) : (
        <>
          <p className="empty">Register an angler first to check in.</p>
          <Link className="button button--secondary" to={screen('register').path}>
            Register
          </Link>
        </>
      )}
    </Page>
  );
}

interface CheckInDaysProps {
  readonly event: Row<'events'>;
  readonly dates: readonly string[];
  readonly anglers: NonNullable<ReturnType<typeof useMyEntry>>['anglers'];
  readonly meId: string;
}

function CheckInDays({ event, dates, anglers, meId }: CheckInDaysProps) {
  const sync = useSyncEngine();
  const checkIns = useSync((s) => s.tables.check_ins);
  const outbox = useSync((s) => s.outbox);
  const [chosen, setChosen] = useState(meId);
  const pickId = useId();
  const angler = anglers.find((a) => a.angler.id === chosen) ?? anglers[0];
  const refused = useMemo(
    () =>
      outbox.items.filter((item) => {
        const step = item.steps[0];
        return (
          item.failure !== null &&
          step?.kind === 'call' &&
          (step.fn === 'check_in' || step.fn === 'check_out')
        );
      }),
    [outbox.items],
  );
  if (!angler) return null;
  const { id, handle } = angler.angler;
  const waiting = outbox.items.filter((item) => item.failure === null);

  function act(fn: Act, day: string, index: number) {
    void sync.queue(checkItem(fn, id, handle, day, index));
  }

  return (
    <>
      {anglers.length > 1 ? (
        <div className="field">
          <label className="field__label" htmlFor={pickId}>
            Angler
          </label>
          <select
            id={pickId}
            value={id}
            onChange={(e) => {
              setChosen(e.target.value);
            }}
          >
            {anglers.map((a) => (
              <option key={a.angler.id} value={a.angler.id}>
                {a.details?.full_name
                  ? `${a.details.full_name} (${a.angler.handle})`
                  : a.angler.handle}
              </option>
            ))}
          </select>
          <p className="hint">A team is one boat: either phone checks either of you in.</p>
        </div>
      ) : null}
      <ul className="check-days" aria-label="Fishing days">
        {dates.map((day, index) => {
          const row = [...checkIns.values()].find((c) => c.angler_id === id && c.day === day);
          const inQueued = queued(waiting, 'check_in', id, day);
          const outQueued = queued(waiting, 'check_out', id, day);
          const inAt = row?.in_at ?? stampOf(inQueued);
          const outAt = row?.out_at ?? stampOf(outQueued);
          const pending =
            (inQueued !== undefined && !row?.in_at) || (outQueued !== undefined && !row?.out_at);
          const time = (at: string) => timeOfDayText(Date.parse(at), event.time_zone);
          const status = outAt
            ? `Checked out at ${time(outAt)}`
            : inAt
              ? `Checked in at ${time(inAt)}`
              : 'Not checked in';
          return (
            <li className="check-day" key={day}>
              <div>
                <p className="check-day__name">
                  Day {index + 1} · {dayLabelText(day)}
                </p>
                <p className="check-day__status">
                  {status}
                  {pending ? ' · waiting to send' : ''}
                </p>
              </div>
              {!inAt ? (
                <button
                  className="check-button check-button--in"
                  type="button"
                  onClick={() => {
                    act('check_in', day, index);
                  }}
                >
                  Check in
                </button>
              ) : !outAt ? (
                <button
                  className="check-button check-button--out"
                  type="button"
                  onClick={() => {
                    act('check_out', day, index);
                  }}
                >
                  Check out
                </button>
              ) : (
                <button className="check-button check-button--done" type="button" disabled>
                  Complete
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {refused.map((item) => (
        <div className="notice notice--problem" key={item.seq} role="alert">
          <strong>{item.label}: not accepted</strong>
          {item.failure?.detail}{' '}
          <button
            className="button button--small"
            type="button"
            onClick={() => void sync.outbox.discard(item)}
          >
            Dismiss
          </button>
        </div>
      ))}
    </>
  );
}
