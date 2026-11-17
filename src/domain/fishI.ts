// Fish-I's answer about a catch photo, as the director's screen shows it: what
// it reads the fish as, and what a director would want a second look at. The
// answer is advice. Fish-I never decides whether a catch counts, and never
// judges the length: the director reads the board.
//
// The server function (api/fish-i.ts) saves the answer on the catch; this reads
// it back defensively, because whatever is stored is only shown, never trusted.

export interface FishIReview {
  readonly species: string | null;
  /** 0 to 1. */
  readonly speciesConfidence: number | null;
  readonly matchesClaim: boolean | null;
  readonly boardVisible: boolean | null;
  readonly fishFlat: boolean | null;
  readonly noseAtStop: boolean | null;
  readonly tailInFrame: boolean | null;
  readonly handBlocking: boolean | null;
  readonly concerns: readonly string[];
  readonly notes: string | null;
}

export interface FishIFinding {
  readonly level: 'flag' | 'review' | 'info';
  readonly text: string;
}

const flag = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const text = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.slice(0, max) : null;

/** A saved answer, or null when there is none worth showing. */
export function readFishIReview(value: unknown): FishIReview | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const r = value as Readonly<Record<string, unknown>>;
  const confidence = r['speciesConfidence'];
  const review: FishIReview = {
    species: text(r['species'], 60),
    speciesConfidence:
      typeof confidence === 'number' && Number.isFinite(confidence)
        ? Math.max(0, Math.min(1, confidence))
        : null,
    matchesClaim: flag(r['matchesClaim']),
    boardVisible: flag(r['boardVisible']),
    fishFlat: flag(r['fishFlat']),
    noseAtStop: flag(r['noseAtStop']),
    tailInFrame: flag(r['tailInFrame']),
    handBlocking: flag(r['handBlocking']),
    concerns: Array.isArray(r['concerns'])
      ? r['concerns']
          .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
          .slice(0, 8)
          .map((c) => c.slice(0, 200))
      : [],
    notes: text(r['notes'], 400),
  };
  const anything =
    review.species !== null ||
    review.concerns.length > 0 ||
    [review.matchesClaim, review.boardVisible, review.fishFlat].some((v) => v !== null);
  return anything ? review : null;
}

/** "reads as walleye (93% confidence) · A clear photo of a walleye on a bump board." */
export function fishISummary(r: FishIReview): string {
  const confidence =
    r.speciesConfidence === null
      ? ''
      : ` (${String(Math.round(r.speciesConfidence * 100))}% confidence)`;
  return `reads as ${r.species ?? 'unknown'}${confidence}${r.notes ? ` · ${r.notes}` : ''}`;
}

/** What the director should look at again, in the old app's words; all clear when nothing. */
export function fishIFindings(r: FishIReview, claimedSpecies: string): FishIFinding[] {
  const out: FishIFinding[] = [];
  if (r.matchesClaim === false) {
    out.push({
      level: 'flag',
      text: `Does not look like the ${claimedSpecies} the angler entered.`,
    });
  }
  const review = (t: string) => {
    out.push({ level: 'review', text: t });
  };
  if (r.boardVisible === false) review('No bump board with a readable scale in frame.');
  if (r.fishFlat === false) review('Fish is not lying flat along the board.');
  if (r.noseAtStop === false) review('Nose does not appear to be against the zero stop.');
  if (r.tailInFrame === false) review('Tail or the scale beneath it is not fully visible.');
  if (r.handBlocking === true) review('A hand is covering the nose, tail or the markings.');
  for (const c of r.concerns) review(c);
  if (out.length === 0) {
    out.push({ level: 'info', text: 'No species, framing or integrity concerns raised.' });
  }
  return out;
}
