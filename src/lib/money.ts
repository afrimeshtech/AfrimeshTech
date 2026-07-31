/**
 * Money is stored and computed in the currency's minor unit (kobo for NGN) as
 * an integer, everywhere. No float arithmetic touches a balance or a price.
 */

export const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY ?? 'NGN'

const SYMBOLS: Record<string, string> = {
  NGN: '₦',
  GHS: '₵',
  KES: 'KSh',
  ZAR: 'R',
  USD: '$',
}

/** 1500.50 -> 150050 */
export function toMinor(major: number): number {
  return Math.round(major * 100)
}

/** 150050 -> 1500.5 */
export function toMajor(minor: number): number {
  return minor / 100
}

/** 150050 -> "₦1,500.50" (or "₦1,500" when the kobo part is zero) */
export function formatMoney(minor: number | null | undefined, currency = DEFAULT_CURRENCY): string {
  if (minor === null || minor === undefined) return '—'
  const symbol = SYMBOLS[currency] ?? currency + ' '
  const major = toMajor(minor)
  const hasKobo = minor % 100 !== 0
  return (
    symbol +
    major.toLocaleString('en-NG', {
      minimumFractionDigits: hasKobo ? 2 : 0,
      maximumFractionDigits: 2,
    })
  )
}

/** Compact form for dashboard tiles: 12,400,000 -> "₦124k" */
export function formatMoneyCompact(minor: number, currency = DEFAULT_CURRENCY): string {
  const symbol = SYMBOLS[currency] ?? currency + ' '
  const major = toMajor(minor)
  if (major >= 1_000_000) return `${symbol}${(major / 1_000_000).toFixed(1)}m`
  if (major >= 1_000) return `${symbol}${Math.round(major / 1_000)}k`
  return symbol + Math.round(major).toLocaleString('en-NG')
}

/**
 * Platform commission in basis points, applied to the order subtotal.
 * Transaction fees are the first revenue stream in the BRS revenue model.
 */
export function platformFee(subtotalMinor: number): number {
  const bps = Number(process.env.PLATFORM_FEE_BPS ?? 150)
  return Math.round((subtotalMinor * bps) / 10_000)
}

/**
 * Loyalty cashback on the goods value of a completed order.
 *
 * Paid out of platform revenue, so it is capped below the commission rate -
 * rewards are a share of the margin, never a subsidy that makes each order
 * lose money.
 */
export function cashbackFor(subtotalMinor: number): number {
  const bps = Number(process.env.CASHBACK_BPS ?? 50)
  const feeBps = Number(process.env.PLATFORM_FEE_BPS ?? 150)
  const effective = Math.min(bps, feeBps)
  return Math.round((subtotalMinor * effective) / 10_000)
}
