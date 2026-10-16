import { useId, useState } from 'react';
import {
  findContestants,
  outstandingFees,
  type Contestant,
  type DayStatus,
} from '../../data/director';
import { useSync } from '../../data/useSync';
import { dayLabelText, timeOfDayText } from '../../domain/time';
import { Card } from '../../ui/Card';
import { inchesText } from '../board/StandingsScreen';
import { StatusBadge } from '../catches/CatchCard';
import { callHref } from '../safety/words';
import { useDirectorQueue } from './queue';

type Filter = 'all' | 'solo' | 'team' | 'unpaid' | 'dq';

const FILTERS: readonly { readonly id: Filter; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'solo', label: 'Solo' },
  { id: 'team', label: 'Team' },
  { id: 'unpaid', label: 'Fee outstanding' },
  { id: 'dq', label: 'Disqualified' },
];

function filtered(list: readonly Contestant[], filter: Filter): readonly Contestant[] {
  switch (filter) {
    case 'all':
      return list;
    case 'solo':
    case 'team':
      return list.filter((c) => c.division === filter);
    case 'unpaid':
      return list.filter((c) => !c.feePaid);
    case 'dq':
      return list.filter((c) => c.disqualified);
  }
}

/** "Day 1 on water · Day 2 not in" */
function daysText(days: readonly DayStatus[]): string {
  return days.map((d, i) => `Day ${String(i + 1)} ${d}`).join(' · ');
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * Every registered angler, findable by name, handle, phone or Tournament ID,
 * and what the director does about them: fees, disqualification, details,
 * check-ins, removal. An angler who has lost their Tournament ID asks the
 * director, who finds them here and reads it to them.
 */
export function Contestants({ list }: { readonly list: readonly Contestant[] }) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const shown = findContestants(filtered(list, filter), query);
  return (
    <Card title="Contestants">
      <p className="hint">
        Every registered angler, with their Tournament ID. An angler who has lost theirs can ask
        you: find them here by name or phone, check it is them, and read it to them. With it and
        their phone number they can bring their entry onto any phone, from Register. Tap an angler
        for their fee, check-ins and the rest.
      </p>
      <FeeBanner list={list} />
      <div className="field">
        <label className="field__label" htmlFor={searchId}>
          Find an angler
        </label>
        <input
          id={searchId}
          type="search"
          placeholder="Name, phone, handle or Tournament ID"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
        />
      </div>
      <div className="contestant-filters" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => {
              setFilter(f.id);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="empty">
          {list.length === 0 ? 'No anglers registered yet.' : 'No anglers match.'}
        </p>
      ) : (
        <ul className="crows" aria-label="Anglers">
          {shown.map((c) => (
            <ContestantRow
              key={c.anglerId}
              c={c}
              open={open === c.anglerId}
              onToggle={() => {
                setOpen(open === c.anglerId ? null : c.anglerId);
              }}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Reconciling fees is desk work, done once registration closes: one line, one button. */
function FeeBanner({ list }: { readonly list: readonly Contestant[] }) {
  const event = useSync((s) => s.event);
  const queue = useDirectorQueue();
  if (!event) return null;
  const owed = outstandingFees(list, {
    solo: event.fee_solo_cents,
    team: event.fee_team_cents,
    bigFish: event.fee_big_fish_cents,
  });
  const n = owed.entries.length;
  if (n === 0) return null;
  return (
    <div className="fp fp--review">
      <p className="fp__head">
        <span className="fp__title">Entry fees outstanding · {money(owed.cents)}</span>
      </p>
      <p className="fp__item">
        <span className="fp__dot fp__dot--review" aria-hidden="true" />
        <span>
          {n} {n === 1 ? 'entry has' : 'entries have'} no payment matched to{' '}
          {n === 1 ? 'it' : 'them'}. They still score and place: this only affects the payout total
          and the state contest report.
          <br />
          {owed.entries.map((e) => e.names).join(', ')}
        </span>
      </p>
      <div className="actions">
        <button
          className="button button--small"
          type="button"
          onClick={() => {
            const sure = window.confirm(
              `Mark all ${String(n)} outstanding ${n === 1 ? 'entry' : 'entries'} as paid?\n\nThat is ${money(owed.cents)} added to the pools. Only do this once the money is actually in the account.`,
            );
            if (!sure) return;
            queue(
              `Mark ${String(n)} ${n === 1 ? 'fee' : 'fees'} received`,
              owed.entries.map((e) => ({
                kind: 'call',
                fn: 'director_set_fee_paid',
                args: { p_entry_id: e.entryId, p_paid: true },
              })),
            );
          }}
        >
          Mark all {n} received
        </button>
      </div>
    </div>
  );
}

type Panel = 'none' | 'dq' | 'edit' | 'remove';

function ContestantRow({
  c,
  open,
  onToggle,
}: {
  readonly c: Contestant;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const bodyId = useId();
  const tone = c.disqualified
    ? ' crow--dq'
    : c.rank === 1
      ? ' crow--leader'
      : !c.feePaid
        ? ' crow--unpaid'
        : '';
  return (
    <li className={`crow${tone}`}>
      <button
        className="crow__head"
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className="crow__rank">{c.rank || '—'}</span>
        <span className="crow__id">
          <span className="crow__name">
            {c.name}
            {c.disqualified ? <span className="crow__tag crow__tag--dq">DQ</span> : null}
            {c.feePaid ? null : <span className="crow__tag">Fee outstanding</span>}
          </span>
          <span className="crow__code">
            Tournament ID <strong>{c.code || 'none'}</strong>
            {c.teamCode ? (
              <>
                {' '}
                · Team <strong>{c.teamCode}</strong>
              </>
            ) : null}
          </span>
          <span className="crow__sub">
            {c.entryNumber} · {c.handle} ·{' '}
            {c.division === 'team'
              ? `Team with ${c.partner ?? '—'}${c.role === 'partner' ? ' (partner)' : ''}`
              : 'Solo'}
            {c.bigFish ? ' · Big Fish' : ''}
          </span>
          <span className="crow__sub">
            {c.phone || 'No phone on file'} · {daysText(c.days)}
          </span>
          {c.disqualified && c.dqReason ? (
            <span className="crow__note">Disqualified: {c.dqReason}</span>
          ) : null}
          {c.sending ? <span className="crow__sub">Waiting to send.</span> : null}
        </span>
        <span className="crow__best">
          <strong>{c.best ? inchesText(c.best) : '—'}</strong>
          <span className="crow__best-label">best</span>
        </span>
      </button>
      {open ? <ContestantBody id={bodyId} c={c} /> : null}
    </li>
  );
}

function ContestantBody({ id, c }: { readonly id: string; readonly c: Contestant }) {
  const queue = useDirectorQueue();
  const [panel, setPanel] = useState<Panel>('none');
  const count = (s: string) => c.fish.filter((f) => f.status === s).length;
  return (
    <div className="crow__body" id={id}>
      <dl className="cstats">
        <div>
          <dt>Approved</dt>
          <dd>{count('approved')}</dd>
        </div>
        <div>
          <dt>Pending</dt>
          <dd>{count('pending')}</dd>
        </div>
        <div>
          <dt>Rejected</dt>
          <dd>{count('rejected')}</dd>
        </div>
        <div>
          <dt>Standing</dt>
          <dd>{c.disqualified ? 'DQ' : c.rank || '—'}</dd>
        </div>
      </dl>
      {c.fish.length === 0 ? (
        <p className="hint">No catches submitted.</p>
      ) : (
        <ul className="cfish" aria-label={`${c.name}’s catches`}>
          {c.fish.map((f) => (
            <li key={f.id}>
              <span>
                {f.species} · {inchesText(f.length_inches)}
              </span>
              <StatusBadge status={f.status} />
            </li>
          ))}
        </ul>
      )}
      {c.phone ? (
        <p className="crow__sub">
          Call <a href={callHref(c.phone)}>{c.phone}</a>
          {c.emergencyPhone ? (
            <>
              {' '}
              · Emergency: {c.emergencyName || 'contact'}{' '}
              <a href={callHref(c.emergencyPhone)}>{c.emergencyPhone}</a>
            </>
          ) : null}
        </p>
      ) : null}

      <CheckIns c={c} />

      {/* Money, and only money: it decides nothing about whether they compete. */}
      <div className="cdq">
        {c.feePaid ? (
          <div className="actions">
            <span className="crow__sub">Fee received.</span>
            <button
              className="button button--small"
              type="button"
              onClick={() => {
                queue(`Fee outstanding: ${c.name}`, [
                  {
                    kind: 'call',
                    fn: 'director_set_fee_paid',
                    args: { p_entry_id: c.entryId, p_paid: false },
                  },
                ]);
              }}
            >
              Mark fee outstanding
            </button>
          </div>
        ) : (
          <>
            <p className="cdq__warn">
              No entry fee matched to {c.name} yet. They score and place normally. This only affects
              the payout total and the state contest report.
            </p>
            <button
              className="button button--small"
              type="button"
              onClick={() => {
                queue(`Fee received: ${c.name}`, [
                  {
                    kind: 'call',
                    fn: 'director_set_fee_paid',
                    args: { p_entry_id: c.entryId, p_paid: true },
                  },
                ]);
              }}
            >
              Fee received
            </button>
          </>
        )}
      </div>

      {panel === 'dq' ? (
        <Disqualify
          c={c}
          onDone={() => {
            setPanel('none');
          }}
        />
      ) : panel === 'edit' ? (
        <EditAngler
          c={c}
          onDone={() => {
            setPanel('none');
          }}
        />
      ) : panel === 'remove' ? (
        <RemoveEntry
          c={c}
          onDone={() => {
            setPanel('none');
          }}
        />
      ) : (
        <div className="actions">
          {c.disqualified ? (
            <button
              className="button button--small"
              type="button"
              onClick={() => {
                queue(`Reinstate ${c.name}`, [
                  { kind: 'call', fn: 'director_reinstate', args: { p_angler_id: c.anglerId } },
                ]);
              }}
            >
              Reinstate
            </button>
          ) : (
            <button
              className="button button--small button--danger"
              type="button"
              onClick={() => {
                setPanel('dq');
              }}
            >
              Disqualify
            </button>
          )}
          <button
            className="button button--small"
            type="button"
            onClick={() => {
              setPanel('edit');
            }}
          >
            Edit profile
          </button>
          <button
            className="button button--small button--danger"
            type="button"
            onClick={() => {
              setPanel('remove');
            }}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

/** Check someone in or out for them: a phone gone flat, a tired angler at the ramp. */
function CheckIns({ c }: { readonly c: Contestant }) {
  const queue = useDirectorQueue();
  const event = useSync((s) => s.event);
  const tz = event?.time_zone ?? 'America/Denver';
  const set = (day: string, inAt: string | null, outAt: string | null, what: string) => {
    queue(`${what}: ${c.name}`, [
      {
        kind: 'call',
        fn: 'director_set_check_in',
        args: { p_angler_id: c.anglerId, p_day: day, p_in_at: inAt, p_out_at: outAt },
      },
    ]);
  };
  if (c.dates.length === 0) return null;
  return (
    <ul className="cdays" aria-label={`${c.name}’s check-ins`}>
      {c.dates.map((day, i) => {
        const t = c.times[i] ?? { inAt: null, outAt: null };
        const stamp = (iso: string) => timeOfDayText(Date.parse(iso), tz);
        // The moment the button is pressed.
        const at = () => new Date().toISOString();
        return (
          <li key={day}>
            <span>
              <strong>{dayLabelText(day)}</strong>{' '}
              {t.inAt
                ? `in ${stamp(t.inAt)}${t.outAt ? ` · out ${stamp(t.outAt)}` : ' · on the water'}`
                : 'not checked in'}
            </span>
            <span className="actions">
              {!t.inAt ? (
                <button
                  className="button button--small"
                  type="button"
                  onClick={() => {
                    set(day, at(), null, 'Check in');
                  }}
                >
                  Check in now
                </button>
              ) : !t.outAt ? (
                <>
                  <button
                    className="button button--small"
                    type="button"
                    onClick={() => {
                      set(day, t.inAt, at(), 'Check out');
                    }}
                  >
                    Check out now
                  </button>
                  <button
                    className="button button--small"
                    type="button"
                    onClick={() => {
                      set(day, null, null, 'Undo check-in');
                    }}
                  >
                    Undo check-in
                  </button>
                </>
              ) : (
                <button
                  className="button button--small"
                  type="button"
                  onClick={() => {
                    set(day, t.inAt, null, 'Undo check-out');
                  }}
                >
                  Undo check-out
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Disqualify({ c, onDone }: { readonly c: Contestant; readonly onDone: () => void }) {
  const queue = useDirectorQueue();
  const reasonId = useId();
  const [reason, setReason] = useState('');
  return (
    <div className="cdq">
      <p className="cdq__warn">
        Disqualify {c.name}? This removes them from the standings, the Big Fish pot, and payout
        placements. Their entry fee stays in the pool. Their catches are kept on record and this can
        be undone.
      </p>
      <div className="field">
        <label className="field__label" htmlFor={reasonId}>
          Reason (optional, kept on record)
        </label>
        <input
          id={reasonId}
          type="text"
          maxLength={200}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
        />
      </div>
      <div className="actions">
        <button
          className="button button--small button--danger"
          type="button"
          onClick={() => {
            queue(`Disqualify ${c.name}`, [
              {
                kind: 'call',
                fn: 'director_disqualify',
                args: { p_angler_id: c.anglerId, p_reason: reason.trim() },
              },
            ]);
            onDone();
          }}
        >
          Yes, disqualify
        </button>
        <button className="button button--small" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Name, phone, handle, Big Fish, residency and emergency contact. Division is
 * deliberately absent: moving between solo and team makes or unmakes a
 * partner and re-prices the entry. Remove the entry and register it again.
 */
function EditAngler({ c, onDone }: { readonly c: Contestant; readonly onDone: () => void }) {
  const queue = useDirectorQueue();
  const ids = {
    name: useId(),
    phone: useId(),
    handle: useId(),
    eName: useId(),
    ePhone: useId(),
  };
  const [name, setName] = useState(c.name);
  const [phone, setPhone] = useState(c.phone);
  const [handle, setHandle] = useState(c.handle);
  const [bigFish, setBigFish] = useState(c.bigFish);
  const [resident, setResident] = useState(c.resident);
  const [eName, setEName] = useState(c.emergencyName);
  const [ePhone, setEPhone] = useState(c.emergencyPhone);
  const [problem, setProblem] = useState<string | null>(null);
  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    type = 'text',
  ) => (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => {
          set(e.target.value);
        }}
      />
    </div>
  );
  return (
    <div className="cdq">
      {field(ids.name, 'Real name', name, setName)}
      {field(ids.phone, 'Phone', phone, setPhone, 'tel')}
      {field(ids.handle, 'Handle', handle, setHandle)}
      {field(ids.eName, 'Emergency contact', eName, setEName)}
      {field(ids.ePhone, 'Emergency contact phone', ePhone, setEPhone, 'tel')}
      <label className="tick">
        <input
          type="checkbox"
          checked={bigFish}
          onChange={(e) => {
            setBigFish(e.target.checked);
          }}
        />
        In the Big Fish pot
      </label>
      <label className="tick">
        <input
          type="checkbox"
          checked={resident}
          onChange={(e) => {
            setResident(e.target.checked);
          }}
        />
        Montana resident
      </label>
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
      <div className="actions">
        <button
          className="button button--small"
          type="button"
          onClick={() => {
            if (!name.trim() || !handle.trim()) {
              setProblem('A name and a handle are both needed.');
              return;
            }
            queue(`Edit ${name.trim()}`, [
              {
                kind: 'call',
                fn: 'director_update_angler',
                args: {
                  p_angler_id: c.anglerId,
                  p_full_name: name.trim(),
                  p_phone: phone.trim(),
                  p_handle: handle.trim(),
                  p_big_fish: bigFish,
                  p_resident: resident,
                  p_emergency_name: eName.trim(),
                  p_emergency_phone: ePhone.trim(),
                },
              },
            ]);
            onDone();
          }}
        >
          Save
        </button>
        <button className="button button--small" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Says exactly what goes before it goes; disqualifying keeps the record instead. */
function RemoveEntry({ c, onDone }: { readonly c: Contestant; readonly onDone: () => void }) {
  const queue = useDirectorQueue();
  const n = c.fish.length;
  return (
    <div className="cdq">
      <p className="cdq__warn">
        Remove {c.name}
        {c.division === 'team' ? ` and their partner ${c.partner ?? ''}` : ''} completely? This
        permanently deletes the entry and {n} catch{n === 1 ? '' : 'es'}
        {c.division === 'team' ? ' of theirs, and their partner’s' : ''}. Their chat posts stay,
        unnamed. It cannot be undone and it changes the pools. To take someone out of the standings
        while keeping their record and their entry fee, disqualify them instead.
      </p>
      <div className="actions">
        <button
          className="button button--small button--danger"
          type="button"
          onClick={() => {
            queue(`Remove ${c.entryNumber}`, [
              { kind: 'call', fn: 'director_remove_entry', args: { p_entry_id: c.entryId } },
            ]);
            onDone();
          }}
        >
          Yes, remove permanently
        </button>
        <button className="button button--small" type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}
