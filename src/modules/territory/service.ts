import { getSql } from '@/db/client'
import { cellDegrees, distanceKmSqlOn, haversineKm, type LatLng } from '@/lib/geo'
import { describeArea } from '@/lib/areas'
import { TIER } from '@/lib/tiers'

/**
 * MODULE: territory
 *
 * Where the demand actually is.
 *
 * "Every unnecessary kilometre adds cost" (BRS, Core Philosophy). The
 * recommendation engine already applies that to a single purchase; this module
 * applies it to the decisions made *between* purchases - which neighbourhoods
 * to stock for, where to open, where to ride. Each tier sees the tier it
 * sells to:
 *
 *   retail outlet   -> where consumers are buying
 *   merchant        -> where retail outlets are buying
 *   dealer warehouse-> where merchants are buying
 *   delivery partner-> all three, plus where the work lands
 *   platform admin   -> all of the above, and where riders are working
 *
 * Two design decisions worth stating:
 *
 * 1. Activity is aggregated into square grid cells, never reported per
 *    address. A neighbourhood is the unit a shopkeeper can act on, and one
 *    buyer's doorstep is nobody else's business. Cells below a minimum number
 *    of distinct actors are withheld entirely, so a quiet area cannot be
 *    narrowed down to the single household that ordered from it.
 *
 * 2. A cell counts *paid* orders. An abandoned basket is not demand a business
 *    can stock against.
 */

export type Audience = 'consumer' | 'outlet' | 'merchant' | 'warehouse' | 'rider'

export interface TerritoryCell {
  /** Cell centre. */
  lat: number
  lng: number
  /** Human place name, resolved from the known-areas table. */
  label: string
  /** From the viewer's own position, when they have one. */
  distance_km: number | null
  /** Distinct buyers (or riders) active in the cell. */
  actors: number
  orders: number
  value: number
  /** Of those orders, how many the viewer served themselves. */
  own_orders: number
  last_active_at: Date
  /** Share of the busiest cell in this result, 0-1. Drives the heat scale. */
  intensity: number
}

export interface ActivityQuery {
  audience: Audience
  /** The viewer's position - orders are ranked by distance from it. */
  origin?: LatLng | null
  radiusKm?: number | null
  /** Grid resolution. Defaults to something sensible for the audience. */
  cellKm?: number
  days?: number
  /** Marks the share of each cell's orders this business served. */
  ownOrgId?: string | null
  /** Cells with fewer distinct actors than this are withheld. */
  minActors?: number
  limit?: number
}

/**
 * How many distinct buyers a cell needs before it can be named.
 *
 * A policy decision, not an engineering one, so it lives in the environment.
 *
 * The default is 1 for the pilot: at current density a floor of 2 withholds
 * every area and the maps come up empty, which makes the feature useless to
 * the shopkeepers it exists for. The cost is real though - at 1, a quiet
 * neighbourhood with a single active buyer is named, and in a thin market
 * that is close to naming the buyer. Raise this to 2 or more once a market
 * has the density to carry it.
 *
 * Never below 1, so no configuration can turn this into an address book.
 */
export const MIN_ACTORS_PER_CELL = Math.max(
  1,
  Math.round(Number(process.env.TERRITORY_MIN_ACTORS ?? 1)),
)

/**
 * Grid resolution per audience. A neighbourhood shop reasons in streets, a
 * dealer warehouse in cities, and using one resolution for both would make the
 * map either unreadable or useless.
 */
const DEFAULT_CELL_KM: Record<Audience, number> = {
  consumer: 2,
  outlet: 5,
  merchant: 20,
  warehouse: 50,
  rider: 2,
}

/** The tier of buyer whose activity each audience is watching. */
const BUYER_TIER: Record<Exclude<Audience, 'rider'>, number> = {
  consumer: TIER.consumer,
  outlet: TIER.outlet,
  merchant: TIER.merchant,
  warehouse: TIER.warehouse,
}

interface CellRow {
  lat: number
  lng: number
  actors: number
  orders: number
  value: number
  own_orders: number
  last_active_at: Date
}

export async function activeLocations(input: ActivityQuery): Promise<TerritoryCell[]> {
  const sql = await getSql()

  const cellKm = input.cellKm ?? DEFAULT_CELL_KM[input.audience]
  const cell = cellDegrees(cellKm)
  const days = input.days ?? 90
  const limit = input.limit ?? 8
  const minActors = input.minActors ?? MIN_ACTORS_PER_CELL
  const origin = input.origin ?? null

  // $1 days · $2 cell size (degrees) · $3 limit · $4 lat · $5 lng
  // $6 radius km · $7 own organisation · $8 minimum distinct actors
  const params: unknown[] = [
    String(days),
    cell,
    limit,
    origin?.lat ?? null,
    origin?.lng ?? null,
    input.radiusKm ?? null,
    input.ownOrgId ?? null,
    minActors,
  ]

  const source =
    input.audience === 'rider' ? riderPoints() : buyerPoints(BUYER_TIER[input.audience], params)

  const distance = distanceKmSqlOn('p.lat', 'p.lng', '$4', '$5')

  const rows = await sql.query<CellRow>(
    `WITH points AS (${source})
     SELECT
       ((floor(p.lat / $2) + 0.5) * $2)::double precision AS lat,
       ((floor(p.lng / $2) + 0.5) * $2)::double precision AS lng,
       COUNT(DISTINCT p.actor_id)::int                    AS actors,
       COUNT(*)::int                                      AS orders,
       COALESCE(SUM(p.value), 0)::bigint                  AS value,
       COUNT(*) FILTER (WHERE p.seller_org_id = $7::uuid)::int AS own_orders,
       MAX(p.occurred_at)                                 AS last_active_at
       FROM points p
      WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
        AND (
          $4::double precision IS NULL
          OR $6::double precision IS NULL
          OR ${distance} <= $6::double precision
        )
      GROUP BY floor(p.lat / $2), floor(p.lng / $2)
     HAVING COUNT(DISTINCT p.actor_id) >= $8::int
      ORDER BY actors DESC, orders DESC, value DESC
      LIMIT $3`,
    params,
  )

  const busiest = Math.max(...rows.map((row) => row.actors), 1)

  return rows.map((row) => ({
    ...row,
    label: describeArea({ lat: row.lat, lng: row.lng }),
    distance_km: origin ? haversineKm(origin, { lat: row.lat, lng: row.lng }) : null,
    intensity: row.actors / busiest,
  }))
}

/**
 * Where a tier of buyer is trading.
 *
 * The position is the delivery point, falling back to the buying business's
 * own address and then to the buyer's saved address - a collection order has
 * no delivery coordinates, but the shop that placed it is exactly where the
 * demand is.
 */
function buyerPoints(tier: number, params: unknown[]): string {
  params.push(tier)
  const tierParam = `$${params.length}`
  return `
    SELECT o.buyer_user_id                                   AS actor_id,
           o.seller_org_id                                   AS seller_org_id,
           o.total                                           AS value,
           o.placed_at                                       AS occurred_at,
           COALESCE(o.delivery_lat, bo.lat, u.default_lat)   AS lat,
           COALESCE(o.delivery_lng, bo.lng, u.default_lng)   AS lng
      FROM orders o
      JOIN users u ON u.id = o.buyer_user_id
      LEFT JOIN organisations bo ON bo.id = o.buyer_org_id
     WHERE o.buyer_tier = ${tierParam}::int
       AND o.payment_status = 'succeeded'
       AND o.placed_at > now() - ($1 || ' days')::interval`
}

/** Where delivery partners are actually completing work. */
function riderPoints(): string {
  return `
    SELECT d.rider_user_id                                   AS actor_id,
           o.seller_org_id                                   AS seller_org_id,
           d.rider_fee                                       AS value,
           d.delivered_at                                    AS occurred_at,
           COALESCE(d.dropoff_lat, o.delivery_lat)           AS lat,
           COALESCE(d.dropoff_lng, o.delivery_lng)           AS lng
      FROM deliveries d
      JOIN orders o ON o.id = d.order_id
     WHERE d.status = 'delivered'
       AND d.rider_user_id IS NOT NULL
       AND d.delivered_at > now() - ($1 || ' days')::interval`
}

// ---------------------------------------------------------------------------
// Headline figures
// ---------------------------------------------------------------------------

export interface TerritorySummary {
  /**
   * Distinct actors per cell, summed. Someone who buys in two neighbourhoods
   * counts in both - which is the honest reading of "active here", and the
   * reason this is not called a unique-buyer count.
   */
  actors: number
  orders: number
  value: number
  /** Of those orders, how many the viewer served themselves. */
  own_orders: number
  /** How many grid cells carried any activity at all. */
  areas: number
}

export async function territorySummary(
  input: Omit<ActivityQuery, 'limit' | 'minActors'>,
): Promise<TerritorySummary> {
  // The floor that protects individuals is a display rule, not an accounting
  // one: the totals cover the whole territory, they just cannot be broken back
  // down to a quiet cell.
  const cells = await activeLocations({ ...input, limit: 1000, minActors: 1 })
  return {
    actors: cells.reduce((sum, cell) => sum + cell.actors, 0),
    orders: cells.reduce((sum, cell) => sum + cell.orders, 0),
    value: cells.reduce((sum, cell) => sum + Number(cell.value), 0),
    own_orders: cells.reduce((sum, cell) => sum + cell.own_orders, 0),
    areas: cells.length,
  }
}

// ---------------------------------------------------------------------------
// The network map
//
// Aggregated cells answer "where is demand?". A delivery partner has a
// different question - "what is physically around me, and where do I go?" -
// and that one needs actual places, not neighbourhoods: the shop to collect
// from, the warehouse on the far side of town, the address waiting for a drop.
// ---------------------------------------------------------------------------

export type PinKind =
  'outlet' | 'merchant' | 'warehouse' | 'manufacturer' | 'dropoff' | 'active_dropoff'

export interface MapPin {
  id: string
  kind: PinKind
  label: string
  detail: string | null
  lat: number
  lng: number
  distance_km: number
  /** Rider fee for a delivery point; null for a business. */
  value: number | null
}

export interface NetworkMapData {
  places: MapPin[]
  deliveries: MapPin[]
  counts: Record<string, number>
}

/**
 * Everything physical within reach: verified businesses of every tier, plus
 * the delivery points that currently need someone to ride to them.
 *
 * Verified only, matching discovery - a rider should never be sent to a
 * business the platform would not recommend to a buyer.
 */
export async function networkMap(
  origin: LatLng,
  opts: { radiusKm?: number; riderUserId?: string | null; limit?: number } = {},
): Promise<NetworkMapData> {
  const sql = await getSql()
  const radiusKm = opts.radiusKm ?? 25
  const limit = opts.limit ?? 60
  const distance = distanceKmSqlOn('o.lat', 'o.lng', '$1', '$2')

  const places = await sql.query<MapPin>(
    `SELECT o.id,
            o.type::text                       AS kind,
            o.name                             AS label,
            COALESCE(o.address, o.city)        AS detail,
            o.lat, o.lng,
            ROUND(${distance}::numeric, 2)     AS distance_km,
            NULL::bigint                       AS value
       FROM organisations o
      WHERE o.verification = 'verified'
        AND o.status = 'active'
        AND o.type <> 'logistics'
        AND ${distance} <= $3
      ORDER BY distance_km
      LIMIT $4`,
    [origin.lat, origin.lng, radiusKm, limit],
  )

  // Open jobs anyone can take, plus whatever this rider is already carrying -
  // both are places they may need to be, and leaving their own run off the map
  // would be the one omission that actually matters mid-shift.
  const dropDistance = distanceKmSqlOn(
    'COALESCE(d.dropoff_lat, o.delivery_lat)',
    'COALESCE(d.dropoff_lng, o.delivery_lng)',
    '$1',
    '$2',
  )

  const deliveries = await sql.query<MapPin>(
    `SELECT d.id,
            CASE WHEN d.rider_user_id = $5::uuid THEN 'active_dropoff' ELSE 'dropoff' END AS kind,
            o.order_number                                       AS label,
            COALESCE(o.delivery_address, s.city)                 AS detail,
            COALESCE(d.dropoff_lat, o.delivery_lat)              AS lat,
            COALESCE(d.dropoff_lng, o.delivery_lng)              AS lng,
            ROUND(${dropDistance}::numeric, 2)                   AS distance_km,
            d.rider_fee                                          AS value
       FROM deliveries d
       JOIN orders o        ON o.id = d.order_id
       JOIN organisations s ON s.id = o.seller_org_id
      WHERE COALESCE(d.dropoff_lat, o.delivery_lat) IS NOT NULL
        AND (
          d.status = 'unassigned'
          OR (d.rider_user_id = $5::uuid AND d.status IN ('assigned', 'picked_up', 'in_transit'))
        )
        AND ${dropDistance} <= $3
      ORDER BY distance_km
      LIMIT $4`,
    [origin.lat, origin.lng, radiusKm, limit, opts.riderUserId ?? null],
  )

  const counts: Record<string, number> = {}
  for (const pin of [...places, ...deliveries]) {
    counts[pin.kind] = (counts[pin.kind] ?? 0) + 1
  }

  return { places, deliveries, counts }
}

export const PIN_LABEL: Record<PinKind, string> = {
  outlet: 'Retail outlets',
  merchant: 'Merchants',
  warehouse: 'Dealer warehouses',
  manufacturer: 'Manufacturers',
  dropoff: 'Delivery points open',
  active_dropoff: 'Your active drops',
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const AUDIENCE_LABEL: Record<Audience, string> = {
  consumer: 'Shoppers',
  outlet: 'Retail outlets',
  merchant: 'Merchants',
  warehouse: 'Dealer warehouses',
  rider: 'Delivery partners',
}

export const AUDIENCE_NOUN: Record<Audience, string> = {
  consumer: 'shoppers',
  outlet: 'outlets',
  merchant: 'merchants',
  warehouse: 'warehouses',
  rider: 'riders',
}

/**
 * The tier a business sells to - the one whose demand it should be reading.
 * A retail outlet watches consumers, a merchant watches outlets, and so on
 * down the chain the platform already encodes in `lib/tiers`.
 */
export function audienceForSeller(orgType: string): Audience | null {
  switch (orgType) {
    case 'outlet':
      return 'consumer'
    case 'merchant':
      return 'outlet'
    case 'warehouse':
      return 'merchant'
    case 'manufacturer':
      return 'warehouse'
    default:
      return null
  }
}
