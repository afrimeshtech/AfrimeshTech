'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import {
  loginWithPasswordAction,
  registerAction,
  requestOtpAction,
  verifyOtpAction,
  type FormState,
} from '@/app/actions/session'
import { Alert, Field, inputClass } from '@/components/ui'

/**
 * Sign-in supports both methods the SAD lists for launch: email/password and
 * phone + OTP. Phone-first is deliberate - it is the identifier most Nigerian
 * shoppers and shopkeepers actually have and remember.
 */
export function LoginForm({ next = '/' }: { next?: string }) {
  const [tab, setTab] = useState<'otp' | 'password'>('otp')

  return (
    <div>
      <div role="tablist" className="mb-4 flex rounded-brand bg-surface-muted p-1">
        {(
          [
            { key: 'otp', label: 'Phone + code' },
            { key: 'password', label: 'Password' },
          ] as const
        ).map((option) => (
          <button
            key={option.key}
            role="tab"
            aria-selected={tab === option.key}
            onClick={() => setTab(option.key)}
            className={`flex-1 rounded-[0.6rem] px-3 py-2 text-sm font-medium transition-colors ${
              tab === option.key ? 'bg-surface text-ink shadow-sm' : 'text-muted'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === 'otp' ? <OtpLogin next={next} /> : <PasswordLogin next={next} />}
    </div>
  )
}

function PasswordLogin({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    loginWithPasswordAction,
    {},
  )
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Phone or email" htmlFor="identifier">
        <input
          id="identifier"
          name="identifier"
          autoComplete="username"
          className={inputClass}
          placeholder="08030000001 or you@example.ng"
          required
        />
      </Field>
      <Field label="Password" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className={inputClass}
          required
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

function OtpLogin({ next }: { next: string }) {
  const [requestState, requestFormAction, requesting] = useActionState<FormState, FormData>(
    requestOtpAction,
    {},
  )
  const [verifyState, verifyFormAction, verifying] = useActionState<FormState, FormData>(
    verifyOtpAction,
    {},
  )
  const [phone, setPhone] = useState('')

  const codeSent = Boolean(requestState.notice)

  return (
    <div className="space-y-3">
      {requestState.error && <Alert tone="danger">{requestState.error}</Alert>}
      {verifyState.error && <Alert tone="danger">{verifyState.error}</Alert>}

      {!codeSent ? (
        <form action={requestFormAction} className="space-y-3">
          <Field label="Phone number" hint="We will text you a 6-digit code." htmlFor="phone">
            <input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
              placeholder="08030000001"
              required
            />
          </Field>
          <button
            type="submit"
            disabled={requesting}
            className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
          >
            {requesting ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form action={verifyFormAction} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="phone" value={phone} />
          <Alert tone="success">{requestState.notice}</Alert>
          {requestState.devCode && (
            <Alert tone="info">
              Development mode — no SMS provider is configured, so your code is{' '}
              <strong className="font-technical">{requestState.devCode}</strong>
            </Alert>
          )}
          <Field label="6-digit code" htmlFor="code">
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className={`${inputClass} text-center font-technical text-lg tracking-[0.4em]`}
              required
            />
          </Field>
          <button
            type="submit"
            disabled={verifying}
            className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
          >
            {verifying ? 'Verifying…' : 'Verify and continue'}
          </button>
        </form>
      )}
    </div>
  )
}

export function RegisterForm({ next = '/' }: { next?: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(registerAction, {})

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Full name" htmlFor="fullName">
        <input id="fullName" name="fullName" className={inputClass} autoComplete="name" required />
      </Field>
      <Field label="Phone number" htmlFor="reg-phone">
        <input
          id="reg-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          className={inputClass}
          placeholder="08030000001"
        />
      </Field>
      <Field label="Email address" hint="Optional if you gave a phone number." htmlFor="reg-email">
        <input
          id="reg-email"
          name="email"
          type="email"
          autoComplete="email"
          className={inputClass}
        />
      </Field>
      <Field label="Password" hint="At least 8 characters." htmlFor="reg-password">
        <input
          id="reg-password"
          name="password"
          type="password"
          autoComplete="new-password"
          className={inputClass}
          minLength={8}
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-brand bg-accent-500 px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? 'Creating your account…' : 'Create account'}
      </button>

      <p className="text-center text-sm text-muted">
        Already registered?{' '}
        <Link href="/login" className="font-medium text-accent-500 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
