import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Layer boundaries (see docs/architecture.md). Patterns match both `@/layer/...` and relative paths.
const layer = (name) => [`@/${name}`, `@/${name}/**`, `**/${name}/**`];

const browserGlobalsForbiddenInDomain = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'navigator',
  'fetch',
].map((name) => ({ name, message: 'Domain code must stay free of browser/storage APIs.' }));

export default defineConfig(
  {
    ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'node_modules'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
  },
  {
    files: ['src/**/*.tsx'],
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
  },
  {
    files: ['src/domain/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      'no-restricted-globals': ['error', ...browserGlobalsForbiddenInDomain],
      'no-restricted-imports': [
        'error',
        {
          paths: ['react', 'react-dom', 'dexie'].map((name) => ({
            name,
            message: 'Domain code must not depend on UI or storage libraries.',
          })),
          patterns: [
            {
              group: [
                ...layer('ui'),
                ...layer('app'),
                ...layer('application'),
                ...layer('repositories'),
                ...layer('persistence'),
                ...layer('backup'),
              ],
              message: 'Domain is the innermost layer and may only import other domain modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.ts', 'src/repositories/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['react', 'react-dom', 'dexie'].map((name) => ({
            name,
            message:
              'Use cases and repository interfaces must not depend on UI or storage libraries.',
          })),
          patterns: [
            {
              group: [...layer('ui'), ...layer('app'), ...layer('persistence')],
              message: 'Depend on repository interfaces, not on UI or a concrete storage adapter.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'dexie', message: 'UI must go through application services.' }],
          patterns: [
            { group: layer('persistence'), message: 'UI must go through application services.' },
          ],
        },
      ],
    },
  },
  {
    files: ['*.config.{js,ts}', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
