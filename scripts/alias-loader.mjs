/**
 * Resolves the `@/*` TypeScript path alias for plain Node.
 *
 * The domain services under src/modules are deliberately free of any Next.js or
 * React coupling - the SAD requires them to be extractable into standalone
 * services later - so scripts like the seeder can import and run them directly.
 * Node does not read tsconfig `paths`, so this hook supplies the mapping.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SRC = new URL('../src/', import.meta.url)
const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs']

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) return nextResolve(specifier, context)

  const base = new URL(specifier.slice(2), SRC)
  const candidates = [
    base,
    ...EXTENSIONS.map((ext) => new URL(base.href + ext)),
    ...EXTENSIONS.map((ext) => new URL(`${base.href}/index${ext}`)),
  ]

  for (const candidate of candidates) {
    if (candidate.href.endsWith('/')) continue
    if (existsSync(fileURLToPath(candidate))) {
      return nextResolve(candidate.href, context)
    }
  }

  throw new Error(`Cannot resolve alias "${specifier}" under ${SRC.href}`)
}
