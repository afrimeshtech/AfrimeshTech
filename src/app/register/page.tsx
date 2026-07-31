import { redirect } from 'next/navigation'
import { RegisterForm } from '@/components/auth/AuthForms'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { currentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Create an account' }

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const user = await currentUser()
  if (user) redirect(next ?? '/')

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Find what you need from trusted sellers nearby."
    >
      <RegisterForm next={next ?? '/'} />
    </AuthLayout>
  )
}
