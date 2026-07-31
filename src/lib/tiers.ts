/**
 * The supply chain, and the business rules that govern who may trade with whom.
 *
 *   Manufacturer -> Dealer Warehouse -> Merchant -> Neighbourhood Retailer -> Consumer
 *
 * PRD §12 Business Rules:
 *   - Consumers cannot purchase directly from warehouses.
 *   - Retailers purchase from merchants.
 *   - Merchants purchase from warehouses.
 *   - Warehouses supply merchants only.
 *
 * Encoding the chain as ordinals turns all four rules into one invariant:
 * a buyer at tier N may only buy from tier N-1. That invariant is enforced in
 * three places - here, in the order service, and as a CHECK constraint on the
 * orders table - so it cannot be bypassed by a new caller or a bad migration.
 */

export type OrgType = 'manufacturer' | 'warehouse' | 'merchant' | 'outlet' | 'logistics'

export const TIER = {
  manufacturer: 1,
  warehouse: 2,
  merchant: 3,
  outlet: 4,
  consumer: 5,
} as const

export type TierName = keyof typeof TIER

/** Tier ordinal for an organisation type. Logistics is not a supply tier. */
export function tierOf(type: OrgType): number {
  switch (type) {
    case 'manufacturer':
      return TIER.manufacturer
    case 'warehouse':
      return TIER.warehouse
    case 'merchant':
      return TIER.merchant
    case 'outlet':
      return TIER.outlet
    default:
      return 0
  }
}

/** The org type a buyer at this tier is allowed to source from. */
export function supplierTypeFor(buyerTier: number): OrgType | null {
  switch (buyerTier) {
    case TIER.consumer:
      return 'outlet'
    case TIER.outlet:
      return 'merchant'
    case TIER.merchant:
      return 'warehouse'
    case TIER.warehouse:
      return 'manufacturer'
    default:
      return null
  }
}

export function canTrade(buyerTier: number, sellerTier: number): boolean {
  return buyerTier === sellerTier + 1
}

/**
 * Which price a buyer at this tier pays. Consumers pay retail; every business
 * tier buys at wholesale (Inventory doc §8, Price Layer).
 */
export function priceColumnFor(buyerTier: number): 'retail_price' | 'wholesale_price' {
  return buyerTier === TIER.consumer ? 'retail_price' : 'wholesale_price'
}

export const ORG_LABEL: Record<OrgType, string> = {
  manufacturer: 'Manufacturer',
  warehouse: 'Dealer Warehouse',
  merchant: 'Merchant',
  outlet: 'Retail Outlet',
  logistics: 'Delivery Partner',
}

/** Ranking model that applies to a buyer at this tier (SAD Recommendation Engine). */
export function rankingScopeFor(buyerTier: number): 'consumer' | 'outlet' | 'merchant' {
  if (buyerTier === TIER.consumer) return 'consumer'
  if (buyerTier === TIER.outlet) return 'outlet'
  return 'merchant'
}
