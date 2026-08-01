/// <reference types="next" />
/// <reference types="next/image-types/global" />

/**
 * Ambient declarations for Next.js globals and static image imports.
 *
 * These normally arrive via `next-env.d.ts`, which Next regenerates on every
 * `next dev` and `next build` — and which is gitignored, because it is
 * generated output that also carries a dev-only reference to `.next/`.
 *
 * That leaves a hole in CI. The quality job runs `npm ci` and then `tsc`
 * directly, without ever invoking Next, so `next-env.d.ts` does not exist in
 * that job and `import logo from '../../../public/brand/afrimesh-icon.png'`
 * has no type. The build job passes because `next build` writes the file
 * before compiling, which is what makes this fail in only one of three jobs.
 *
 * So the two references Next would have written are committed here instead.
 * They point at the type definitions inside the `next` package rather than
 * restating them, so there is nothing to keep in sync on a version bump.
 */

export {}
