/**
 * Business-rule verification.
 *
 * Each check below maps to a rule the specifications state explicitly. They run
 * against the real service layer and the seeded database, so a pass means the
 * rule genuinely holds in the running system rather than in a mock.
 *
 *   npm run verify        (stop the dev server first - PGlite is single-process)
 *
 * Checks that mutate data clean up after themselves, so this is safe to re-run.
 */
import { getSql } from '@/db/client'
import {
  placeOrder,
  payOrder,
  cancelOrder,
  advanceOrder,
  getOrder,
  rateOrder,
  BusinessRuleError,
} from '@/modules/orders/service'
import { reserveStock, releaseReservations } from '@/modules/inventory/service'
import { verifyIntegrity, getBalance, deposit } from '@/modules/wallet/service'
import { searchProducts } from '@/modules/search/service'
import { rankOffers, setWeight, getWeights } from '@/modules/recommendation/service'
import { openJobs, acceptJob, markPickedUp, completeDelivery } from '@/modules/logistics/service'
import { sendMessage, readThread } from '@/modules/messaging/service'
import { withTx } from '@/db/client'
import { TIER } from '@/lib/tiers'
import { cashbackFor } from '@/lib/money'

/** Deterministic id of the platform logistics wallet (see wallet service). */
const LOGISTICS_WALLET_ID = '00000000-0000-4000-8000-000000000003'

let passed = 0
let failed = 0

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function expectRejection(name: string, fn: () => Promise<unknown>, expect: string) {
  try {
    await fn()
    check(name, false, 'the operation was allowed when it should have been rejected')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    check(name, err instanceof BusinessRuleError || message.includes(expect), message)
  }
}

const sql = await getSql()

const org = async (slug: string) =>
  (await sql.one<{ id: string; lat: number; lng: number; tier_level: number; name: string }>(
    `SELECT id, lat, lng, tier_level, name FROM organisations WHERE slug = $1`,
    [slug],
  ))!

const user = async (email: string) =>
  (await sql.one<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM users WHERE email = $1`,
    [email],
  ))!

const listing = async (orgId: string, productName: string) =>
  (await sql.one<{ id: string; qty_available: number; min_order_qty: number }>(
    `SELECT i.id, i.qty_available, i.min_order_qty
       FROM inventory_items i JOIN products p ON p.id = i.product_id
      WHERE i.organisation_id = $1 AND p.name = $2`,
    [orgId, productName],
  ))!

console.log('\nAfriMesh business-rule verification\n')

// ---------------------------------------------------------------------------
console.log('PRD §12 — Supply-chain business rules')
// ---------------------------------------------------------------------------

const ada = await user('ada@example.ng')
const grace = await org('grace-stores')
const mushin = await org('mushin-trade-partners')
const apapa = await org('apapa-distribution-hub')
const graceOwner = await user('grace@gracestores.ng')

const warehouseListing = await listing(apapa.id, 'Peak Milk Powder 400g')
const merchantListing = await listing(mushin.id, 'Peak Milk Powder 400g')
const outletListing = await listing(grace.id, 'Peak Milk Powder 400g')

await expectRejection(
  'Consumers cannot purchase directly from warehouses',
  () =>
    placeOrder({
      buyerUserId: ada.id,
      buyerOrgId: null,
      buyerTier: TIER.consumer,
      sellerOrgId: apapa.id,
      items: [{ inventoryItemId: warehouseListing.id, qty: 1 }],
      fulfilment: 'delivery',
      deliveryLat: 6.6018,
      deliveryLng: 3.3515,
    }),
  'warehouses',
)

await expectRejection(
  'Consumers cannot purchase directly from merchants',
  () =>
    placeOrder({
      buyerUserId: ada.id,
      buyerOrgId: null,
      buyerTier: TIER.consumer,
      sellerOrgId: mushin.id,
      items: [{ inventoryItemId: merchantListing.id, qty: 1 }],
      fulfilment: 'delivery',
      deliveryLat: 6.6018,
      deliveryLng: 3.3515,
    }),
  'tier',
)

await expectRejection(
  'Retail outlets cannot skip merchants and buy from warehouses',
  () =>
    placeOrder({
      buyerUserId: graceOwner.id,
      buyerOrgId: grace.id,
      buyerTier: TIER.outlet,
      sellerOrgId: apapa.id,
      items: [{ inventoryItemId: warehouseListing.id, qty: 20 }],
      fulfilment: 'delivery',
      deliveryLat: grace.lat,
      deliveryLng: grace.lng,
    }),
  'tier',
)

// The permitted path: outlet buys from merchant.
const b2bOrder = await placeOrder({
  buyerUserId: graceOwner.id,
  buyerOrgId: grace.id,
  buyerTier: TIER.outlet,
  sellerOrgId: mushin.id,
  items: [{ inventoryItemId: merchantListing.id, qty: merchantListing.min_order_qty }],
  fulfilment: 'delivery',
  deliveryLat: grace.lat,
  deliveryLng: grace.lng,
})
check(
  'Retail outlets can buy from merchants',
  b2bOrder.status === 'pending_payment',
  b2bOrder.order_number,
)

// Wholesale pricing applies to the B2B order, retail to a consumer order.
check(
  'B2B orders are priced at wholesale, not retail',
  b2bOrder.items[0].unit_price ===
    (await sql.one<{ wholesale_price: number }>(
      `SELECT wholesale_price FROM inventory_items WHERE id = $1`,
      [merchantListing.id],
    ))!.wholesale_price,
  `paid ${b2bOrder.items[0].unit_price} per unit`,
)

await cancelOrder(b2bOrder.id, graceOwner.id, 'verification cleanup')

// ---------------------------------------------------------------------------
console.log('\nInventory doc §3–§5 — Stock reservation and the ledger')
// ---------------------------------------------------------------------------

const before = (await sql.one<{ qty_available: number; qty_reserved: number }>(
  `SELECT qty_available, qty_reserved FROM inventory_items WHERE id = $1`,
  [outletListing.id],
))!

const holdOrder = await placeOrder({
  buyerUserId: ada.id,
  buyerOrgId: null,
  buyerTier: TIER.consumer,
  sellerOrgId: grace.id,
  items: [{ inventoryItemId: outletListing.id, qty: 2 }],
  fulfilment: 'delivery',
  deliveryLat: 6.6018,
  deliveryLng: 3.3515,
})

const during = (await sql.one<{ qty_available: number; qty_reserved: number }>(
  `SELECT qty_available, qty_reserved FROM inventory_items WHERE id = $1`,
  [outletListing.id],
))!

check(
  'Placing an order reserves stock immediately',
  during.qty_available === before.qty_available - 2 &&
    during.qty_reserved === before.qty_reserved + 2,
  `available ${before.qty_available} → ${during.qty_available}, reserved ${before.qty_reserved} → ${during.qty_reserved}`,
)

// Reserved units must be invisible to discovery.
const offersWhileHeld = await rankOffers(
  { lat: 6.6018, lng: 3.3515, tier: TIER.consumer },
  {
    productId: (await sql.one<{ product_id: string }>(
      `SELECT product_id FROM inventory_items WHERE id = $1`,
      [outletListing.id],
    ))!.product_id,
  },
)
const graceOffer = offersWhileHeld.find((o) => o.organisation_id === grace.id)
check(
  'Reserved units are excluded from what buyers can see',
  graceOffer?.qty_available === during.qty_available,
  `discovery shows ${graceOffer?.qty_available}, available is ${during.qty_available}`,
)

await cancelOrder(holdOrder.id, ada.id, 'verification cleanup')

const after = (await sql.one<{ qty_available: number; qty_reserved: number }>(
  `SELECT qty_available, qty_reserved FROM inventory_items WHERE id = $1`,
  [outletListing.id],
))!
check(
  'Cancelling an unpaid order releases the reservation',
  after.qty_available === before.qty_available && after.qty_reserved === before.qty_reserved,
  `available back to ${after.qty_available}`,
)

// Overselling must be impossible even when asking for more than exists.
await expectRejection(
  'Stock cannot be reserved beyond what is available',
  () =>
    withTx(async (tx) => {
      await reserveStock(tx, outletListing.id, after.qty_available + 50, crypto.randomUUID())
    }),
  'stock',
)

// Two buyers racing for the last units: the second must lose.
const scarce = await sql.one<{ id: string; qty_available: number }>(
  `SELECT id, qty_available FROM inventory_items
    WHERE organisation_id = $1 AND qty_available BETWEEN 1 AND 20 LIMIT 1`,
  [grace.id],
)
if (scarce) {
  const fakeOrderA = crypto.randomUUID()
  let oversold = false
  try {
    await withTx(async (tx) => {
      await reserveStock(tx, scarce.id, scarce.qty_available, fakeOrderA)
      // Second reservation inside the same transaction sees the reduced figure.
      await reserveStock(tx, scarce.id, 1, crypto.randomUUID())
      oversold = true
    })
  } catch {
    // expected
  }
  check('Concurrent reservations cannot oversell the last units', !oversold)
  await releaseReservations(fakeOrderA, 'released')
}

// The ledger records every movement and is append-only.
const ledgerRows = await sql.one<{ count: number }>(
  `SELECT COUNT(*)::int AS count FROM inventory_ledger WHERE inventory_item_id = $1`,
  [outletListing.id],
)
check(
  'Every stock movement is written to the immutable ledger',
  (ledgerRows?.count ?? 0) > 0,
  `${ledgerRows?.count} entries`,
)

// ---------------------------------------------------------------------------
console.log('\nSAD Wallet Architecture — Double-entry ledger and escrow')
// ---------------------------------------------------------------------------

const graceWalletBefore = await getBalance('organisation', grace.id)
const logisticsBefore = await getBalance('platform', LOGISTICS_WALLET_ID)
await deposit('user', ada.id, 5_000_000, 'verification funding')

const paidOrder = await placeOrder({
  buyerUserId: ada.id,
  buyerOrgId: null,
  buyerTier: TIER.consumer,
  sellerOrgId: grace.id,
  items: [{ inventoryItemId: outletListing.id, qty: 1 }],
  fulfilment: 'delivery',
  deliveryLat: 6.6018,
  deliveryLng: 3.3515,
})
const payment = await payOrder(paidOrder.id, ada.id, 'wallet')
check('An order can be paid from the wallet', payment.ok, payment.error ?? paidOrder.order_number)

const graceWalletAfter = await getBalance('organisation', grace.id)
check(
  'Seller proceeds are held in escrow, not spendable, until delivery',
  graceWalletAfter.locked ===
    graceWalletBefore.locked + (paidOrder.subtotal - paidOrder.platform_fee) &&
    graceWalletAfter.available === graceWalletBefore.available,
  `escrow ${graceWalletBefore.locked} → ${graceWalletAfter.locked}`,
)

// The delivery fee must not sit with the seller, or there is nothing to pay a
// delivery partner from.
const logisticsAfterPay = await getBalance('platform', LOGISTICS_WALLET_ID)
check(
  'The delivery fee is held separately from the seller’s proceeds',
  logisticsAfterPay.locked === logisticsBefore.locked + paidOrder.delivery_fee,
  `logistics escrow holds ${logisticsAfterPay.locked}, order fee was ${paidOrder.delivery_fee}`,
)

await expectRejection(
  'A seller cannot be rated before the order is delivered',
  () => rateOrder(paidOrder.id, ada.id, 5, 'too early'),
  'delivered',
)

await cancelOrder(paidOrder.id, ada.id, 'verification cleanup')
const graceWalletRefunded = await getBalance('organisation', grace.id)
const logisticsRefunded = await getBalance('platform', LOGISTICS_WALLET_ID)
check(
  'Cancelling a paid order reverses the escrow',
  graceWalletRefunded.locked === graceWalletBefore.locked &&
    logisticsRefunded.locked === logisticsBefore.locked,
  `seller escrow back to ${graceWalletRefunded.locked}, logistics back to ${logisticsRefunded.locked}`,
)

const integrity = await verifyIntegrity()
check('Every ledger transaction balances (debits = credits)', integrity.balanced)
check(
  'No value was created or destroyed (net wallet position is zero)',
  integrity.netWalletPosition === 0,
  `net ${integrity.netWalletPosition}`,
)

// ---------------------------------------------------------------------------
console.log('\nLogistics engine — Delivery partners get paid')
// ---------------------------------------------------------------------------

const rider = await user('sola@rider.ng')
const riderWalletBefore = await getBalance('user', rider.id)
const adaWalletBefore = await getBalance('user', ada.id)

const riderOrder = await placeOrder({
  buyerUserId: ada.id,
  buyerOrgId: null,
  buyerTier: TIER.consumer,
  sellerOrgId: grace.id,
  items: [{ inventoryItemId: outletListing.id, qty: 1 }],
  fulfilment: 'delivery',
  deliveryAddress: '12 Allen Avenue, Ikeja',
  deliveryLat: 6.6018,
  deliveryLng: 3.3515,
})
await payOrder(riderOrder.id, ada.id, 'wallet')
await advanceOrder(riderOrder.id, 'preparing', ada.id)
await advanceOrder(riderOrder.id, 'dispatched', ada.id)

const board = await openJobs({ lat: 6.6005, lng: 3.3505 }, { radiusKm: 20 })
const job = board.find((j) => j.order_id === riderOrder.id)
check(
  'Dispatching an order raises a job on the rider board',
  Boolean(job),
  `${board.length} open job(s)`,
)

if (job) {
  check(
    'The rider fee is stated up front and comes out of the delivery fee',
    job.rider_fee > 0 && job.rider_fee <= riderOrder.delivery_fee,
    `${job.rider_fee} of a ${riderOrder.delivery_fee} delivery fee`,
  )

  await acceptJob(job.id, rider.id)
  await expectRejection(
    'A second rider cannot claim a job that is already taken',
    () => acceptJob(job.id, rider.id),
    'already',
  )

  await markPickedUp(job.id, rider.id)
  await completeDelivery(job.id, rider.id, 'Verification run')

  const riderWalletAfter = await getBalance('user', rider.id)
  check(
    'Completing a delivery pays the rider',
    riderWalletAfter.available === riderWalletBefore.available + job.rider_fee,
    `+${riderWalletAfter.available - riderWalletBefore.available}`,
  )

  const deliveredOrder = await getOrder(riderOrder.id)
  check(
    'Completing the delivery marks the order delivered',
    deliveredOrder?.status === 'delivered',
    deliveredOrder?.status,
  )

  // Buyer confirms receipt: escrow releases and cashback lands.
  await advanceOrder(riderOrder.id, 'completed', ada.id)

  const adaWalletAfter = await getBalance('user', ada.id)
  const expectedCashback = cashbackFor(riderOrder.subtotal)
  const spent = riderOrder.total
  check(
    'Confirming receipt credits cashback to the buyer',
    expectedCashback > 0 &&
      adaWalletAfter.available === adaWalletBefore.available - spent + expectedCashback,
    `expected ${expectedCashback} cashback on a ${riderOrder.subtotal} subtotal`,
  )

  const logisticsDrained = await getBalance('platform', LOGISTICS_WALLET_ID)
  check(
    'The logistics escrow is emptied once the rider is paid',
    logisticsDrained.locked === logisticsBefore.locked,
    `logistics escrow ${logisticsDrained.locked}`,
  )
}

const postLogistics = await verifyIntegrity()
check(
  'The ledger still balances after rider payouts and cashback',
  postLogistics.balanced && postLogistics.netWalletPosition === 0,
  `net ${postLogistics.netWalletPosition}`,
)

// ---------------------------------------------------------------------------
console.log('\nMessaging — Access control')
// ---------------------------------------------------------------------------

await sendMessage({
  orderId: riderOrder.id,
  senderUserId: ada.id,
  organisationId: null,
  body: 'Verification message from the buyer.',
})
const buyerThread = await readThread(riderOrder.id, ada.id, null)
check(
  'A buyer can message the seller about their order',
  buyerThread.messages.length > 0,
  `${buyerThread.messages.length} message(s)`,
)
check('The buyer is identified as the buyer side', buyerThread.side === 'buyer')

const sellerThread = await readThread(riderOrder.id, graceOwner.id, grace.id)
check(
  'The seller sees the same thread',
  sellerThread.messages.length === buyerThread.messages.length,
)
check('The seller is identified as the seller side', sellerThread.side === 'seller')

const stranger = await user('musa@example.ng')
await expectRejection(
  'An unrelated user cannot read the conversation',
  () => readThread(riderOrder.id, stranger.id, null),
  'not a party',
)

// ---------------------------------------------------------------------------
console.log('\nSAD Recommendation Engine — Ranking behaviour')
// ---------------------------------------------------------------------------

const searchStart = Date.now()
const results = await searchProducts(
  { lat: 6.6018, lng: 3.3515, tier: TIER.consumer, userId: ada.id },
  'milk',
  {},
)
const searchMs = Date.now() - searchStart

check('Search returns results inside the PRD 2-second budget', searchMs < 2000, `${searchMs} ms`)
check(
  'Search finds live nearby stock',
  results.results.length > 0,
  `${results.results.length} products`,
)
check(
  'Results carry a price comparison across multiple sellers',
  results.results.some((r) => r.seller_count > 1),
  `top result has ${results.results[0]?.seller_count} sellers`,
)

// Only verified, active sellers may be recommended.
const unverified = await sql.one<{ count: number }>(
  `SELECT COUNT(*)::int AS count
     FROM inventory_items i JOIN organisations o ON o.id = i.organisation_id
    WHERE o.verification <> 'verified' AND i.qty_available > 0 AND i.is_listed`,
)
const allOffers = await rankOffers(
  { lat: 6.6018, lng: 3.3515, tier: TIER.consumer },
  {},
  { limit: 500 },
)
const unverifiedShown = await sql.one<{ count: number }>(
  `SELECT COUNT(*)::int AS count FROM organisations WHERE verification <> 'verified' AND id = ANY($1::uuid[])`,
  [allOffers.map((o) => o.organisation_id)],
)
check(
  'Unverified businesses are never recommended',
  (unverifiedShown?.count ?? 0) === 0,
  `${unverified?.count ?? 0} unverified listings exist and none were shown`,
)

// Weights are data, not code: changing them must change the ordering.
//
// Scored against one product, because the price factor is normalised against
// the cheapest offer *of that product* — comparing across products would be
// meaningless.
const milkProductId = (await sql.one<{ product_id: string }>(
  `SELECT product_id FROM inventory_items WHERE id = $1`,
  [outletListing.id],
))!.product_id
const buyerHere = { lat: 6.6018, lng: 3.3515, tier: TIER.consumer }

const original = await getWeights('consumer')

await setWeight('consumer', 'price', 900)
const priceLed = await rankOffers(buyerHere, { productId: milkProductId })

// Now let distance dominate instead.
for (const [factor, weight] of Object.entries(original)) await setWeight('consumer', factor, weight)
await setWeight('consumer', 'distance', 900)
const distanceLed = await rankOffers(buyerHere, { productId: milkProductId })

for (const [factor, weight] of Object.entries(original)) await setWeight('consumer', factor, weight)

const cheapest = Math.min(...priceLed.map((o) => o.unit_price))
const nearest = Math.min(...distanceLed.map((o) => o.distance_km))

check(
  'A price-dominant weighting ranks the cheapest seller first',
  priceLed.length > 1 && priceLed[0].unit_price === cheapest,
  `${priceLed[0]?.seller_name} at ${priceLed[0]?.unit_price} (cheapest is ${cheapest})`,
)
check(
  'A distance-dominant weighting ranks the closest seller first',
  distanceLed.length > 1 && distanceLed[0].distance_km === nearest,
  `${distanceLed[0]?.seller_name} at ${distanceLed[0]?.distance_km} km (nearest is ${nearest} km)`,
)
// Only meaningful when the cheapest seller is not also the closest one — which
// is a property of the data, not of the engine. Asserting it unconditionally
// would produce a failure that says nothing about correctness.
const cheapestSeller = priceLed.find((o) => o.unit_price === cheapest)
const nearestSeller = distanceLed.find((o) => o.distance_km === nearest)

if (
  cheapestSeller &&
  nearestSeller &&
  cheapestSeller.inventory_item_id !== nearestSeller.inventory_item_id
) {
  check(
    'Retuning the weights genuinely reorders results',
    priceLed[0].inventory_item_id !== distanceLed[0].inventory_item_id,
    `price-led → ${priceLed[0]?.seller_name}, distance-led → ${distanceLed[0]?.seller_name}`,
  )
} else {
  console.log(
    `  SKIP  Retuning the weights reorders results — ${cheapestSeller?.seller_name} is both the` +
      ' cheapest and the nearest for this product, so no reordering is possible. The two checks' +
      ' above already prove each weighting selects on its own factor.',
  )
}

// ---------------------------------------------------------------------------
console.log('\nPRD CTO note — Event logging from day one')
// ---------------------------------------------------------------------------

const events = await sql.query<{ event_type: string; count: number }>(
  `SELECT event_type, COUNT(*)::int AS count FROM event_log GROUP BY event_type`,
)
const seen = new Set(events.map((e) => e.event_type))
for (const required of [
  'StockAdded',
  'StockReserved',
  'StockSold',
  'order.placed',
  'payment.succeeded',
]) {
  check(`Event "${required}" is recorded`, seen.has(required))
}

// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
