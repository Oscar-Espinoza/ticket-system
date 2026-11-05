// ESLint for the SvelteKit app: TypeScript + Svelte recommended rules.
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['build/**', '.svelte-kit/**', 'node_modules/**', 'public/**', 'src/lib/remote/**', 'src/lib/actions/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // TypeScript already checks these (svelte-check / tsc).
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser, extraFileExtensions: ['.svelte'] } },
    rules: {
      // Plain string hrefs/goto targets are fine here (no base path).
      'svelte/no-navigation-without-resolve': 'off',
      // Misfires on re-exports from <script module>.
      'no-import-assign': 'off',
      // Advisory: local Map/Set/Date in functions are often not meant to be reactive.
      'svelte/prefer-svelte-reactivity': 'warn',
      'svelte/prefer-writable-derived': 'warn',
      // Style-only, left from the port; clean up opportunistically.
      'svelte/no-useless-mustaches': 'warn',
      'svelte/no-unused-svelte-ignore': 'warn',
      'svelte/no-useless-children-snippet': 'warn',
    },
  },
);
