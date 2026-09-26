import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Things the engine must never use. The server replays games through the engine,
// so it has to give the same result for the same seed and inputs on any machine.
const engineOnlyRules = {
  'no-restricted-properties': [
    'error',
    { object: 'Math', property: 'random', message: 'Use the seeded Rng from rng.ts.' },
    { object: 'Date', property: 'now', message: 'The engine counts ticks, not wall-clock time.' },
    {
      object: 'performance',
      property: 'now',
      message: 'The engine counts ticks, not wall-clock time.',
    },
  ],
  'no-restricted-globals': [
    'error',
    { name: 'Date', message: 'The engine counts ticks, not wall-clock time.' },
    { name: 'window', message: 'The engine must not touch the DOM.' },
    { name: 'document', message: 'The engine must not touch the DOM.' },
    { name: 'localStorage', message: 'The engine must not do I/O.' },
    { name: 'fetch', message: 'The engine must not do I/O.' },
    { name: 'setTimeout', message: 'The engine is advanced by step(), not by timers.' },
    { name: 'setInterval', message: 'The engine is advanced by step(), not by timers.' },
    { name: 'requestAnimationFrame', message: 'The engine is advanced by step(), not by timers.' },
  ],
};

export default defineConfig([
  globalIgnores(['**/dist/', '**/coverage/', '**/node_modules/']),

  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  {
    files: ['packages/engine/src/**/*.ts'],
    rules: engineOnlyRules,
  },

  // Must stay last: turns off any rule that would fight with Prettier's formatting.
  prettier,
]);