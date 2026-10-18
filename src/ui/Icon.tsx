import type { ScreenId } from '../app/screens';

export type IconName =
  | ScreenId
  | 'signal'
  | 'location'
  | 'review'
  | 'contestants'
  | 'positions'
  | 'event'
  | 'results'
  | 'report';

const TROPHY = [
  'M8 21h8',
  'M12 17v4',
  'M7 4h10v6a5 5 0 0 1-10 0V4Z',
  'M7 6H4.5A1.5 1.5 0 0 0 3 7.5 3.5 3.5 0 0 0 6.5 11H7',
  'M17 6h2.5A1.5 1.5 0 0 1 21 7.5 3.5 3.5 0 0 1 17.5 11H17',
];
const DOLLAR = [
  'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0',
  'M15 8.5c-.8-.7-1.8-1-3-1-1.7 0-3 .9-3 2.2 0 3.4 6 1.3 6 4.5 0 1.3-1.3 2.3-3.1 2.3-1.3 0-2.5-.4-3.4-1.2M12 5.5v13',
];
const PIN = [
  'M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z',
  'M9.5 10a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0',
];

// Line icons, the old app's own set. Decorative: every one sits next to a
// text label, so they are hidden from screen readers.
// prettier-ignore
const PATHS: Partial<Record<IconName, readonly string[]>> = {
  home: ['M3 11.5 12 4l9 7.5', 'M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9'],
  catch: ['M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z', 'M15.3 13a3.3 3.3 0 1 1-6.6 0 3.3 3.3 0 0 1 6.6 0Z'],
  standings: TROPHY,
  results: TROPHY,
  report: ['M6 3.5h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1Z', 'M14 3.5v4h4', 'M8.5 12.5h7M8.5 16h4'],
  chat: ['M20 12a8 8 0 0 1-8 8H7l-3 3v-6.5A8 8 0 1 1 20 12Z', 'M8.5 11h7M8.5 14.5h4'],
  director: ['M8.8 12a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0', 'M19.4 13.9a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V20a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.98 18.35a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87A1.7 1.7 0 0 0 3.06 12.9H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 7.87a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V2a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V8a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03Z'],
  'check-in': ['M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0', 'm8 12 2.5 2.5L16 9'],
  'my-catches': ['M9 5h6', 'M9 3h6v4H9z', 'M7 5H5v16h14V5h-2', 'M8 12h8M8 16h5'],
  livewell: ['M3 12c4-5 10-6 15-2l3-3v10l-3-3c-5 4-11 3-15-2Z', 'M16 11h.01'],
  trophies: TROPHY,
  gallery: ['M5.5 5h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z', 'm6 16 3.5-4 2.5 3 2.5-3L18 16', 'M7.8 9.5a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0-2.4 0'],
  'side-bets': DOLLAR,
  payouts: DOLLAR,
  safety: PIN,
  location: PIN,
  signal: ['M5 12.6a10 10 0 0 1 14 0', 'M8.5 16a5 5 0 0 1 7 0', 'M11 19a1 1 0 1 0 2 0 1 1 0 1 0-2 0'],
  review: ['M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z', 'M9.4 12a2.6 2.6 0 1 0 5.2 0 2.6 2.6 0 1 0-5.2 0'],
  event: ['M5.5 5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z', 'M3.5 9.5h17M8 3.5v3M16 3.5v3', 'm9 14.5 2 2 4-4'],
  positions: ['M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z', 'M9.5 10a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0', 'M4.5 19.5h15'],
  contestants: ['M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19', 'M6.8 8a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0', 'M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4', 'M15.4 5.2a3.2 3.2 0 0 1 0 5.6'],
};

export function Icon({ name }: { readonly name: IconName }) {
  const paths = PATHS[name] ?? [];
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
