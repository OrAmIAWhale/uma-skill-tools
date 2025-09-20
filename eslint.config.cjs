// eslint.config.js (CommonJS format for ESLint v9+)

const js = require('@eslint/js');
const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const importPlugin = require('eslint-plugin-import');
const prettierPlugin = require('eslint-plugin-prettier');
const unicorn = require('eslint-plugin-unicorn');

module.exports = [
  {
    ignores: ['node_modules/', 'dist/', '.tsbuildinfo', '.history/', '**/*.history.*'],
  },

  // JS
  js.configs.recommended,

  // Defaults
  {
    files: ['src/**/*.ts', 'tools/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
        ecmaVersion: 'latest',
      },
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // Test overrides
  {
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Import plugin
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      ...importPlugin.configs.recommended.rules,
      ...(importPlugin.configs.typescript?.rules ?? {}),
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
  },

  // Unicorn
  {
    plugins: {
      unicorn,
    },
    rules: {
      'unicorn/no-empty-file': 'off',
      'unicorn/prevent-abbreviations': [
        'off',
        {
          checkProperties: false,
          checkFilenames: false,
        },
      ],
    },
  },

  // Prettier
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },
];
