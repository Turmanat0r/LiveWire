import { useEffect, useId, useState } from 'react';
import { failureText } from '../../app/failureText';
import { failureOf, type Json } from '../../data/remote';
import type { Row } from '../../data/tables';
import { useEventDates } from '../../data/selectors';
import { useSync, useSyncEngine } from '../../data/useSync';
import { boundaryIsUsable, parseBoundary } from '../../domain/geo';
import { isCompletePhone } from '../../domain/identity';
import { dateRangeText } from '../../domain/time';
import { Card } from '../../ui/Card';
import {
  courseJson,
  draftFrom,
  eventArgs,
  newDraft,
  TIME_ZONES,
  type EventDraft,
} from './eventForm';
import { CourseEditor } from './CourseEditor';
import { presetCeiling, SPECIES_PRESETS } from './species';

/** What an event is set up with besides its own row. */
interface Setup {
  readonly days: readonly string[];
  readonly species: readonly Row<'event_species'>[];
  readonly safety: Row<'event_safety'> | null;
}

const NEW = 'new';

/** Everything the director changes here needs signal: a mistake is said at once, by the box it is in. */
function problemOf(error: unknown, doing: string): string {
  return failureText(failureOf(error), doing);
}

/**
 * The old app's Event tool: which tournament every phone is on, every event
 * this app knows about, and each one's details, scoring species and the
 * director's number for the Safety screen. Next year's event is set up here
 * without the field noticing, until it is made the live one.
 */
export function EventTool() {
  const live = useSync((s) => s.event);
  const rows = useSync((s) => s.tables.events);
  const liveDates = useEventDates(live);
  const [editing, setEditing] = useState<string>(live?.id ?? NEW);
  const [added, setAdded] = useState<string | null>(null);
  const events = [...rows.values()].sort(
    (x, y) =>
      Number(y.is_current) - Number(x.is_current) ||
      Number(x.archived) - Number(y.archived) ||
      y.created_at.localeCompare(x.created_at),
  );
  const chosen = events.find((e) => e.id === editing) ?? null;
  return (
    <Card title="Event">
      <p className="hint">
        Every phone follows the live event, so change it once and the whole field moves together.
        Records stay with the event they were logged under: switching never mixes two fields, and
        switching back brings the first one up exactly as it was.
      </p>
      <EventList
        events={events}
        live={live}
        liveDates={liveDates}
        editing={chosen?.id ?? NEW}
        onEdit={(id) => {
          setEditing(id);
          setAdded(null);
        }}
      />
      <hr className="divider" />
      {added && chosen?.id === added ? (
        <p className="ok" role="status">
          Added. Nothing changes for the field until you make it the live event. Set its species and
          safety number below.
        </p>
      ) : null}
      {chosen ? (
        <EventSetup key={chosen.id} event={chosen} isLive={chosen.id === live?.id} />
      ) : (
        <NewEvent
          live={live}
          onAdded={(id) => {
            setEditing(id);
            setAdded(id);
          }}
        />
      )}
    </Card>
  );
}

function EventList({
  events,
  live,
  liveDates,
  editing,
  onEdit,
}: {
  readonly events: readonly Row<'events'>[];
  readonly live: Row<'events'> | null;
  readonly liveDates: readonly string[];
  readonly editing: string;
  readonly onEdit: (id: string) => void;
}) {
  const sync = useSyncEngine();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function act(
    doing: string,
    fn: 'director_set_current_event' | 'director_archive_event',
    args: Record<string, Json>,
  ) {
    setBusy(true);
    setProblem(null);
    try {
      await sync.call(fn, args);
      await sync.refreshEvents();
    } catch (error) {
      setProblem(problemOf(error, doing));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="money-part" aria-labelledby={`${id}-head`}>
      <h3 className="card__subtitle" id={`${id}-head`}>
        All events
      </h3>
      <p className="hint">
        Archiving takes an event out of the way without touching a single record. Restore it and it
        comes back exactly as it was.
      </p>
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
      <ul className="evs" aria-label="Events">
        {events.map((e) => (
          <li key={e.id} className={e.id === editing ? 'ev ev--editing' : 'ev'}>
            <p className="ev__name">
              <strong>{e.name}</strong>{' '}
              {e.is_current ? <span className="ev__tag ev__tag--live">Live</span> : null}
              {e.archived ? <span className="ev__tag">Archived</span> : null}
            </p>
            <p className="ev__sub">
              Entries {e.entry_prefix}-001 and up
              {e.is_current && liveDates.length ? ` · ${dateRangeText(liveDates)}` : ''}
            </p>
            <div className="actions">
              {e.id === editing ? (
                <span className="ev__editing">Editing below</span>
              ) : (
                <button
                  className="button button--small"
                  type="button"
                  onClick={() => {
                    onEdit(e.id);
                  }}
                >
                  Edit
                </button>
              )}
              {!e.is_current && !e.archived ? (
                <button
                  className="button button--small"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const sure = window.confirm(
                      `Make ${e.name} the live event?\n\nEvery phone moves to it straight away.${
                        live
                          ? ` ${live.name} keeps its records, and switching back brings it up exactly as it was.`
                          : ''
                      }`,
                    );
                    if (sure)
                      void act('Switching the live event', 'director_set_current_event', {
                        p_event_id: e.id,
                      });
                  }}
                >
                  Make live
                </button>
              ) : null}
              {!e.is_current ? (
                <button
                  className="button button--small"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void act(
                      e.archived ? 'Restoring the event' : 'Archiving the event',
                      'director_archive_event',
                      {
                        p_event_id: e.id,
                        p_archived: !e.archived,
                      },
                    );
                  }}
                >
                  {e.archived ? 'Restore' : 'Archive'}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {editing === NEW ? null : (
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            onEdit(NEW);
          }}
        >
          Add an event
        </button>
      )}
    </section>
  );
}

function NewEvent({
  live,
  onAdded,
}: {
  readonly live: Row<'events'> | null;
  readonly onAdded: (id: string) => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const course = live ? parseBoundary(live.course) : null;
  return (
    <section className="money-part" aria-label="Add an event">
      <h3 className="card__subtitle">Add an event</h3>
      <p className="hint">
        Set up next year’s tournament here. Nothing about the live event changes until you make the
        new one live.
      </p>
      <DetailsForm
        id={id}
        start={newDraft(live)}
        copyCourse={course && boundaryIsUsable(course) ? courseJson(course) : null}
        submit="Add event"
        onSaved={() => {
          onAdded(id);
        }}
      />
    </section>
  );
}

/** One event's details, species and safety number. */
function EventSetup({
  event,
  isLive,
}: {
  readonly event: Row<'events'>;
  readonly isLive: boolean;
}) {
  const setup = useSetup(event.id, isLive);
  return (
    <>
      <section className="money-part" aria-label="Event details">
        <h3 className="card__subtitle">
          {event.name}
          {isLive ? ' (live)' : ''}
        </h3>
        {setup.state === 'loading' ? (
          <p className="hint">Reading this event’s days and species…</p>
        ) : setup.state === 'failed' ? (
          <>
            <p className="err" role="alert">
              {setup.problem}
            </p>
            <button
              className="button button--small"
              type="button"
              onClick={() => void setup.reload()}
            >
              Try again
            </button>
          </>
        ) : (
          <DetailsForm
            id={event.id}
            start={draftFrom(event, setup.value.days)}
            copyCourse={null}
            submit="Save details"
            onSaved={() => void setup.reload()}
          />
        )}
      </section>
      <hr className="divider" />
      <CourseEditor event={event} isLive={isLive} />
      {setup.state === 'ready' ? (
        <>
          <hr className="divider" />
          <SpeciesEditor
            eventId={event.id}
            species={setup.value.species}
            onChanged={setup.reload}
          />
          <hr className="divider" />
          <SafetyContact eventId={event.id} safety={setup.value.safety} onChanged={setup.reload} />
        </>
      ) : null}
    </>
  );
}

type Loaded = { readonly reload: () => Promise<void> } & (
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly problem: string }
  | { readonly state: 'ready'; readonly value: Setup }
);

/**
 * The live event's setup comes from this phone's copy. Another event's is
 * read from the server when it is opened, and again after each change.
 */
function useSetup(eventId: string, isLive: boolean): Loaded {
  const sync = useSyncEngine();
  const dayRows = useSync((s) => s.tables.event_days);
  const speciesRows = useSync((s) => s.tables.event_species);
  const safetyRows = useSync((s) => s.tables.event_safety);
  const [version, setVersion] = useState(0);
  const [peeked, setPeeked] = useState<
    | { readonly version: number; readonly value: Setup }
    | { readonly version: number; readonly problem: string }
    | null
  >(null);
  // The live event's copy is read again first, so nothing reopens on old rows.
  const reload = async () => {
    if (isLive) {
      await sync.refresh(['event_days', 'event_species', 'event_safety']).catch(() => undefined);
    }
    setVersion((v) => v + 1);
  };

  useEffect(() => {
    if (isLive) return;
    let alive = true;
    Promise.all([
      sync.peek('event_days', eventId),
      sync.peek('event_species', eventId),
      sync.peek('event_safety', eventId),
    ]).then(
      ([days, species, safety]) => {
        if (alive)
          setPeeked({
            version,
            value: {
              days: days.map((d) => d.day),
              species: [...species].sort((a, b) => a.position - b.position),
              safety: safety[0] ?? null,
            },
          });
      },
      (error: unknown) => {
        if (alive) setPeeked({ version, problem: problemOf(error, 'Opening another event') });
      },
    );
    return () => {
      alive = false;
    };
  }, [sync, eventId, isLive, version]);

  if (isLive) {
    return {
      state: 'ready',
      reload,
      value: {
        days: [...dayRows.values()].filter((d) => d.event_id === eventId).map((d) => d.day),
        species: [...speciesRows.values()]
          .filter((s) => s.event_id === eventId)
          .sort((a, b) => a.position - b.position),
        safety: [...safetyRows.values()].find((r) => r.event_id === eventId) ?? null,
      },
    };
  }
  // Shown until the read for this version lands; a reload after a change
  // keeps the last answer up rather than flashing back to "reading".
  if (!peeked) return { state: 'loading', reload };
  if ('problem' in peeked) return { state: 'failed', problem: peeked.problem, reload };
  return { state: 'ready', value: peeked.value, reload };
}

function DetailsForm({
  id,
  start,
  copyCourse,
  submit,
  onSaved,
}: {
  readonly id: string;
  readonly start: EventDraft;
  /** A new event can start from the live one's boundary. */
  readonly copyCourse: Json | null;
  readonly submit: string;
  readonly onSaved: () => void;
}) {
  const sync = useSyncEngine();
  const ids = {
    name: useId(),
    presenter: useId(),
    prefix: useId(),
    zone: useId(),
    lastDay: useId(),
    linesIn: useId(),
    linesOut: useId(),
    final: useId(),
    label: useId(),
    labelLong: useId(),
    solo: useId(),
    team: useId(),
    bigFish: useId(),
    split: useId(),
    days: useId(),
  };
  const [d, setD] = useState<EventDraft>(start);
  const [copy, setCopy] = useState(copyCourse !== null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (change: Partial<EventDraft>) => {
    setD((was) => ({ ...was, ...change }));
    setSaved(false);
  };
  const zones = TIME_ZONES.some((z) => z.id === d.timeZone)
    ? TIME_ZONES
    : [...TIME_ZONES, { id: d.timeZone, label: d.timeZone }];

  async function save() {
    const checked = eventArgs(id, d);
    if (!checked.ok) {
      setProblem(checked.problem);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await sync.call('director_save_event', {
        ...checked.args,
        ...(copy && copyCourse !== null ? { p_course: copyCourse } : {}),
      });
      await sync.refreshEvents();
      setSaved(true);
      onSaved();
    } catch (error) {
      setProblem(problemOf(error, 'Saving the event'));
    } finally {
      setBusy(false);
    }
  }

  const text = (
    fieldId: string,
    label: string,
    key: keyof Omit<EventDraft, 'days'>,
    more: { placeholder?: string; inputMode?: 'decimal'; type?: string } = {},
  ) => (
    <div className="field">
      <label className="field__label" htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        type={more.type ?? 'text'}
        inputMode={more.inputMode}
        placeholder={more.placeholder}
        autoComplete="off"
        value={d[key]}
        onChange={(e) => {
          set({ [key]: e.target.value });
        }}
      />
    </div>
  );

  return (
    <form
      className="event-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset className="event-form__fields" disabled={busy}>
        {text(ids.name, 'Tournament name', 'name', { placeholder: 'Montana Kayak Walleye Open' })}
        {text(ids.presenter, 'Presented by (optional)', 'presenter', {
          placeholder: 'Big Sky Kayak Anglers',
        })}
        <div className="event-form__pair">
          {text(ids.prefix, 'Entry ID prefix', 'prefix', { placeholder: 'MKWO28' })}
          <div className="field">
            <label className="field__label" htmlFor={ids.zone}>
              Time zone
            </label>
            <select
              id={ids.zone}
              value={d.timeZone}
              onChange={(e) => {
                set({ timeZone: e.target.value });
              }}
            >
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="hint">
          Anglers are numbered from 001 in each event, so the prefix is what keeps this year’s entry
          001 apart from last year’s.
        </p>

        <fieldset className="event-form__days">
          <legend className="field__label">Fishing days</legend>
          <ul className="event-days">
            {d.days.map((day, i) => (
              <li key={i} className="event-days__day">
                <label className="visually-hidden" htmlFor={`${ids.days}-${String(i)}`}>
                  Day {i + 1}
                </label>
                <input
                  id={`${ids.days}-${String(i)}`}
                  type="date"
                  value={day}
                  onChange={(e) => {
                    set({ days: d.days.map((x, j) => (j === i ? e.target.value : x)) });
                  }}
                />
                {d.days.length > 1 ? (
                  <button
                    className="button button--small"
                    type="button"
                    aria-label={`Remove day ${String(i + 1)}`}
                    onClick={() => {
                      set({ days: d.days.filter((_, j) => j !== i) });
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {d.days.length < 7 ? (
            <button
              className="button button--small"
              type="button"
              onClick={() => {
                set({ days: [...d.days, ''] });
              }}
            >
              Add a day
            </button>
          ) : null}
        </fieldset>

        {text(ids.lastDay, 'Last day to register', 'lastDay', { type: 'date' })}
        <div className="event-form__times">
          {text(ids.linesIn, 'Lines in', 'linesIn', { type: 'time' })}
          {text(ids.linesOut, 'Lines out', 'linesOut', { type: 'time' })}
          {text(ids.final, 'Final check-in', 'finalCheckIn', { type: 'time' })}
        </div>
        {text(ids.label, 'Water, short (home screen)', 'courseLabel', {
          placeholder: 'Canyon Ferry',
        })}
        {text(ids.labelLong, 'Water, in full (Register screen)', 'courseLabelLong', {
          placeholder: 'Canyon Ferry Reservoir · Silos to the Ponds',
        })}
        <div className="event-form__trio">
          {text(ids.solo, 'Solo entry ($)', 'feeSolo', { inputMode: 'decimal' })}
          {text(ids.team, 'Team entry ($)', 'feeTeam', { inputMode: 'decimal' })}
          {text(ids.bigFish, 'Big Fish ($)', 'feeBigFish', { inputMode: 'decimal' })}
        </div>
        {text(ids.split, 'Payout split (%), 1st place first', 'split', { placeholder: '50/30/20' })}
        {copyCourse !== null ? (
          <label className="tick">
            <input
              type="checkbox"
              checked={copy}
              onChange={(e) => {
                setCopy(e.target.checked);
              }}
            />
            Start from the live event’s course boundary
          </label>
        ) : null}
      </fieldset>
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
      {saved ? (
        <p className="ok" role="status">
          Saved.
        </p>
      ) : null}
      <button className="button button--secondary" type="submit" disabled={busy}>
        {busy ? 'Saving…' : submit}
      </button>
    </form>
  );
}

const CUSTOM = '__custom__';

function SpeciesEditor({
  eventId,
  species,
  onChanged,
}: {
  readonly eventId: string;
  readonly species: readonly Row<'event_species'>[];
  readonly onChanged: () => Promise<void>;
}) {
  const sync = useSyncEngine();
  const ids = { head: useId(), pick: useId(), name: useId(), ceiling: useId() };
  const [pick, setPick] = useState('Walleye');
  const [custom, setCustom] = useState('');
  const [ceiling, setCeiling] = useState(String(presetCeiling('Walleye') ?? ''));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function send(list: { name: string; recordInches: number | null }[]) {
    setBusy(true);
    setProblem(null);
    try {
      await sync.call('director_set_event_species', { p_event_id: eventId, p_species: list });
      await onChanged();
      return true;
    } catch (error) {
      setProblem(problemOf(error, 'Changing the species'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const now = species.map((s) => ({ name: s.name, recordInches: s.record_inches }));

  async function add() {
    const name = (pick === CUSTOM ? custom : pick).trim();
    if (!name || name.length > 60) {
      setProblem('Name the species: 60 characters at most.');
      return;
    }
    if (name.toLowerCase() === 'other') {
      setProblem('“Other” is what anglers pick for a fish that does not score.');
      return;
    }
    if (now.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setProblem(`${name} is already on the list.`);
      return;
    }
    const inches = ceiling.trim() ? Number(ceiling) : null;
    if (inches !== null && !(inches > 0 && inches < 1000)) {
      setProblem('The length ceiling is in inches, like 36, or left empty for none.');
      return;
    }
    if (await send([...now, { name, recordInches: inches }])) setCustom('');
  }

  return (
    <section className="money-part" aria-labelledby={ids.head}>
      <h3 className="card__subtitle" id={ids.head}>
        Scoring species
      </h3>
      <p className="hint">
        Anglers pick from these, or “Other (not scored)”, when they file a fish, and only these are
        ranked, placed and paid. They share one leaderboard, ranked by length. A fish longer than
        its species’ ceiling is flagged for you, never rejected. The first is the main species: the
        one the submit screen starts on.
      </p>
      {species.length === 0 ? (
        <p className="empty">
          No scoring species yet. Nothing an angler files can be ranked, placed or paid until there
          is at least one.
        </p>
      ) : (
        <ul className="sps" aria-label="Scoring species">
          {species.map((s, i) => (
            <li key={s.name} className="sp">
              <span className="sp__name">
                {s.name}
                {i === 0 ? <span className="ev__tag ev__tag--live">Main</span> : null}
              </span>
              <span className="sp__ceiling">
                {s.record_inches ? `${String(s.record_inches)}″ ceiling` : 'No ceiling'}
              </span>
              <span className="actions">
                {i > 0 ? (
                  <button
                    className="button button--small"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const picked = now[i];
                      if (picked) void send([picked, ...now.filter((_, j) => j !== i)]);
                    }}
                  >
                    Make main
                  </button>
                ) : null}
                <button
                  className="button button--small button--danger"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const sure = window.confirm(
                      `Take ${s.name} off the list?\n\nFish already filed as ${s.name} stop counting toward the standings and payouts until it is added back.`,
                    );
                    if (sure) void send(now.filter((_, j) => j !== i));
                  }}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="field">
        <label className="field__label" htmlFor={ids.pick}>
          Add a species
        </label>
        <select
          id={ids.pick}
          value={pick}
          onChange={(e) => {
            setPick(e.target.value);
            const preset = presetCeiling(e.target.value);
            setCeiling(preset === null ? '' : String(preset));
          }}
        >
          {SPECIES_PRESETS.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((it) => (
                <option key={it.name} value={it.name}>
                  {it.name}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={CUSTOM}>Other — type it in</option>
        </select>
      </div>
      {pick === CUSTOM ? (
        <div className="field">
          <label className="field__label" htmlFor={ids.name}>
            Species name
          </label>
          <input
            id={ids.name}
            type="text"
            autoCapitalize="words"
            spellCheck={false}
            placeholder="Lake Sturgeon"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
            }}
          />
        </div>
      ) : null}
      <div className="field">
        <label className="field__label" htmlFor={ids.ceiling}>
          Length ceiling (in)
        </label>
        <input
          id={ids.ceiling}
          type="text"
          inputMode="decimal"
          placeholder="36"
          value={ceiling}
          onChange={(e) => {
            setCeiling(e.target.value);
          }}
        />
      </div>
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
      <button
        className="button button--secondary"
        type="button"
        disabled={busy}
        onClick={() => void add()}
      >
        Add to this event
      </button>
    </section>
  );
}

function SafetyContact({
  eventId,
  safety,
  onChanged,
}: {
  readonly eventId: string;
  readonly safety: Row<'event_safety'> | null;
  readonly onChanged: () => Promise<void>;
}) {
  const sync = useSyncEngine();
  const ids = { head: useId(), name: useId(), phone: useId() };
  const [name, setName] = useState(safety?.contact_name ?? 'Tournament director');
  const [phone, setPhone] = useState(safety?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function send(number: string) {
    if (number && !isCompletePhone(number)) {
      setProblem('That phone number looks incomplete. Include the area code.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await sync.call('director_set_safety_contact', {
        p_event_id: eventId,
        p_phone: number,
        p_contact_name: name.trim() || 'Tournament director',
      });
      await onChanged();
      setPhone(number);
      setSaved(number ? 'Saved.' : 'Removed.');
    } catch (error) {
      setProblem(problemOf(error, 'Saving the number'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="money-part" aria-labelledby={ids.head}>
      <h3 className="card__subtitle" id={ids.head}>
        Director’s number for the Safety screen
      </h3>
      <p className="hint">
        The number the Safety screen’s Text and Call buttons reach. Only anglers registered for this
        event can see it.
        {safety ? '' : ' There is none yet, so those buttons are hidden.'}
      </p>
      <form
        className="event-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void send(phone.trim());
        }}
      >
        <fieldset className="event-form__fields" disabled={busy}>
          <div className="event-form__pair">
            <div className="field">
              <label className="field__label" htmlFor={ids.name}>
                Name anglers see
              </label>
              <input
                id={ids.name}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor={ids.phone}>
                Phone
              </label>
              <input
                id={ids.phone}
                type="tel"
                autoComplete="off"
                placeholder="406-555-0100"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setSaved(null);
                }}
              />
            </div>
          </div>
        </fieldset>
        {problem ? (
          <p className="err" role="alert">
            {problem}
          </p>
        ) : null}
        {saved ? (
          <p className="ok" role="status">
            {saved}
          </p>
        ) : null}
        <div className="actions">
          <button className="button button--secondary" type="submit" disabled={busy}>
            Save number
          </button>
          {safety ? (
            <button
              className="button button--small"
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Take the director’s number off the Safety screen?'))
                  void send('');
              }}
            >
              Remove number
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
