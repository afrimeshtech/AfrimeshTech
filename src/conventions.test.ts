import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Architectural guards.
 *
 * These encode the rules a code review can only check by eye, so that they
 * hold permanently instead of until the next hurried commit. Each one exists
 * because getting it wrong is expensive: a hardcoded host breaks the moment we
 * deploy, a secret in a client component is a breach, and a client component
 * importing a database module ships our SQL to the browser.
 */

const SRC = fileURLToPath(new URL('.', import.meta.url))

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, files)
    else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts')) files.push(full)
  }
  return files
}

const sourceFiles = walk(SRC).map((path) => ({
  path: relative(SRC, path).replace(/\\/g, '/'),
  content: readFileSync(path, 'utf8'),
}))

const clientFiles = sourceFiles.filter(({ content }) => /^\s*['"]use client['"]/m.test(content))

describe('no hardcoded hosts', () => {
  test('nothing in src/ hardcodes localhost or a port', () => {
    const offenders = sourceFiles.filter(({ content }) =>
      /https?:\/\/localhost|127\.0\.0\.1|:\d{4}\//.test(content),
    )
    assert.deepEqual(
      offenders.map((f) => f.path),
      [],
      'hardcoded host found — use a relative path, or an environment variable on the server',
    )
  })

  test('every fetch() target is a relative path', () => {
    for (const file of sourceFiles) {
      for (const match of file.content.matchAll(/fetch\(\s*[`'"]([^`'"]*)/g)) {
        const url = match[1]
        assert.ok(
          url.startsWith('/'),
          `${file.path} fetches an absolute URL (${url}); same-origin requests must be relative`,
        )
      }
    }
  })
})

describe('no secrets reach the browser', () => {
  test('no environment variable is exposed with the NEXT_PUBLIC_ prefix', () => {
    // The moment one exists, someone will put a key behind it. If a public
    // value is genuinely needed, delete this test deliberately, not by accident.
    const offenders = sourceFiles.filter(({ content }) => content.includes('NEXT_PUBLIC_'))
    assert.deepEqual(
      offenders.map((f) => f.path),
      [],
    )
  })

  test('no client component reads process.env', () => {
    const offenders = clientFiles.filter(({ content }) => content.includes('process.env'))
    assert.deepEqual(
      offenders.map((f) => f.path),
      [],
      'a client component read process.env; server values must be passed as props',
    )
  })

  test('no client component imports the database or a domain service', () => {
    const offenders = clientFiles.filter(({ content }) => {
      // `import type` is erased by the compiler and ships nothing, so it is
      // safe and is stripped before checking. The codebase omits semicolons,
      // so the statement is matched to the end of the line.
      const runtimeImports = content.replace(/^\s*import\s+type\s+.*$/gm, '')
      return /from '@\/(db|modules)\/[^']*'/.test(runtimeImports)
    })
    assert.deepEqual(
      offenders.map((f) => f.path),
      [],
      'a client component imported server-side code; go through a server action instead',
    )
  })
})

describe('server actions are validated', () => {
  const actionFiles = sourceFiles.filter((f) => f.path.startsWith('app/actions/'))

  test('there are action files to check', () => {
    assert.ok(actionFiles.length > 0)
  })

  test('every action that reads form input validates it', () => {
    // A server action is a public endpoint; raw String()/Number() casts on
    // FormData accept anything an attacker sends. Actions that take no input
    // at all (a plain "do it" button) have nothing to validate.
    const offenders = actionFiles.filter(({ content }) => {
      const readsInput = /formData\.(get|getAll|entries|has)\(/.test(content)
      return readsInput && !content.includes('parseForm')
    })
    assert.deepEqual(
      offenders.map((f) => f.path),
      [],
      'server action reads form input without validating it',
    )
  })

  test('no action reads a raw FormData value outside a schema', () => {
    // Catches the pattern the validation work replaced, so it cannot creep
    // back in one action at a time.
    for (const file of actionFiles) {
      const raw = file.content.match(/String\(formData\.get|Number\(formData\.get/g)
      assert.equal(
        raw,
        null,
        `${file.path} casts a raw FormData value; parse it through a schema instead`,
      )
    }
  })

  test('no action trusts an organisation id supplied by the form', () => {
    // Ownership must be resolved from the session, or one seller could act as
    // another. `organisationId` as a *validated target* is fine in admin
    // actions; what is banned is reading it as the caller's own identity.
    for (const file of actionFiles) {
      const suspicious = /organisationId:\s*(String\(formData|formData\.get)/.test(file.content)
      assert.equal(suspicious, false, `${file.path} took the acting organisation from the form`)
    }
  })
})
