import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { currentFix, type Fix } from '../../app/location';
import { rememberFix, useLatestFix } from '../../app/position';
import { screen } from '../../app/screens';
import { useActiveBeacons, useMyBeacon } from '../../data/beacons';
import { useMyEntry, type MyEntry } from '../../data/myEntry';
import { useSync, useSyncEngine } from '../../data/useSync';
import { parseBoundary } from '../../domain/geo';
import { ageText } from '../../domain/safety';
import { useNow } from '../../app/useNow';
import { Page } from '../../ui/Page';
import { trustedOffset } from '../catch/filing';
import { BeaconCards } from './BeaconCards';
import { BEACON_FIX_MS } from '../../app/BeaconWatch';
import { CatchLocations, type CatchLocation } from './CatchLocations';
import { WhereAmI } from './WhereAmI';
import { parseVerdict } from '../../domain/geo';
import { callHref, helpMessage, locationBadge, textHref, whenText } from './words';
import '../../ui/forms.css';
import '../catches/catches.css';
import './SafetyScreen.css';

/**
 * Help, and where you are: raise a beacon the whole field sees, text the
 * director with your position, and check yourself against the course line.
 */
export function SafetyScreen() {
  const title = screen('safety').title;
  const event = useSync((s) => s.event);
  const mine = useMyEntry();
  const fix = useLatestFix();
  const beacons = useActiveBeacons(fix);
  const catches = useSync((s) => s.tables.catches);
  const evidence = useSync((s) => s.tables.catch_evidence);
  const course = useMemo(() => parseBoundary(event?.course), [event]);
  const timeZone = event?.time_zone ?? 'America/Denver';

  const located = useMemo(() => {
    const ids = new Set(mine?.anglers.map((a) => a.angler.id) ?? []);
    const byCatch = new Map([...evidence.values()].map((e) => [e.catch_id, e]));
    const rows: CatchLocation[] = [];
    const pins: { lat: number; lng: number; label: string; outside: boolean }[] = [];
    const list = [...catches.values()]
      .filter((c) => ids.has(c.angler_id))
      .sort((a, b) => b.logged_at.localeCompare(a.logged_at));
    for (const c of list) {
      const e = byCatch.get(c.id);
      const verdict = parseVerdict(e?.boundary);
      const lat = e?.lat ?? null;
      const lng = e?.lng ?? null;
      rows.push({
        id: c.id,
        species: c.species,
        lengthInches: c.length_inches,
        when: whenText(Date.parse(c.logged_at), timeZone),
        status: c.status,
        badge: locationBadge(lat !== null && lng !== null, verdict),
      });
      if (lat !== null && lng !== null) {
        pins.push({
          lat,
          lng,
          label: `${c.species} · ${String(c.length_inches)}″`,
          outside: verdict !== null && verdict.kind !== 'unchecked' && !verdict.within,
        });
      }
    }
    return { rows, pins };
  }, [mine, catches, evidence, timeZone]);

  if (!event) {
    return (
      <Page title={title}>
        <p className="empty">No tournament is on right now.</p>
        <EmergencyLine />
      </Page>
    );
  }
  return (
    <Page
      title={title}
      before={<BeaconCards beacons={beacons} />}
      after={
        <>
          <WhereAmI
            course={course}
            timeZone={timeZone}
            mine={mine}
            beacons={beacons}
            catches={located.pins}
          />
          <CatchLocations mine={mine} rows={located.rows} />
        </>
      }
    >
      <HelpCard mine={mine} eventId={event.id} timeZone={timeZone} />
    </Page>
  );
}

function EmergencyLine() {
  return (
    <p className="safety-911">
      Life in danger? <a href="tel:911">Call 911</a> first.
    </p>
  );
}

function HelpCard({
  mine,
  eventId,
  timeZone,
}: {
  readonly mine: MyEntry | null;
  readonly eventId: string;
  readonly timeZone: string;
}) {
  const sync = useSyncEngine();
  const clock = useSync((s) => s.clock);
  const contacts = useSync((s) => s.tables.event_safety);
  const { phase, beacon, refused } = useMyBeacon();
  const fix = useLatestFix();
  const now = useNow();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pendingFix = useRef<Promise<Fix | null> | null>(null);
  const yes = useRef<HTMLButtonElement>(null);
  const noteId = useId();

  // The question is new on screen: take a screen reader's focus to its answer.
  useEffect(() => {
    if (asking) yes.current?.focus();
  }, [asking]);
  const contact = [...contacts.values()].find((c) => c.event_id === eventId) ?? null;
  const name = mine?.me.details?.full_name ?? mine?.me.angler.handle ?? 'An angler';

  // The fix starts the moment the button is pressed, while the angler reads
  // the question, so it is usually in hand by the time they say yes.
  function ask() {
    setProblem(null);
    setAsking(true);
    pendingFix.current = currentFix(BEACON_FIX_MS);
  }

  function cancel() {
    setAsking(false);
    pendingFix.current = null;
  }

  async function raise() {
    if (!mine) return;
    setBusy(true);
    const found = await (pendingFix.current ?? currentFix(BEACON_FIX_MS));
    pendingFix.current = null;
    setBusy(false);
    setAsking(false);
    if (!found) {
      // No fix, no beacon: one that points nowhere sends help to the wrong water.
      setProblem(
        'Could not get a location fix, and a beacon needs a position, so nothing was sent. Get into the open and try again, or text the director below.',
      );
      return;
    }
    const at = Date.now();
    rememberFix(found, at);
    await sync.queue({
      id: crypto.randomUUID(),
      label: 'Beacon',
      createdAt: at,
      steps: [
        {
          kind: 'call',
          fn: 'raise_beacon',
          args: {
            p_angler_id: mine.me.angler.id,
            p_lat: found.lat,
            p_lng: found.lng,
            p_accuracy_miles: found.accuracyMiles,
            p_at: new Date(at + (trustedOffset(clock, at) ?? 0)).toISOString(),
            p_note: note.trim(),
          },
        },
      ],
    });
    setNote('');
  }

  function standDown() {
    const anglerId = beacon?.angler_id ?? mine?.me.angler.id;
    if (!anglerId) return;
    if (
      !window.confirm('Stand down your beacon? The field stops being asked to come and find you.')
    )
      return;
    void sync.queue({
      id: crypto.randomUUID(),
      label: 'Stand down beacon',
      createdAt: Date.now(),
      steps: [{ kind: 'call', fn: 'stand_down_beacon', args: { p_angler_id: anglerId } }],
    });
  }

  return (
    <>
      <p className="hint">
        Raising a beacon shares your position with the tournament director{' '}
        <strong>and every other angler on the water</strong>, so whoever is closest can reach you.
        While it is up your position refreshes about once a minute, for as long as the app stays
        open on screen: a phone with its screen off stops. Use it if you are in trouble, not to mark
        a spot.
      </p>
      {!mine ? (
        <Link className="button button--secondary" to={screen('register').path}>
          Register on this device first
        </Link>
      ) : phase === 'none' ? (
        <>
          <div className="field">
            <label className="field__label" htmlFor={noteId}>
              What is wrong? (optional)
            </label>
            <input
              id={noteId}
              type="text"
              maxLength={140}
              placeholder="Capsized, cold, need a tow…"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
              }}
            />
          </div>
          {asking ? (
            // Asked on the page rather than in a pop-up: this goes to everyone on
            // the water, so a pocket press must not send it, and a phone's own
            // dialog can hold up the GPS fix behind it.
            <div className="beacon-ask">
              <p>
                <strong>Raise a beacon?</strong> Your position goes to the tournament director and
                to every other angler on the water, and refreshes about every minute while the app
                stays open. It keeps going until you stand it down.
              </p>
              <div className="actions">
                <button
                  ref={yes}
                  className="button button--beacon beacon-ask__yes"
                  type="button"
                  disabled={busy}
                  onClick={() => void raise()}
                >
                  {busy ? 'Getting a fix…' : 'Yes, raise it'}
                </button>
                <button
                  className="button button--secondary beacon-ask__no"
                  type="button"
                  disabled={busy}
                  onClick={cancel}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="button button--beacon" type="button" onClick={ask}>
              Raise a beacon
            </button>
          )}
        </>
      ) : phase === 'raising' ? (
        <p className="notice notice--problem">
          <strong>Your beacon is waiting for signal</strong>
          It goes out the moment this phone has a bar. A text often gets through when data will not:
          send the director one below.
        </p>
      ) : phase === 'standing-down' ? (
        <p className="notice">
          <strong>Standing down</strong>
          Waiting for signal to tell the field you are OK.
        </p>
      ) : (
        <button className="button button--secondary" type="button" onClick={standDown}>
          Stand down: I am OK
        </button>
      )}
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
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
      {mine && contact ? (
        <div className="safety-text">
          <div className="actions">
            <a
              className="button button--secondary safety-text__send"
              href={textHref(contact.phone, helpMessage(name, note, fix, timeZone))}
            >
              Text the director
            </a>
            <a className="button button--small" href={callHref(contact.phone)}>
              Call
            </a>
          </div>
          <p className="hint">
            {fix
              ? `The text carries your position from ${ageText(fix.at, now)}.`
              : 'Check your position below first to put it in the text.'}{' '}
            {contact.contact_name}: {contact.phone}
          </p>
        </div>
      ) : null}
      <EmergencyLine />
    </>
  );
}
