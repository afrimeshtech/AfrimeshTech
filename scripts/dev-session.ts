/**
 * Mints a session token for a seeded account, for local testing.
 *
 *   node --experimental-strip-types --import ./scripts/register-alias.mjs \
 *        scripts/dev-session.ts ada@example.ng
 *
 * Prints a cookie you can paste into a browser or pass to curl. It writes a
 * normal row to the `sessions` table through the real identity service - there
 * is no auth bypass anywhere in the running application, which is why this has
 * to run against the database directly rather than as an HTTP endpoint.
 *
 * The embedded PGlite database allows a single process at a time, so stop the
 * dev server before running this.
 */
import { getSql } from '@/db/client'
import { createSession, SESSION_COOKIE_NAME } from '@/modules/identity/service'

const emails = process.argv.slice(2)
if (!emails.length) {
  console.error('Usage: dev-session.ts <email> [email...]')
  process.exit(1)
}

const sql = await getSql()

for (const email of emails) {
  const user = await sql.one<{ id: string; full_name: string; role: string }>(
    `SELECT id, full_name, role FROM users WHERE email = $1`,
    [email.toLowerCase()],
  )
  if (!user) {
    console.error(`  ! no account for ${email}`)
    continue
  }
  const token = await createSession(user.id, { userAgent: 'dev-session-script' })
  console.log(`${email}\t${user.role}\t${SESSION_COOKIE_NAME}=${token}`)
}

process.exit(0)
