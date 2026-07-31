import Link from 'next/link'
import { Wordmark } from '@/components/brand/Logo'
import { Card } from '@/components/ui'

export function AuthLayout({
  title,
  subtitle,
  children,
  footnote,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footnote?: string
}) {
  return (
    <div className="bg-bar flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6">
        <Wordmark size="md" orientation="stacked" priority />
      </Link>
      <Card className="w-full max-w-sm">
        <h1 className="text-xl">{title}</h1>
        <p className="mb-4 mt-1 text-sm text-muted">{subtitle}</p>
        {children}
      </Card>
      {footnote && (
        <p className="mt-6 max-w-sm text-center font-technical text-xs text-white/60">{footnote}</p>
      )}
    </div>
  )
}
