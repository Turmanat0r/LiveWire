// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'coverage', 'playwright-report', 'test-results'] },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Numbers in template strings are fine; it is objects that print badly.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Prefer the narrow, checked ways of saying "this might be missing".
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-syntax': [
        'error',
        {
          // The Content-Security-Policy refuses inline styles; styles live in
          // CSS files. A custom property is the one exception, and goes through
          // a class or a CSS variable set by a hook, not a style attribute.
          selector: "JSXAttribute[name.name='style']",
          message: 'Use a class from a stylesheet. Inline styles are blocked by the CSP.',
        },
        {
          // Text from the database is rendered as text, always. This is what
          // makes the old escapeHtml() unnecessary.
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Render text, not HTML. Anything from the database is untrusted.',
        },
        {
          selector: "MemberExpression[property.name='innerHTML']",
          message: 'Build DOM with React, not HTML strings.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.tsx'],
    ...jsxA11y.flatConfigs.strict,
  },

  {
    // Config files and Node-side tests.
    files: ['*.config.{js,ts}', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    // The old app's stub page is all do-nothing methods, on purpose.
    files: ['tests/parity/**/*.ts'],
    rules: { '@typescript-eslint/no-empty-function': 'off' },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
