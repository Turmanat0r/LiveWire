import { describe, expect, it } from 'vitest';
import { findMyEntry } from './myEntry';
import { replaceTable, emptyTables, type TableMaps } from './replica';
import { DEVICE, entryRows, eventRow } from '../test/rows';

function tablesWith(...entries: ReturnType<typeof entryRows>[]): TableMaps {
  let t = emptyTables();
  t = replaceTable(
    t,
    'entries',
    entries.map((e) => e.entry),
  );
  t = replaceTable(
    t,
    'entry_private',
    entries.map((e) => e.entryPrivate),
  );
  t = replaceTable(
    t,
    'anglers',
    entries.flatMap((e) => e.anglers),
  );
  t = replaceTable(
    t,
    'angler_private',
    entries.flatMap((e) => e.privates),
  );
  t = replaceTable(
    t,
    'entry_devices',
    entries.flatMap((e) => e.devices),
  );
  return t;
}

describe("this phone's entry", () => {
  it('is the one linked to its account', () => {
    const solo = entryRows({ number: 1 });
    const mine = findMyEntry(tablesWith(solo), eventRow(), DEVICE);
    expect(mine?.entry.entry_number).toBe(1);
    expect(mine?.me.details?.full_name).toBe('Daniel Turman');
    expect(mine?.partner).toBeNull();
  });

  it('is nobody’s when the phone has not signed in, or holds no entry', () => {
    const someoneElse = entryRows({ userId: 'device-2' });
    expect(findMyEntry(tablesWith(someoneElse), eventRow(), DEVICE)).toBeNull();
    expect(findMyEntry(tablesWith(entryRows()), eventRow(), null)).toBeNull();
    expect(findMyEntry(tablesWith(entryRows()), null, DEVICE)).toBeNull();
  });

  it('ignores other phones’ links, which only the director can read', () => {
    const theirs = entryRows({ number: 1, userId: 'device-2' });
    const mine = entryRows({ number: 2 });
    expect(findMyEntry(tablesWith(theirs, mine), eventRow(), DEVICE)?.entry.entry_number).toBe(2);
  });

  it('on a team, is the angler the phone is, with the other as partner', () => {
    const team = entryRows({ team: true, names: ['Daniel Turman', 'Pat Partner'] });
    const mine = findMyEntry(tablesWith(team), eventRow(), DEVICE);
    expect(mine?.anglers.map((a) => a.angler.role)).toEqual(['captain', 'partner']);
    expect(mine?.me.angler.id).toBe(team.captainId);
    expect(mine?.partner?.details?.full_name).toBe('Pat Partner');
  });
});
