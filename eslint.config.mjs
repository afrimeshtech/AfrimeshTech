import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

/**
 * ESLint flat config.
 *
 * `eslint-config-next` 16 ships native flat config, so these are spread
 * directly — routing them through `FlatCompat` double-wraps the plugin objects
 * and throws on a circular structure.
 *
 * The rules below the presets are the ones that map to mistakes this codebase
 * can actually make, rather than style opinions Prettier already settles.
 *
 * @type {import('eslint').Linter.Config[]}
 */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', '.pgdata/**', 'next-env.d.ts'],
  },

  ...coreWebVitals,
  ...typescript,

  {
    rules: {
      // Unused values are usually a half-finished refactor. Leading
      // underscores are the documented escape hatch for deliberate ones.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // `any` erases the type safety the rest of the codebase depends on.
      '@typescript-eslint/no-explicit-any': 'error',

      // `==` against null is idiomatic here; everything else is not.
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // Catches `if (x = 1)` typos in business rules.
      'no-cond-assign': ['error', 'always'],
    },
  },

  {
    // Scripts and tests run outside Next.js: they print and exit by design.
    files: ['scripts/**/*.ts', 'src/**/*.test.ts'],
    rules: {
      'no-console': 'off',
    },
  },
]

export default config
