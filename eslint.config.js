import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.histoire/**',
      '**/node_modules/**',
      'data/**',
      '.fermi-work/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      // one-word names like Lobby, Scoreboard are fine in an app (not a component library)
      'vue/multi-word-component-names': 'off',
      // QR codes are SVG strings we generate ourselves
      'vue/no-v-html': 'off',
    },
  },
  {
    files: ['**/*.story.vue', '**/test/**', 'e2e/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off', 'vue/one-component-per-file': 'off' },
  },
  prettier,
)
