import 'server-only'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import {
  resolveSession,
  revokeSession,
  SESSION_COOKIE_NAME,
  type User,
  type UserRole,
} from '@/modules/identity/service'
import { getSql } from '@/db/client'

/**
 * Session plumbing for the App Router, plus the RBAC guards every protected
 * route uses. Role checks live here so authorisation is stated once.
 */

export const SESSION_COOKIE = SESSION_COOKIE_NAME

/** Cached per-request so a page with ten server components hits the DB once. */
export const currentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies()
  return resolveSession(jar.get(SESSION_COOKIE)?.value)
})

export async function setSessionCookie(token: string) {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function clearSession() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  await revokeSession(token)
  jar.delete(SESSION_COOKIE)
}

/** Require any signed-in user. */
export async function requireUser(returnTo = '/'): Promise<User> {
  const user = await currentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`)
  return user
}

/** Require one of a set of roles (SAD RBAC). */
export async function requireRole(roles: UserRole[], returnTo = '/'): Promise<User> {
  const user = await requireUser(returnTo)
  if (!roles.includes(user.role)) redirect('/forbidden')
  return user
}

export const ADMIN_ROLES: UserRole[] = ['platform_admin', 'super_admin', 'auditor']

/**
 * The organisation a business user acts on behalf of. Every partner dashboard
 * resolves this first, then scopes all of its queries by the returned id -
 * that is what keeps one merchant from reading another merchant's inventory.
 */
export const currentOrganisation = cache(
  async (): Promise<{
    id: string
    name: string
    type: 'manufacturer' | 'warehouse' | 'merchant' | 'outlet' | 'logistics'
    tier_level: number
    verification: string
    status: string
    logo_url: string | null
    lat: number
    lng: number
    city: string | null
    state: string | null
    address: string | null
    delivery_radius_km: number
    rating: number
    rating_count: number
    fulfilment_rate: number
    avg_dispatch_minutes: number
  } | null> => {
    const user = await currentUser()
    if (!user) return null
    const sql = await getSql()
    return sql.one(
      `SELECT o.* FROM organisations o
        WHERE o.owner_user_id = $1
           OR o.id IN (SELECT organisation_id FROM organisation_members WHERE user_id = $1)
        ORDER BY o.created_at ASC
        LIMIT 1`,
      [user.id],
    )
  },
)

/** Require a verified organisation of one of the given types. */
export async function requireOrganisation(
  types: Array<'manufacturer' | 'warehouse' | 'merchant' | 'outlet' | 'logistics'>,
  returnTo = '/',
) {
  const user = await requireUser(returnTo)
  const org = await currentOrganisation()
  if (!org || !types.includes(org.type)) redirect('/onboarding')
  return { user, org }
}
