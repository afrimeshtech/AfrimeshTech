import { getSql, withTx } from '@/db/client'
import { publish, EVENT } from '@/modules/events/service'
import { queueNotification } from '@/modules/notifications/service'

/**
 * MODULE: messaging
 *
 * "Customer communication" (PRD, Retailer Module) - a buyer and a seller
 * agreeing where to leave a delivery, or a shop telling a customer one item is
 * short.
 *
 * Threads are anchored to an order. That gives both sides a verifiable shared
 * subject, keeps access control trivial (you are either the buyer on that
 * order or you work for the selling business), and means the inbox cannot be
 * used to cold-message shops once the network grows.
 */

export interface Conversation {
  id: string
  order_id: string
  buyer_user_id: string
  seller_org_id: string
  last_message_at: Date
}

export interface Message {
  id: string
  conversation_id: string
  sender_user_id: string
  sender_side: 'buyer' | 'seller'
  body: string
  read_at: Date | null
  created_at: Date
}

export interface ThreadSummary extends Conversation {
  order_number: string
  order_status: string
  seller_name: string
  seller_slug: string
  seller_logo: string | null
  buyer_name: string
  buyer_org_name: string | null
  last_body: string | null
  last_side: 'buyer' | 'seller' | null
  unread: number
}

export class MessagingError extends Error {}

export type Side = 'buyer' | 'seller'

/**
 * Establish which side of the order the viewer is on, or refuse.
 * Every read and write in this module goes through here first.
 */
export async function sideFor(
  orderId: string,
  userId: string,
  organisationId: string | null,
): Promise<Side> {
  const sql = await getSql()
  const order = await sql.one<{
    buyer_user_id: string
    seller_org_id: string
    buyer_org_id: string | null
  }>(`SELECT buyer_user_id, seller_org_id, buyer_org_id FROM orders WHERE id = $1`, [orderId])
  if (!order) throw new MessagingError('Order not found')

  if (organisationId && order.seller_org_id === organisationId) return 'seller'
  if (order.buyer_user_id === userId) return 'buyer'
  if (organisationId && order.buyer_org_id === organisationId) return 'buyer'
  throw new MessagingError('You are not a party to this order')
}

/** Fetch the thread for an order, creating it on first use. */
export async function threadFor(orderId: string): Promise<Conversation> {
  return withTx(async (tx) => {
    const existing = await tx.one<Conversation>(`SELECT * FROM conversations WHERE order_id = $1`, [
      orderId,
    ])
    if (existing) return existing

    const order = await tx.one<{ buyer_user_id: string; seller_org_id: string }>(
      `SELECT buyer_user_id, seller_org_id FROM orders WHERE id = $1`,
      [orderId],
    )
    if (!order) throw new MessagingError('Order not found')

    const created = await tx.one<Conversation>(
      `INSERT INTO conversations (order_id, buyer_user_id, seller_org_id)
       VALUES ($1,$2,$3)
       ON CONFLICT (order_id) DO UPDATE SET last_message_at = conversations.last_message_at
       RETURNING *`,
      [orderId, order.buyer_user_id, order.seller_org_id],
    )
    if (!created) throw new MessagingError('Could not open that conversation')
    return created
  })
}

export async function sendMessage(input: {
  orderId: string
  senderUserId: string
  organisationId: string | null
  body: string
}): Promise<Message> {
  const body = input.body.trim()
  if (!body) throw new MessagingError('Write something first')
  if (body.length > 2000) throw new MessagingError('That message is too long')

  const side = await sideFor(input.orderId, input.senderUserId, input.organisationId)
  const conversation = await threadFor(input.orderId)

  return withTx(async (tx) => {
    const message = await tx.one<Message>(
      `INSERT INTO messages (conversation_id, sender_user_id, sender_side, body)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [conversation.id, input.senderUserId, side, body],
    )
    if (!message) throw new MessagingError('Could not send that message')

    await tx.query(`UPDATE conversations SET last_message_at = now() WHERE id = $1`, [
      conversation.id,
    ])

    // Notify the other side, never the sender.
    const order = await tx.one<{
      order_number: string
      buyer_user_id: string
      seller_owner: string | null
      seller_name: string
      buyer_name: string
    }>(
      `SELECT o.order_number, o.buyer_user_id, s.owner_user_id AS seller_owner,
              s.name AS seller_name, u.full_name AS buyer_name
         FROM orders o
         JOIN organisations s ON s.id = o.seller_org_id
         JOIN users u ON u.id = o.buyer_user_id
        WHERE o.id = $1`,
      [input.orderId],
    )

    const recipient = side === 'buyer' ? order?.seller_owner : order?.buyer_user_id
    if (recipient && recipient !== input.senderUserId && order) {
      await queueNotification(
        {
          userId: recipient,
          title: `Message about ${order.order_number}`,
          body: body.length > 120 ? `${body.slice(0, 117)}…` : body,
          category: 'message',
          referenceType: 'order',
          referenceId: input.orderId,
        },
        tx,
      )
    }

    await publish(
      {
        type: EVENT.MessageSent,
        aggregateType: 'conversation',
        aggregateId: conversation.id,
        actorUserId: input.senderUserId,
        payload: { orderId: input.orderId, side },
      },
      tx,
    )

    return message
  })
}

/** Messages in a thread, marking the other side's messages read as you look. */
export async function readThread(
  orderId: string,
  userId: string,
  organisationId: string | null,
): Promise<{ side: Side; messages: Message[] }> {
  const side = await sideFor(orderId, userId, organisationId)
  const conversation = await threadFor(orderId)
  const sql = await getSql()

  await sql.query(
    `UPDATE messages SET read_at = now()
      WHERE conversation_id = $1 AND sender_side <> $2 AND read_at IS NULL`,
    [conversation.id, side],
  )

  const messages = await sql.query<Message>(
    `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversation.id],
  )
  return { side, messages }
}

/**
 * One inbox query, parameterised by which side is looking. `unreadSide` is the
 * side whose messages count as unread *for the viewer* - a buyer's unread
 * messages are the ones the seller sent, and vice versa.
 */
function inboxSql(unreadSide: Side, scope: 'buyer' | 'seller'): string {
  return `
    SELECT c.*,
           o.order_number, o.status::text AS order_status,
           s.name AS seller_name, s.slug AS seller_slug, s.logo_url AS seller_logo,
           u.full_name AS buyer_name, bo.name AS buyer_org_name,
           (SELECT m.body FROM messages m WHERE m.conversation_id = c.id
             ORDER BY m.created_at DESC LIMIT 1) AS last_body,
           (SELECT m.sender_side FROM messages m WHERE m.conversation_id = c.id
             ORDER BY m.created_at DESC LIMIT 1) AS last_side,
           (SELECT COUNT(*)::int FROM messages m
             WHERE m.conversation_id = c.id
               AND m.sender_side = '${unreadSide}'
               AND m.read_at IS NULL) AS unread
      FROM conversations c
      JOIN orders o        ON o.id = c.order_id
      JOIN organisations s ON s.id = c.seller_org_id
      JOIN users u         ON u.id = c.buyer_user_id
      LEFT JOIN organisations bo ON bo.id = o.buyer_org_id
     WHERE ${scope === 'buyer' ? 'c.buyer_user_id' : 'c.seller_org_id'} = $1
     ORDER BY c.last_message_at DESC
  `
}

/** A buyer's inbox. */
export async function threadsForBuyer(userId: string): Promise<ThreadSummary[]> {
  const sql = await getSql()
  return sql.query<ThreadSummary>(inboxSql('seller', 'buyer'), [userId])
}

/** A seller's inbox. */
export async function threadsForSeller(orgId: string): Promise<ThreadSummary[]> {
  const sql = await getSql()
  return sql.query<ThreadSummary>(inboxSql('buyer', 'seller'), [orgId])
}

export async function unreadMessageCount(
  userId: string,
  organisationId: string | null,
): Promise<number> {
  const sql = await getSql()
  const row = await sql.one<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
      WHERE m.read_at IS NULL
        AND (
          (c.buyer_user_id = $1 AND m.sender_side = 'seller')
          OR ($2::uuid IS NOT NULL AND c.seller_org_id = $2 AND m.sender_side = 'buyer')
        )`,
    [userId, organisationId],
  )
  return row?.count ?? 0
}
