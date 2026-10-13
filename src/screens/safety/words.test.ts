import { describe, expect, it } from 'vitest';
import type { Boundary } from '../../domain/geo';
import { helpMessage, locationBadge, parseVerdict, readout, textHref } from './words';
import type { TimedFix } from '../../app/location';

const DENVER = 'America/Denver';
const LAUNCH = { lat: 46.38917, lng: -111.57556 };
const COURSE: Boundary = { kind: 'circle', center: LAUNCH, radiusMiles: 4 };
const at = Date.parse('2027-09-18T10:42:00-06:00');
const fix = (lat: number, lng: number, accuracyMiles = 0.01): TimedFix => ({
  lat,
  lng,
  accuracyMiles,
  at,
});

describe('where am I', () => {
  it('waits for a fix', () => {
    expect(readout(null, COURSE, DENVER)).toEqual({
      tone: 'plain',
      title: 'Not checked yet',
      detail: 'Tap below for a fix',
    });
    expect(readout(null, { kind: 'none' }, DENVER).detail).toBe('No boundary set for this event');
  });

  it('says how much room is left inside the line', () => {
    const r = readout(fix(LAUNCH.lat + 1 / 69.0546, LAUNCH.lng), COURSE, DENVER);
    expect(r.tone).toBe('in');
    expect(r.title).toBe('In bounds');
    expect(r.detail).toMatch(
      /^3\.00 mi inside the line · 46\.40365, -111\.57556 · 10:42\sAM · ±53 ft$/,
    );
  });

  it('says how far past it', () => {
    const r = readout(fix(LAUNCH.lat + 5 / 69.0546, LAUNCH.lng), COURSE, DENVER);
    expect(r.tone).toBe('out');
    expect(r.detail).toMatch(/^1\.00 mi past the boundary · /);
  });

  it('still shows the position with no course', () => {
    const r = readout(fix(46.4, -111.6), { kind: 'none' }, DENVER);
    expect(r.title).toBe('Position recorded');
    expect(r.detail).toMatch(/No boundary set$/);
  });
});

describe('a catch’s location', () => {
  it('reads the verdict stored with the catch', () => {
    expect(
      parseVerdict({ kind: 'circle', within: false, fromLaunchMiles: 4.4, outsideMiles: 0.4 }),
    ).toEqual({ kind: 'circle', within: false, fromLaunchMiles: 4.4, outsideMiles: 0.4 });
    expect(parseVerdict({ kind: 'unchecked' })).toEqual({ kind: 'unchecked' });
    expect(parseVerdict('nonsense')).toBeNull();
    expect(parseVerdict({ kind: 'circle', within: 'yes' })).toBeNull();
  });

  it('is badged as the old app did', () => {
    expect(locationBadge(false, null)).toEqual({ tone: 'plain', text: 'Location unavailable' });
    expect(locationBadge(true, { kind: 'unchecked' }).text).toBe(
      'Location recorded · no boundary set',
    );
    expect(
      locationBadge(true, { kind: 'circle', within: true, fromLaunchMiles: 1.24, outsideMiles: 0 }),
    ).toEqual({ tone: 'good', text: 'In bounds · 1.2 mi from launch' });
    expect(
      locationBadge(true, { kind: 'polygon', within: false, edgeMiles: 0.42, outsideMiles: 0.42 }),
    ).toEqual({ tone: 'out', text: 'Outside course boundary · 0.4 mi outside the line' });
  });
});

describe('the text to the director', () => {
  it('carries the name, the note, the position and a map link', () => {
    const body = helpMessage('Daniel Turman', ' Capsized ', fix(46.40365, -111.57556), DENVER);
    expect(body).toMatch(
      /^LiveWire: Daniel Turman needs help\. "Capsized" At 46\.40365, -111\.57556 \(±53 ft\) as of 10:42\sAM\. https:\/\/www\.google\.com\/maps\?q=46\.40365,-111\.57556$/,
    );
  });

  it('says so when there is no fix', () => {
    expect(helpMessage('Pat', '', null, DENVER)).toBe('LiveWire: Pat needs help. No GPS fix yet.');
  });

  it('opens the phone’s messages with it written', () => {
    expect(textHref('(406) 555-0142', 'Help at 46.4, -111.6')).toBe(
      'sms:+14065550142?&body=Help%20at%2046.4%2C%20-111.6',
    );
  });
});
