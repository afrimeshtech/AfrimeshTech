import { KM_PER_DEGREE } from '@/lib/geo'
import type { MapPin, PinKind } from '@/modules/territory/service'

/**
 * The places a delivery partner actually rides between.
 *
 * Where the hotspot map answers "where is demand?" with neighbourhoods, this
 * answers "what is around me right now?" with individual premises: the shop to
 * collect from, the warehouse across town, the address waiting for a drop. So
 * it plots one mark per place, not one per cell.
 *
 * Every kind gets its own *shape* as well as its own tone. Colour alone would
 * make the whole map unreadable to a red-green colourblind rider, and this is
 * the screen they navigate by.
 */

const MARK: Record<PinKind, { tone: string; shape: 'circle' | 'square' | 'diamond' | 'pin' }> = {
  outlet: { tone: 'text-accent-500', shape: 'circle' },
  merchant: { tone: 'text-info-ink', shape: 'square' },
  warehouse: { tone: 'text-ink', shape: 'diamond' },
  manufacturer: { tone: 'text-muted', shape: 'diamond' },
  dropoff: { tone: 'text-coral-ink', shape: 'pin' },
  active_dropoff: { tone: 'text-success-ink', shape: 'pin' },
}

export function NetworkMap({
  pins,
  origin,
  radiusKm,
  caption,
}: {
  pins: MapPin[]
  /** The rider. Everything is drawn relative to where they are standing. */
  origin: { lat: number; lng: number }
  radiusKm: number
  caption: string
}) {
  const SIZE = 100
  // Fixed to the search radius rather than the furthest pin, so the rings mean
  // a constant distance. A rider reads this to judge "can I get there", and a
  // scale that silently rescaled between loads would defeat that.
  const reach = radiusKm * 1.05
  const project = (km: number) => (km / reach) * (SIZE / 2)
  const rings = ringRadii(radiusKm)

  const lngScale = Math.cos((origin.lat * Math.PI) / 180) * KM_PER_DEGREE

  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <svg
        viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`}
        className="aspect-square w-full"
        role="img"
        aria-label={caption}
      >
        <g className="text-muted" stroke="currentColor" fill="none">
          {rings.map((km) => (
            <circle key={km} cx={0} cy={0} r={project(km)} strokeWidth={0.3} opacity={0.35} />
          ))}
          <line x1={-SIZE / 2} y1={0} x2={SIZE / 2} y2={0} strokeWidth={0.2} opacity={0.25} />
          <line x1={0} y1={-SIZE / 2} x2={0} y2={SIZE / 2} strokeWidth={0.2} opacity={0.25} />
        </g>

        <g className="text-muted" fill="currentColor" opacity={0.7}>
          {rings.map((km) => (
            <text key={km} x={1.4} y={-project(km) - 1.2} fontSize={2.8}>
              {km} km
            </text>
          ))}
          <text x={0} y={-SIZE / 2 + 4} fontSize={3.4} textAnchor="middle">
            N
          </text>
        </g>

        {/* Businesses first, delivery points over them: a drop is the thing
            being acted on, and it must never be hidden under a shop. */}
        {[...pins]
          .sort((a, b) => rank(a.kind) - rank(b.kind))
          .map((pin) => {
            const east = (pin.lng - origin.lng) * lngScale
            const north = (pin.lat - origin.lat) * KM_PER_DEGREE
            return (
              <Mark
                key={`${pin.kind}-${pin.id}`}
                kind={pin.kind}
                x={project(east)}
                y={-project(north)}
              />
            )
          })}

        <g>
          <circle cx={0} cy={0} r={2} className="text-ink" fill="currentColor" />
          <circle
            cx={0}
            cy={0}
            r={3.6}
            className="text-ink"
            fill="none"
            stroke="currentColor"
            strokeWidth={0.5}
            opacity={0.5}
          />
        </g>
      </svg>
    </figure>
  )
}

/** Delivery points draw last so they sit on top. */
function rank(kind: PinKind): number {
  return kind === 'dropoff' || kind === 'active_dropoff' ? 1 : 0
}

function Mark({ kind, x, y }: { kind: PinKind; x: number; y: number }) {
  const { tone, shape } = MARK[kind]
  const r = shape === 'pin' ? 2.2 : 1.9

  if (shape === 'square') {
    return (
      <rect
        x={x - r}
        y={y - r}
        width={r * 2}
        height={r * 2}
        className={tone}
        fill="currentColor"
        opacity={0.85}
      />
    )
  }
  if (shape === 'diamond') {
    return (
      <polygon
        points={`${x},${y - r * 1.3} ${x + r * 1.3},${y} ${x},${y + r * 1.3} ${x - r * 1.3},${y}`}
        className={tone}
        fill="currentColor"
        opacity={0.85}
      />
    )
  }
  if (shape === 'pin') {
    // A ring, so a drop reads as a target rather than another premises.
    return (
      <g className={tone}>
        <circle cx={x} cy={y} r={r} fill="none" stroke="currentColor" strokeWidth={1} />
        <circle cx={x} cy={y} r={0.7} fill="currentColor" />
      </g>
    )
  }
  return <circle cx={x} cy={y} r={r} className={tone} fill="currentColor" opacity={0.85} />
}

/** The same shape legend, for use beside the map. */
export function MapLegend({ counts }: { counts: Record<string, number> }) {
  const entries: { kind: PinKind; label: string }[] = [
    { kind: 'outlet', label: 'Retail outlet' },
    { kind: 'merchant', label: 'Merchant' },
    { kind: 'warehouse', label: 'Warehouse' },
    { kind: 'manufacturer', label: 'Manufacturer' },
    { kind: 'dropoff', label: 'Delivery point' },
    { kind: 'active_dropoff', label: 'Your active drop' },
  ]

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {entries
        .filter((entry) => (counts[entry.kind] ?? 0) > 0)
        .map((entry) => (
          <li key={entry.kind} className="flex items-center gap-1.5 text-muted">
            <svg viewBox="-4 -4 8 8" className="size-3 shrink-0" aria-hidden>
              <Mark kind={entry.kind} x={0} y={0} />
            </svg>
            {entry.label}
            <span className="font-technical text-ink">{counts[entry.kind]}</span>
          </li>
        ))}
    </ul>
  )
}

function ringRadii(radiusKm: number): number[] {
  return [radiusKm / 4, radiusKm / 2, radiusKm].map((km) =>
    km >= 10 ? Math.round(km) : Math.round(km * 2) / 2,
  )
}
