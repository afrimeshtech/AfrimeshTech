'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Wordmark } from '@/components/brand/Logo'

/**
 * Shared failure and waiting states.
 *
 * Two rules, both from the brand guide's voice ("confident, clear, helpful",
 * never "overly technical"):
 *
 *  - Never show a raw error message. A PostgreSQL constraint name tells the
 *    person nothing and tells an attacker something.
 *  - Always offer a way forward. An error screen with no action is a dead end.
 */
export function ErrorState({
  error,
  reset,
  title = 'Something went wrong on our side',
  body = 'This is not your fault. Try again, and if it keeps happening let us know.',
  home = '/',
}: {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  body?: string
  home?: string
}) {
  useEffect(() => {
    // The digest is the only safe handle on a production error: it correlates
    // this screen with the server log without leaking the message.
    console.error('[boundary]', error.digest ?? error.message)
  }, [error])

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
      <Wordmark size="sm" orientation="stacked" />
      <div>
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        <p className="mt-1.5 text-sm text-muted">{body}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-600"
        >
          Try again
        </button>
        <Link
          href={home}
          className="rounded-brand border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted"
        >
          Go back
        </Link>
      </div>
      {error.digest && (
        <p className="font-technical text-xs text-muted">Reference {error.digest}</p>
      )}
    </div>
  )
}

/**
 * A single grey block used to compose loading skeletons.
 *
 * A travelling highlight rather than the whole block blinking: a sweep reads
 * as "something is on its way", where a pulse at low contrast is easy to
 * mistake for a rendering fault. Motion-sensitive users get a still block.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`shimmer rounded-brand bg-surface-muted ${className}`} aria-hidden />
}

/**
 * Generic page skeleton. Announced politely so a screen reader says the page
 * is loading rather than reading out a grid of empty boxes.
 */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-busy className="space-y-4">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-7 w-56" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  )
}
