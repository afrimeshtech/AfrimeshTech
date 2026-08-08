import { KM_PER_DEGREE } from '@/lib/geo'
import type { TerritoryCell } from '@/modules/territory/service'

/**
 * Where the demand sits, relative to where the viewer stands.
 *
 * A radar rather than a street map: the viewer is the centre, the rings are
 * distance, and each bubble is a neighbourhood sized by how many buyers are
 * active there. That answers the question a shopkeeper actually has - "which
 * way, and how far, is my next customer?" - without a tile provider, an API
 * key, or a single byte of client JavaScript.
 *
 * Drawn with `currentColor` throughout so it inherits the theme rather than
 * baking in colours that would be invisible on half the app's surfaces. The
 * ranked table beside it carries the same figures for screen readers.
 */
export function HotspotMap({
  cells,
  origin,
  originLabel = 'You',
  unit = 'buyers',
  caption,
}: {
  cells: TerritoryCell[]
  origin: { lat: number; lng: number } | null
  originLabel?: string
  /** What a bubble counts - riders are not buyers. */
  unit?: string
  caption: string
}) {
  if (!cells.length) return null

  // Without a viewer position - the platform console - the map centres on the
  // activity itself, so the busiest region fills the frame either way.
  const centre = origin ?? {
    lat: cells.reduce((sum, c) => sum + c.lat, 0) / cells.length,
    lng: cells.reduce((sum, c) => sum + c.lng, 0) / cells.length,
  }

  const lngScale = Math.cos((centre.lat * Math.PI) / 180) * KM_PER_DEGREE

  const points = cells.map((cell) => ({
    cell,
    east: (cell.lng - centre.lng) * lngScale,
    north: (cell.lat - centre.lat) * KM_PER_DEGREE,
  }))

  // The frame is sized by the furthest hotspot, so a dense neighbourhood and a
  // whole state both read at a usable scale.
  const reach = Math.max(...points.map((p) => Math.hypot(p.east, p.north)), 0.5) * 1.18
  const rings = ringRadii(reach)

  const SIZE = 100
  const project = (km: number) => (km / reach) * (SIZE / 2)
  const maxActors = Math.max(...cells.map((c) => c.actors), 1)

  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <svg
        viewBox={`${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`}
        className="aspect-square w-full"
        role="img"
        aria-label={caption}
      >
        {/* Distance rings and the cardinal cross. */}
        <g className="text-muted" stroke="currentColor" fill="none">
          {rings.map((km) => (
            <circle key={km} cx={0} cy={0} r={project(km)} strokeWidth={0.3} opacity={0.35} />
          ))}
          <line x1={-SIZE / 2} y1={0} x2={SIZE / 2} y2={0} strokeWidth={0.2} opacity={0.25} />
          <line x1={0} y1={-SIZE / 2} x2={0} y2={SIZE / 2} strokeWidth={0.2} opacity={0.25} />
        </g>

        <g className="text-muted" fill="currentColor" opacity={0.7}>
          {rings.map((km) => (
            <text key={km} x={1.4} y={-project(km) - 1.2} fontSize={3}>
              {km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`}
            </text>
          ))}
          <text x={0} y={-SIZE / 2 + 4} fontSize={3.4} textAnchor="middle" opacity={0.8}>
            N
          </text>
        </g>

        {/* Hotspots. Area, not radius, carries the count - a circle twice as
            wide reads as four times as much, and would overstate it. */}
        <g className="text-accent-500" fill="currentColor">
          {points.map(({ cell, east, north }, index) => (
            <circle
              key={index}
              cx={project(east)}
              cy={-project(north)}
              r={2 + Math.sqrt(cell.actors / maxActors) * 7}
              opacity={0.3 + cell.intensity * 0.55}
            />
          ))}
        </g>

        {/* The viewer, last so nothing is drawn over them. */}
        <g>
          <circle cx={0} cy={0} r={2.2} className="text-ink" fill="currentColor" />
          <circle
            cx={0}
            cy={0}
            r={4}
            className="text-ink"
            fill="none"
            stroke="currentColor"
            strokeWidth={0.5}
            opacity={0.5}
          />
        </g>
      </svg>

      <p className="mt-1 text-center text-xs text-muted">
        {originLabel} at the centre · bubble size is active {unit}
      </p>
    </figure>
  )
}

/**
 * Three rings at round numbers a person reads without decoding - 1/2/5 km,
 * not 1.7/3.4/5.1.
 */
function ringRadii(reach: number): number[] {
  const steps = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500]
  const outer = steps.find((step) => step >= reach * 0.85) ?? Math.round(reach)
  const index = steps.indexOf(outer)
  return steps.slice(Math.max(0, index - 2), index + 1)
}
