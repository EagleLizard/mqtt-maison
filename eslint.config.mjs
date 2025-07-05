
import globals from 'globals';
import pluginJs from '@eslint/js';
import tsEslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    files: [
      '**/*.js',
    ],
    languageOptions: {
      sourceType: 'commonjs',
    },
  },
  {languageOptions: { globals: globals.node }},
  pluginJs.configs.recommended,
  tsEslint.configs.recommended,
  {
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      indent: [
        'error',
        2,
        {
          'MemberExpression': 1,
          'SwitchCase': 1
        }
      ],
      semi: 'error',
      eqeqeq: [ 'error', 'always' ],
      'no-octal': [ 'off' ],
      'no-multiple-empty-lines': [ 'error', { 'max': 1, 'maxBOF': 1 }],
      '@stylistic/array-bracket-spacing': [ 'error', 'always', {
        objectsInArrays: false,
        arraysInArrays: false,
      }],
      '@stylistic/eol-last': [ 'error', 'always' ],
      '@stylistic/no-trailing-spaces': [ 'error' ],
      '@stylistic/max-len': [ 'warn', {
        code: 100,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreComments: true,
      }],
      '@stylistic/quotes': [ 'error', 'single', {
        avoidEscape: true,
        allowTemplateLiterals: 'avoidEscape',
      }],
      /* TS */
      'prefer-const': [ 'off' ],
      'no-unused-vars': [ 'off' ],
      '@typescript-eslint/no-this-alias': [ 'warn' ],
      '@typescript-eslint/no-unused-vars': [ 'warn' ],
    },
  },
];

const tsConfig = tsEslint.config(config);

export default tsConfig;
