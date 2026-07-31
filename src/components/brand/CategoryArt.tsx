/**
 * Category artwork — detailed illustrations of the actual goods.
 *
 * Deliberately not the outlined icon set: a category tile is a shop window, and
 * a line drawing of a bottle sells nothing. These are filled, multi-colour
 * illustrations in the real colours of the items — tomato red, carrot orange,
 * leaf green — so a shopper recognises the aisle at a glance.
 *
 * Illustrations rather than photographs because there is no photography to use
 * and pulling images from a third-party host would put an external dependency
 * on the front page. When real photography exists it drops in behind the same
 * component: give a category an `image_url` and render that instead.
 *
 * Drawn on an 80×80 grid, sized 60–80px at the call site.
 */

const SHADOW = 'rgba(0,0,0,0.18)'

function Groceries() {
  return (
    <>
      {/* leafy green at the back */}
      <path d="M14 46c-4-10 2-20 12-21-1 8-3 15-12 21Z" fill="#4f9d4a" />
      <path d="M26 25c8 2 12 11 9 20-6-5-9-12-9-20Z" fill="#5fb356" />
      {/* carrot */}
      <path d="M56 30l8 26-16-6Z" fill="#ef7f2a" />
      <path d="M56 30l-3-8 5 3 4-5 1 7Z" fill="#4f9d4a" />
      {/* tomato */}
      <ellipse cx="33" cy="52" rx="15" ry="14" fill="#e0452f" />
      <ellipse cx="28" cy="47" rx="4.5" ry="3.5" fill="#f0705c" opacity="0.85" />
      <path d="M33 39c-4-1-7-2-8-5 4 0 6 1 8 3 2-2 4-3 8-3-1 3-4 4-8 5Z" fill="#3f8b3c" />
      {/* citrus wedge */}
      <path d="M62 62a12 12 0 0 1-20 4l10-10Z" fill="#f5c130" />
      <path d="M58 62l-6-6-4 4a8 8 0 0 0 10 2Z" fill="#ffde7a" opacity="0.7" />
      <ellipse cx="40" cy="66" rx="26" ry="3" fill={SHADOW} />
    </>
  )
}

function Beverages() {
  return (
    <>
      {/* tall bottle */}
      <path d="M30 20h10v8l4 8v26a3 3 0 0 1-3 3H29a3 3 0 0 1-3-3V36l4-8Z" fill="#2f6f4e" />
      <path d="M30 20h10v6H30Z" fill="#1d4d36" />
      <path d="M27 42h16v14H27Z" fill="#e8dfc8" />
      <path d="M30 45h8v2h-8Zm0 4h6v2h-6Z" fill="#8a7f63" />
      {/* glass with drink and straw */}
      <path d="M50 34h20l-3 28a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4Z" fill="#cfe6f2" opacity="0.55" />
      <path d="M51.5 42h17l-2 20a3 3 0 0 1-3 3h-7a3 3 0 0 1-3-3Z" fill="#f0932b" />
      <path d="M63 30l4-8 3 1-4 9Z" fill="#e0452f" />
      <ellipse cx="60" cy="42" rx="8.5" ry="2.4" fill="#ffbe6b" />
      <ellipse cx="40" cy="69" rx="28" ry="3" fill={SHADOW} />
    </>
  )
}

function BuildingMaterials() {
  return (
    <>
      {/* cement bag */}
      <path d="M12 34h22l3 30H14Z" fill="#c9bfa6" />
      <path d="M12 34h22l1 6H13Z" fill="#a89c80" />
      <path d="M18 46h11v3H18Zm0 6h8v3h-8Z" fill="#8a7f63" />
      {/* brick stack */}
      <rect x="40" y="46" width="26" height="9" rx="1.5" fill="#b34a34" />
      <rect x="36" y="56" width="26" height="9" rx="1.5" fill="#c2563e" />
      <rect x="44" y="56" width="4" height="9" fill="#a03f2c" opacity="0.5" />
      <rect x="50" y="46" width="4" height="9" fill="#9c3b28" opacity="0.5" />
      {/* trowel */}
      <path d="M46 18h16l-8 18-8-6Z" fill="#b9c3c9" />
      <rect x="52" y="12" width="4" height="8" rx="2" fill="#6b4a2f" />
      <ellipse cx="40" cy="68" rx="28" ry="3" fill={SHADOW} />
    </>
  )
}

function Pharmacy() {
  return (
    <>
      {/* blister pack */}
      <rect x="10" y="30" width="34" height="30" rx="4" fill="#dfe6ea" />
      <rect
        x="10"
        y="30"
        width="34"
        height="30"
        rx="4"
        fill="none"
        stroke="#b7c2c8"
        strokeWidth="1.5"
      />
      {[16, 27, 38].map((cx) =>
        [39, 51].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4.2" fill="#f0932b" />),
      )}
      {/* two-tone capsule */}
      <g transform="rotate(-28 60 40)">
        <rect x="48" y="34" width="26" height="13" rx="6.5" fill="#e0452f" />
        <path d="M61 34h6.5a6.5 6.5 0 0 1 0 13H61Z" fill="#f5f5f5" />
      </g>
      {/* loose tablet */}
      <circle cx="56" cy="60" r="7" fill="#f5f5f5" />
      <path d="M50 60h12" stroke="#b7c2c8" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="40" cy="68" rx="28" ry="3" fill={SHADOW} />
    </>
  )
}

function Electronics() {
  return (
    <>
      {/* phone */}
      <rect x="20" y="14" width="30" height="52" rx="5" fill="#2b3138" />
      <rect x="23" y="19" width="24" height="41" rx="2.5" fill="#3aa0d8" />
      <path d="M23 45l7-8 6 6 5-5 6 7v15H23Z" fill="#2b7fb0" />
      <circle cx="35" cy="63" r="1.8" fill="#5b636c" />
      <rect x="30" y="16" width="10" height="1.8" rx="0.9" fill="#5b636c" />
      {/* earbud case + bud */}
      <rect x="54" y="42" width="18" height="16" rx="6" fill="#e9edf0" />
      <path d="M54 50h18" stroke="#c3ccd2" strokeWidth="1.4" />
      <circle cx="63" cy="32" r="5" fill="#f5f5f5" />
      <path d="M63 36c1.5 3 1 6-1 8l-3-2c2-2 2-4 1-6Z" fill="#f5f5f5" />
      <ellipse cx="40" cy="69" rx="28" ry="3" fill={SHADOW} />
    </>
  )
}

function HomeKitchen() {
  return (
    <>
      {/* pot with lid */}
      <path d="M12 38h30v20a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6Z" fill="#5b6873" />
      <rect x="9" y="33" width="36" height="6" rx="3" fill="#7c8894" />
      <circle cx="27" cy="30" r="3" fill="#c0562f" />
      {/* frying pan */}
      <ellipse cx="55" cy="52" rx="17" ry="9" fill="#3b4149" />
      <ellipse cx="55" cy="50" rx="13" ry="6" fill="#5b6873" />
      <path d="M70 50h12a3 3 0 0 1 0 6H70Z" fill="#6b4a2f" />
      {/* egg in the pan */}
      <ellipse cx="53" cy="49" rx="6" ry="4" fill="#f7f3e8" />
      <circle cx="53" cy="49" r="2.2" fill="#f5b942" />
      <ellipse cx="40" cy="68" rx="28" ry="3" fill={SHADOW} />
    </>
  )
}

function PersonalCare() {
  return (
    <>
      {/* lotion bottle with pump */}
      <path d="M26 30h16v30a5 5 0 0 1-5 5h-6a5 5 0 0 1-5-5Z" fill="#e7e2f0" />
      <rect x="30" y="22" width="8" height="8" fill="#8e7cc3" />
      <path d="M34 18h9v3h-9Z" fill="#8e7cc3" />
      <rect x="27" y="42" width="14" height="11" rx="1" fill="#8e7cc3" opacity="0.35" />
      {/* soap bar with bubbles */}
      <rect x="48" y="48" width="24" height="15" rx="5" fill="#f2c9d6" />
      <rect x="48" y="48" width="24" height="6" rx="3" fill="#f8dee7" />
      <circle cx="58" cy="34" r="5" fill="#cfe6f2" opacity="0.8" />
      <circle cx="67" cy="28" r="3.4" fill="#cfe6f2" opacity="0.7" />
      <circle cx="52" cy="26" r="2.4" fill="#cfe6f2" opacity="0.6" />
      <ellipse cx="40" cy="67" rx="28" ry="3" fill={SHADOW} />
    </>
  )
}

function AgroInputs() {
  return (
    <>
      {/* fertiliser sack */}
      <path d="M40 34h26l3 30H41Z" fill="#d8cfae" />
      <path d="M40 34h26l1 6H41Z" fill="#b3a884" />
      <path d="M48 46h12v10H48Z" fill="#4f9d4a" opacity="0.75" />
      {/* wheat */}
      <path d="M22 66V28" stroke="#c69a3a" strokeWidth="3" strokeLinecap="round" />
      {[30, 39, 48].map((y) => (
        <g key={y}>
          <path d={`M22 ${y}c0-5 3-8 7-9 1 4-2 8-7 9Z`} fill="#e0b445" />
          <path d={`M22 ${y}c0-5-3-8-7-9-1 4 2 8 7 9Z`} fill="#c69a3a" />
        </g>
      ))}
      {/* seeds */}
      <ellipse cx="16" cy="64" rx="3" ry="2" fill="#8a6a3a" />
      <ellipse cx="24" cy="66" rx="3" ry="2" fill="#8a6a3a" />
      <ellipse cx="40" cy="69" rx="30" ry="3" fill={SHADOW} />
    </>
  )
}

const ART: Record<string, () => React.ReactElement> = {
  groceries: Groceries,
  beverages: Beverages,
  'building-materials': BuildingMaterials,
  pharmacy: Pharmacy,
  electronics: Electronics,
  'home-kitchen': HomeKitchen,
  'personal-care': PersonalCare,
  'agro-inputs': AgroInputs,
}

export function hasCategoryArt(slug: string): boolean {
  return slug in ART
}

/**
 * Illustration for a category. Falls back to the groceries basket for an
 * unknown slug rather than rendering an empty box.
 */
export function CategoryArt({ slug, size = 72 }: { slug: string; size?: number }) {
  const Art = ART[slug] ?? Groceries
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <Art />
    </svg>
  )
}
