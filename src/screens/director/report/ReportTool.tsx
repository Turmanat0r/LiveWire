import { useEffect, useId, useMemo, useState } from 'react';
import { useNow } from '../../../app/useNow';
import { useBoard } from '../../../data/board';
import { eventDates } from '../../../data/selectors';
import type { Row } from '../../../data/tables';
import { useSync, useSyncEngine } from '../../../data/useSync';
import { clockText, dayHours, type ReportAngler, type ReportWarning } from '../../../domain/report';
import type { CheckIn } from '../../../domain/safety';
import { Card } from '../../../ui/Card';
import { useDirectorQueue } from '../queue';
import {
  buildReport,
  carriedDetails,
  FILER_FIELDS,
  parseReportSettings,
  settingsJson,
  withDefaults,
  type ReportModel,
  type ReportSettings,
  type TextField,
} from './model';
import { ReportSheet, reportText, SHEET_BLANK } from './ReportSheet';
import './report.css';

type Angler = ReportAngler & {
  readonly name: string;
  readonly row: Row<'anglers'>;
  readonly details: Row<'angler_private'> | undefined;
};

/** Everything the report is built from, with the director's changes not yet sent laid over it. */
export function useReportData() {
  const board = useBoard();
  const anglerRows = useSync((s) => s.tables.anglers);
  const entries = useSync((s) => s.tables.entries);
  const entryPrivate = useSync((s) => s.tables.entry_private);
  const privates = useSync((s) => s.tables.angler_private);
  const checkInRows = useSync((s) => s.tables.check_ins);
  const days = useSync((s) => s.tables.event_days);
  const reports = useSync((s) => s.tables.event_reports);
  const items = useSync((s) => s.outbox.items);
  return useMemo(() => {
    if (!board) return null;
    const { event } = board;
    const division = new Map([...entries.values()].map((e) => [e.id, e.division]));
    const paid = new Map([...entryPrivate.values()].map((e) => [e.entry_id, e.fee_paid]));
    const details = new Map([...privates.values()].map((p) => [p.angler_id, p]));
    // A residency set from this screen shows at once, before it has sent.
    const resident = new Map<string, boolean>();
    let saved = parseReportSettings(
      [...reports.values()].find((r) => r.event_id === event.id)?.settings,
    );
    let sending = false;
    for (const item of items) {
      if (item.failure !== null) continue;
      for (const step of item.steps) {
        if (step.kind !== 'call') continue;
        const a = step.args;
        if (step.fn === 'director_update_angler' && typeof a['p_angler_id'] === 'string') {
          if (typeof a['p_resident'] === 'boolean') resident.set(a['p_angler_id'], a['p_resident']);
        } else if (step.fn === 'director_save_report' && a['p_event_id'] === event.id) {
          saved = parseReportSettings(a['p_settings']);
          sending = true;
        }
      }
    }
    const anglers: Angler[] = [...anglerRows.values()]
      .filter((a) => a.event_id === event.id)
      .flatMap((a) => {
        const d = division.get(a.entry_id);
        if (!d) return [];
        const p = details.get(a.id);
        return [
          {
            id: a.id,
            division: d,
            role: a.role,
            feePaid: paid.get(a.entry_id) ?? false,
            disqualified: a.disqualified,
            resident: resident.get(a.id) ?? p?.resident ?? null,
            name: p?.full_name ?? a.handle,
            row: a,
            details: p,
          },
        ];
      });
    const checkIns: CheckIn[] = [...checkInRows.values()]
      .filter((c) => c.event_id === event.id)
      .map((c) => ({
        anglerId: c.angler_id,
        date: c.day,
        inAt: c.in_at ? Date.parse(c.in_at) : null,
        outAt: c.out_at ? Date.parse(c.out_at) : null,
      }));
    return {
      event,
      dates: eventDates(days, event.id),
      anglers,
      checkIns,
      catches: board.catches,
      species: board.species,
      saved,
      sending,
    };
  }, [board, anglerRows, entries, entryPrivate, privates, checkInRows, days, reports, items]);
}

/** Last year's filer, read once from the server when the report opens. */
function useCarried(eventId: string): ReportSettings {
  const sync = useSyncEngine();
  const [carried, setCarried] = useState<{ id: string; value: ReportSettings } | null>(null);
  useEffect(() => {
    let alive = true;
    sync.peek('event_reports', null).then(
      (rows) => {
        if (alive) setCarried({ id: eventId, value: carriedDetails(rows, eventId) });
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [sync, eventId]);
  return carried?.id === eventId ? carried.value : {};
}

/** "Due October 18, 2027: 12 days from now." */
export function dueText(model: ReportModel): string {
  if (!model.due)
    return 'This event has no fishing days set, so there is no deadline to count from.';
  const on = new Date(model.due.due).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const n = model.due.daysLeft;
  const days = (k: number) => `${String(Math.abs(k))} ${Math.abs(k) === 1 ? 'day' : 'days'}`;
  if (n < 0) return `Was due ${on}: ${days(n)} ago.`;
  if (n === 0) return `Due today, ${on}.`;
  return `Due ${on}: ${days(n)} from now.`;
}

function warningText(w: ReportWarning): string {
  const n = w.count;
  const one = n === 1;
  switch (w.kind) {
    case 'unpaid':
      return `${String(n)} ${one ? 'angler has' : 'anglers have'} no fee matched, so the “# Paid” box reads lower than the angler count. Tick ${one ? 'it' : 'them'} off under Contestants if the money did arrive.`;
    case 'residency':
      return `${String(n)} ${one ? 'angler' : 'anglers'} entered before the app asked about residency. Set ${one ? 'it' : 'them'} below: the resident and non-resident boxes do not add up until you do.`;
    case 'pending':
      return `${String(n)} ${one ? 'catch is' : 'catches are'} still waiting on review and counted as caught. Review ${one ? 'it' : 'them'} if that is not right.`;
    case 'off-days':
      return `${String(n)} ${one ? 'catch' : 'catches'} fell outside the event’s fishing days, so ${one ? 'it is' : 'they are'} in the species totals but on no day row. Usually a test entry.`;
  }
}

/** What the form has no box for, said on screen only: the sheet stays a copy of the state's form. */
function notes(model: ReportModel): string[] {
  const out: string[] = [];
  if (model.died > 0) {
    out.push(
      `Released is left blank for each day: the app records which species did not survive, not which day it happened on. Split the ${String(model.died)} across the day rows yourself.`,
    );
  }
  const split = model.sizes.small.filter((r) => r.split).map((r) => r.species);
  if (split.length) {
    out.push(
      `${split.join(', ')} turned up both under 12 inches and over 23, which no one size table has columns for. Those fish are split across both tables: every one is reported once, but the species appears on two rows.`,
    );
  }
  if (model.sizes.under8 > 0) {
    out.push(
      `${String(model.sizes.under8)} ${model.sizes.under8 === 1 ? 'fish under 8 inches is' : 'fish under 8 inches are'} in the species totals but on neither size table: the form only asks for 8 inches and up.`,
    );
  }
  out.push(
    `Boxes marked “${SHEET_BLANK}” print empty, as they would on the paper form. Fill them in above if the state needs them.`,
  );
  return out;
}

const LEVELS = ['Up', 'Down', 'Normal'] as const;
const CLARITY = ['Clear', 'Semi-turbid', 'Muddy'] as const;

/**
 * The old app's Montana FWP contest report. Every box on the state's form the
 * tournament can answer is worked out from the roster, the check-ins and the
 * catch log; the rest is typed here, saved with the event over the 30 days the
 * state allows, and carried into next year's report where it does not change.
 */
export function ReportTool() {
  const data = useReportData();
  if (!data) return null;
  return <Report key={data.event.id} data={data} />;
}

function Report({ data }: { readonly data: NonNullable<ReturnType<typeof useReportData>> }) {
  const queue = useDirectorQueue();
  const now = useNow();
  const ids = useId();
  const { event } = data;
  const carried = useCarried(event.id);
  const [draft, setDraft] = useState<ReportSettings>({});
  const [copied, setCopied] = useState<string | null>(null);
  const settings = withDefaults({ ...data.saved, ...draft }, carried, event);
  const model = buildReport({
    timeZone: event.time_zone,
    dates: data.dates,
    anglers: data.anglers,
    checkIns: data.checkIns,
    catches: data.catches,
    species: data.species,
    settings,
    now,
  });
  const today = new Date(now).toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });
  // Last year's filer shows straight away, but it is not this event's until
  // it is saved: that counts as a change too.
  const carriedOnly = FILER_FIELDS.some(
    (f) => carried[f] !== undefined && data.saved[f] === undefined && draft[f] === undefined,
  );
  const unsaved = Object.keys(draft).length > 0 || carriedOnly;
  const derivedDays = dayHours(data.checkIns, data.dates);

  const set = (field: TextField, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setCopied(null);
  };

  const text = (
    field: TextField,
    label: string,
    more: { placeholder?: string; type?: string; inputMode?: 'numeric' | 'decimal' } = {},
  ) => (
    <div className="field">
      <label className="field__label" htmlFor={`${ids}-${field}`}>
        {label}
      </label>
      <input
        id={`${ids}-${field}`}
        type={more.type ?? 'text'}
        inputMode={more.inputMode}
        placeholder={more.placeholder}
        value={settings[field] ?? ''}
        onChange={(e) => {
          set(field, e.target.value);
        }}
      />
    </div>
  );

  function save() {
    queue(`Save ${event.name}’s contest report`, [
      {
        kind: 'call',
        fn: 'director_save_report',
        args: {
          p_event_id: event.id,
          p_settings: settingsJson({ ...carried, ...data.saved, ...draft, savedAt: Date.now() }),
        },
      },
    ]);
    setDraft({});
  }

  function setResident(a: Angler, resident: boolean) {
    const p = a.details;
    queue(`${a.name}: ${resident ? 'Montana resident' : 'non-resident'}`, [
      {
        kind: 'call',
        fn: 'director_update_angler',
        args: {
          p_angler_id: a.id,
          p_full_name: p?.full_name ?? a.name,
          p_phone: p?.phone ?? '',
          p_handle: a.row.handle,
          p_big_fish: a.row.big_fish,
          p_resident: resident,
          p_emergency_name: p?.emergency_name ?? '',
          p_emergency_phone: p?.emergency_phone ?? '',
        },
      },
    ]);
  }

  const unknown = data.anglers.filter((a) => a.resident === null);

  return (
    <Card title="Montana FWP contest report">
      <p className="hint">
        Every box on the state’s form that this tournament can answer, worked out from the roster,
        the check-ins and the catch log. Fill in the rest below and print the sheet: it is laid out
        in the same order as the paper form, so it copies across line by line.
      </p>
      <p className={model.due && model.due.daysLeft < 0 ? 'err' : 'ok'}>{dueText(model)}</p>
      {model.warnings.length ? (
        <ul className="report-warnings" aria-label="To settle before filing">
          {model.warnings.map((w) => (
            <li key={w.kind} className="report-warning">
              {warningText(w)}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="report-save">
        <button
          className="button button--secondary"
          type="button"
          disabled={!unsaved}
          onClick={save}
        >
          Save report
        </button>
        <span className="hint">
          {Object.keys(draft).length > 0
            ? 'Unsaved changes. The sheet below already shows them.'
            : carriedOnly
              ? 'Last year’s filer is filled in but not saved for this event yet.'
              : data.sending
                ? 'Saved on this phone; waiting to send.'
                : data.saved.savedAt
                  ? 'Saved with the event.'
                  : 'Nothing saved for this event yet.'}
        </span>
      </div>

      <hr className="divider" />
      <section className="money-part" aria-label="Who is filing">
        <h3 className="card__subtitle">Who is filing</h3>
        <p className="hint">
          Saved with the event, and next year’s report opens holding these same answers.
        </p>
        {text('filerName', 'Form completed by', { placeholder: 'Your full name' })}
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-filerAddress`}>
            Mailing address
          </label>
          <textarea
            id={`${ids}-filerAddress`}
            rows={2}
            placeholder="Street, city, state, ZIP"
            value={settings.filerAddress ?? ''}
            onChange={(e) => {
              set('filerAddress', e.target.value);
            }}
          />
        </div>
        <div className="event-form__pair">
          {text('filerEmail', 'Email address', { type: 'email', placeholder: 'you@example.com' })}
          {text('filerPhone', 'Telephone', { type: 'tel', placeholder: '406-555-0100' })}
        </div>
        <div className="event-form__pair">
          {text('sponsor', 'Contest sponsor', { placeholder: 'Sponsoring business or club' })}
          {text('region', 'FWP region', { placeholder: '3', inputMode: 'numeric' })}
        </div>
        <p className="hint">
          The region is printed on the contest permit FWP issued you: copy it from there rather than
          guessing.
        </p>
      </section>

      <hr className="divider" />
      <section className="money-part" aria-label="The water">
        <h3 className="card__subtitle">The water</h3>
        {text('waterbody', 'Waterbody', { placeholder: 'Canyon Ferry Reservoir' })}
        <p className="hint">
          The name FWP knows it by, which is usually broader than the stretch you fished.
        </p>
        <div className="event-form__pair">
          {text('boats', 'Number of boats', {
            inputMode: 'numeric',
            placeholder: String(model.counts.anglers),
          })}
          {text('minLength', 'Minimum length (in)', { inputMode: 'decimal', placeholder: 'none' })}
        </div>
        <p className="hint">
          Boats is one per angler unless you say otherwise, which is what a kayak field is. Minimum
          length is the shortest scoring fish your rules allow; leave it empty if there is no floor.
        </p>
      </section>

      <hr className="divider" />
      <section className="money-part" aria-label="Hours fished">
        <h3 className="card__subtitle">Hours fished</h3>
        <p className="hint">
          From the first check-in to the last check-out of each day. Type over either one if the
          times on your permit differ; empty a box to go back to the check-ins.
        </p>
        {model.days.length === 0 ? (
          <p className="empty">This event has no fishing days set.</p>
        ) : (
          <ul className="report-days">
            {model.days.map((d) => {
              const derived = derivedDays.find((x) => x.dateKey === d.dateKey);
              const typed = settings.hours?.[d.dateKey] ?? {};
              const setTime = (which: 'start' | 'stop', value: string) => {
                setDraft((was) => {
                  const hours = { ...(was.hours ?? data.saved.hours ?? {}) };
                  hours[d.dateKey] = { ...(hours[d.dateKey] ?? {}), [which]: value };
                  return { ...was, hours };
                });
                setCopied(null);
              };
              return (
                <li key={d.dateKey} className="report-day">
                  <p className="report-day__head">
                    <strong>Day {d.day}</strong>
                    <span className="hint">
                      {d.hours === null ? 'no total yet' : `${d.hours.toFixed(2)} hours`}
                    </span>
                  </p>
                  <div className="event-form__pair">
                    <div className="field">
                      <label className="field__label" htmlFor={`${ids}-start-${d.dateKey}`}>
                        Day {d.day} start
                      </label>
                      <input
                        id={`${ids}-start-${d.dateKey}`}
                        type="time"
                        value={
                          typed.start !== undefined && typed.start !== ''
                            ? typed.start
                            : clockText(derived?.start ?? null, event.time_zone)
                        }
                        onChange={(e) => {
                          setTime('start', e.target.value);
                        }}
                      />
                    </div>
                    <div className="field">
                      <label className="field__label" htmlFor={`${ids}-stop-${d.dateKey}`}>
                        Day {d.day} stop
                      </label>
                      <input
                        id={`${ids}-stop-${d.dateKey}`}
                        type="time"
                        value={
                          typed.stop !== undefined && typed.stop !== ''
                            ? typed.stop
                            : clockText(derived?.stop ?? null, event.time_zone)
                        }
                        onChange={(e) => {
                          setTime('stop', e.target.value);
                        }}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <hr className="divider" />
      <section className="money-part" aria-label="Fish that did not survive">
        <h3 className="card__subtitle">Fish that did not survive</h3>
        <p className="hint">
          Catch, photo, release: the app counts every fish as swimming away, so there is nothing to
          change here unless one did not.
        </p>
        {model.species.length === 0 ? (
          <p className="empty">No catches logged yet.</p>
        ) : (
          <div className="event-form__pair">
            {model.species.map((s) => (
              <div key={s.species} className="field">
                <label className="field__label" htmlFor={`${ids}-died-${s.species}`}>
                  {s.species}: {s.caught} caught
                </label>
                <input
                  id={`${ids}-died-${s.species}`}
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={settings.died?.[s.species] ? String(settings.died[s.species]) : ''}
                  onChange={(e) => {
                    const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                    setDraft((was) => ({
                      ...was,
                      died: { ...(was.died ?? data.saved.died ?? {}), [s.species]: n },
                    }));
                    setCopied(null);
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <hr className="divider" />
      <section className="money-part" aria-label="Residency">
        <h3 className="card__subtitle">Residency</h3>
        {unknown.length === 0 ? (
          <p className="hint">
            {model.residency.resident} Montana{' '}
            {model.residency.resident === 1 ? 'resident' : 'residents'},{' '}
            {model.residency.nonresident} non-
            {model.residency.nonresident === 1 ? 'resident' : 'residents'}. Nothing outstanding.
            Change one under Contestants, from their profile.
          </p>
        ) : (
          <ul className="report-residency" aria-label="Residency not asked">
            {unknown.map((a) => (
              <li key={a.id} className="report-residency__row">
                <span>{a.name}</span>
                <span className="actions">
                  <button
                    className="button button--small"
                    type="button"
                    onClick={() => {
                      setResident(a, true);
                    }}
                  >
                    Montana
                  </button>
                  <button
                    className="button button--small"
                    type="button"
                    onClick={() => {
                      setResident(a, false);
                    }}
                  >
                    Non-resident
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <hr className="divider" />
      <section className="money-part" aria-label="Conditions">
        <h3 className="card__subtitle">Conditions (optional on the form)</h3>
        <div className="event-form__pair">
          {text('airTemp', 'Air temperature (°F)', { inputMode: 'numeric', placeholder: '62' })}
          {text('waterTemp', 'Water temperature (°F)', { inputMode: 'numeric', placeholder: '58' })}
        </div>
        <div className="event-form__pair">
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-waterLevel`}>
              Water level
            </label>
            <select
              id={`${ids}-waterLevel`}
              value={settings.waterLevel ?? ''}
              onChange={(e) => {
                set('waterLevel', e.target.value);
              }}
            >
              <option value="">Not recorded</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${ids}-clarity`}>
              Water clarity
            </label>
            <select
              id={`${ids}-clarity`}
              value={settings.clarity ?? ''}
              onChange={(e) => {
                set('clarity', e.target.value);
              }}
            >
              <option value="">Not recorded</option>
              {CLARITY.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <hr className="divider" />
      <section className="money-part" aria-label="Notes">
        <h3 className="card__subtitle">Notes</h3>
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-otherInfo`}>
            Other information
          </label>
          <textarea
            id={`${ids}-otherInfo`}
            rows={3}
            placeholder="Anything the permit asked you to report back"
            value={settings.otherInfo ?? ''}
            onChange={(e) => {
              set('otherInfo', e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-comments`}>
            Comments
          </label>
          <textarea
            id={`${ids}-comments`}
            rows={3}
            placeholder="Optional"
            value={settings.comments ?? ''}
            onChange={(e) => {
              set('comments', e.target.value);
            }}
          />
        </div>
      </section>

      <hr className="divider" />
      <section className="money-part" aria-label="The sheet">
        <h3 className="card__subtitle">The sheet</h3>
        <p className="hint">
          The state’s form, rebuilt box for box. Print it and you have a copy to send and one to
          keep.
        </p>
        {notes(model).map((n) => (
          <p key={n} className="report-note">
            {n}
          </p>
        ))}
        <ReportSheet model={model} eventName={event.name} today={today} />
        <div className="actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              window.print();
            }}
          >
            Print / Save as PDF
          </button>
          <button
            className="button button--small"
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(reportText(model, event.name, today)).then(
                () => {
                  setCopied('Copied. Paste it into an email to the region office.');
                },
                () => {
                  setCopied('This browser would not copy. Print to PDF instead.');
                },
              );
            }}
          >
            Copy as text
          </button>
        </div>
        {copied ? (
          <p className="hint" role="status">
            {copied}
          </p>
        ) : null}
        <p className="hint">For a PDF, choose Print and pick “Save as PDF” as the printer.</p>
      </section>
    </Card>
  );
}
