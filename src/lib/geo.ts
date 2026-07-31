/**
 * Proximity primitives. "Every unnecessary kilometre adds cost" (BRS, Core
 * Philosophy) - distance is a first-class input to every ranking decision.
 */

export const EARTH_RADIUS_KM = 6371

export interface LatLng {
  lat: number
  lng: number
}

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/**
 * The same formula as a PostgreSQL expression, so ranking happens in the
 * database rather than by loading every row into the application.
 *
 * `$lat`/`$lng` are the placeholder names for the buyer's position; `table`
 * supplies the seller's lat/lng columns.
 *
 * PostGIS would be the production choice at scale (SAD scalability targets);
 * this keeps the MVP dependency-free while producing identical results.
 */
export function distanceKmSql(table: string, latParam: string, lngParam: string): string {
  return distanceKmSqlOn(`${table}.lat`, `${table}.lng`, latParam, lngParam)
}

/**
 * The same formula against arbitrary column expressions, for tables whose
 * coordinates are not called `lat`/`lng` - a delivery's pickup point, for
 * instance.
 */
export function distanceKmSqlOn(
  latExpr: string,
  lngExpr: string,
  latParam: string,
  lngParam: string,
): string {
  return `(
    ${EARTH_RADIUS_KM} * 2 * asin(sqrt(
      power(sin(radians(${latExpr} - ${latParam}) / 2), 2) +
      cos(radians(${latParam})) * cos(radians(${latExpr})) *
      power(sin(radians(${lngExpr} - ${lngParam}) / 2), 2)
    ))
  )`
}

/**
 * Rough delivery-time estimate. Urban African road speeds vary widely, so this
 * is deliberately conservative: a fixed dispatch overhead plus travel time.
 * Replaced by the logistics engine's route optimisation in Phase 2.
 */
export function estimateEtaMinutes(distanceKm: number, dispatchMinutes = 45): number {
  const averageSpeedKmh = 18 // dense urban traffic
  return Math.round(dispatchMinutes + (distanceKm / averageSpeedKmh) * 60)
}

export function formatDistance(km: number | null | undefined): string {
  if (km === null || km === undefined) return '—'
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}

export function formatEta(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
