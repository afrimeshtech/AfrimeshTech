/**
 * Applies src/db/schema.sql to the configured database.
 *
 *   npm run db:push    - create the schema (refuses to run over existing data)
 *   npm run db:reset   - drop everything, recreate, then seed
 */
import { readFileSync } from 'node:fs'
import { getSql } from '../src/db/client.ts'

const RESET = process.argv.includes('--reset')

async function main() {
  const sql = await getSql()
  const driver = process.env.DATABASE_URL ? 'PostgreSQL server' : 'PGlite (embedded, ./.pgdata)'
  console.log(`> target: ${driver}`)

  const existing = await sql.one<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'users'
     ) AS exists`,
  )

  if (existing?.exists && !RESET) {
    console.error('\n! Schema already present. Run `npm run db:reset` to drop and recreate it.')
    process.exit(1)
  }

  if (RESET) {
    console.log('> dropping schema public')
    await sql.exec('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
  }

  const ddl = readFileSync(new URL('../src/db/schema.sql', import.meta.url), 'utf8')
  console.log('> applying schema.sql')
  await sql.exec(ddl)

  const tables = await sql.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  )
  console.log(`> ${tables.length} tables created:`)
  console.log('  ' + tables.map((t) => t.table_name).join(', '))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
