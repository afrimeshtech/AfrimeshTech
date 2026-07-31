import { SellerArt, resolveSellerForm } from '@/components/brand/SellerArt'

/**
 * The mark beside a business, on the brand's dark green tile.
 *
 * Resolution order, most specific first:
 *   1. a logo the owner actually uploaded
 *   2. a brand mark drawn from what the business is and what it is called
 *   3. initials — only when the name says nothing we can draw
 *
 * The same shape as `ProductThumb`, and deliberately so: a product tile and a
 * seller tile sit side by side on an offer card, so they share the ground, the
 * radius and the depth, and differ only in what is drawn on them.
 */
export function SellerThumb({
  name,
  logoUrl,
  type,
  size = 'md',
}: {
  name: string
  logoUrl?: string | null
  /** Supply-chain tier: the fallback when the name alone says nothing. */
  type?: string | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const box = { sm: 'size-12', md: 'size-16', lg: 'size-20' }[size]
  const art = { sm: 38, md: 52, lg: 64 }[size]

  // A real logo fills the tile edge to edge — the owner chose that image, and
  // framing it in our green would only shrink it and fight their colours.
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className={`${box} shrink-0 rounded-brand object-cover`}
        loading="lazy"
      />
    )
  }

  const hasArt = resolveSellerForm(name, type) !== null

  return (
    <span
      aria-hidden
      className={`${box} brand-tile grid shrink-0 place-items-center overflow-hidden rounded-brand group-hover:brand-tile-hover`}
    >
      {hasArt ? (
        <SellerArt name={name} type={type} size={art} />
      ) : (
        <span className="text-sm font-semibold text-white/90">{initialsOf(name)}</span>
      )}
    </span>
  )
}

function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w && !/^\d/.test(w))
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
