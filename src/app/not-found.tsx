import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { EmptyState, LinkButton } from '@/components/ui'

export const metadata = { title: 'Not found' }

/**
 * Also the response when someone requests an order, conversation or shop they
 * are not a party to — indistinguishable from it not existing, so the 404 does
 * not confirm that a given record exists.
 */
export default function NotFound() {
  return (
    <ConsumerShell search={false}>
      <EmptyState
        icon="compass"
        title="We could not find that page"
        body="The link may be out of date, or the item may no longer be listed."
        action={<LinkButton href="/">Back to shopping</LinkButton>}
      />
    </ConsumerShell>
  )
}
