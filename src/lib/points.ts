/**
 * Reward points: the unit the referral programme pays in.
 *
 * Points are money-like but deliberately not money. They are held in the same
 * `wallets` table under a separate currency, so every point issued is a
 * double-entry ledger movement against a platform liability and shows up on a
 * statement — but they are not spendable at checkout and cannot be withdrawn.
 * A holder converts them to naira first, which is the moment the platform
 * actually books the cost.
 *
 * Everything below is a whole number. A fractional point would round somewhere
 * and, at the conversion boundary, that rounding is real money.
 */

/** Currency code for the points ledger. */
export const POINTS_CURRENCY = 'PTS'

/** What one point is worth on conversion, in minor units (kobo). Default ₦1. */
export const POINT_VALUE_MINOR = Math.max(
  1,
  Math.round(Number(process.env.POINT_VALUE_KOBO ?? 100)),
)

/**
 * Conversion floor. Small redemptions cost more to settle than they are worth,
 * and a floor is also the cheapest brake there is on farming the programme
 * with throwaway accounts.
 */
export const MIN_REDEEMABLE_POINTS = Math.max(
  1,
  Math.round(Number(process.env.MIN_REDEEMABLE_POINTS ?? 500)),
)

/**
 * A referral only earns once the person invited completes an order worth at
 * least this much. The programme pays for commerce, not for sign-ups.
 */
export const REFERRAL_MIN_ORDER_MINOR = Math.max(
  0,
  Math.round(Number(process.env.REFERRAL_MIN_ORDER_KOBO ?? 100_000)),
)

/**
 * Which referral programme a member belongs to — their own tier. A consumer
 * refers consumers, an outlet refers outlets, a merchant refers merchants.
 */
export type Programme = 'consumer' | 'outlet' | 'merchant' | 'warehouse' | 'manufacturer'

export const PROGRAMMES: Programme[] = [
  'consumer',
  'outlet',
  'merchant',
  'warehouse',
  'manufacturer',
]

/**
 * Default award per qualified referral, in points.
 *
 * The ladder tracks order value, not generosity: a merchant who brings another
 * merchant onto the network introduces wholesale volume, and the reward is a
 * fraction of the commission that volume generates. These are defaults —
 * operations retunes them from the admin console without a deployment.
 */
export const DEFAULT_REFERRAL_POINTS: Record<Programme, number> = {
  consumer: 500,
  outlet: 2_500,
  merchant: 10_000,
  warehouse: 25_000,
  manufacturer: 25_000,
}

export const PROGRAMME_LABEL: Record<Programme, string> = {
  consumer: 'Shopper refers a shopper',
  outlet: 'Retail outlet refers an outlet',
  merchant: 'Merchant refers a merchant',
  warehouse: 'Dealer warehouse refers a warehouse',
  manufacturer: 'Manufacturer refers a manufacturer',
}

/**
 * The programme a referrer earns under, derived from their account role.
 * Roles with no tier of their own (riders, staff, administrators) refer as
 * shoppers, which is the only thing they can genuinely introduce someone to.
 */
export function programmeForRole(role: string): Programme {
  switch (role) {
    case 'outlet':
      return 'outlet'
    case 'merchant':
      return 'merchant'
    case 'warehouse':
      return 'warehouse'
    case 'manufacturer':
      return 'manufacturer'
    default:
      return 'consumer'
  }
}

/** 500 points -> 50_000 kobo (₦500 at the default rate). */
export function pointsToMinor(points: number): number {
  return Math.floor(points) * POINT_VALUE_MINOR
}

/** 1250 -> "1,250 pts" */
export function formatPoints(points: number | null | undefined): string {
  if (points === null || points === undefined) return '—'
  return `${Math.round(points).toLocaleString('en-NG')} pts`
}

/**
 * How much of a balance can actually be converted right now. Below the floor
 * the answer is zero rather than a rounded-down teaser.
 */
export function redeemablePoints(balance: number): number {
  return balance >= MIN_REDEEMABLE_POINTS ? Math.floor(balance) : 0
}
