import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Engine modules that build or schedule audio. The editor must play sound only through
// src/engine/index.ts (createKit); the pure modules types.ts, notes.ts and schema.ts are allowed.
const ENGINE_INTERNALS = [
  'context',
  'voice',
  'envelope',
  'noise',
  'limiter',
  'theme',
  'prefs',
  'bind',
  'render',
];

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  URL: 'readonly',
  Buffer: 'readonly',
};

export default [
  {
    ignores: ['dist/', 'generated/', 'node_modules/', 'test-results/', 'playwright-report/'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    languageOptions: { globals: nodeGlobals },
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?![.]/)',
              message:
                'src/engine is self-contained: import only sibling engine modules (./x). No packages, no ../ paths.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/editor/**/*.ts', 'src/export/**/*.ts', 'src/presets/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `engine/(${ENGINE_INTERNALS.join('|')})([.]ts)?$`,
              message:
                'Play sound only through src/engine/index.ts (createKit). types.ts, notes.ts and schema.ts are the only other engine modules allowed here.',
            },
          ],
        },
      ],
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
