import { describe, expect, it } from 'vitest';
import { generateHandle, uniqueHandle } from './handles';
import {
  CODE_ALPHABET,
  isCompletePhone,
  looksLikeCode,
  normalizeCode,
  normalizePhone,
} from './identity';
import { dHashFromGrey, hammingHex, isDuplicate, photoHashDistance } from './photo';
import { seededRandom } from '../test/arbitraries';

describe('phone numbers', () => {
  it('treats punctuation and a country code as the same number', () => {
    for (const v of ['406-555-0100', '(406) 555 0100', '+1 4065550100']) {
      expect(normalizePhone(v)).toBe('4065550100');
    }
    expect(isCompletePhone('555-0100')).toBe(false);
    expect(normalizePhone(null)).toBe('');
  });
});

describe('board codes', () => {
  it('has no two characters that look alike', () => {
    for (const ch of '0125 8BGILOSUVZ'.replace(' ', '')) expect(CODE_ALPHABET).not.toContain(ch);
  });

  it('accepts what an angler types, and the old four-digit codes', () => {
    expect(normalizeCode(' 7k-9x ')).toBe('7K9X');
    expect(looksLikeCode('7k9x')).toBe(true);
    expect(looksLikeCode('0123')).toBe(true);
    expect(looksLikeCode('7KOX')).toBe(false);
    expect(looksLikeCode('7K9')).toBe(false);
  });
});

describe('handles', () => {
  it('is reproducible from the same random numbers', () => {
    expect(generateHandle(seededRandom(42))).toBe(generateHandle(seededRandom(42)));
  });

  it('never repeats a handle already on the roster, whatever the case', () => {
    const random = seededRandom(7);
    const taken: string[] = [];
    for (let i = 0; i < 300; i++) taken.push(uniqueHandle(taken, random));
    expect(new Set(taken.map((h) => h.toLowerCase())).size).toBe(300);
  });
});

describe('photo fingerprints', () => {
  it('hashes a 9x8 grid to 64 bits', () => {
    const ramp = Array.from({ length: 72 }, (_, i) => 72 - i);
    expect(dHashFromGrey(ramp)).toBe('ffffffffffffffff');
    expect(dHashFromGrey(ramp.map((v) => -v))).toBe('0000000000000000');
  });

  it('counts differing bits, and refuses to compare mismatched hashes', () => {
    expect(hammingHex('f0', '0f')).toBe(8);
    expect(hammingHex('ff', 'fff')).toBe(64);
    expect(hammingHex(undefined, 'ff')).toBe(64);
  });

  it('matches a crop through a window, against a tighter bar', () => {
    const original = ['0000000000000000', 'ffff000000000000'];
    const crop = ['ffff000000000007'];
    const match = photoHashDistance(original, crop);
    expect(match).toEqual({ distance: 3, cropped: true });
    expect(isDuplicate(match)).toBe(true);
    expect(isDuplicate({ distance: 5, cropped: true })).toBe(false);
    expect(isDuplicate({ distance: 5, cropped: false })).toBe(true);
  });
});
