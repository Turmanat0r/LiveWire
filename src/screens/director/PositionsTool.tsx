import { lazy, Suspense, useMemo } from 'react';
import { useNow } from '../../app/useNow';
import type { Placed, Positions } from '../../data/director';
import { useSync } from '../../data/useSync';
import { evaluateBoundary, parseBoundary, type Boundary } from '../../domain/geo';
import { ageText, signalAgeMinutes, SIGNAL_STALE_MINUTES } from '../../domain/safety';
import { Card } from '../../ui/Card';
import { callHref, coordsText } from '../safety/words';
import { useDirectorQueue } from './queue';
import '../../ui/beacon.css';
import '../../ui/map.css';

const CourseMap = lazy(() => import('../safety/CourseMap'));

const FEET_PER_MILE = 5280;

const stale = (p: Placed, now: number) => signalAgeMinutes(p.at, now) > SIGNAL_STALE_MINUTES;

/** "46.38917, -111.57556 · ±33 ft · 0.42 mi outside" */
function whereText(p: Placed, course: Boundary): string {
  const bits = [coordsText(p)];
  if (p.accuracyMiles) bits.push(`±${(p.accuracyMiles * FEET_PER_MILE).toFixed(0)} ft`);
  const verdict = evaluateBoundary(p, course);
  if (verdict.kind !== 'unchecked') {
    bits.push(verdict.within ? 'in bounds' : `${verdict.outsideMiles.toFixed(2)} mi outside`);
  }
  return bits.join(' · ');
}

/**
 * The old app's Positions: where each angler's phone last reported from, for
 * the director's eyes only, raised beacons first and loudest. A director who
 * knows somebody is safe can stand their beacon down for them.
 */
export function PositionsTool({ placed }: { readonly placed: Positions }) {
  const event = useSync((s) => s.event);
  const now = useNow();
  const course = useMemo(() => parseBoundary(event?.course), [event?.course]);
  const beacons = placed.rows.filter((p) => p.beacon);
  const pins = useMemo(
    () => ({
      beacons: placed.rows
        .filter((p) => p.beacon)
        .map((p) => ({ lat: p.lat, lng: p.lng, label: p.name })),
      anglers: placed.rows
        .filter((p) => !p.beacon)
        .map((p) => ({
          lat: p.lat,
          lng: p.lng,
          label: `${p.name} · ${ageText(p.at, now)}`,
          stale: stale(p, now),
        })),
    }),
    [placed.rows, now],
  );
  return (
    <Card title="Positions">
      <p className="hint">
        Where each angler’s phone last reported from. A position is recorded when the app already
        has a fix: filing a catch, checking against the course, or while a beacon is up. Nothing
        here drains a battery and nothing is live, so read the age next to each one before you act
        on it.
      </p>
      {beacons.length ? (
        <ul className="beacon-cards" aria-label="Raised beacons">
          {beacons.map((p) => (
            <BeaconCard key={p.anglerId} p={p} now={now} />
          ))}
        </ul>
      ) : null}
      <Suspense fallback={<div className="course-map course-map--waiting">Loading the map…</div>}>
        <CourseMap
          course={course}
          me={null}
          beacons={pins.beacons}
          anglers={pins.anglers}
          label="Map of the course, with each angler’s last position and any raised beacons"
        />
      </Suspense>
      <p className="hint">
        Anglers cannot see each other’s positions. The only one that goes out to the field is a
        raised beacon. {placed.rows.length} of {placed.anglers}{' '}
        {placed.anglers === 1 ? 'angler has' : 'anglers have'} reported a position.
      </p>
      {placed.rows.length === 0 ? (
        <p className="empty">
          No angler has reported a position yet. One is recorded the first time somebody files a
          catch or checks themselves against the course.
        </p>
      ) : (
        <ul className="pos-rows" aria-label="Last positions">
          {placed.rows.map((p) => {
            const old = !p.beacon && stale(p, now);
            return (
              <li
                key={p.anglerId}
                className={
                  p.beacon ? 'pos-row pos-row--beacon' : old ? 'pos-row pos-row--stale' : 'pos-row'
                }
              >
                <p className="pos-row__top">
                  <span className="pos-row__who">
                    {p.name} · {p.handle}
                    {p.beacon ? <strong> · Beacon</strong> : null}
                  </span>
                  <span className="pos-row__age">{ageText(p.at, now)}</span>
                </p>
                <p className="pos-row__meta">{whereText(p, course)}</p>
                {old ? (
                  <p className="pos-row__meta">
                    Older than {SIGNAL_STALE_MINUTES} minutes: treat it as history.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function BeaconCard({ p, now }: { readonly p: Placed; readonly now: number }) {
  const queue = useDirectorQueue();
  const { beacon } = p;
  if (!beacon) return null;
  return (
    <li className="beacon-card">
      <p className="beacon-card__title">
        <span className="beacon-pulse" aria-hidden="true" />
        Beacon raised
      </p>
      <p className="beacon-card__row">
        <span className="beacon-card__who">
          {p.name} · {p.handle}
        </span>
        <span className="beacon-card__where">{ageText(Date.parse(beacon.raised_at), now)}</span>
      </p>
      {beacon.note ? <p className="beacon-card__note">“{beacon.note}”</p> : null}
      <p className="beacon-card__meta">
        {coordsText(p)} · position {ageText(p.at, now)}
      </p>
      <div className="actions">
        {p.phone ? (
          <a className="button button--small" href={callHref(p.phone)}>
            Call {p.phone}
          </a>
        ) : null}
        {p.emergencyPhone ? (
          <a className="button button--small" href={callHref(p.emergencyPhone)}>
            Call {p.emergencyName || 'emergency contact'}
          </a>
        ) : null}
        {p.standingDown ? null : (
          <button
            className="button button--small"
            type="button"
            onClick={() => {
              const sure = window.confirm(
                `Stand down ${p.name}’s beacon?\n\nOnly once you know they are safe: the whole field stops being asked to go and help.`,
              );
              if (!sure) return;
              queue(`Stand down ${p.name}’s beacon`, [
                { kind: 'call', fn: 'stand_down_beacon', args: { p_angler_id: p.anglerId } },
              ]);
            }}
          >
            Stand down
          </button>
        )}
      </div>
      {p.standingDown ? (
        <p className="beacon-card__meta">Stood down. Waiting to send: the field still sees it.</p>
      ) : null}
    </li>
  );
}
