'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser, currentOrganisation } from '@/lib/auth'
import { deposit, withdraw, InsufficientFundsError } from '@/modules/wallet/service'
import { gateway } from '@/modules/payments/service'
import { toMinor } from '@/lib/money'

import { parseForm, z, nairaAmount, paymentMethod } from '@/lib/forms'

export interface WalletActionState {
  error?: string
  notice?: string
}

const MAX_TOPUP_NAIRA = 5_000_000

const topUpSchema = z.object({
  amount: nairaAmount('Top-up amount', 100).refine((value) => value <= MAX_TOPUP_NAIRA, {
    message: `Single top-ups are capped at ₦${MAX_TOPUP_NAIRA.toLocaleString()}.`,
  }),
  method: paymentMethod.catch('card'),
  scope: z.enum(['user', 'organisation']).catch('user'),
})

const withdrawSchema = z.object({
  amount: nairaAmount('Withdrawal amount', 100),
  scope: z.enum(['user', 'organisation']).catch('user'),
})

/**
 * Wallet top-up. The money genuinely has to come from somewhere, so this runs
 * through the same payment gateway abstraction an order does; only on a
 * successful charge is the wallet credited.
 */
export async function topUpAction(
  _prev: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/wallet')

  const parsed = parseForm(topUpSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const { amount: naira, scope } = parsed.data

  const amount = toMinor(naira)

  let ownerType: 'user' | 'organisation' = 'user'
  let ownerId = user.id
  if (scope === 'organisation') {
    const org = await currentOrganisation()
    if (!org) return { error: 'No business account found' }
    ownerType = 'organisation'
    ownerId = org.id
  }

  const charge = await gateway().charge({
    amount,
    currency: 'NGN',
    method: parsed.data.method,
    reference: `TOPUP-${Date.now()}`,
    customer: { userId: user.id, email: user.email, phone: user.phone },
  })

  if (!charge.success) return { error: charge.failureReason ?? 'That payment was declined' }

  await deposit(ownerType, ownerId, amount, 'Wallet top-up')
  revalidatePath('/wallet')
  revalidatePath('/partner/wallet')
  return { notice: `₦${naira.toLocaleString()} added to your wallet.` }
}

export async function withdrawAction(
  _prev: WalletActionState,
  formData: FormData,
): Promise<WalletActionState> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/wallet')

  const parsed = parseForm(withdrawSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const { amount: naira, scope } = parsed.data

  let ownerType: 'user' | 'organisation' = 'user'
  let ownerId = user.id
  if (scope === 'organisation') {
    const org = await currentOrganisation()
    if (!org) return { error: 'No business account found' }
    ownerType = 'organisation'
    ownerId = org.id
  }

  try {
    await withdraw(ownerType, ownerId, toMinor(naira), 'Withdrawal to bank account')
  } catch (err) {
    if (err instanceof InsufficientFundsError) {
      return { error: 'Your available balance is not enough for that withdrawal' }
    }
    console.error('[wallet] withdrawal failed', err)
    return { error: 'We could not process that withdrawal.' }
  }

  revalidatePath('/wallet')
  revalidatePath('/partner/wallet')
  return { notice: `₦${naira.toLocaleString()} is on its way to your bank account.` }
}
