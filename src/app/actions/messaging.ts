'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser, currentOrganisation } from '@/lib/auth'
import { sendMessage, MessagingError } from '@/modules/messaging/service'

import { parseForm, z, uuid } from '@/lib/forms'

export interface MessageActionState {
  error?: string
}

const sendSchema = z.object({
  orderId: uuid('order'),
  body: z
    .string()
    .trim()
    .min(1, { message: 'Write something first.' })
    .max(2000, { message: 'That message is too long.' }),
})

export async function sendMessageAction(
  _prev: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/messages')

  const parsed = parseForm(sendSchema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const { orderId, body } = parsed.data

  // The organisation is resolved server-side, never taken from the form —
  // otherwise anyone could claim to be the seller on someone else's order.
  const org = await currentOrganisation()

  try {
    await sendMessage({ orderId, senderUserId: user.id, organisationId: org?.id ?? null, body })
  } catch (err) {
    if (err instanceof MessagingError) return { error: err.message }
    console.error('[messaging] send failed', err)
    return { error: 'We could not send that message.' }
  }

  revalidatePath(`/messages/${orderId}`)
  revalidatePath('/messages')
  revalidatePath('/', 'layout')
  return {}
}
