import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { EmptyState, LinkButton } from '@/components/ui'

export const metadata = { title: 'Not permitted' }

export default function ForbiddenPage() {
  return (
    <ConsumerShell search={false}>
      <EmptyState
        icon="lock"
        title="You do not have access to that area"
        body="Your account role does not permit this action. If you believe that is wrong, contact your platform administrator."
        action={<LinkButton href="/">Back to shopping</LinkButton>}
      />
    </ConsumerShell>
  )
}
