import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'tests/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.webextensions, ...globals.node },
    },
    rules: {
      // 新代码（engine/gameplay）必须零告警；旧文件逐步收敛
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-func-assign': 'error',
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-class-members': 'error',
      'no-self-assign': 'error',
      'no-unreachable': 'error',
      'no-unsafe-negation': 'warn',
      eqeqeq: ['warn', 'smart'],
      'prefer-const': 'off',
    },
  },
  {
    files: ['src/engine/**/*.js', 'src/ai/**/*.js', 'src/content/**/*.js'],
    rules: {
      'no-unused-vars': 'error',
      eqeqeq: 'error',
    },
  },
];
