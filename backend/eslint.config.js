import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Configuración de ESLint del backend (flat config, ESLint 9).
 *
 * Hasta ahora `npm run lint` era `echo "Lint pendiente de configurar"`: pasaba
 * siempre sin analizar nada — un falso verde. Ver docs/qa/QA_INITIAL_AUDIT.md
 * (hallazgos H4 y R10).
 *
 * Criterio de severidad: `error` solo para lo que puede romper algo en
 * ejecución o filtrar información; `warn` para deuda técnica. Así el lint puede
 * usarse como puerta en CI sin que la deuda acumulada lo bloquee.
 */
export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'src/generated',
      'prisma/migrations',
      'eslint.config.js',
    ],
  },

  // ── Código de la API ────────────────────────────────────────────────────────
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',

      // Un catch vacío intencional es válido; el resto de bloques vacíos no.
      'no-empty': ['error', { allowEmptyCatch: true }],

      // Una promesa sin await dentro de un handler se traga los errores y deja
      // la petición colgada. Es la fuente clásica de "falla y nadie se entera".
      'no-floating-decimal': 'off',
      'require-atomic-updates': 'off',

      // ── Invariantes del proyecto ─────────────────────────────────────────
      // Los secretos jamás se serializan hacia el cliente. Esto no detecta
      // todos los casos posibles, pero sí el más común: meter el valor de una
      // variable sensible en una respuesta.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name=/^(json|send)$/] MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/APIKEY|API_KEY|SECRET|TOKEN|PASSWORD/i]",
          message:
            'Nunca devuelvas el valor de una variable de entorno sensible en una respuesta HTTP. Expón solo si está configurada (booleano), nunca su valor.',
        },
      ],
    },
  },

  // ── Pruebas y scripts operativos ────────────────────────────────────────────
  // Mismo análisis, pero sin exigencias pensadas para código de producción.
  {
    files: ['tests/**/*.ts', 'scripts/**/*.ts', 'prisma/*.ts', 'prisma.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Las pruebas y los backfills usan `any` para armar datos a propósito.
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
)
