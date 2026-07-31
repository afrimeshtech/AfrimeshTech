'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { writeCart } from '@/lib/cart'
import { sourcingContext } from '@/lib/viewer'
import { listInventory } from '@/modules/inventory/service'
import { rankOffers, type Offer } from '@/modules/recommendation/service'

export interface RestockState {
  error?: string
  notice?: string
}

/**
 * One-tap restock.
 *
 * "Outlet restocks from merchant automatically. Merchant sources from
 * warehouse efficiently." — steps 5 and 6 of the Project Nexus flow.
 *
 * Takes everything at or below its reorder level, finds who upstream can
 * actually supply it, and assembles a single basket. Because an order settles
 * with exactly one seller, it picks the supplier that covers the most of the
 * shortfall rather than splitting the restock across several — one delivery,
 * one settlement, one relationship.
 *
 * It stops at the basket rather than placing the order. Committing a business's
 * money without them seeing the total first is not automation, it is a trap.
 */
export async function buildRestockBasketAction(
  _prev: RestockState,
  _formData: FormData,
): Promise<RestockState> {
  const ctx = await sourcingContext()
  if (!ctx) return { error: 'You need a business account to source stock' }

  const low = await listInventory(ctx.orgId, { lowOnly: true, limit: 40 })
  if (!low.length) return { notice: 'Nothing is below its reorder level right now.' }

  const buyer = { lat: ctx.lat, lng: ctx.lng, tier: ctx.tier, userId: null }

  // Which suppliers can cover which shortfalls.
  const bySeller = new Map<string, { name: string; offers: Offer[]; score: number }>()

  for (const item of low) {
    const offers = await rankOffers(
      buyer,
      { productId: item.product_id },
      { maxDistanceKm: 150, limit: 5 },
    )
    for (const offer of offers) {
      const entry = bySeller.get(offer.organisation_id) ?? {
        name: offer.seller_name,
        offers: [],
        score: 0,
      }
      // Only the best offer per product from any one seller.
      if (entry.offers.some((o) => o.product_id === offer.product_id)) continue
      entry.offers.push(offer)
      entry.score += offer.score
      bySeller.set(offer.organisation_id, entry)
    }
  }

  if (!bySeller.size) {
    return {
      error: 'No verified supplier in range has any of your low-stock items available right now.',
    }
  }

  // Most coverage wins; average recommendation score breaks a tie.
  const [sellerId, best] = [...bySeller.entries()].sort(
    (a, b) =>
      b[1].offers.length - a[1].offers.length ||
      b[1].score / b[1].offers.length - a[1].score / a[1].offers.length,
  )[0]

  const targets = new Map(low.map((item) => [item.product_id, item]))
  const items: { inventoryItemId: string; qty: number }[] = []

  for (const offer of best.offers) {
    const shelf = targets.get(offer.product_id)
    if (!shelf) continue
    // Restock to three times the reorder level, so the shop is not back here
    // tomorrow — bounded by the supplier's minimum order and their stock.
    const target = Math.max(shelf.reorder_level * 3, shelf.reorder_level + 1)
    const shortfall = Math.max(target - shelf.qty_available, 0)
    const qty = Math.min(Math.max(shortfall, offer.min_order_qty), offer.qty_available)
    if (qty > 0) items.push({ inventoryItemId: offer.inventory_item_id, qty })
  }

  if (!items.length) {
    return { error: 'Suppliers were found, but none had enough stock to cover a minimum order.' }
  }

  await writeCart({ sellerOrgId: sellerId, items, tier: ctx.tier, buyerOrgId: ctx.orgId })
  revalidatePath('/', 'layout')
  redirect('/cart')
}
