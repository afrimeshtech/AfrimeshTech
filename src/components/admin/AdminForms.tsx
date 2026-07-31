'use client'

import { useActionState, useState } from 'react'
import {
  rejectOrganisationAction,
  updateWeightsAction,
  type AdminActionState,
} from '@/app/actions/admin'
import { Alert, inputClass } from '@/components/ui'

export function RejectBusinessForm({ organisationId }: { organisationId: string }) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    rejectOrganisationAction,
    {},
  )
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-brand border border-line px-3 py-1.5 text-xs font-medium text-coral-ink hover:bg-coral/15"
      >
        Reject
      </button>
    )
  }

  return (
    <form action={formAction} className="w-full space-y-2">
      <input type="hidden" name="organisationId" value={organisationId} />
      <input
        name="reason"
        placeholder="Reason (the business is told this)"
        className={inputClass}
        required
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-brand bg-coral-strong px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Rejecting…' : 'Confirm rejection'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-brand border border-line px-3 py-1.5 text-xs font-medium"
        >
          Cancel
        </button>
      </div>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
    </form>
  )
}

const FACTOR_HELP: Record<string, string> = {
  availability: 'Depth of live stock, saturating at 10 units',
  distance: 'Linear decay to the search radius',
  price: 'Ratio to the cheapest nearby offer',
  rating: 'Verified stars, damped while reviews are few',
  delivery_time: 'Dispatch time plus travel, over a 3-hour horizon',
  trust: 'Platform trust score',
  fulfilment: 'Historical fulfilment reliability (B2B models)',
  purchase_history: 'Existing relationship, saturating at 3 orders',
}

/**
 * Retuning the marketplace. The relative share each factor carries is shown
 * live as the numbers change, because the absolute weights are meaningless on
 * their own — only the ratio between them affects ranking.
 */
export function RankingWeightsForm({
  scope,
  weights,
}: {
  scope: string
  weights: Record<string, number>
}) {
  const [state, formAction, pending] = useActionState<AdminActionState, FormData>(
    updateWeightsAction,
    {},
  )
  const [values, setValues] = useState(weights)
  const total = Object.values(values).reduce((a, b) => a + Number(b || 0), 0) || 1

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="scope" value={scope} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      {state.notice && <Alert tone="success">{state.notice}</Alert>}

      {Object.entries(values).map(([factor, value]) => (
        <div key={factor}>
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor={`${scope}-${factor}`}
              className="text-sm font-medium capitalize text-ink"
            >
              {factor.replace(/_/g, ' ')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`${scope}-${factor}`}
                name={`weight_${factor}`}
                type="number"
                min={0}
                step={1}
                value={value}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [factor]: Number(e.target.value) }))
                }
                className="w-20 rounded-brand border border-line px-2 py-1.5 text-right text-sm"
              />
              <span className="w-12 text-right font-technical text-xs text-muted">
                {Math.round((Number(value || 0) / total) * 100)}%
              </span>
            </div>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-accent-500"
              style={{ width: `${(Number(value || 0) / total) * 100}%` }}
            />
          </div>
          <p className="mt-0.5 text-xs text-muted">{FACTOR_HELP[factor]}</p>
        </div>
      ))}

      <button
        type="submit"
        disabled={pending}
        className="rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Save weights'}
      </button>
    </form>
  )
}
