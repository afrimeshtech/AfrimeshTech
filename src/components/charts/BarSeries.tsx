import { formatMoneyCompact } from '@/lib/money'

/**
 * A minimal trend chart, drawn as plain HTML rather than an SVG chart library:
 * no dependency, no client JavaScript, and the underlying figures stay
 * readable to a screen reader through the table markup.
 */
export function BarSeries({
  data,
  valueKey,
  labelKey = 'day',
  money = true,
  caption,
}: {
  data: Record<string, string | number>[]
  valueKey: string
  labelKey?: string
  money?: boolean
  caption: string
}) {
  const values = data.map((d) => Number(d[valueKey]) || 0)
  const max = Math.max(...values, 1)

  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="flex h-32 items-end gap-1" role="img" aria-label={caption}>
        {data.map((row, index) => {
          const value = Number(row[valueKey]) || 0
          const height = Math.max(2, (value / max) * 100)
          return (
            <div key={index} className="group relative flex flex-1 flex-col justify-end">
              <span
                className="rounded-t bg-accent-500/80 transition-colors group-hover:bg-accent-500"
                style={{ height: `${height}%` }}
              />
              <span className="pointer-events-none absolute -top-6 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-surface-deep px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                {money ? formatMoneyCompact(value) : value}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-technical text-[10px] text-muted">
        <span>{data[0]?.[labelKey]}</span>
        <span>{data[data.length - 1]?.[labelKey]}</span>
      </div>
    </figure>
  )
}
