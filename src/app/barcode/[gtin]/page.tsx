import { redirect } from 'next/navigation'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { EmptyState, LinkButton } from '@/components/ui'
import { getProductByBarcode } from '@/modules/catalog/service'

export const dynamic = 'force-dynamic'

/**
 * Barcode lookup. The SAD lists barcode search as a launch capability; because
 * every seller lists against the shared master catalogue, one GTIN resolves to
 * one product and therefore to every nearby seller who stocks it.
 */
export default async function BarcodePage({ params }: { params: Promise<{ gtin: string }> }) {
  const { gtin } = await params
  const product = await getProductByBarcode(decodeURIComponent(gtin))

  if (product) redirect(`/product/${product.slug}`)

  return (
    <ConsumerShell>
      <EmptyState
        icon="tag"
        title={`No product with barcode ${gtin}`}
        body="This code is not in the master catalogue yet. If you are a seller, you can add it when listing the product."
        action={<LinkButton href="/search">Search by name instead</LinkButton>}
      />
    </ConsumerShell>
  )
}
