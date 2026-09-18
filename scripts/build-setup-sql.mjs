import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Concatena las migraciones en un único archivo, para poder ejecutarlas de una
 * sola vez en el editor SQL de Supabase.
 *
 * La fuente de verdad siguen siendo los archivos de `supabase/migrations/`:
 * este archivo es derivado y se regenera. No editarlo a mano.
 *
 *   node scripts/build-setup-sql.mjs
 */

const DIR = 'supabase/migrations'
const OUT = 'supabase/setup.sql'

const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort()

const header = `-- =============================================================================
-- ARCHIVO GENERADO - no editar a mano.
-- Concatenacion de ${DIR}/ en orden, para ejecutarlo de una vez
-- en el editor SQL de Supabase.
-- Regenerar con: node scripts/build-setup-sql.mjs
-- =============================================================================
`

const parts = [header]
for (const file of files) {
  parts.push(`\n-- >>>>>>>>>>>>>>>>>>>> ${DIR}/${file}\n`)
  parts.push(await readFile(join(DIR, file), 'utf8'))
  parts.push('\n')
}

await writeFile(OUT, parts.join(''), 'utf8')
console.log(`✓ ${OUT} (${files.length} migraciones: ${files.join(', ')})`)
