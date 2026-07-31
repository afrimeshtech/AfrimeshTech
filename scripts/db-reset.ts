/** Drops and recreates the schema, then seeds it. */
import { spawnSync } from 'node:child_process'

const node = process.execPath
const run = (args: string[]) => {
  const res = spawnSync(
    node,
    ['--experimental-strip-types', '--import', './scripts/register-alias.mjs', ...args],
    { stdio: 'inherit' },
  )
  if (res.status !== 0) process.exit(res.status ?? 1)
}

run(['scripts/db-push.ts', '--reset'])
run(['scripts/seed.ts'])
