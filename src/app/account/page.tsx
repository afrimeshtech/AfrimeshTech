import Link from 'next/link'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { Badge, Card, LinkButton, SectionHeading, Stat, Thumb } from '@/components/ui'
import { logoutAction } from '@/app/actions/session'
import { requireUser, currentOrganisation, ADMIN_ROLES } from '@/lib/auth'
import { formatMoney } from '@/lib/money'
import { getBalance } from '@/modules/wallet/service'
import { consumerKpis } from '@/modules/analytics/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Account' }

export default async function AccountPage() {
  const user = await requireUser('/account')
  const [org, wallet, kpis] = await Promise.all([
    currentOrganisation(),
    getBalance('user', user.id),
    consumerKpis(user.id),
  ])

  const links = [
    { href: '/orders', label: 'Orders', icon: 'box', hint: 'Track and review your purchases' },
    { href: '/wallet', label: 'Wallet', icon: 'wallet', hint: 'Balance, top-ups and statements' },
    {
      href: '/favourites',
      label: 'Saved',
      icon: 'star-filled',
      hint: 'Products and shops you keep coming back to',
    },
    {
      href: '/notifications',
      label: 'Notifications',
      icon: 'bell',
      hint: 'Order and account updates',
    },
  ]

  return (
    <ConsumerShell search={false}>
      <div className="space-y-7">
        <Card className="flex items-center gap-4">
          <Thumb alt={user.full_name} size="lg" rounded="rounded-full" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-ink">{user.full_name}</h1>
            <p className="truncate text-sm text-muted">
              {[user.phone, user.email].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge tone="neutral">{user.role.replace(/_/g, ' ')}</Badge>
              {user.phone_verified && <Badge tone="brand">Phone verified</Badge>}
              <Badge tone="sand">Trust score {Number(user.trust_score).toFixed(0)}</Badge>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Wallet" value={formatMoney(wallet.available)} />
          <Stat label="In escrow" value={formatMoney(wallet.locked)} />
          <Stat label="Orders" value={kpis.orders} />
          <Stat label="Saved items" value={kpis.saved_favourites} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              <Card className="flex items-center gap-3 card-interactive hover:card-interactive-hover">
                <span aria-hidden className="text-xl">
                  {link.icon}
                </span>
                <div>
                  <p className="font-medium text-ink">{link.label}</p>
                  <p className="text-xs text-muted">{link.hint}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        <section>
          <SectionHeading title="Business" />
          {org ? (
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-ink">{org.name}</p>
                <p className="text-xs text-muted">
                  {org.type.replace('_', ' ')} · {org.verification}
                </p>
              </div>
              <LinkButton href="/partner" variant="secondary">
                Open dashboard
              </LinkButton>
            </Card>
          ) : (
            <Card className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-ink">Sell on AfriMesh</p>
                <p className="text-xs text-muted">
                  Register a retail outlet, merchant business or dealer warehouse.
                </p>
              </div>
              <LinkButton href="/onboarding" variant="secondary">
                Register a business
              </LinkButton>
            </Card>
          )}
        </section>

        {ADMIN_ROLES.includes(user.role) && (
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-ink">Platform console</p>
              <p className="text-xs text-muted">
                Verification queue, moderation, fraud monitoring and system health.
              </p>
            </div>
            <LinkButton href="/admin" variant="secondary">
              Open console
            </LinkButton>
          </Card>
        )}

        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full rounded-brand border border-line bg-surface px-4 py-2.5 text-sm font-semibold text-coral-ink hover:bg-coral/15"
          >
            Sign out
          </button>
        </form>
      </div>
    </ConsumerShell>
  )
}
