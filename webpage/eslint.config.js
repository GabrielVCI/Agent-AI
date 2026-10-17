import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/**
 * Configuración de ESLint de la landing comercial (flat config, ESLint 9).
 *
 * `package.json` declaraba el script `lint` desde el principio, pero ESLint no
 * estaba ni instalado: el script fallaba en seco. Ver docs/qa/QA_INITIAL_AUDIT.md
 * (hallazgo H4).
 */
export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', '*.tsbuildinfo', 'public', 'vite.config.ts'],
  },
  // Código del sitio: corre en el navegador.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  // Scripts de build (sitemap, prerender, iconos): corren en Node.
  {
    files: ['scripts/**/*.{ts,mjs,js}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // console.log es la salida esperada de un script de build.
      'no-console': 'off',
    },
  },
)
