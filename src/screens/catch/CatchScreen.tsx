import { useCallback, useEffect, useId, useMemo, useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { currentFix } from '../../app/location';
import { rememberFix } from '../../app/position';
import { screen } from '../../app/screens';
import { useNow } from '../../app/useNow';
import { useMyEntry } from '../../data/myEntry';
import { useEventDates } from '../../data/selectors';
import type { Row } from '../../data/tables';
import { useSync, useSyncEngine } from '../../data/useSync';
import {
  CLOCK_TOLERANCE_MS,
  skewText,
  type PhotoSource,
  type StampInput,
} from '../../domain/capture';
import { evaluateBoundary, parseBoundary, type BoundaryVerdict } from '../../domain/geo';
import { zonedParts } from '../../domain/time';
import { OTHER_SPECIES } from '../../domain/types';
import { preparePickedPhoto, type CapturedPhoto } from '../../photo/capture';
import { Page } from '../../ui/Page';
import { filingItem, parseLength, trustedOffset } from './filing';
import { Viewfinder } from './Viewfinder';
import '../../ui/forms.css';
import './CatchScreen.css';

/**
 * Submit a catch: the angler, the length, the species, and a photo on the
 * bump board. Everything goes to the outbox, so a fish can be filed in the
 * middle of the lake and sends itself once there is signal.
 */
export function CatchScreen() {
  const event = useSync((s) => s.event);
  const mine = useMyEntry();
  const title = screen('catch').title;
  if (!event) {
    return (
      <Page title={title}>
        <p>No tournament is open yet.</p>
      </Page>
    );
  }
  if (!mine) {
    return (
      <Page title={title}>
        <p className="empty">Register an angler first to submit a catch.</p>
        <Link className="button button--secondary" to={screen('register').path}>
          Register
        </Link>
      </Page>
    );
  }
  return (
    <Page title={title}>
      <CatchForm event={event} mine={mine} />
    </Page>
  );
}

interface CatchFormProps {
  readonly event: Row<'events'>;
  readonly mine: NonNullable<ReturnType<typeof useMyEntry>>;
}

function CatchForm({ event, mine }: CatchFormProps) {
  const sync = useSyncEngine();
  const navigate = useNavigate();
  const speciesRows = useSync((s) => s.tables.event_species);
  const clock = useSync((s) => s.clock);
  const dates = useEventDates(event);
  const now = useNow();
  const ids = { angler: useId(), length: useId(), species: useId(), file: useId() };

  const species = useMemo(
    () =>
      [...speciesRows.values()]
        .filter((s) => s.event_id === event.id)
        .sort((a, b) => a.position - b.position),
    [speciesRows, event.id],
  );
  const [anglerId, setAnglerId] = useState(mine.me.angler.id);
  const [length, setLength] = useState('');
  const [chosenSpecies, setSpecies] = useState(species[0]?.name ?? OTHER_SPECIES);
  const [announce, setAnnounce] = useState(true);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // The preview's address is let go when the photo is replaced or the screen closes.
  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.url);
    };
  }, [photo]);

  const angler = mine.anglers.find((a) => a.angler.id === anglerId) ?? mine.me;
  const forPartner = angler.angler.id !== mine.me.angler.id;
  const codes = [
    ...(mine.details?.team_code ? [{ label: 'Team', code: mine.details.team_code }] : []),
    ...(angler.details?.angler_code ? [{ label: 'ID', code: angler.details.angler_code }] : []),
  ];

  const stampFor = useCallback(
    (source: PhotoSource): StampInput => {
      const at = Date.now();
      const index = dates.indexOf(zonedParts(at, event.time_zone).dateKey);
      return {
        prefix: event.entry_prefix,
        day: index === -1 ? null : index + 1,
        at,
        timeZone: event.time_zone,
        source,
        clockOffsetMs: trustedOffset(clock, at),
      };
    },
    [dates, event.entry_prefix, event.time_zone, clock],
  );

  const choosePhoto = useCallback((captured: CapturedPhoto | null) => {
    setPhoto(captured);
    setPicked(null);
  }, []);

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const inches = parseLength(length);
    if (inches === null) {
      setProblem('Enter the length in inches, as read off the board.');
      return;
    }
    if (!photo && !picked) {
      setProblem('Take or choose a photo of the fish on the bump board.');
      return;
    }
    const record = species.find((s) => s.name === chosenSpecies)?.record_inches;
    if (record && inches > record) {
      const sure = window.confirm(
        `${String(inches)} inches is longer than the ${chosenSpecies} record of ${String(record)}. File it anyway?`,
      );
      if (!sure) return;
    }
    setProblem(null);
    try {
      let filed = photo;
      if (!filed && picked) {
        setBusy('Preparing photo…');
        // A photo off the camera roll could have been taken any time, so its
        // stamp is the time it was filed, and says so.
        filed = await preparePickedPhoto(picked, stampFor('upload'));
      }
      if (!filed) return;
      setBusy('Checking location…');
      const fix = await currentFix();
      if (fix) rememberFix(fix);
      const course = parseBoundary(event.course);
      const boundary: BoundaryVerdict = fix ? evaluateBoundary(fix, course) : { kind: 'unchecked' };
      setBusy('Saving…');
      const catchId = crypto.randomUUID();
      await sync.queue(
        filingItem({
          catchId,
          messageId: crypto.randomUUID(),
          eventId: event.id,
          anglerId: angler.angler.id,
          phoneAnglerId: mine.me.angler.id,
          species: chosenSpecies,
          lengthInches: inches,
          loggedAt: Date.now(),
          photo: { at: filed.at, source: filed.source, precheck: filed.precheck },
          clockOffsetMs: trustedOffset(clock, Date.now()),
          fix,
          boundary,
          announce,
        }),
        { photo: { bytes: await filed.blob.arrayBuffer(), type: 'image/jpeg' } },
      );
      if (filed !== photo) URL.revokeObjectURL(filed.url);
      void navigate(screen('my-catches').path);
    } catch {
      setProblem('That photo could not be read. Choose a different one, or use the camera.');
    } finally {
      setBusy(null);
    }
  }

  const offset = trustedOffset(clock, now);
  const clockOff = offset !== null && Math.abs(offset) > CLOCK_TOLERANCE_MS;

  return (
    <form className="catch-form" onSubmit={(e) => void submit(e)} noValidate>
      {mine.anglers.length > 1 ? (
        <div className="field">
          <label className="field__label" htmlFor={ids.angler}>
            Angler
          </label>
          <select
            id={ids.angler}
            value={angler.angler.id}
            onChange={(e) => {
              setAnglerId(e.target.value);
            }}
          >
            {mine.anglers.map((a) => (
              <option key={a.angler.id} value={a.angler.id}>
                {a.details?.full_name
                  ? `${a.details.full_name} (${a.angler.handle})`
                  : a.angler.handle}
              </option>
            ))}
          </select>
          {forPartner ? (
            <p className="hint">
              Filing for your partner. It counts toward {angler.details?.full_name ?? 'their'}’s
              standings, under their Tournament ID.
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="catch-form__pair">
        <div className="field">
          <label className="field__label" htmlFor={ids.length}>
            Length (inches)
          </label>
          <input
            id={ids.length}
            type="number"
            inputMode="decimal"
            step="0.25"
            min="0"
            placeholder="18.5"
            value={length}
            onChange={(e) => {
              setLength(e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={ids.species}>
            Species
          </label>
          <select
            id={ids.species}
            value={chosenSpecies}
            onChange={(e) => {
              setSpecies(e.target.value);
            }}
          >
            {species.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
            <option value={OTHER_SPECIES}>Other (not scored)</option>
          </select>
        </div>
      </div>
      <Viewfinder
        species={chosenSpecies}
        codes={codes}
        stampFor={stampFor}
        photo={photo}
        onPhoto={choosePhoto}
      />
      <div className="field">
        <label className="field__label" htmlFor={ids.file}>
          Or choose a photo you already took
        </label>
        {/* No capture attribute: that forces the camera and hides the photo library. */}
        <input
          id={ids.file}
          className="catch-form__file"
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            if (file) setPhoto(null);
            setPicked(file);
          }}
        />
      </div>
      <label className="tick">
        <input
          type="checkbox"
          checked={announce}
          onChange={(e) => {
            setAnnounce(e.target.checked);
          }}
        />
        Tell the field: post this catch to the tournament chat
      </label>
      {clockOff ? (
        <p className="notice notice--problem">
          This phone’s clock is {skewText(offset)} the tournament server. Turn on automatic date and
          time, or the time printed on your photo will be questioned.
        </p>
      ) : null}
      {problem ? (
        <p className="err" role="alert">
          {problem}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={busy !== null}>
        {busy ?? 'Submit catch for scoring'}
      </button>
      <p className="hint">
        Fish must be shown flat on a bump board with a visible measuring scale (a Ketch X-Board,
        Bubba Bump Board, YakAttack LeaderBoard or similar) in the photo. Catches are reviewed
        before they count on the leaderboard.
      </p>
    </form>
  );
}
