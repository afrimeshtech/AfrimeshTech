import { randomInt } from 'node:crypto'
import { getSql, withTx, type Sql } from '@/db/client'
import { publish, EVENT } from '@/modules/events/service'
import { queueNotification } from '@/modules/notifications/service'
import { getSetting, setSetting } from '@/modules/platform/service'
import {
  ensureWallet,
  platformWallet,
  postTransaction,
  reference,
  InsufficientFundsError,
  PLATFORM_POINTS,
  PLATFORM_REVENUE,
  type WalletOwnerType,
} from '@/modules/wallet/service'
import { DEFAULT_CURRENCY } from '@/lib/money'
import {
  DEFAULT_REFERRAL_POINTS,
  MIN_REDEEMABLE_POINTS,
  POINTS_CURRENCY,
  PROGRAMMES,
  REFERRAL_MIN_ORDER_MINOR,
  pointsToMinor,
  programmeForRole,
  type Programme,
} from '@/lib/points'

/**
 * MODULE: rewards
 *
 * The referral programme, and the points wallet it pays into.
 *
 * Each tier grows the tier below its own supplier, which is how a proximity
 * network densifies: a shopper brings another shopper to their retail outlet,
 * an outlet brings another outlet to its merchant, a merchant brings another
 * merchant to its warehouse. One mechanism serves all three — the programme a
 * referral belongs to is simply the referrer's own tier.
 *
 * Three rules make it a growth lever rather than a leak:
 *
 *   1. Nothing is paid for a sign-up. A referral earns only when the person
 *      invited completes a real order above a floor value.
 *   2. Points are issued against a platform liability in the double-entry
 *      ledger, so the amount owed is always visible and always auditable.
 *   3. Converting points to naira is a separate, deliberate act funded from
 *      platform revenue — the same source that funds cashback — so a reward
 *      can never exceed the commission that pays for it.
 *
 * A business owner's referral earns for the business, not for their personal
 * wallet: the retailer who recruited another retailer is the shop, and the
 * money should land where the shop spends it.
 */

const POINTS_SETTING_KEY = 'rewards.referral_points'

// ---------------------------------------------------------------------------
// Programme configuration - data, not code (SAD: configurable without deploy)
// ---------------------------------------------------------------------------

export async function referralPoints(tx?: Sql): Promise<Record<Programme, number>> {
  const stored = await getSetting<Partial<Record<Programme, number>>>(POINTS_SETTING_KEY, {}, tx)
  const merged = { ...DEFAULT_REFERRAL_POINTS }
  for (const programme of PROGRAMMES) {
    const value = Number(stored?.[programme])
    if (Number.isFinite(value) && value >= 0) merged[programme] = Math.round(value)
  }
  return merged
}

export async function setReferralPoints(values: Partial<Record<Programme, number>>): Promise<void> {
  const current = await referralPoints()
  for (const programme of PROGRAMMES) {
    const value = Number(values[programme])
    if (Number.isFinite(value) && value >= 0) current[programme] = Math.round(value)
  }
  await setSetting(POINTS_SETTING_KEY, current)
}

// ---------------------------------------------------------------------------
// Referral codes
// ---------------------------------------------------------------------------

/**
 * Ambiguous characters are left out on purpose. These codes get read aloud
 * across a shop counter and typed by someone who has never seen them written
 * down, so O/0 and I/1/L cannot appear.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function mintCode(length = 7): string {
  let out = ''
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return out
}

/** Codes are typed by hand, so comparison ignores case, spaces and dashes. */
export function normaliseCode(input: string | null | undefined): string | null {
  if (!input) return null
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return cleaned.length ? cleaned : null
}

/**
 * The caller's own code, minted on first use. Lazy rather than assigned at
 * registration so that accounts created before the programme existed — and
 * accounts that never refer anyone — need no migration and carry no code.
 */
export async function referralCodeFor(userId: string): Promise<string> {
  const sql = await getSql()
  const existing = await sql.one<{ referral_code: string | null }>(
    `SELECT referral_code FROM users WHERE id = $1`,
    [userId],
  )
  if (!existing) throw new Error('User not found')
  if (existing.referral_code) return existing.referral_code

  // Collisions are vanishingly rare at 31^7, but "rare" is not "never" and the
  // column is UNIQUE, so the insert is retried rather than allowed to 500.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = mintCode()
    const row = await sql.one<{ referral_code: string }>(
      `UPDATE users SET referral_code = $2
        WHERE id = $1 AND referral_code IS NULL
          AND NOT EXISTS (SELECT 1 FROM users WHERE referral_code = $2)
        RETURNING referral_code`,
      [userId, code],
    )
    if (row) return row.referral_code

    // Either someone else minted concurrently for this user, or the code
    // clashed. Re-read before deciding which.
    const now = await sql.one<{ referral_code: string | null }>(
      `SELECT referral_code FROM users WHERE id = $1`,
      [userId],
    )
    if (now?.referral_code) return now.referral_code
  }
  throw new Error('Could not allocate a referral code')
}

// ---------------------------------------------------------------------------
// Joining under a code
// ---------------------------------------------------------------------------

export type AttachOutcome = 'linked' | 'unknown_code' | 'self' | 'already_referred'

/**
 * Record that a new account joined on somebody's invitation. Called at the end
 * of registration; a bad code is never fatal, because failing a sign-up over a
 * mistyped invitation would cost far more than the referral is worth.
 */
export async function attachReferral(
  input: { referredUserId: string; code: string },
  outerTx?: Sql,
): Promise<AttachOutcome> {
  const code = normaliseCode(input.code)
  if (!code) return 'unknown_code'

  const run = async (tx: Sql): Promise<AttachOutcome> => {
    const referrer = await tx.one<{ id: string }>(
      `SELECT id FROM users WHERE referral_code = $1 AND status <> 'suspended'`,
      [code],
    )
    if (!referrer) return 'unknown_code'
    if (referrer.id === input.referredUserId) return 'self'

    const claimed = await tx.one<{ id: string }>(
      `SELECT id FROM referrals WHERE referred_user_id = $1`,
      [input.referredUserId],
    )
    if (claimed) return 'already_referred'

    const row = await tx.one<{ id: string }>(
      `INSERT INTO referrals (referrer_user_id, referred_user_id, code)
       VALUES ($1,$2,$3)
       ON CONFLICT (referred_user_id) DO NOTHING
       RETURNING id`,
      [referrer.id, input.referredUserId, code],
    )
    if (!row) return 'already_referred'

    await tx.query(`UPDATE users SET referred_by_user_id = $2 WHERE id = $1`, [
      input.referredUserId,
      referrer.id,
    ])

    await publish(
      {
        type: EVENT.ReferralCreated,
        aggregateType: 'referral',
        aggregateId: row.id,
        actorUserId: input.referredUserId,
        payload: { referrerUserId: referrer.id, code },
      },
      tx,
    )
    await queueNotification(
      {
        userId: referrer.id,
        title: 'Someone joined with your code',
        body: 'You earn reward points as soon as they complete their first order.',
        category: 'reward',
        referenceType: 'referral',
        referenceId: row.id,
      },
      tx,
    )
    return 'linked'
  }

  return outerTx ? run(outerTx) : withTx(run)
}

// ---------------------------------------------------------------------------
// Earning
// ---------------------------------------------------------------------------

export interface Beneficiary {
  /** Never 'platform': a reward is always owed to a member of the network. */
  type: 'user' | 'organisation'
  id: string
  label: string
}

/**
 * Who a member's rewards belong to: their business if they own one, otherwise
 * themselves. The retailer who recruited another retailer *is* the shop, and
 * the points should land where the shop spends them.
 *
 * Ownership, not membership — a staff member earns for themselves, because
 * they can leave, and a reward that followed them out of the door would be
 * paid to the wrong party.
 *
 * Used both when paying a reward and when displaying a balance, so the screen
 * can never disagree with the ledger about whose points these are.
 */
export async function rewardsBeneficiary(userId: string, tx?: Sql): Promise<Beneficiary> {
  const sql = tx ?? (await getSql())
  const org = await sql.one<{ id: string; name: string }>(
    `SELECT id, name FROM organisations WHERE owner_user_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [userId],
  )
  return org
    ? { type: 'organisation', id: org.id, label: org.name }
    : { type: 'user', id: userId, label: 'your wallet' }
}

interface PendingReferral {
  id: string
  referrer_user_id: string
  referrer_role: string
}

/**
 * A completed order by a referred buyer settles the referral that introduced
 * them. Runs inside the order's own transaction, so the reward and the order
 * that earned it either both exist or neither does.
 *
 * Returns null when there is nothing to pay — no referral, already paid, or an
 * order below the qualifying value. An order below the floor leaves the
 * referral pending, so a bigger second order can still earn it.
 */
export async function qualifyReferral(
  tx: Sql,
  input: { referredUserId: string; orderId: string; orderNumber: string; subtotal: number },
): Promise<{ referralId: string; points: number; programme: Programme } | null> {
  if (input.subtotal < REFERRAL_MIN_ORDER_MINOR) return null

  const pending = await tx.one<PendingReferral>(
    `SELECT r.id, r.referrer_user_id, u.role AS referrer_role
       FROM referrals r
       JOIN users u ON u.id = r.referrer_user_id
      WHERE r.referred_user_id = $1 AND r.status = 'pending'`,
    [input.referredUserId],
  )
  if (!pending) return null

  const programme = programmeForRole(pending.referrer_role)
  const points = (await referralPoints(tx))[programme]
  if (points <= 0) return null

  const beneficiary = await rewardsBeneficiary(pending.referrer_user_id, tx)

  // Claim the referral before crediting anything. The UPDATE only matches a
  // row that is still pending, so two orders settling at once cannot both pay.
  const claimed = await tx.one<{ id: string }>(
    `UPDATE referrals
        SET status = 'rewarded',
            rewarded_at = now(),
            programme = $2,
            points_awarded = $3,
            beneficiary_type = $4,
            beneficiary_id = $5,
            qualifying_order_id = $6
      WHERE id = $1 AND status = 'pending'
      RETURNING id`,
    [pending.id, programme, points, beneficiary.type, beneficiary.id, input.orderId],
  )
  if (!claimed) return null

  await creditPoints(tx, {
    ownerType: beneficiary.type,
    ownerId: beneficiary.id,
    points,
    narration: `Referral reward · order ${input.orderNumber}`,
    metadata: { referralId: pending.id, orderId: input.orderId, programme },
  })

  await publish(
    {
      type: EVENT.ReferralRewarded,
      aggregateType: 'referral',
      aggregateId: pending.id,
      actorUserId: pending.referrer_user_id,
      payload: {
        points,
        programme,
        beneficiaryType: beneficiary.type,
        beneficiaryId: beneficiary.id,
        orderNumber: input.orderNumber,
      },
    },
    tx,
  )

  await queueNotification(
    {
      userId: pending.referrer_user_id,
      title: 'Referral reward earned',
      body: `${points.toLocaleString('en-NG')} points are in your rewards balance. Convert them to cash whenever you like.`,
      category: 'reward',
      referenceType: 'referral',
      referenceId: pending.id,
    },
    tx,
  )

  return { referralId: pending.id, points, programme }
}

/** Issue points against the platform's points-float liability. */
async function creditPoints(
  tx: Sql,
  input: {
    ownerType: WalletOwnerType
    ownerId: string
    points: number
    narration: string
    metadata?: Record<string, unknown>
  },
) {
  const float = await platformWallet(PLATFORM_POINTS, tx, POINTS_CURRENCY)
  const wallet = await ensureWallet(input.ownerType, input.ownerId, POINTS_CURRENCY, tx)

  return postTransaction(tx, {
    type: 'referral_reward',
    currency: POINTS_CURRENCY,
    narration: input.narration,
    metadata: input.metadata,
    lines: [
      { walletId: float.id, direction: 'debit', amount: input.points },
      { walletId: wallet.id, direction: 'credit', amount: input.points },
    ],
  })
}

// ---------------------------------------------------------------------------
// Converting points to cash
// ---------------------------------------------------------------------------

export class RedemptionError extends Error {}

/**
 * Burn points and pay the naira equivalent into the same holder's spendable
 * wallet.
 *
 * Two ledger transactions, not one: a transaction has a single currency, and
 * "debits equal credits" only means anything within one unit of account. They
 * share a reference stem so the pair is obvious on a statement, and they are
 * written in one database transaction so points can never be burned without
 * the cash arriving.
 */
export async function redeemPoints(
  ownerType: WalletOwnerType,
  ownerId: string,
  points: number,
  outerTx?: Sql,
): Promise<{ points: number; amount: number; reference: string }> {
  if (!Number.isInteger(points) || points <= 0) {
    throw new RedemptionError('Enter a whole number of points to convert.')
  }
  if (points < MIN_REDEEMABLE_POINTS) {
    throw new RedemptionError(
      `You can convert from ${MIN_REDEEMABLE_POINTS.toLocaleString('en-NG')} points upwards.`,
    )
  }

  const amount = pointsToMinor(points)

  const run = async (tx: Sql) => {
    const pointsWallet = await ensureWallet(ownerType, ownerId, POINTS_CURRENCY, tx)
    if (pointsWallet.available < points) {
      throw new InsufficientFundsError(pointsWallet.available)
    }

    const stem = reference('REDEEM')
    const float = await platformWallet(PLATFORM_POINTS, tx, POINTS_CURRENCY)
    const revenue = await platformWallet(PLATFORM_REVENUE, tx)
    const cashWallet = await ensureWallet(ownerType, ownerId, DEFAULT_CURRENCY, tx)

    await postTransaction(tx, {
      type: 'points_redemption',
      currency: POINTS_CURRENCY,
      reference: `${stem}-PTS`,
      narration: 'Points converted to cash',
      metadata: { amountMinor: amount },
      lines: [
        { walletId: pointsWallet.id, direction: 'debit', amount: points },
        { walletId: float.id, direction: 'credit', amount: points },
      ],
    })

    await postTransaction(tx, {
      type: 'points_redemption',
      reference: `${stem}-NGN`,
      narration: `Reward points converted (${points.toLocaleString('en-NG')} pts)`,
      metadata: { points },
      lines: [
        { walletId: revenue.id, direction: 'debit', amount },
        { walletId: cashWallet.id, direction: 'credit', amount },
      ],
    })

    await publish(
      {
        type: EVENT.PointsRedeemed,
        aggregateType: ownerType === 'organisation' ? 'organisation' : 'user',
        aggregateId: ownerId,
        payload: { points, amount, reference: stem },
      },
      tx,
    )

    return { points, amount, reference: stem }
  }

  return outerTx ? run(outerTx) : withTx(run)
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface PointsBalance {
  walletId: string
  available: number
  redeemableValue: number
}

export async function pointsBalance(
  ownerType: WalletOwnerType,
  ownerId: string,
): Promise<PointsBalance> {
  const wallet = await ensureWallet(ownerType, ownerId, POINTS_CURRENCY)
  return {
    walletId: wallet.id,
    available: wallet.available,
    redeemableValue: pointsToMinor(wallet.available),
  }
}

export interface ReferralRecord {
  id: string
  status: 'pending' | 'rewarded' | 'void'
  programme: Programme
  points_awarded: number
  created_at: Date
  rewarded_at: Date | null
  referred_name: string
  referred_role: string
  order_number: string | null
}

export async function referralsFor(userId: string, limit = 25): Promise<ReferralRecord[]> {
  const sql = await getSql()
  return sql.query<ReferralRecord>(
    `SELECT r.id, r.status, r.programme, r.points_awarded, r.created_at, r.rewarded_at,
            u.full_name AS referred_name, u.role AS referred_role,
            o.order_number
       FROM referrals r
       JOIN users u ON u.id = r.referred_user_id
       LEFT JOIN orders o ON o.id = r.qualifying_order_id
      WHERE r.referrer_user_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2`,
    [userId, limit],
  )
}

export interface ReferralSummary {
  invited: number
  pending: number
  rewarded: number
  points_earned: number
}

export async function referralSummary(userId: string): Promise<ReferralSummary> {
  const sql = await getSql()
  const row = await sql.one<ReferralSummary>(
    `SELECT COUNT(*)::int                                                AS invited,
            COUNT(*) FILTER (WHERE status = 'pending')::int              AS pending,
            COUNT(*) FILTER (WHERE status = 'rewarded')::int             AS rewarded,
            COALESCE(SUM(points_awarded), 0)::bigint                     AS points_earned
       FROM referrals WHERE referrer_user_id = $1`,
    [userId],
  )
  return row ?? { invited: 0, pending: 0, rewarded: 0, points_earned: 0 }
}

/** Who invited this account, if anyone. Shown so the relationship is visible. */
export async function referredBy(userId: string): Promise<{ name: string; status: string } | null> {
  const sql = await getSql()
  return sql.one<{ name: string; status: string }>(
    `SELECT u.full_name AS name, r.status
       FROM referrals r JOIN users u ON u.id = r.referrer_user_id
      WHERE r.referred_user_id = $1`,
    [userId],
  )
}

export interface ProgrammeStats {
  referrals_total: number
  referrals_pending: number
  referrals_rewarded: number
  points_issued: number
  points_redeemed: number
  points_outstanding: number
  liability_minor: number
  members_with_points: number
}

/** Programme health for the admin console. Every figure comes off the ledger. */
export async function programmeStats(): Promise<ProgrammeStats> {
  const sql = await getSql()

  const row = await sql.one<Omit<ProgrammeStats, 'points_outstanding' | 'liability_minor'>>(
    `SELECT
       (SELECT COUNT(*)::int FROM referrals)                                   AS referrals_total,
       (SELECT COUNT(*)::int FROM referrals WHERE status = 'pending')          AS referrals_pending,
       (SELECT COUNT(*)::int FROM referrals WHERE status = 'rewarded')         AS referrals_rewarded,
       (SELECT COALESCE(SUM(points_awarded), 0)::bigint FROM referrals)        AS points_issued,
       (SELECT COALESCE(SUM(t.amount), 0)::bigint
          FROM ledger_transactions t
         WHERE t.type = 'points_redemption' AND t.currency = $1)               AS points_redeemed,
       (SELECT COUNT(*)::int FROM wallets
         WHERE currency = $1 AND owner_type <> 'platform' AND available > 0)   AS members_with_points`,
    [POINTS_CURRENCY],
  )

  const issued = Number(row?.points_issued ?? 0)
  const redeemed = Number(row?.points_redeemed ?? 0)
  const outstanding = issued - redeemed

  return {
    referrals_total: row?.referrals_total ?? 0,
    referrals_pending: row?.referrals_pending ?? 0,
    referrals_rewarded: row?.referrals_rewarded ?? 0,
    points_issued: issued,
    points_redeemed: redeemed,
    points_outstanding: outstanding,
    liability_minor: pointsToMinor(outstanding),
    members_with_points: row?.members_with_points ?? 0,
  }
}

export interface TopReferrer {
  user_id: string
  full_name: string
  role: string
  organisation_name: string | null
  rewarded: number
  points_earned: number
}

export async function topReferrers(limit = 10): Promise<TopReferrer[]> {
  const sql = await getSql()
  return sql.query<TopReferrer>(
    `SELECT r.referrer_user_id AS user_id, u.full_name, u.role,
            o.name AS organisation_name,
            COUNT(*) FILTER (WHERE r.status = 'rewarded')::int AS rewarded,
            COALESCE(SUM(r.points_awarded), 0)::bigint         AS points_earned
       FROM referrals r
       JOIN users u ON u.id = r.referrer_user_id
       LEFT JOIN organisations o ON o.owner_user_id = u.id
      GROUP BY r.referrer_user_id, u.full_name, u.role, o.name
     HAVING COUNT(*) FILTER (WHERE r.status = 'rewarded') > 0
      ORDER BY points_earned DESC
      LIMIT $1`,
    [limit],
  )
}
