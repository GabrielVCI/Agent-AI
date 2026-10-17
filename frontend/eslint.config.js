import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/**
 * Configuración de ESLint del panel (flat config, ESLint 9).
 *
 * Las dependencias ya estaban en package.json desde que se creó el proyecto,
 * pero faltaba este archivo, así que `npm run lint` fallaba en seco. Ver
 * docs/qa/QA_INITIAL_AUDIT.md (hallazgo H4).
 */
export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', '*.tsbuildinfo', 'vite.config.ts'],
  },
  {
    files: ['**/*.{ts,tsx}'],
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

      // Un argumento sin usar es casi siempre ruido de un refactor; se permite
      // silenciarlo con el prefijo _ cuando la firma obliga a declararlo.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // `any` es deuda, no un error que deba frenar el build.
      '@typescript-eslint/no-explicit-any': 'warn',

      // `try { ... } catch {}` es intencional cuando el fallo no cambia nada
      // (p. ej. el logout limpia el estado local aunque la API falle). El resto
      // de bloques vacíos sí se marcan.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // ── Invariantes de seguridad del proyecto ──────────────────────────────
      // La sesión vive en una cookie httpOnly `sid`: el navegador no debe poder
      // leer NI guardar credenciales. localStorage sigue siendo válido para
      // preferencias de interfaz (p. ej. el colapso del sidebar), así que solo
      // se bloquean las claves que huelen a credencial.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name=/^(localStorage|sessionStorage)$/][callee.property.name='setItem'] > Literal:first-child[value=/token|jwt|auth|session|password|secret|credential/i]",
          message:
            'No guardes credenciales en localStorage/sessionStorage. La sesión de Sendwary vive en la cookie httpOnly `sid` (ver docs/LOCKED_DECISIONS.md).',
        },
        {
          selector:
            "CallExpression[callee.object.name=/^(localStorage|sessionStorage)$/][callee.property.name='getItem'] > Literal:first-child[value=/token|jwt|auth|session|password|secret|credential/i]",
          message:
            'No leas credenciales de localStorage/sessionStorage. La sesión de Sendwary vive en la cookie httpOnly `sid` (ver docs/LOCKED_DECISIONS.md).',
        },
      ],
    },
  },
)
