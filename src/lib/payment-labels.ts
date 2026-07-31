/**
 * Payment method labels, shared by server and client components.
 *
 * These live outside the payments module so a client component can import them
 * without pulling the module's database code into the browser bundle.
 */
export const PAYMENT_METHOD_LABEL = {
  wallet: 'AfriMesh Wallet',
  card: 'Debit card',
  bank_transfer: 'Bank transfer',
  ussd: 'USSD',
  qr: 'QR payment',
} as const

export type PaymentMethodKey = keyof typeof PAYMENT_METHOD_LABEL
