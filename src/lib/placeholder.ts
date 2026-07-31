/**
 * Generated brand imagery for businesses.
 *
 * The Brand Identity Guide says to use real photography of African
 * entrepreneurs, retail stores and warehouses, and to "avoid generic stock
 * imagery whenever possible". Until a business uploads a real logo, a generated
 * mark drawn from the brand palette is the honest option: it is unmistakably
 * ours and it carries the mesh motif from the logo.
 *
 * Deterministic: the same name always produces the same mark, so a business
 * keeps its appearance across reseeds.
 *
 * Products deliberately have no equivalent here. An initials tile stored in
 * `image_url` reads as a photograph to every consumer of that column and so
 * outranks the real artwork; products get `ProductArt`, which draws the goods
 * themselves, and `image_url` stays empty until someone takes a photo.
 */

/** Palette drawn from the brand tokens: greens, deep emerald, warm sand. */
const SURFACES = [
  { bg: '#1e3227', accent: '#ffa500' },
  { bg: '#263e30', accent: '#ffb733' },
  { bg: '#2d4a3a', accent: '#ffa500' },
  { bg: '#365643', accent: '#ffc966' },
  { bg: '#1b3a5c', accent: '#ffa500' },
  { bg: '#243b2e', accent: '#a8b8b0' },
] as const

/** FNV-1a: small, stable, and not dependent on any runtime hashing API. */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/** "Grace Stores" -> "GS"; "Peak Milk Powder 400g" -> "PM" */
export function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0 && !/^\d+$/.test(word))

  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * A business logo: the A-frame from the logo mark over a brand surface, with
 * the business's initials.
 */
export function businessLogoSvg(name: string): string {
  const surface = SURFACES[(hash(name) + 3) % SURFACES.length]
  const initials = initialsOf(name)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="${escapeXml(name)}">
  <rect width="200" height="200" rx="28" fill="${surface.bg}"/>
  <path d="M100 34 44 152h26l30-64 30 64h26L100 34Z" fill="${surface.accent}" fill-opacity="0.28"/>
  <text x="100" y="112" text-anchor="middle" dominant-baseline="central"
        font-family="Inter, Arial, sans-serif" font-size="66" font-weight="700"
        fill="#ffffff" letter-spacing="1">${escapeXml(initials)}</text>
</svg>`
}
