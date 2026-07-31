import { randomBytes } from 'node:crypto'
import { type Sql } from '@/db/client'

/**
 * MODULE: payments
 *
 * "The payment service should abstract multiple providers behind a common
 * interface... The design allows regional payment providers to be added
 * without changing business logic." - System Architecture Document.
 *
 * So the rest of the platform only ever sees `PaymentGateway`. Paystack,
 * Flutterwave, a bank's USSD rail or a QR scheme each become one adapter
 * implementing `charge`/`refund`; no order, wallet or inventory code changes.
 *
 * Methods supported at MVP: wallet, bank transfer, card, USSD, QR.
 * Split payments and scheduled payments are deferred (PRD §10, future).
 */

export type PaymentMethod = 'wallet' | 'bank_transfer' | 'card' | 'ussd' | 'qr'

export interface ChargeRequest {
  amount: number // minor units
  currency: string
  method: PaymentMethod
  reference: string
  customer: { userId: string; email?: string | null; phone?: string | null }
  metadata?: Record<string, unknown>
}

export interface ChargeResult {
  success: boolean
  providerRef: string
  failureReason?: string
  /** Set when the provider needs the customer to complete an action. */
  actionRequired?: { kind: 'redirect' | 'ussd_code' | 'qr'; value: string }
}

export interface PaymentGateway {
  readonly name: string
  supports(method: PaymentMethod): boolean
  charge(request: ChargeRequest): Promise<ChargeResult>
  refund(providerRef: string, amount: number): Promise<ChargeResult>
}

// ---------------------------------------------------------------------------
// Mock gateway - the default for development and demos.
// ---------------------------------------------------------------------------

const mockGateway: PaymentGateway = {
  name: 'mock',
  supports: () => true,
  async charge(request) {
    const providerRef = `MOCK-${randomBytes(6).toString('hex').toUpperCase()}`
    // Deterministic failure hook so the failure path stays exercisable:
    // any amount ending in .13 is declined.
    if (request.amount % 100 === 13) {
      return { success: false, providerRef, failureReason: 'Declined by issuer' }
    }
    if (request.method === 'ussd') {
      return {
        success: true,
        providerRef,
        actionRequired: { kind: 'ussd_code', value: '*737*000#' },
      }
    }
    return { success: true, providerRef }
  },
  async refund(providerRef) {
    return { success: true, providerRef: `${providerRef}-RFND` }
  },
}

/*
 * Adapters for live providers plug in here, e.g.:
 *
 *   const paystack: PaymentGateway = {
 *     name: 'paystack',
 *     supports: (m) => ['card', 'bank_transfer', 'ussd'].includes(m),
 *     async charge(req) { ... POST /transaction/initialize ... },
 *     async refund(ref, amount) { ... POST /refund ... },
 *   }
 */

const GATEWAYS: Record<string, PaymentGateway> = {
  mock: mockGateway,
}

export function gateway(): PaymentGateway {
  const configured = process.env.PAYMENT_PROVIDER ?? 'mock'
  return GATEWAYS[configured] ?? mockGateway
}

// ---------------------------------------------------------------------------
// Payment records
// ---------------------------------------------------------------------------

export interface Payment {
  id: string
  order_id: string | null
  payer_user_id: string
  method: PaymentMethod
  provider: string
  provider_ref: string | null
  amount: number
  currency: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  failure_reason: string | null
  created_at: Date
  completed_at: Date | null
}

export async function createPayment(
  tx: Sql,
  input: {
    orderId: string | null
    payerUserId: string
    method: PaymentMethod
    amount: number
    currency: string
  },
): Promise<Payment> {
  const row = await tx.one<Payment>(
    `INSERT INTO payments (order_id, payer_user_id, method, provider, amount, currency)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [input.orderId, input.payerUserId, input.method, gateway().name, input.amount, input.currency],
  )
  if (!row) throw new Error('Failed to create payment')
  return row
}

export async function markPayment(
  tx: Sql,
  paymentId: string,
  status: 'succeeded' | 'failed' | 'refunded',
  detail: { providerRef?: string | null; failureReason?: string | null } = {},
): Promise<void> {
  // Every status this function accepts is terminal, so the payment is always
  // being completed. (An earlier version also handled 'pending' here and used
  // $2 in two different type contexts, which PostgreSQL cannot deduce a type
  // for - `text versus payment_status`.)
  await tx.query(
    `UPDATE payments
        SET status = $2,
            provider_ref = COALESCE($3, provider_ref),
            failure_reason = $4,
            completed_at = now()
      WHERE id = $1`,
    [paymentId, status, detail.providerRef ?? null, detail.failureReason ?? null],
  )
}

export async function paymentsForOrder(tx: Sql, orderId: string): Promise<Payment[]> {
  return tx.query<Payment>(`SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC`, [
    orderId,
  ])
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  wallet: 'AfriMesh Wallet',
  bank_transfer: 'Bank transfer',
  card: 'Debit card',
  ussd: 'USSD',
  qr: 'QR payment',
}
