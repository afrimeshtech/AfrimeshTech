import { notFound, redirect } from 'next/navigation'
import { PartnerShell } from '@/components/shell/PartnerShell'
import { OrderDetailView } from '@/components/commerce/OrderDetailView'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { getOrder } from '@/modules/orders/service'

export const dynamic = 'force-dynamic'

/** The same order record as the buyer sees, framed by the seller's dashboard. */
export default async function PartnerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser(`/partner/orders/${id}`)
  const org = await currentOrganisation()
  if (!org) redirect('/onboarding')

  const order = await getOrder(id)
  if (!order) notFound()

  const isSeller = order.seller_org_id === org.id
  const isBuyer = order.buyer_user_id === user.id || order.buyer_org_id === org.id
  if (!isSeller && !isBuyer) notFound()

  return (
    <PartnerShell active="/partner/orders">
      <OrderDetailView order={order} viewer={{ isBuyer: isBuyer && !isSeller, isSeller }} />
    </PartnerShell>
  )
}
