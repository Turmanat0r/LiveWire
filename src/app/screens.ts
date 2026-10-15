// Every screen in the app, in one list: its address, its name, its colour
// theme, and (until it is built) the milestone it arrives in. The router, the
// home tiles and the placeholders all read from here, so a screen is added in
// exactly one place.

export type ScreenId =
  | 'home'
  | 'register'
  | 'check-in'
  | 'catch'
  | 'my-catches'
  | 'livewell'
  | 'standings'
  | 'big-fish'
  | 'side-bets'
  | 'payouts'
  | 'safety'
  | 'chat'
  | 'gallery'
  | 'trophies'
  | 'director';

export interface Screen {
  readonly id: ScreenId;
  readonly path: string;
  readonly title: string;
  readonly summary: string;
  /** Sets data-theme on the shell; see tokens.css. */
  readonly theme: string;
  /** The milestone that builds it, while it is still a placeholder. */
  readonly milestone: number | null;
}

// prettier-ignore
export const SCREENS: readonly Screen[] = [
  { id: 'home', path: '/', title: 'LiveWire', summary: 'The tournament at a glance.', theme: 'home', milestone: null },
  { id: 'register', path: '/register', title: 'Register', summary: 'Enter the tournament, or bring your entry onto this phone.', theme: 'register', milestone: null },
  { id: 'check-in', path: '/check-in', title: 'Check in / check out', summary: 'Check in before you launch and out when you are back on shore.', theme: 'check-in', milestone: null },
  { id: 'catch', path: '/catch', title: 'Submit a catch', summary: 'Photograph a fish on the board and file it, with or without signal.', theme: 'catch', milestone: null },
  { id: 'my-catches', path: '/my-catches', title: 'My catches', summary: 'Everything you have filed, and where each one stands.', theme: 'my-catches', milestone: null },
  { id: 'livewell', path: '/livewell', title: 'Livewell', summary: 'Your running tally of released fish.', theme: 'livewell', milestone: null },
  { id: 'safety', path: '/safety', title: 'Safety', summary: 'Where you are against the course line, and a beacon if you need help.', theme: 'safety', milestone: null },
  { id: 'standings', path: '/standings', title: 'Standings', summary: 'Solo and team boards, longest fish first.', theme: 'standings', milestone: null },
  { id: 'big-fish', path: '/big-fish', title: 'Big Fish', summary: 'The side pot for the single longest fish.', theme: 'big-fish', milestone: null },
  { id: 'side-bets', path: '/side-bets', title: 'Side bets', summary: 'Smallest fish, most fish, first fish, or anything else you can settle.', theme: 'side-bets', milestone: 6 },
  { id: 'payouts', path: '/payouts', title: 'Payouts', summary: 'What each pool holds and how it splits.', theme: 'payouts', milestone: null },
  { id: 'chat', path: '/chat', title: 'Chat', summary: 'The boat-ramp group chat, with every catch announced.', theme: 'chat', milestone: 6 },
  { id: 'director', path: '/director', title: 'Director', summary: 'Review catches, run the roster, set up the event and file the state report.', theme: 'director', milestone: 7 },
  { id: 'gallery', path: '/gallery', title: 'Gallery', summary: 'Every approved fish, yours first.', theme: 'gallery', milestone: 8 },
  { id: 'trophies', path: '/trophies', title: 'Trophy case', summary: 'Your placings across every tournament.', theme: 'trophies', milestone: 8 },
];

export function screen(id: ScreenId): Screen {
  const found = SCREENS.find((s) => s.id === id);
  if (!found) throw new Error(`No screen called ${id}`);
  return found;
}

/** The bottom tab bar, in order, with the short label each tab wears. */
export const TABS: readonly { readonly id: ScreenId; readonly label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'catch', label: 'Submit' },
  { id: 'standings', label: 'Standings' },
  { id: 'chat', label: 'Chat' },
  { id: 'director', label: 'Director' },
];
