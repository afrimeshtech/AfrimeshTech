'use client'

import { ErrorState } from '@/components/Feedback'

export default function PartnerError({
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
      title="We could not load your dashboard"
      body="Your stock, orders and wallet balance are safe. This is a display problem, not a data one."
      home="/partner"
    />
  )
}
