import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PartnerShell } from '@/components/shell/PartnerShell'
import { ProductThumb } from '@/components/commerce/ProductThumb'
import { Badge, Card, EmptyState, LinkButton, SectionHeading, Stat } from '@/components/ui'
import { requireUser, currentOrganisation } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import { inventoryStats, listInventory } from '@/modules/inventory/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Inventory' }

/**
 * The seller's view of their own stock. Available, reserved and sold are shown
 * separately, because "20 units" means something different when 8 of them are
 * already spoken for by a paid order.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>
}) {
  const params = await searchParams
  await requireUser('/partner/inventory')
  const org = await currentOrganisation()
  if (!org) redirect('/onboarding')

  const [items, stats] = await Promise.all([
    listInventory(org.id, { search: params.q, lowOnly: params.filter === 'low' }),
    inventoryStats(org.id),
  ])

  const isRetail = org.type === 'outlet'
  const priceLabel = isRetail ? 'Retail price' : 'Wholesale price'

  return (
    <PartnerShell active="/partner/inventory">
      <div className="space-y-7">
        <SectionHeading
          title="Inventory"
          subtitle="Your stock, published live to the network"
          action={<LinkButton href="/partner/catalogue">Add products</LinkButton>}
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label="Products" value={stats.skus} />
          <Stat label="Available" value={stats.units_available.toLocaleString()} />
          <Stat
            label="Reserved"
            value={stats.units_reserved.toLocaleString()}
            hint="Held on live orders"
          />
          <Stat
            label="Low stock"
            value={stats.low_stock}
            tone={stats.low_stock ? 'danger' : 'neutral'}
          />
          <Stat label="Stock value" value={formatMoney(stats.stock_value)} />
        </div>

        <Card>
          <form className="flex flex-wrap items-end gap-2" action="/partner/inventory">
            <div className="min-w-52 flex-1">
              <label className="mb-1 block text-xs font-medium text-ink" htmlFor="inv-q">
                Search your stock
              </label>
              <input
                id="inv-q"
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="Product name or barcode"
                className="w-full rounded-brand border border-line px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-brand bg-accent-500 px-4 py-2 text-sm font-semibold text-accent-ink"
            >
              Search
            </button>
            <Link
              href={
                params.filter === 'low' ? '/partner/inventory' : '/partner/inventory?filter=low'
              }
              className={`rounded-brand border px-4 py-2 text-sm font-medium ${
                params.filter === 'low'
                  ? 'border-accent-500 bg-accent-soft text-accent-500'
                  : 'border-line bg-surface text-ink'
              }`}
            >
              Needs restocking
            </Link>
          </form>
        </Card>

        {items.length ? (
          <Card className="p-0">
            <div className="scroll-x">
              <table className="w-full min-w-[46rem] text-sm">
                <caption className="sr-only">Your inventory</caption>
                <thead>
                  <tr className="border-b border-line-soft text-left text-xs uppercase tracking-wide text-muted">
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-3 py-3 text-right font-medium">Available</th>
                    <th className="px-3 py-3 text-right font-medium">Reserved</th>
                    <th className="px-3 py-3 text-right font-medium">Sold</th>
                    <th className="px-3 py-3 text-right font-medium">{priceLabel}</th>
                    <th className="px-4 py-3 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const price = isRetail ? item.retail_price : item.wholesale_price
                    const low = item.qty_available <= item.reorder_level
                    return (
                      <tr
                        key={item.id}
                        className="border-b border-line-soft last:border-0 hover:bg-surface"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/partner/inventory/${item.id}`}
                            className="flex items-center gap-3"
                          >
                            <ProductThumb
                              name={item.product_name}
                              imageUrl={item.product_image}
                              brandLogo={item.brand_logo}
                              categorySlug={item.category_slug}
                              size="sm"
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-ink">
                                {item.product_name}
                              </span>
                              <span className="block font-technical text-xs text-muted">
                                {[item.brand_name, item.pack_size, item.gtin]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-medium ${low ? 'text-warning-ink' : ''}`}
                        >
                          {item.qty_available}
                        </td>
                        <td className="px-3 py-3 text-right text-muted">{item.qty_reserved}</td>
                        <td className="px-3 py-3 text-right text-muted">{item.qty_sold}</td>
                        <td className="px-3 py-3 text-right">
                          {item.promo_price ? (
                            <span>
                              <span className="font-medium text-accent-500">
                                {formatMoney(item.promo_price)}
                              </span>
                              <span className="ml-1 text-xs text-muted line-through">
                                {formatMoney(price)}
                              </span>
                            </span>
                          ) : (
                            <span className="font-medium">{formatMoney(price)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!item.is_listed ? (
                            <Badge tone="neutral">Hidden</Badge>
                          ) : item.qty_available === 0 ? (
                            <Badge tone="danger">Out of stock</Badge>
                          ) : low ? (
                            <Badge tone="warning">Low</Badge>
                          ) : (
                            <Badge tone="brand">Live</Badge>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <EmptyState
            icon="box"
            title={params.q ? 'Nothing matched that search' : 'No stock listed yet'}
            body="List a product from the master catalogue and it becomes discoverable to buyers near you."
            action={<LinkButton href="/partner/catalogue">Browse the catalogue</LinkButton>}
          />
        )}
      </div>
    </PartnerShell>
  )
}
