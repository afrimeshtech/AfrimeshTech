/**
 * Product artwork — detailed illustrations of the goods themselves.
 *
 * These replace the initials badge, which told a shopper nothing. They are
 * generic depictions of the product *form* — a milk tin, a rice sack, a cola
 * bottle — in the colours the category is recognised by, not reproductions of
 * anyone's packaging or trade dress. Real photography, once a seller uploads
 * it, always wins over these (see `resolveProductArt`).
 *
 * Drawn on an 80×80 grid so they sit correctly in the 60–80px container.
 */

const SHADOW = 'rgba(0,0,0,0.22)'

/* -- Named forms ---------------------------------------------------------- */

function MilkTin() {
  return (
    <>
      <path d="M24 26h32v38a4 4 0 0 1-4 4H28a4 4 0 0 1-4-4Z" fill="#e8edf2" />
      <path d="M24 26h32v9H24Z" fill="#1e5fa8" />
      <rect x="27" y="39" width="26" height="17" rx="2" fill="#1e5fa8" />
      <path d="M31 44h18v3H31Zm0 5h12v2.5H31Z" fill="#e8edf2" opacity="0.9" />
      <ellipse cx="40" cy="26" rx="16" ry="4" fill="#f6f8fa" />
      <path d="M22 22h36v5H22Z" fill="#c8d2da" />
      <ellipse cx="40" cy="70" rx="22" ry="3" fill={SHADOW} />
    </>
  )
}

function RiceBag() {
  return (
    <>
      <path d="M20 28c0-3 4-6 20-6s20 3 20 6v34a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4Z" fill="#efe6cd" />
      <path d="M20 28c0-3 4-6 20-6s20 3 20 6v6H20Z" fill="#d8caa6" />
      <rect x="27" y="40" width="26" height="18" rx="2" fill="#b8332e" />
      {/* grains */}
      <g fill="#f7f2e2">
        <ellipse cx="34" cy="46" rx="3" ry="1.6" transform="rotate(-20 34 46)" />
        <ellipse cx="41" cy="49" rx="3" ry="1.6" transform="rotate(15 41 49)" />
        <ellipse cx="47" cy="45" rx="3" ry="1.6" transform="rotate(-8 47 45)" />
        <ellipse cx="37" cy="53" rx="3" ry="1.6" transform="rotate(25 37 53)" />
        <ellipse cx="45" cy="53" rx="3" ry="1.6" transform="rotate(-14 45 53)" />
      </g>
      <ellipse cx="40" cy="69" rx="24" ry="3" fill={SHADOW} />
    </>
  )
}

function NoodlePack() {
  return (
    <>
      <path d="M18 24h44v34a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4Z" fill="#e8542f" />
      <path d="M18 24h44v8H18Z" fill="#c93f1e" />
      {/* crimped top and bottom */}
      <path d="M18 22h44v3H18Zm0 38h44v3H18Z" fill="#f0a03a" />
      {/* bowl motif */}
      <path d="M28 42h24a12 12 0 0 1-24 0Z" fill="#f7dfa5" />
      <g stroke="#f0a03a" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M31 40c2-4 6-4 8 0" />
        <path d="M38 40c2-4 6-4 8 0" />
      </g>
      <rect x="26" y="49" width="28" height="4" rx="2" fill="#f7dfa5" opacity="0.75" />
      <ellipse cx="40" cy="67" rx="24" ry="3" fill={SHADOW} />
    </>
  )
}

function CementBag() {
  return (
    <>
      <path d="M17 26h46l4 36a3 3 0 0 1-3 3.5H16a3 3 0 0 1-3-3.5Z" fill="#cfc7b2" />
      <path d="M17 26h46l1 8H16Z" fill="#a89f88" />
      <rect x="25" y="40" width="30" height="16" rx="2" fill="#2f6f4e" />
      <path d="M29 45h22v3H29Zm0 5h14v2.5H29Z" fill="#e8e2d2" />
      {/* seam stitching */}
      <path d="M17 26h46" stroke="#8f866f" strokeWidth="1.4" strokeDasharray="3 3" />
      <ellipse cx="40" cy="69" rx="26" ry="3" fill={SHADOW} />
    </>
  )
}

function ChocolateTin() {
  return (
    <>
      <path d="M25 28h30v34a4 4 0 0 1-4 4H29a4 4 0 0 1-4-4Z" fill="#7a4a1e" />
      <ellipse cx="40" cy="28" rx="15" ry="4" fill="#96602c" />
      <path d="M23 22h34v6H23Z" fill="#c9922f" />
      <rect x="28" y="38" width="24" height="16" rx="2" fill="#f0c14b" />
      <path d="M32 43h16v2.5H32Zm0 4.5h10v2h-10Z" fill="#7a4a1e" />
      {/* a spoonful of powder */}
      <ellipse cx="60" cy="58" rx="9" ry="5" fill="#5e3714" />
      <ellipse cx="60" cy="56" rx="8" ry="4" fill="#7a4a1e" />
      <ellipse cx="40" cy="69" rx="22" ry="3" fill={SHADOW} />
    </>
  )
}

function Deodorant() {
  return (
    <>
      {/* rollerball dome */}
      <path d="M31 20a9 9 0 0 1 18 0v6H31Z" fill="#f2f5f8" />
      <ellipse cx="40" cy="20" rx="7" ry="6" fill="#dbe3ea" />
      <path d="M29 26h22v34a5 5 0 0 1-5 5H34a5 5 0 0 1-5-5Z" fill="#1657a0" />
      <rect x="32" y="36" width="16" height="16" rx="2" fill="#f2f5f8" />
      <path d="M35 41h10v2.5H35Zm0 4.5h7v2h-7Z" fill="#1657a0" />
      <ellipse cx="40" cy="68" rx="18" ry="3" fill={SHADOW} />
    </>
  )
}

function ColaBottle() {
  return (
    <>
      {/* contour bottle */}
      <path
        d="M34 14h12v6l3 6c0 4-3 5-3 9s3 5 3 9v18a6 6 0 0 1-6 6h-6a6 6 0 0 1-6-6V44c0-4 3-5 3-9s-3-5-3-9l3-6Z"
        fill="#7a1c14"
      />
      <path d="M34 14h12v5H34Z" fill="#b8332e" />
      <path d="M33 10h14v5H33Z" fill="#c9c9c9" />
      <rect x="30" y="42" width="20" height="13" rx="2" fill="#d8332c" />
      <path d="M33 47h14v2.5H33Z" fill="#f7f2e2" />
      {/* highlight */}
      <path
        d="M36 26v34"
        stroke="#fff"
        strokeWidth="2"
        strokeOpacity="0.22"
        strokeLinecap="round"
      />
      <ellipse cx="40" cy="70" rx="16" ry="3" fill={SHADOW} />
    </>
  )
}

function OilBottle() {
  return (
    <>
      <path d="M35 12h10v7l6 7v34a6 6 0 0 1-6 6H35a6 6 0 0 1-6-6V26l6-7Z" fill="#f2b21c" />
      <path d="M34 10h12v4H34Z" fill="#c9401f" />
      <path d="M29 34h22v22H29Z" fill="#f7d97a" opacity="0.55" />
      <rect x="30" y="38" width="20" height="15" rx="2" fill="#c9401f" />
      <path d="M33 43h14v2.5H33Zm0 4.5h9v2h-9Z" fill="#f7f2e2" />
      <path
        d="M33 24v32"
        stroke="#fff"
        strokeWidth="2"
        strokeOpacity="0.28"
        strokeLinecap="round"
      />
      <ellipse cx="40" cy="70" rx="17" ry="3" fill={SHADOW} />
    </>
  )
}

/* -- Generic forms, for products without a named illustration ------------- */

function Sachet() {
  return (
    <>
      <path d="M22 24h36v32a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4Z" fill="#5b8f6a" />
      <path d="M22 22h36v3H22Zm0 36h36v3H22Z" fill="#3f6f4e" />
      <rect x="29" y="34" width="22" height="14" rx="2" fill="#f2f5f0" />
      <path d="M33 39h14v2.5H33Z" fill="#5b8f6a" />
      <ellipse cx="40" cy="65" rx="20" ry="3" fill={SHADOW} />
    </>
  )
}

function Carton() {
  return (
    <>
      <path d="M18 30h44v30a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4Z" fill="#c08a52" />
      <path d="M18 30 26 20h28l8 10Z" fill="#d6a06a" />
      <path d="M40 20v10" stroke="#a5713f" strokeWidth="1.6" />
      <rect x="30" y="40" width="20" height="12" rx="2" fill="#8a5b31" opacity="0.5" />
      <ellipse cx="40" cy="67" rx="24" ry="3" fill={SHADOW} />
    </>
  )
}

/* ------------------------------------------------------------------------ */

const FORMS = {
  milk: MilkTin,
  rice: RiceBag,
  noodles: NoodlePack,
  cement: CementBag,
  chocolate: ChocolateTin,
  deodorant: Deodorant,
  cola: ColaBottle,
  oil: OilBottle,
  sachet: Sachet,
  carton: Carton,
} as const

export type ProductForm = keyof typeof FORMS

/**
 * Which illustration a product gets.
 *
 * Matched on keywords rather than on an id, so a seller adding "Peak Milk 900g"
 * or "Three Crowns Milk" tomorrow gets the milk tin without anyone maintaining
 * a lookup table. Order matters: the most specific term wins.
 */
const KEYWORDS: [RegExp, ProductForm][] = [
  [/\bmilk\b|\bmilo\b|dairy/i, 'milk'],
  [/\brice\b|semovita|wheat meal|spaghetti|garri/i, 'rice'],
  [/noodle|indomie|pasta/i, 'noodles'],
  [/cement|mortar|plaster/i, 'cement'],
  [/bournvita|chocolate|cocoa|ovaltine/i, 'chocolate'],
  [/deodorant|roll-?on|lotion|cream|nivea/i, 'deodorant'],
  [/cola|soda|soft drink|malt|juice|water\b/i, 'cola'],
  [/\boil\b|mamador|groundnut oil/i, 'oil'],
  [/sugar|salt|detergent|ariel|omo|sachet|powder/i, 'sachet'],
]

const BY_CATEGORY: Record<string, ProductForm> = {
  groceries: 'carton',
  beverages: 'cola',
  'building-materials': 'cement',
  pharmacy: 'sachet',
  electronics: 'carton',
  'home-kitchen': 'carton',
  'personal-care': 'deodorant',
  'agro-inputs': 'cement',
}

export function resolveProductForm(name: string, categorySlug?: string | null): ProductForm | null {
  for (const [pattern, form] of KEYWORDS) {
    if (pattern.test(name)) return form
  }
  if (categorySlug && BY_CATEGORY[categorySlug]) return BY_CATEGORY[categorySlug]
  return null
}

export function ProductArt({
  name,
  categorySlug,
  size = 64,
}: {
  name: string
  categorySlug?: string | null
  size?: number
}) {
  const form = resolveProductForm(name, categorySlug)
  if (!form) return null
  const Art = FORMS[form]
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <Art />
    </svg>
  )
}
