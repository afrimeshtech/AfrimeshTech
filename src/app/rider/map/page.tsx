import { redirect } from 'next/navigation'
import { RiderShell } from '@/components/shell/RiderShell'
import { RiderNetworkView, riderRadius } from '@/components/rider/NetworkView'
import { requireUser } from '@/lib/auth'
import { buyerLocation } from '@/lib/location'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Network map' }

/**
 * The rider's map, on their own dashboard. The same view renders on the
 * storefront, which is where a delivery partner is most likely to land.
 */
export default async function RiderMapPage({
  searchParams,
}: {
  searchParams: Promise<{ radius?: string }>
}) {
  const user = await requireUser('/rider/map')
  if (user.role !== 'delivery_partner') redirect('/forbidden')

  const radiusKm = riderRadius((await searchParams).radius)
  const location = await buyerLocation()

  return (
    <RiderShell name={user.full_name} locationLabel={location.label} active="/rider/map">
      <RiderNetworkView
        userId={user.id}
        origin={{ lat: location.lat, lng: location.lng }}
        locationLabel={location.label}
        radiusKm={radiusKm}
        basePath="/rider/map"
      />
    </RiderShell>
  )
}
