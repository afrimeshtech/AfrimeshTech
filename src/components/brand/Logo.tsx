import Image from 'next/image'
import horizontal from '../../../public/brand/afrimesh-horizontal.png'
import stacked from '../../../public/brand/afrimesh-lockup.png'

/**
 * The AfriMesh logo.
 *
 * This renders the supplied artwork (`Afrimesh logo.jpeg`) rather than a
 * redrawn approximation, so the mark on screen is the mark that was designed —
 * the A, the layered green triangle, the tan aperture, the Africa outline and
 * the mesh nodes, all exactly as authored.
 *
 * Two crops are prepared from the source sheet:
 *   horizontal — mark beside the wordmark, for header bars
 *   stacked    — the original vertical lockup, for footers and auth pages
 *
 * Both are cropped on the artwork's own background (#021614), so wherever they
 * sit on a surface of that colour the edges are invisible and the lockup reads
 * as part of the bar rather than as a pasted rectangle.
 *
 * Sampled from the file:
 *   ground  #021614   white  #ffffff   green  #216441   tan  #8a5b31
 */

export const LOGO_COLOURS = {
  ground: '#021614',
  white: '#ffffff',
  green: '#216441',
  tan: '#8a5b31',
} as const

/**
 * The mark on its own is not available as a separate asset, so a small
 * horizontal crop stands in where only an icon fits. `priority` is set on the
 * header instance because it is above the fold on every page.
 */
export function Wordmark({
  size = 'md',
  orientation = 'horizontal',
  priority = false,
}: {
  size?: 'sm' | 'md' | 'lg'
  /** `horizontal` for bars, `stacked` for footers and full-page surfaces. */
  orientation?: 'horizontal' | 'stacked'
  priority?: boolean
}) {
  if (orientation === 'stacked') {
    const width = { sm: 148, md: 200, lg: 264 }[size]
    return (
      <Image
        src={stacked}
        alt="AfriMesh Technologies — Engineering Africa's Commerce Infrastructure"
        width={width}
        height={Math.round((width * stacked.height) / stacked.width)}
        priority={priority}
        className="h-auto"
      />
    )
  }

  const height = { sm: 38, md: 48, lg: 64 }[size]
  return (
    <Image
      src={horizontal}
      alt="AfriMesh Technologies"
      height={height}
      width={Math.round((height * horizontal.width) / horizontal.height)}
      priority={priority}
      className="w-auto"
      style={{ height }}
    />
  )
}

/*
 * There is no `tagline` switch: the supplied artwork carries
 * "ENGINEERING AFRICA'S COMMERCE INFRASTRUCTURE" in both crops, and cropping it
 * out would mean shipping a fourth asset for no gain.
 */
