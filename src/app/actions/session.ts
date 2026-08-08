'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import {
  authenticateWithOtp,
  authenticateWithPassword,
  createSession,
  registerUser,
  requestOtp,
  AuthError,
  ValidationError,
} from '@/modules/identity/service'
import { attachReferral } from '@/modules/rewards/service'
import { clearSession, setSessionCookie } from '@/lib/auth'
import { LOCATION_COOKIE, encodeLocation, type BuyerLocation } from '@/lib/location'

import {
  parseForm,
  z,
  phone,
  email,
  internalPath,
  requiredText,
  latitude,
  longitude,
  referralCode,
} from '@/lib/forms'

export interface FormState {
  error?: string
  notice?: string
  devCode?: string
}

const passwordLoginSchema = z.object({
  identifier: requiredText('Your phone or email'),
  password: z.string().min(1, { message: 'Enter your password.' }),
  next: internalPath,
})

const otpRequestSchema = z.object({ phone })

const otpVerifySchema = z.object({
  phone,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { message: 'Enter the 6-digit code we sent you.' }),
  // Phone + OTP creates the account on first use, so it is a sign-up path as
  // much as a sign-in one and has to carry an invitation the same way.
  referralCode: referralCode,
  next: internalPath,
})

const registerSchema = z
  .object({
    fullName: requiredText('Your full name', 120),
    phone: phone.optional().or(z.literal('')),
    email: email.optional().or(z.literal('')),
    // Optional, because phone + OTP is a complete sign-in method on its own.
    password: z
      .string()
      .min(8, { message: 'Use at least 8 characters for your password.' })
      .max(200)
      .optional()
      .or(z.literal('')),
    // An invitation code from the rewards programme. Optional, and never
    // allowed to fail a registration - see below.
    referralCode: referralCode,
    next: internalPath,
  })
  .refine((value) => value.phone || value.email, {
    message: 'Enter a phone number or an email address.',
  })

const locationSchema = z.object({
  lat: latitude,
  lng: longitude,
  label: requiredText('Location name', 120).catch('Current location'),
  source: z.enum(['gps', 'saved', 'chosen', 'default']).catch('chosen'),
})

/**
 * Credit whoever invited a brand-new account.
 *
 * Best-effort by design, and its outcome is never reported back: a mistyped or
 * withdrawn invitation must not cost someone their account, and telling a
 * stranger whether a given code is real would turn the sign-up form into an
 * oracle for enumerating other people's codes.
 */
async function creditInviter(userId: string, code: string | undefined) {
  if (!code) return
  try {
    await attachReferral({ referredUserId: userId, code })
  } catch (err) {
    console.error('[rewards] could not attach referral', err)
  }
}

async function sessionMeta() {
  const h = await headers()
  return {
    userAgent: h.get('user-agent') ?? undefined,
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
  }
}

export async function loginWithPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseForm(passwordLoginSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  try {
    const user = await authenticateWithPassword(parsed.data.identifier, parsed.data.password)
    const token = await createSession(user.id, await sessionMeta())
    await setSessionCookie(token)
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message }
    console.error('[auth] login failed', err)
    return { error: 'We could not sign you in. Please try again.' }
  }
  // `next` is validated to be a relative path, so this cannot be turned into
  // an open redirect by crafting ?next=https://…
  redirect(parsed.data.next)
}

export async function requestOtpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(otpRequestSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  try {
    const result = await requestOtp(parsed.data.phone, 'login')
    return {
      notice: `We sent a 6-digit code to ${parsed.data.phone}.`,
      devCode: result.devCode,
    }
  } catch (err) {
    console.error('[auth] otp request failed', err)
    return { error: 'We could not send that code. Please try again.' }
  }
}

export async function verifyOtpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(otpVerifySchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  try {
    const { user, created } = await authenticateWithOtp(parsed.data.phone, parsed.data.code)

    // Only on the sign-in that created the account. A returning member was
    // already part of the network, so nobody introduced them.
    if (created) await creditInviter(user.id, parsed.data.referralCode)

    const token = await createSession(user.id, await sessionMeta())
    await setSessionCookie(token)
  } catch (err) {
    if (err instanceof AuthError) return { error: err.message }
    console.error('[auth] otp verify failed', err)
    return { error: 'We could not verify that code.' }
  }
  redirect(parsed.data.next)
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(registerSchema, formData)
  if (!parsed.ok) return { error: parsed.error }

  try {
    const user = await registerUser({
      fullName: parsed.data.fullName,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      password: parsed.data.password || null,
    })

    await creditInviter(user.id, parsed.data.referralCode)

    const token = await createSession(user.id, await sessionMeta())
    await setSessionCookie(token)
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message }
    console.error('[auth] registration failed', err)
    return { error: 'We could not create that account.' }
  }
  redirect(parsed.data.next)
}

export async function logoutAction() {
  await clearSession()
  redirect('/')
}

// ---------------------------------------------------------------------------

export async function setLocationAction(formData: FormData) {
  const parsed = parseForm(locationSchema, formData)
  // A bad coordinate silently keeps the previous location rather than moving
  // the shopper somewhere they did not choose.
  if (!parsed.ok) return

  const jar = await cookies()
  jar.set(
    LOCATION_COOKIE,
    encodeLocation({
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      label: parsed.data.label,
      source: parsed.data.source as BuyerLocation['source'],
    }),
    {
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 90,
    },
  )
  revalidatePath('/', 'layout')
}
