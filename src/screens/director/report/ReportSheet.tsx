// The state's form, rebuilt box for box: the same order, the same wording and
// the same grid, so it can be held next to the paper copy and read straight
// across. Row counts match the paper too, padded out when there is less to
// say. Anything the app wants to say about the numbers is said on screen
// above it, never on the page that gets posted.
import type { ReactNode } from 'react';
import {
  SIZE_LARGE_MAX,
  SIZE_LARGE_MIN,
  SIZE_SMALL_MAX,
  SIZE_SMALL_MIN,
  type SizeRow,
} from '../../../domain/report';
import { formDate, type ReportModel } from './model';

const HOURS_ROWS = 4;
const SPECIES_ROWS = 6;
const SIZE_SMALL_ROWS = 6;
const SIZE_LARGE_ROWS = 7;
export const FWP_FOOTER =
  'Send to: MT Fish, Wildlife and Parks - Attn: Fishing Contest Reporting- PO Box 200701 - Helena, MT 59620-0701';

/** What an empty box says on screen. The print styles hide it: paper shows an empty box. */
export const SHEET_BLANK = 'not filled in';

function Val({
  v,
  blank = SHEET_BLANK,
}: {
  readonly v: string | number | null | undefined;
  readonly blank?: string;
}) {
  const text = v === null || v === undefined ? '' : String(v).trim();
  return text === '' ? <span className="fwp-blank">{blank}</span> : <>{text}</>;
}

function Pad({
  have,
  want,
  cols,
}: {
  readonly have: number;
  readonly want: number;
  readonly cols: number;
}) {
  return (
    <>
      {Array.from({ length: Math.max(0, want - have) }, (_, r) => (
        <tr key={`pad-${String(r)}`}>
          {Array.from({ length: cols }, (__, c) => (
            <td key={c}>&nbsp;</td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** The form's fill-in-the-blank choices: an X on the one that applies, as if by hand. */
function Tick({
  actual,
  option,
}: {
  readonly actual: string | undefined;
  readonly option: string;
}) {
  const on = (actual ?? '').toLowerCase() === option.toLowerCase();
  return (
    <>
      <span className="fwp-box">{on ? 'X' : ' '}</span> {option}
    </>
  );
}

function Fill({
  children,
  wide = false,
}: {
  readonly children: ReactNode;
  readonly wide?: boolean;
}) {
  return <span className={wide ? 'fwp-fill fwp-fill--wide' : 'fwp-fill'}>{children}</span>;
}

function columns(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

function SizeTable({
  rows,
  min,
  max,
  plusLast,
  padTo,
}: {
  readonly rows: readonly SizeRow[];
  readonly min: number;
  readonly max: number;
  readonly plusLast: boolean;
  readonly padTo: number;
}) {
  const cols = columns(min, max);
  return (
    <div
      className="fwp-scroll"
      role="region"
      aria-label={`Fish ${String(min)} inches or longer, by inch`}
      // Wider than a phone, so it scrolls, and a keyboard has to be able to scroll it.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
    >
      <table className="fwp-table fwp-table--size">
        <thead>
          <tr>
            <th rowSpan={2} className="fwp-species-col">
              List Species
            </th>
            <th colSpan={cols.length}>Size in Inches</th>
          </tr>
          <tr>
            {cols.map((c) => (
              <th key={c} className="fwp-num">
                {c}
                {plusLast && c === max ? '+' : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.species}>
              <td>{r.species}</td>
              {cols.map((c) => (
                <td key={c} className="fwp-num">
                  {r.counts[c] ?? ' '}
                </td>
              ))}
            </tr>
          ))}
          <Pad have={rows.length} want={padTo} cols={cols.length + 1} />
        </tbody>
      </table>
    </div>
  );
}

export function ReportSheet({
  model,
  eventName,
  today,
}: {
  readonly model: ReportModel;
  readonly eventName: string;
  /** "10/2/2027": the day the form is completed. */
  readonly today: string;
}) {
  const cfg = model.settings;
  const res = model.residency;
  const unanswered = res.unknown ? (
    <span className="fwp-blank"> (+{res.unknown} unanswered)</span>
  ) : null;
  const minLength = (cfg.minLength ?? '').trim();
  return (
    <section className="fwp-sheet" aria-label="The state’s contest report form">
      <div className="fwp-page fwp-page--break">
        <div className="fwp-region">
          Region:{' '}
          <Fill>
            <Val v={cfg.region} />
          </Fill>
        </div>
        <h2 className="fwp-title">FISHING CONTEST REPORT</h2>
        <p className="fwp-return">
          Please return within <u>30 days</u> after the contest to:
        </p>
        <div className="fwp-address">
          Montana Fish, Wildlife &amp; Parks
          <br />
          Attn: Fishing Contest Reporting
          <br />
          Fisheries Division
          <br />
          P.O. Box 200701
          <br />
          Helena, MT 59620-0701
        </div>
        <table className="fwp-grid">
          <tbody>
            <tr>
              <th>Contest Name</th>
              <td colSpan={5}>{eventName}</td>
            </tr>
            <tr>
              <th>Contest Date(s) M/D/Y</th>
              <td colSpan={2}>
                <Val v={model.dates.map(formDate).join(', ')} />
              </td>
              <th>Waterbody:</th>
              <td colSpan={2}>
                <Val v={cfg.waterbody} />
              </td>
            </tr>
            <tr>
              <th>Total # of Anglers:</th>
              <td>{model.counts.anglers}</td>
              <th># of Teams</th>
              <td>{model.counts.teams}</td>
              <th># Paid:</th>
              <td>{model.counts.paid}</td>
            </tr>
            <tr>
              <th># of Montana Residents:</th>
              <td>
                {res.resident}
                {unanswered}
              </td>
              <th># of Non-Residents:</th>
              <td>
                {res.nonresident}
                {unanswered}
              </td>
              <th># of Boats (if applicable):</th>
              <td>{model.boats}</td>
            </tr>
            <tr>
              <th>Size of Winning Fish:</th>
              <td colSpan={5}>
                {model.winner ? `${model.winner.lengthInches.toFixed(2)}"` : <Val v="" />}
              </td>
            </tr>
          </tbody>
        </table>
        <table className="fwp-grid">
          <tbody>
            <tr>
              <th>Form Completed By:</th>
              <td colSpan={3}>
                <Val v={cfg.filerName} />
              </td>
              <th>Date:</th>
              <td>{today}</td>
            </tr>
            <tr>
              <th>Mailing Address:</th>
              <td colSpan={5}>
                <Val v={(cfg.filerAddress ?? '').replace(/\s*\n\s*/g, ', ')} />
              </td>
            </tr>
            <tr>
              <th>Email Address:</th>
              <td colSpan={2}>
                <Val v={cfg.filerEmail} />
              </td>
              <th>Telephone:</th>
              <td colSpan={2}>
                <Val v={cfg.filerPhone} />
              </td>
            </tr>
            <tr>
              <th>Contest Sponsor:</th>
              <td colSpan={5}>
                <Val v={cfg.sponsor} />
              </td>
            </tr>
          </tbody>
        </table>

        <h3 className="fwp-head">HOURS FISHED:</h3>
        <table className="fwp-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Start Time</th>
              <th>Stop Time</th>
              <th>Total Hours</th>
              <th># Fish Caught</th>
              <th># Fish Released</th>
            </tr>
          </thead>
          <tbody>
            {model.days.map((d) => (
              <tr key={d.dateKey}>
                <td className="fwp-num">{d.day}</td>
                <td className="fwp-num">
                  <Val v={d.start} />
                </td>
                <td className="fwp-num">
                  <Val v={d.stop} />
                </td>
                <td className="fwp-num">{d.hours === null ? <Val v="" /> : d.hours.toFixed(2)}</td>
                <td className="fwp-num">{d.caught}</td>
                <td className="fwp-num">{d.released ?? <Val v="" />}</td>
              </tr>
            ))}
            <Pad have={model.days.length} want={HOURS_ROWS} cols={6} />
          </tbody>
        </table>

        <h3 className="fwp-head">
          NUMBER OF FISH CAUGHT:{' '}
          <span className="fwp-head-note">
            **Please attach a copy of your contest results if available.
          </span>
        </h3>
        <table className="fwp-table">
          <thead>
            <tr>
              <th>Species Type</th>
              <th>Total Number Caught</th>
              <th>Minimum Length Required for Contest</th>
              <th>Number Released</th>
              <th>Number Died</th>
            </tr>
          </thead>
          <tbody>
            {model.species.map((s) => (
              <tr key={s.species}>
                <td>{s.species}</td>
                <td className="fwp-num">{s.caught}</td>
                <td className="fwp-num">
                  {model.scoring.includes(s.species) && minLength ? `${minLength}"` : ' '}
                </td>
                <td className="fwp-num">{s.released}</td>
                <td className="fwp-num">{s.died}</td>
              </tr>
            ))}
            <Pad have={model.species.length} want={SPECIES_ROWS} cols={5} />
          </tbody>
        </table>
        <div className="fwp-foot">
          <span>{FWP_FOOTER}</span>
          <span>Page 1 of 2</span>
        </div>
      </div>

      <div className="fwp-page">
        <h3 className="fwp-head">OTHER INFORMATION: (if required)</h3>
        <div className="fwp-area">
          <Val v={cfg.otherInfo} blank="nothing to report" />
        </div>
        <h3 className="fwp-head">COMMENTS:</h3>
        <div className="fwp-area">
          <Val v={cfg.comments} blank="none" />
        </div>
        <h3 className="fwp-head">OPTIONAL INFORMATION:</h3>
        <p className="fwp-sub">
          The following information is optional, but would be of interest for management purposes.
        </p>
        <p className="fwp-line">
          <strong>Body of Water:</strong>{' '}
          <Fill wide>
            <Val v={cfg.waterbody} />
          </Fill>
        </p>
        <p className="fwp-line">
          <strong>Water Level:</strong> <Tick actual={cfg.waterLevel} option="Up" />{' '}
          <Tick actual={cfg.waterLevel} option="Down" />{' '}
          <Tick actual={cfg.waterLevel} option="Normal" />
        </p>
        <p className="fwp-line">
          <strong>Air Temperature:</strong>{' '}
          <Fill>
            <Val v={cfg.airTemp} blank="" />
          </Fill>{' '}
          Degrees F<span className="fwp-gap" />
          <strong>Water Temperature:</strong>{' '}
          <Fill>
            <Val v={cfg.waterTemp} blank="" />
          </Fill>{' '}
          Degrees F
        </p>
        <p className="fwp-line">
          <strong>Water Clarity:</strong> <Tick actual={cfg.clarity} option="Clear" />{' '}
          <Tick actual={cfg.clarity} option="Semi-turbid" />{' '}
          <Tick actual={cfg.clarity} option="Muddy" />
        </p>
        <h3 className="fwp-head">SIZE DISTRIBUTION OF FISH CAUGHT:</h3>
        <p className="fwp-sub fwp-sub--em">
          Please record all fish caught that were 8 inches or longer.
        </p>
        <SizeTable
          rows={model.sizes.small}
          min={SIZE_SMALL_MIN}
          max={SIZE_SMALL_MAX}
          plusLast={false}
          padTo={SIZE_SMALL_ROWS}
        />
        <p className="fwp-sub fwp-sub--em">
          Please record all fish caught that were 12 inches or longer.
        </p>
        <SizeTable
          rows={model.sizes.large}
          min={SIZE_LARGE_MIN}
          max={SIZE_LARGE_MAX}
          plusLast
          padTo={SIZE_LARGE_ROWS}
        />
        <div className="fwp-foot">
          <span>{FWP_FOOTER}</span>
          <span>Page 2 of 2</span>
        </div>
      </div>
    </section>
  );
}

const or = (v: string | number | null | undefined, blank = '(not filled in)') => {
  const text = v === null || v === undefined ? '' : String(v).trim();
  return text === '' ? blank : text;
};

/** The same form as plain text, for pasting into an email to the region office. */
export function reportText(model: ReportModel, eventName: string, today: string): string {
  const cfg = model.settings;
  const res = model.residency;
  const unanswered = res.unknown ? ` (+${String(res.unknown)} unanswered)` : '';
  const sizeLines = (rows: readonly SizeRow[], plusAt: number | null) =>
    rows.length === 0
      ? ['(none)']
      : rows.map(
          (r) =>
            `${r.species}: ` +
            Object.entries(r.counts)
              .map(([inch, n]) => `${inch}${Number(inch) === plusAt ? '+' : ''}" ${String(n)}`)
              .join(', '),
        );
  const lines = [
    'FISHING CONTEST REPORT (Montana Fish, Wildlife & Parks)',
    `Region: ${or(cfg.region)}`,
    `Contest name: ${eventName}`,
    `Contest date(s): ${or(model.dates.map(formDate).join(', '))}`,
    `Waterbody: ${or(cfg.waterbody)}`,
    `Total # of anglers: ${String(model.counts.anglers)}; # of teams: ${String(model.counts.teams)}; # paid: ${String(model.counts.paid)}`,
    `# of Montana residents: ${String(res.resident)}${unanswered}; # of non-residents: ${String(res.nonresident)}${unanswered}; # of boats: ${String(model.boats)}`,
    `Size of winning fish: ${model.winner ? `${model.winner.lengthInches.toFixed(2)}"` : '(none)'}`,
    `Form completed by: ${or(cfg.filerName)}; date: ${today}`,
    `Mailing address: ${or((cfg.filerAddress ?? '').replace(/\s*\n\s*/g, ', '))}`,
    `Email: ${or(cfg.filerEmail)}; telephone: ${or(cfg.filerPhone)}`,
    `Contest sponsor: ${or(cfg.sponsor)}`,
    '',
    'HOURS FISHED',
    ...model.days.map(
      (d) =>
        `Day ${String(d.day)}: start ${or(d.start)}, stop ${or(d.stop)}, ${d.hours === null ? '(no total)' : `${d.hours.toFixed(2)} hours`}, ${String(d.caught)} caught, ${d.released === null ? '(released not filled in)' : `${String(d.released)} released`}`,
    ),
    '',
    'NUMBER OF FISH CAUGHT',
    ...(model.species.length === 0
      ? ['(none)']
      : model.species.map(
          (s) =>
            `${s.species}: ${String(s.caught)} caught, ${String(s.released)} released, ${String(s.died)} died` +
            (model.scoring.includes(s.species) && (cfg.minLength ?? '').trim()
              ? `, minimum length ${(cfg.minLength ?? '').trim()}"`
              : ''),
        )),
    '',
    `OTHER INFORMATION: ${or(cfg.otherInfo, 'nothing to report')}`,
    `COMMENTS: ${or(cfg.comments, 'none')}`,
    '',
    'OPTIONAL INFORMATION',
    `Body of water: ${or(cfg.waterbody)}`,
    `Water level: ${or(cfg.waterLevel, '(not recorded)')}`,
    `Air temperature: ${or(cfg.airTemp, '(not recorded)')} degrees F; water temperature: ${or(cfg.waterTemp, '(not recorded)')} degrees F`,
    `Water clarity: ${or(cfg.clarity, '(not recorded)')}`,
    '',
    'SIZE DISTRIBUTION, FISH 8 INCHES OR LONGER',
    ...sizeLines(model.sizes.small, null),
    'SIZE DISTRIBUTION, FISH 12 INCHES OR LONGER',
    ...sizeLines(model.sizes.large, SIZE_LARGE_MAX),
  ];
  return lines.join('\n');
}
