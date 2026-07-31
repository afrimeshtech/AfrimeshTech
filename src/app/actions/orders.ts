'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser, currentOrganisation } from '@/lib/auth'
import {
  advanceOrder,
  cancelOrder,
  getOrder,
  rateOrder,
  BusinessRuleError,
  type OrderStatus,
} from '@/modules/orders/service'

import { parseForm, z, uuid, stars, requiredText } from '@/lib/forms'

export interface OrderActionState {
  error?: string
  notice?: string
}

const rateSchema = z.object({
  orderId: uuid('order'),
  stars,
  comment: z.string().trim().max(1000).optional(),
})

const cancelSchema = z.object({
  orderId: uuid('order'),
  reason: requiredText('A reason', 300),
})

const advanceSchema = z.object({
  orderId: uuid('order'),
  next: z.enum(
    ['confirmed', 'preparing', 'dispatched', 'delivered', 'completed', 'cancelled', 'refunded'],
    { message: 'That is not a valid order status.' },
  ),
})

/** Buyer rates a delivered order. Verified transactions only (PRD §12). */
export async function rateOrderAction(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await currentUser()
  if (!user) redirect('/login')

  const parsed = parseForm(rateSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  try {
    await rateOrder(parsed.data.orderId, user.id, parsed.data.stars, parsed.data.comment || null)
  } catch (err) {
    if (err instanceof BusinessRuleError) return { error: err.message }
    console.error('[orders] rating failed', err)
    return { error: 'We could not save that rating.' }
  }

  revalidatePath(`/orders/${parsed.data.orderId}`)
  return { notice: 'Thanks — your rating helps other buyers.' }
}

export async function cancelOrderAction(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await currentUser()
  if (!user) redirect('/login')

  const parsed = parseForm(cancelSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const { orderId, reason } = parsed.data

  const order = await getOrder(orderId)
  if (!order) return { error: 'Order not found' }

  // Either side of the transaction may cancel; nobody else may.
  const org = await currentOrganisation()
  const isBuyer = order.buyer_user_id === user.id
  const isSeller = org?.id === order.seller_org_id
  if (!isBuyer && !isSeller) return { error: 'You cannot cancel this order' }

  try {
    await cancelOrder(orderId, user.id, reason)
  } catch (err) {
    if (err instanceof BusinessRuleError) return { error: err.message }
    console.error('[orders] cancellation failed', err)
    return { error: 'We could not cancel that order.' }
  }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/partner/orders')
  return { notice: 'Order cancelled.' }
}

/**
 * Seller moves an order along its lifecycle. The buyer is allowed exactly one
 * transition - confirming delivery - because they are the party who knows the
 * goods arrived, and that is what releases escrow.
 */
export async function advanceOrderAction(
  _prev: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const user = await currentUser()
  if (!user) redirect('/login')

  const parsed = parseForm(advanceSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const orderId = parsed.data.orderId
  const next = parsed.data.next as OrderStatus

  const order = await getOrder(orderId)
  if (!order) return { error: 'Order not found' }

  const org = await currentOrganisation()
  const isSeller = org?.id === order.seller_org_id
  const isBuyer = order.buyer_user_id === user.id
  const buyerMayDo = next === 'completed' && order.status === 'delivered'

  if (!isSeller && !(isBuyer && buyerMayDo)) {
    return { error: 'You are not allowed to make that change' }
  }

  try {
    await advanceOrder(orderId, next, user.id)
  } catch (err) {
    if (err instanceof BusinessRuleError) return { error: err.message }
    console.error('[orders] transition failed', err)
    return { error: 'We could not update that order.' }
  }

  revalidatePath(`/orders/${orderId}`)
  revalidatePath('/partner/orders')
  revalidatePath(`/partner/orders/${orderId}`)
  return { notice: 'Order updated.' }
}
