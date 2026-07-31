'use client'

import { ErrorState } from '@/components/Feedback'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="The console could not load that view"
      body="Platform operations are unaffected. Retry, and check system health if it persists."
      home="/admin"
    />
  )
}
