import Link from 'next/link'
import { CategoryRow } from '@/components/commerce/CategoryRow'
import { ConsumerShell } from '@/components/shell/ConsumerShell'
import { ProductResultCard } from '@/components/commerce/OfferCard'
import { SellerThumb } from '@/components/commerce/SellerThumb'
import { RiderNetworkView, riderRadius } from '@/components/rider/NetworkView'
import { Badge, Card, EmptyState, LinkButton, Rating, SectionHeading } from '@/components/ui'
import { currentUser } from '@/lib/auth'
import { buyerLocation } from '@/lib/location'
import { TIER } from '@/lib/tiers'
import { formatDistance, formatEta } from '@/lib/geo'
import { listCategories } from '@/modules/catalog/service'
import { popularNearby, trendingSearches } from '@/modules/search/service'
import { rankSellers } from '@/modules/recommendation/service'

export const dynamic = 'force-dynamic'

/**
 * Consumer home.
 *
 * Everything on this page is derived from what is actually in stock within
 * range of the viewer right now. There is no editorial merchandising, because
 * the product promise is "accurate product discovery" - a category tile or a
 * popular item that turns out to be unavailable is the exact failure the BRS
 * describes.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ radius?: string; shop?: string }>
}) {
  const [user, location, params] = await Promise.all([currentUser(), buyerLocation(), searchParams])

  /**
   * For a delivery partner the storefront *is* the map.
   *
   * A rider never buys stock, so a wall of product categories tells them
   * nothing they can act on; the shops, warehouses and waiting drop points
   * are the whole job. `?shop=1` still opens the ordinary storefront, because
   * a rider is also a person who can buy things — this changes the default,
   * it does not take the shop away.
   */
  if (user?.role === 'delivery_partner' && !params.shop) {
    return (
      <ConsumerShell search={false}>
        <div className="space-y-6">
          <RiderNetworkView
            userId={user.id}
            origin={{ lat: location.lat, lng: location.lng }}
            locationLabel={location.label}
            radiusKm={riderRadius(params.radius)}
            basePath="/"
          />
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-ink">Looking to buy something yourself?</p>
              <p className="text-xs text-muted">
                The ordinary storefront is still here — this page just leads with the map, because
                that is what a delivery partner needs first.
              </p>
            </div>
            <LinkButton href="/?shop=1" variant="secondary">
              Browse the shop
            </LinkButton>
          </Card>
        </div>
      </ConsumerShell>
    )
  }

  const ctx = {
    lat: location.lat,
    lng: location.lng,
    tier: TIER.consumer,
    userId: user?.id ?? null,
  }

  const [categories, popular, outlets, trending] = await Promise.all([
    listCategories(),
    popularNearby(ctx, 8),
    rankSellers(ctx, { limit: 8 }),
    trendingSearches(6),
  ])

  const greeting = user ? `Hello, ${user.full_name.split(' ')[0]}` : 'Find what you need, nearby'

  return (
    <ConsumerShell>
      <div className="space-y-8">
        <section>
          <h1 className="text-display-sm">{greeting}</h1>
          <p className="hero-lede">
            One search. Real inventory, nearby. Pay. Delivered. Restocked. Everything below is stock
            a verified seller around {location.label} physically has right now.
          </p>
          {trending.length > 0 && (
            <div className="mt-7 flex flex-wrap gap-2">
              {trending.map((t) => (
                <Link
                  key={t.query}
                  href={`/search?q=${encodeURIComponent(t.query)}`}
                  className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted hover:border-accent-500 hover:text-accent-400"
                >
                  {t.query}
                </Link>
              ))}
            </div>
          )}
        </section>

        {categories.length > 0 && (
          <section>
            <SectionHeading title="Top categories" />
            {/* Five, then an overflow — the reference design deliberately does
                not present a wall of categories on first open. */}
            <CategoryRow categories={categories} limit={5} />
          </section>
        )}

        <section>
          <SectionHeading
            title="Popular nearby"
            subtitle="In stock right now, ranked by availability, distance and price"
            action={
              <Link href="/search" className="text-sm font-medium text-accent-500 hover:underline">
                See all
              </Link>
            }
          />
          {popular.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {popular.map((result, i) => (
                <ProductResultCard key={result.product_id} result={result} index={i} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="pin"
              title="Nothing in stock around here yet"
              body={`No verified sellers have listed stock within range of ${location.label}. Try another area, or register your business to be the first.`}
              action={<LinkButton href="/onboarding">Register a business</LinkButton>}
            />
          )}
        </section>

        {outlets.length > 0 && (
          <section>
            <SectionHeading title="Nearby outlets" subtitle="Verified shops closest to you" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {outlets.map((outlet) => (
                <Link key={outlet.id} href={`/shop/${outlet.slug}`}>
                  <Card className="flex h-full items-center gap-3 card-interactive hover:card-interactive-hover">
                    <SellerThumb
                      name={outlet.name}
                      logoUrl={outlet.logo_url}
                      type={outlet.type}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink">{outlet.name}</p>
                      <p className="truncate text-xs text-muted">{outlet.address ?? outlet.city}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span>{formatDistance(outlet.distance_km)}</span>
                        <span>· {formatEta(outlet.eta_minutes)}</span>
                        <Rating value={outlet.rating} count={outlet.rating_count} />
                      </div>
                      <Badge tone="neutral" className="mt-1.5">
                        {outlet.sku_count} products in stock
                      </Badge>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="mesh-surface hero">
          <h2 className="text-display-sm">
            Sell on <span className="accent-word">AfriMesh</span>
          </h2>
          <p className="hero-lede">
            Neighbourhood shops, merchants and dealer warehouses: list what you have, get discovered
            by buyers close to you, and restock from the tier above you in the same place.
          </p>
          <div className="hero-actions">
            <LinkButton href="/onboarding" variant="secondary">
              Register your business
            </LinkButton>
            <Link
              href="/about"
              className="inline-flex items-center rounded-brand px-4 py-2 text-sm font-semibold text-white/90 hover:bg-white/10"
            >
              How the network works
            </Link>
          </div>
        </section>
      </div>
    </ConsumerShell>
  )
}
