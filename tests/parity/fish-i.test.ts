// Fish-I's server function, side by side with the old app's api/fish-i.js: the
// same prompt word for word, the same model chosen from the same list, the
// same reading of Google's errors, and the same clean-up of the answer.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { loadLegacyFishI } from './legacy';
import {
  buildPrompt,
  clean,
  directorClaim,
  googleRetrySeconds,
  isDailyQuota,
  isRetryableModelStatus,
  normalize,
  pickModel,
  rankModels,
  speciesBare,
  speciesPhrase,
} from '../../api/fish-i';

const legacy = loadLegacyFishI();
const RUNS = 1_000;

const speciesList = fc
  .subarray(['Walleye', 'Northern Pike', 'Yellow Perch', 'Lake Trout', 'Smallmouth Bass'])
  .map((names) => names.join(', '));
const anyText = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc.constantFrom('Canyon Ferry Reservoir', 'the tournament water', 'Hauser Lake (north end)'),
);

const MODEL_NAMES = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-flash-latest',
  'gemini-3.0-flash-preview-09-2026',
  'gemini-2.5-flash-exp-0827',
  'gemini-1.5-pro-latest',
  'gemini-embedding-001',
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-preview-tts',
  'gemini-live-2.5-flash',
  'imagen-4.0-generate',
  'text-bison-001',
  'gemma-3-27b-it',
];
const modelArb = fc.record({
  name: fc.constantFrom(...MODEL_NAMES.map((n) => `models/${n}`), 42),
  supportedGenerationMethods: fc.oneof(
    fc.constant(['generateContent', 'countTokens']),
    fc.constant(['embedContent']),
    fc.constant(undefined),
  ),
});

const answerValue = fc.oneof(
  fc.string({ maxLength: 300 }),
  fc.double({ noNaN: true, min: -2, max: 3 }),
  fc.boolean(),
  fc.constant(null),
  fc.array(
    fc.oneof(
      fc.string({ maxLength: 250 }),
      fc.integer(),
      fc.constant(null),
      fc.array(fc.integer(), { maxLength: 3 }),
      fc.constant({ a: 1 }),
    ),
    { maxLength: 10 },
  ),
  fc.constant({ nested: true }),
);
const answerArb = fc.dictionary(
  fc.constantFrom(
    'species',
    'speciesConfidence',
    'matchesClaim',
    'boardVisible',
    'fishFlat',
    'noseAtStop',
    'tailInFrame',
    'handBlocking',
    'concerns',
    'notes',
    'length',
  ),
  answerValue,
);

describe('Fish-I matches the old app', () => {
  it('asks Gemini in exactly the same words', () => {
    fc.assert(
      fc.property(
        speciesList,
        anyText,
        fc.constantFrom('Walleye', 'Northern Pike', 'Other', ''),
        fc.constantFrom('21.5', '18', '', 'an unstated'),
        fc.boolean(),
        (target, water, claimed, length, scoring) => {
          expect(buildPrompt(target, water, claimed, length, scoring)).toBe(
            legacy.buildPrompt(target, water, claimed, length, scoring),
          );
          expect([speciesPhrase(target), speciesBare(target)]).toEqual([
            legacy.speciesPhrase(target),
            legacy.speciesBare(target),
          ]);
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('cleans what goes into the prompt the same way', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.integer(), fc.constant(null)), fc.nat(130), (v, max) => {
        expect(clean(v, max)).toBe(legacy.clean(v, max));
      }),
      { numRuns: RUNS },
    );
  });

  it('chooses the same model from what the key offers', () => {
    fc.assert(
      fc.property(fc.array(modelArb, { maxLength: 12 }), (models) => {
        expect(rankModels(models)).toEqual(legacy.rankModels(models));
        expect(pickModel(models)).toBe(legacy.pickModel(models));
      }),
      { numRuns: RUNS },
    );
  });

  it('reads Google’s refusals the same way', () => {
    for (let status = 100; status < 600; status++) {
      expect(isRetryableModelStatus(status)).toBe(legacy.isRetryableModelStatus(status));
    }
    const payloads = [
      '',
      'not json',
      '{}',
      JSON.stringify({
        error: {
          message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 250',
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
              violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
            },
            { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' },
          ],
        },
      }),
      JSON.stringify({
        error: {
          message: 'Resource exhausted',
          details: [{ retryDelay: '2.5s' }, { retryDelay: 'soon' }],
        },
      }),
      JSON.stringify({ error: { message: 'You have used your daily allowance.' } }),
    ];
    for (const raw of payloads) {
      expect([googleRetrySeconds(raw), isDailyQuota(raw)]).toEqual([
        legacy.googleRetrySeconds(raw),
        legacy.isDailyQuota(raw),
      ]);
    }
  });

  it('keeps the same fields of an answer, in the same types', () => {
    fc.assert(
      fc.property(answerArb, (raw) => {
        expect(normalize(raw)).toEqual(legacy.normalize(raw));
      }),
      { numRuns: RUNS },
    );
  });

  it('reads the director claim from the same place', () => {
    const users: unknown[] = [
      null,
      {},
      { app_metadata: { director: true } },
      { app_metadata: { director: 'true' } },
      { app_metadata: { director: 1 } },
      { user_metadata: { director: true } },
      { app_metadata: null },
    ];
    for (const u of users) expect(directorClaim(u)).toBe(legacy.directorClaim(u));
  });
});
