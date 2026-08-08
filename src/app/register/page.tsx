import { redirect } from 'next/navigation'
import { RegisterForm } from '@/components/auth/AuthForms'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { currentUser } from '@/lib/auth'
import { normaliseCode } from '@/modules/rewards/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Create an account' }

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; ref?: string }>
}) {
  const { next, ref } = await searchParams
  const user = await currentUser()
  if (user) redirect(next ?? '/')

  // `ref` arrives from a member's invitation link. It is only ever a prefill:
  // the code is validated on the server when the account is created.
  const referralCode = (normaliseCode(ref) ?? '').slice(0, 24)

  return (
    <AuthLayout
      title="Create your account"
      subtitle={
        referralCode
          ? 'You were invited to AfriMesh. Buy from trusted sellers nearby.'
          : 'Find what you need from trusted sellers nearby.'
      }
    >
      <RegisterForm next={next ?? '/'} referralCode={referralCode} />
    </AuthLayout>
  )
}
