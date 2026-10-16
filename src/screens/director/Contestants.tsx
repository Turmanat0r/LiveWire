import { useId, useState } from 'react';
import { findContestants, type Contestant } from '../../data/director';
import { Card } from '../../ui/Card';
import { inchesText } from '../board/StandingsScreen';
import { callHref } from '../safety/words';

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
function daysText(c: Contestant): string {
  return c.days.map((d, i) => `Day ${String(i + 1)} ${d}`).join(' · ');
}

/**
 * Every registered angler, findable by name, handle, phone or Tournament ID:
 * an angler who has lost their Tournament ID asks the director, who finds
 * them here and reads it to them.
 */
export function Contestants({ list }: { readonly list: readonly Contestant[] }) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const shown = findContestants(filtered(list, filter), query);
  return (
    <Card title="Contestants">
      <p className="hint">
        Every registered angler, with their Tournament ID. An angler who has lost theirs can ask
        you: find them here by name or phone, check it is them, and read it to them. With it and
        their phone number they can bring their entry onto any phone, from Register.
      </p>
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
            <li
              key={c.anglerId}
              className={`crow${c.disqualified ? ' crow--dq' : c.rank === 1 ? ' crow--leader' : !c.feePaid ? ' crow--unpaid' : ''}`}
            >
              <span className="crow__rank">{c.rank || '—'}</span>
              <div className="crow__id">
                <p className="crow__name">
                  {c.name}
                  {c.disqualified ? <span className="crow__tag crow__tag--dq">DQ</span> : null}
                  {c.feePaid ? null : <span className="crow__tag">Fee outstanding</span>}
                </p>
                <p className="crow__code">
                  Tournament ID <strong>{c.code || 'none'}</strong>
                  {c.teamCode ? (
                    <>
                      {' '}
                      · Team <strong>{c.teamCode}</strong>
                    </>
                  ) : null}
                </p>
                <p className="crow__sub">
                  {c.entryNumber} · {c.handle} ·{' '}
                  {c.division === 'team'
                    ? `Team with ${c.partner ?? '—'}${c.role === 'partner' ? ' (partner)' : ''}`
                    : 'Solo'}
                  {c.bigFish ? ' · Big Fish' : ''}
                </p>
                <p className="crow__sub">
                  {c.phone ? <a href={callHref(c.phone)}>{c.phone}</a> : 'No phone on file'} ·{' '}
                  {daysText(c)}
                </p>
                {c.disqualified && c.dqReason ? (
                  <p className="crow__note">Disqualified: {c.dqReason}</p>
                ) : null}
              </div>
              <span className="crow__best">
                <strong>{c.best ? inchesText(c.best) : '—'}</strong>
                <span className="crow__best-label">best</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
