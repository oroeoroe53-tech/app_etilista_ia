import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescript from 'eslint-config-next/typescript'

/*
 * Next 16 publica `eslint-config-next` ya en formato flat config, así que se
 * importa directamente. Envolverlo con `FlatCompat` (lo habitual hasta Next 15)
 * rompe con un error de estructura circular.
 */
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'public/sw.js', 'next-env.d.ts'],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Convención del proyecto: un guion bajo delante marca algo descartado a
      // propósito, normalmente al desestructurar para omitir una propiedad.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]

export default config
