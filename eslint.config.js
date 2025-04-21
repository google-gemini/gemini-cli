/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactRecommended from 'eslint-plugin-react/configs/recommended.js';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import licenseHeader from 'eslint-plugin-license-header';

export default tseslint.config(
  {
    // Global ignores
    ignores: [
      'node_modules/**',
      'eslint.config.js',
      'packages/cli/dist/**',
      'packages/server/dist/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // React specific config
    files: ['packages/cli/src/**/*.tsx'], // Target only TSX in the cli package
    languageOptions: {
      // Keep languageOptions from reactRecommended if needed, or define explicitly
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      // Define the plugins used in this block
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      // Apply recommended rules explicitly
      ...reactRecommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Custom overrides
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    // Import specific config
    files: ['packages/cli/src/**/*.{ts,tsx}'], // Target only TS/TSX in the cli package
    plugins: {
      import: importPlugin,
    },
    settings: {
      'import/resolver': {
        node: true,
      },
    },
    rules: {
      ...importPlugin.configs.recommended.rules,
      ...importPlugin.configs.typescript.rules,
      'import/no-default-export': 'warn',
      'import/no-unresolved': 'off', // Disable for now, can be noisy with monorepos/paths
    },
  },
  {
    // General overrides and rules for the project (TS/TSX files)
    files: ['packages/cli/src/**/*.{ts,tsx}'], // Target only TS/TSX in the cli package
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      // General Best Practice Rules (subset adapted for flat config)
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      'arrow-body-style': ['error', 'as-needed'],
      curly: ['error', 'multi-line'],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as' },
      ],
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        { accessibility: 'no-public' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-inferrable-types': [
        'error',
        { ignoreParameters: true, ignoreProperties: true },
      ],
      '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-cond-assign': 'error',
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="require"]',
          message: 'Avoid using require(). Use ES6 imports instead.',
        },
        {
          selector: 'ThrowStatement > Literal:not([value=/^\\w+Error:/])',
          message:
            'Do not throw string literals or non-Error objects. Throw new Error("...") instead.',
        },
      ],
      'no-unsafe-finally': 'error',
      'no-unused-expressions': 'off', // Disable base rule
      '@typescript-eslint/no-unused-expressions': [
        // Enable TS version
        'error',
        { allowShortCircuit: true, allowTernary: true },
      ],
      'no-var': 'error',
      'object-shorthand': 'error',
      'one-var': ['error', 'never'],
      'prefer-arrow-callback': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      radix: 'error',
      'default-case': 'error',
    },
  },
  {
    files: ['./**/*.{tsx,ts,js}'],
    plugins: {
      'license-header': licenseHeader,
    },
    rules: {
      'license-header/header': [
        'error',
        [
          '/**',
          ' * @license',
          ' * Copyright 2025 Google LLC',
          ' * SPDX-License-Identifier: Apache-2.0',
          ' */',
        ],
      ],
    },
  },
  // Prettier config must be last
  prettierConfig,
);
