'use client'

import { ErrorState } from '@/components/Feedback'

/** Catches render and data-fetch failures anywhere under the app root. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorState error={error} reset={reset} />
}
