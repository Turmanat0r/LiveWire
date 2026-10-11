import { useMemo, useState } from 'react';
import { useNow } from '../../app/useNow';
import { failureText } from '../../app/failureText';
import { useMyEntry, type MyEntry } from '../../data/myEntry';
import { failureOf } from '../../data/remote';
import { useEventDates } from '../../data/selectors';
import type { Row } from '../../data/tables';
import { useSync, useSyncEngine } from '../../data/useSync';
import { entryNumberText } from '../../domain/identity';
import { dateRangeText, lastDayText } from '../../domain/time';
import { Page } from '../../ui/Page';
import { ClaimEntry, RegisterForm } from './RegisterForm';
import '../../ui/forms.css';
import './RegisterScreen.css';

/** The old register screen: the event at the top, then your entry or the form, then the roster. */
export function RegisterScreen() {
  const loaded = useSync((s) => s.loaded);
  const event = useSync((s) => s.event);
  const dates = useEventDates(event);
  const mine = useMyEntry();
  const now = useNow();
  if (!event) {
    return (
      <Page title="Register">
        <p>{loaded ? 'No tournament is open for registration yet.' : 'Loading the tournament…'}</p>
      </Page>
    );
  }
  const closesAt = Date.parse(event.registration_closes_at);
  const lastDay = lastDayText(closesAt, event.time_zone);
  const meta = [dateRangeText(dates), event.course_label_long, 'Catch · Photo · Release']
    .filter(Boolean)
    .join(' · ');
  return (
    <Page
      title={event.name}
      hero={{ kicker: event.presenter ? `${event.presenter} presents` : undefined, meta }}
    >
      {mine ? (
        <RegisteredCard mine={mine} event={event} />
      ) : (
        <>
          <RegisterForm event={event} closed={closesAt <= now} lastDay={lastDay} />
          <ClaimEntry />
        </>
      )}
      <Roster event={event} />
    </Page>
  );
}

function RegisteredCard({
  mine,
  event,
}: {
  readonly mine: MyEntry;
  readonly event: Row<'events'>;
}) {
  const sync = useSyncEngine();
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { me, partner, details } = mine;
  const feePaid = details?.fee_paid ?? false;
  const rows: [string, string][] = [
    ['Name', me.details?.full_name ?? ''],
    ['Handle', me.angler.handle],
    ['Entry', entryNumberText(event.entry_prefix, mine.entry.entry_number)],
    ['Division', mine.entry.division === 'team' ? 'Team' : 'Solo'],
    ['Entry fee', feePaid ? 'Received' : 'Not matched up yet'],
  ];
  if (partner) {
    rows.push(['Partner', `${partner.details?.full_name ?? ''} (${partner.angler.handle})`]);
  }
  rows.push(['Big Fish pot', me.angler.big_fish ? 'Entered' : 'Not entered']);

  async function leave() {
    const sure = window.confirm(
      'Sign this phone out of your entry? Your entry stays on the roster. You can bring it back with your Tournament ID and phone number.',
    );
    if (!sure) return;
    setBusy(true);
    setProblem(null);
    try {
      await sync.call('leave_entry', { p_entry_id: mine.entry.id });
      await sync.refresh(['entry_devices']).catch(() => undefined);
    } catch (error) {
      setProblem(failureText(failureOf(error), 'Signing out of an entry'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="registered-title">
      <h2 className="card__title" id="registered-title">
        You are registered
      </h2>
      {feePaid ? null : (
        <div className="notice">
          <strong>Entry fee not matched up yet</strong>
          You are on the roster and your catches score normally. This is only the director ticking
          payments off against entries. If you have already paid, there is nothing to do. If you are
          not sure, check with the director before the rules meeting.
        </div>
      )}
      <ul className="rows">
        {rows.map(([label, value]) => (
          <li className="row" key={label}>
            <span className="row__who row__name">{label}</span>
            <span className="row__value">{value}</span>
          </li>
        ))}
      </ul>
      <div className="codebox">
        {details?.team_code ? <CodeChip label="Team code" code={details.team_code} /> : null}
        <CodeChip
          label={partner ? 'Your Tournament ID' : 'Tournament ID'}
          code={me.details?.angler_code ?? ''}
        />
        {partner ? (
          <CodeChip label="Partner’s Tournament ID" code={partner.details?.angler_code ?? ''} />
        ) : null}
      </div>
      <p className="hint">
        {partner
          ? 'Write the team code and your own Tournament ID on your bump board, and your partner writes theirs. The Tournament ID is what tells your fish apart from theirs.'
          : 'Write your Tournament ID on your bump board so it is readable in every catch photo.'}
      </p>
      <p className="hint">
        One entry per phone. Your handle is fixed now; the director can change it if there is a
        problem with it.
      </p>
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
      <button
        className="button button--small button--danger"
        type="button"
        disabled={busy}
        onClick={() => void leave()}
      >
        Sign this phone out of the entry
      </button>
    </section>
  );
}

function CodeChip({ label, code }: { readonly label: string; readonly code: string }) {
  return (
    <p className="codechip">
      <span className="codechip__label">{label}</span>
      <span className="codechip__code">{code || '—'}</span>
    </p>
  );
}

/** Handles only, never names: the roster is public. Newest first. */
function Roster({ event }: { readonly event: Row<'events'> }) {
  const entries = useSync((s) => s.tables.entries);
  const anglers = useSync((s) => s.tables.anglers);
  const list = useMemo(() => {
    const byEntry = new Map<string, Row<'anglers'>[]>();
    for (const a of anglers.values()) {
      if (a.event_id !== event.id) continue;
      byEntry.set(a.entry_id, [...(byEntry.get(a.entry_id) ?? []), a]);
    }
    return [...entries.values()]
      .filter((e) => e.event_id === event.id)
      .sort((a, b) => b.entry_number - a.entry_number)
      .map((entry) => {
        const people = (byEntry.get(entry.id) ?? []).sort(
          (a, b) => Number(a.role === 'partner') - Number(b.role === 'partner'),
        );
        return { entry, people };
      });
  }, [entries, anglers, event.id]);

  return (
    <section className="card" aria-labelledby="roster-title">
      <h2 className="card__title" id="roster-title">
        Registered anglers
      </h2>
      {list.length === 0 ? (
        <p className="empty">No anglers registered yet.</p>
      ) : (
        <ul className="rows">
          {list.map(({ entry, people }) => (
            <li className="row" key={entry.id}>
              <div className="row__who">
                <p className="row__name">{people.map((p) => p.handle).join(' & ')}</p>
                <p className="row__sub">
                  {entry.division === 'team' ? 'Team' : 'Solo'} ·{' '}
                  {entryNumberText(event.entry_prefix, entry.entry_number)}
                  {people.some((p) => p.big_fish) ? ' · Big Fish pot' : ''}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
