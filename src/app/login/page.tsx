import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/auth/AuthForms'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { currentUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const user = await currentUser()
  if (user) redirect(next ?? '/')

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to shop, sell and track your orders."
      footnote="Sessions are opaque tokens stored hashed, so a database dump cannot be replayed into a live session and revocation is immediate."
    >
      <LoginForm next={next ?? '/'} />
      <p className="mt-4 text-center text-sm text-muted">
        New to AfriMesh?{' '}
        <Link
          href={`/register?next=${encodeURIComponent(next ?? '/')}`}
          className="font-medium text-accent-500 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </AuthLayout>
  )
}
