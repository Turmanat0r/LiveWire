// @ts-check
/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  rules: {
    // Cascade layers decide what wins. !important is how the old stylesheet
    // fought its own inline styles (71 of them); there is nothing to fight now.
    'declaration-no-important': true,
    // Ids are for the DOM and for labels, never for styling.
    'selector-max-id': 0,
    // Colours come from tokens.css and nowhere else, so a theme is one file.
    'color-no-hex': true,
    'color-named': 'never',
    'function-disallowed-list': ['rgb', 'rgba', 'hsl', 'hsla'],
    // block__element and block--modifier, all lower case.
    'selector-class-pattern': [
      '^[a-z][a-z0-9]*(-[a-z0-9]+)*(__[a-z0-9]+(-[a-z0-9]+)*)?(--[a-z0-9]+(-[a-z0-9]+)*)?$',
      { message: 'Use block, block__element or block--modifier in kebab-case' },
    ],
    // env(safe-area-inset-*, 0px) sits inside calc(), where a bare 0 is invalid.
    'length-zero-no-unit': [true, { ignoreFunctions: ['env'] }],
    // iOS Safari still reads only the prefixed form.
    'property-no-vendor-prefix': [true, { ignoreProperties: ['/text-size-adjust/'] }],
    // Tokens are grouped by blank lines.
    'custom-property-empty-line-before': null,
    // 13px is the smallest readable text on a phone in sunlight. The old home
    // screen went down to 8px. Sizes come from the tokens, in rem.
    'declaration-property-value-disallowed-list': {
      'font-size': ['/^[0-9](\\.[0-9]+)?px$/', '/^1[0-2](\\.[0-9]+)?px$/'],
    },
  },
  overrides: [
    {
      files: ['src/styles/tokens.css'],
      rules: {
        'color-no-hex': null,
        'function-disallowed-list': null,
      },
    },
  ],
};
