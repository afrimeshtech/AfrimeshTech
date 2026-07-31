import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { currentUser } from '@/lib/auth'

/**
 * Where the buyer is standing. Everything the platform recommends is relative
 * to this point, so it is resolved once per request and passed down.
 *
 * Resolution order:
 *   1. the location cookie, set by the browser's Geolocation API or by the
 *      user picking a place;
 *   2. the address saved on their account;
 *   3. a sensible default so a first-time, not-signed-in visitor still sees a
 *      working marketplace rather than an empty page.
 *
 * "Offline Resilience" (PRD Core Principles): a denied or unavailable GPS fix
 * degrades to a chosen area instead of breaking discovery.
 */

export const LOCATION_COOKIE = 'afrimesh_loc'

export interface BuyerLocation {
  lat: number
  lng: number
  label: string
  source: 'gps' | 'saved' | 'chosen' | 'default'
}

/** Launch market. The BRS short-term objective is one metropolitan area. */
export const DEFAULT_LOCATION: BuyerLocation = {
  lat: 6.6018,
  lng: 3.3515,
  label: 'Ikeja, Lagos',
  source: 'default',
}

/** Areas offered in the location picker for the pilot city and beyond. */
export const KNOWN_AREAS: { label: string; lat: number; lng: number }[] = [
  { label: 'Ikeja, Lagos', lat: 6.6018, lng: 3.3515 },
  { label: 'Yaba, Lagos', lat: 6.5095, lng: 3.3711 },
  { label: 'Surulere, Lagos', lat: 6.4969, lng: 3.3481 },
  { label: 'Lekki, Lagos', lat: 6.4478, lng: 3.4723 },
  { label: 'Apapa, Lagos', lat: 6.4491, lng: 3.3592 },
  { label: 'Wuse, Abuja', lat: 9.0765, lng: 7.4586 },
  { label: 'Sabon Gari, Kano', lat: 12.0022, lng: 8.5236 },
  { label: 'Port Harcourt', lat: 4.8156, lng: 7.0498 },
]

export const buyerLocation = cache(async (): Promise<BuyerLocation> => {
  const jar = await cookies()
  const raw = jar.get(LOCATION_COOKIE)?.value

  if (raw) {
    const [lat, lng, source, ...label] = raw.split('|')
    const parsedLat = Number(lat)
    const parsedLng = Number(lng)
    if (Number.isFinite(parsedLat) && Number.isFinite(parsedLng)) {
      return {
        lat: parsedLat,
        lng: parsedLng,
        label: label.join('|') || 'Current location',
        source: (source as BuyerLocation['source']) ?? 'chosen',
      }
    }
  }

  const user = await currentUser()
  if (user?.default_lat != null && user?.default_lng != null) {
    return {
      lat: user.default_lat,
      lng: user.default_lng,
      label:
        user.default_address ||
        [user.city, user.state].filter(Boolean).join(', ') ||
        'Saved address',
      source: 'saved',
    }
  }

  return DEFAULT_LOCATION
})

export function encodeLocation(loc: BuyerLocation): string {
  return `${loc.lat}|${loc.lng}|${loc.source}|${loc.label}`
}
