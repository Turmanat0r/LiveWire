// Phone numbers and board codes: the two things that tie a person to an entry.

/**
 * Digits only, last ten. 406-555-0100, (406) 555 0100 and +1 4065550100 are
 * one angler. Every entrant dials a North American number; an international
 * field would need more than this.
 */
export function normalizePhone(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '').slice(-10);
}

export function isCompletePhone(value: string | null | undefined): boolean {
  return normalizePhone(value).length === 10;
}

/**
 * Board codes are written on a wet bump board with a marker and read back off
 * a photo, so no two characters in the alphabet may look alike. Dropped:
 * 0 1 2 5 8 B G I L O S U V Z. The database draws them (unique across every
 * event); the app only ever reads one back.
 */
export const CODE_ALPHABET = '34679ACDEFHJKMNPQRTWXY';
export const CODE_LENGTH = 4;
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/**
 * What an angler typed into "sign in to my entry", made comparable: upper
 * case, no spaces or dashes. Codes issued before the alphabet existed were
 * four digits, and still count.
 */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function looksLikeCode(input: string): boolean {
  const code = normalizeCode(input);
  return /^\d{4}$/.test(code) || CODE_PATTERN.test(code);
}
