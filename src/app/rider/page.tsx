import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Wordmark } from '@/components/brand/Logo'
import { AcceptJobButton, CompleteDeliveryForm, PickUpButton } from '@/components/rider/JobActions'
import { Badge, Card, EmptyState, SectionHeading, Stat } from '@/components/ui'
import { logoutAction } from '@/app/actions/session'
import { requireUser } from '@/lib/auth'
import { buyerLocation } from '@/lib/location'
import { formatMoney } from '@/lib/money'
import { formatDistance, formatEta } from '@/lib/geo'
import { openJobs, riderJobs, riderStats, type DeliveryJob } from '@/modules/logistics/service'
import { getBalance } from '@/modules/wallet/service'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Deliveries' }

/**
 * The delivery partner's screen.
 *
 * From the Project Nexus infographic, delivery partners "receive delivery
 * requests, optimised routes, real-time tracking, earn more" — so the board
 * leads with work that starts closest to where the rider already is, and the
 * fee is stated up front rather than discovered after accepting.
 */
export default async function RiderPage({
  searchParams,
}: {
  searchParams: Promise<{ radius?: string }>
}) {
  const params = await searchParams
  const user = await requireUser('/rider')
  if (user.role !== 'delivery_partner') redirect('/forbidden')

  const location = await buyerLocation()
  const radius = Number(params.radius ?? 20)

  const [open, active, history, stats, wallet] = await Promise.all([
    openJobs({ lat: location.lat, lng: location.lng }, { radiusKm: radius }),
    riderJobs(user.id, { active: true }),
    riderJobs(user.id, { limit: 10 }),
    riderStats(user.id),
    getBalance('user', user.id),
  ])

  const completed = history.filter((j) => j.status === 'delivered')

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-bar">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/rider">
            <Wordmark size="sm" priority />
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-right">
              <span className="block text-sm font-semibold text-white">{user.full_name}</span>
              <span className="block text-xs text-white/70">
                Delivery partner · {location.label}
              </span>
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-brand px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/10"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Wallet" value={formatMoney(wallet.available)} />
          <Stat label="Earned (30 days)" value={formatMoney(stats.earned_30d)} />
          <Stat label="Deliveries done" value={stats.completed} />
          <Stat
            label="Distance covered"
            value={`${Number(stats.distance_km).toFixed(1)} km`}
            hint={`${stats.active} in progress`}
          />
        </div>

        {active.length > 0 && (
          <section>
            <SectionHeading title="In progress" subtitle="Finish these before taking new work" />
            <div className="space-y-3">
              {active.map((job) => (
                <JobCard key={job.id} job={job} mode="active" />
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeading
            title="Available deliveries"
            subtitle={`Unclaimed jobs within ${radius} km of you, nearest pickup first`}
            action={
              <div className="flex gap-1.5">
                {[5, 20, 50].map((km) => (
                  <Link
                    key={km}
                    href={`/rider?radius=${km}`}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      radius === km
                        ? 'bg-accent-500 text-accent-ink'
                        : 'border border-line bg-surface text-muted'
                    }`}
                  >
                    {km} km
                  </Link>
                ))}
              </div>
            }
          />
          {open.length ? (
            <div className="space-y-3">
              {open.map((job) => (
                <JobCard key={job.id} job={job} mode="open" />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="scooter"
              title="No deliveries waiting nearby"
              body="Sellers raise a job the moment they dispatch an order. Widen your radius or check back shortly."
            />
          )}
        </section>

        {completed.length > 0 && (
          <section>
            <SectionHeading title="Recently completed" />
            <Card className="p-0">
              <ul>
                {completed.map((job) => (
                  <li
                    key={job.id}
                    className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3 last:border-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        {job.seller_name} → {job.buyer_name}
                      </span>
                      <span className="block font-technical text-xs text-muted">
                        {job.order_number} · {formatDistance(Number(job.distance_km))}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-accent-500">
                      +{formatMoney(job.rider_fee)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}
      </main>
    </div>
  )
}

function JobCard({ job, mode }: { job: DeliveryJob; mode: 'open' | 'active' }) {
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-technical text-xs text-muted">{job.order_number}</span>
            {mode === 'active' && (
              <Badge tone={job.status === 'assigned' ? 'warning' : 'brand'}>
                {job.status === 'assigned' ? 'Collect from seller' : 'Out for delivery'}
              </Badge>
            )}
            {mode === 'open' && (
              <Badge tone="neutral">{formatDistance(job.pickup_distance_km)} to pickup</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-ink">
            {job.item_count} item{job.item_count === 1 ? '' : 's'} ·{' '}
            {formatDistance(Number(job.distance_km))} trip · {formatEta(job.eta_minutes)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-accent-500">{formatMoney(job.rider_fee)}</p>
          <p className="text-xs text-muted">you earn</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Leg
          label="Pick up"
          name={job.seller_name}
          detail={job.seller_address}
          phone={mode === 'active' ? job.seller_phone : null}
        />
        <Leg
          label="Drop off"
          name={mode === 'active' ? job.buyer_name : 'Customer'}
          detail={mode === 'active' ? job.delivery_address : 'Address shown once you accept'}
          phone={mode === 'active' ? job.buyer_phone : null}
        />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line-soft pt-3">
        {mode === 'open' && <AcceptJobButton deliveryId={job.id} />}
        {mode === 'active' && job.status === 'assigned' && <PickUpButton deliveryId={job.id} />}
        {mode === 'active' && ['picked_up', 'in_transit'].includes(job.status) && (
          <CompleteDeliveryForm deliveryId={job.id} />
        )}
      </div>
    </Card>
  )
}

function Leg({
  label,
  name,
  detail,
  phone,
}: {
  label: string
  name: string
  detail: string | null
  phone: string | null
}) {
  return (
    <div className="rounded-brand bg-surface p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 truncate font-medium text-ink">{name}</p>
      <p className="truncate text-xs text-muted">{detail ?? '—'}</p>
      {phone && (
        <a href={`tel:${phone}`} className="mt-1 inline-block text-xs font-medium text-accent-500">
          Call {phone}
        </a>
      )}
    </div>
  )
}
