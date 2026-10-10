import type { ScreenId } from '../app/screens';

// Line icons for the tab bar, drawn from the old app's own set. Decorative:
// every one sits next to a text label, so they are hidden from screen readers.
// prettier-ignore
const PATHS: Partial<Record<ScreenId, readonly string[]>> = {
  home: ['M3 11.5 12 4l9 7.5', 'M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9'],
  catch: ['M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z', 'M15.3 13a3.3 3.3 0 1 1-6.6 0 3.3 3.3 0 0 1 6.6 0Z'],
  standings: ['M8 21h8', 'M12 17v4', 'M7 4h10v6a5 5 0 0 1-10 0V4Z', 'M7 6H4.5A1.5 1.5 0 0 0 3 7.5 3.5 3.5 0 0 0 6.5 11H7', 'M17 6h2.5A1.5 1.5 0 0 1 21 7.5 3.5 3.5 0 0 1 17.5 11H17'],
  chat: ['M20 12a8 8 0 0 1-8 8H7l-3 3v-6.5A8 8 0 1 1 20 12Z', 'M8.5 11h7M8.5 14.5h4'],
  director: ['M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1', 'M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z'],
};

export function Icon({ name }: { readonly name: ScreenId }) {
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
