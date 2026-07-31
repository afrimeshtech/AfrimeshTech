'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { currentUser, currentOrganisation } from '@/lib/auth'
import { toMinor } from '@/lib/money'
import { parseForm, z, uuid, requiredText, optionalText, quantity, nairaAmount } from '@/lib/forms'
import {
  createProduct,
  findOrCreateBrand,
  getProductByBarcode,
  findSimilarProducts,
} from '@/modules/catalog/service'
import { upsertStock } from '@/modules/inventory/service'
import { storeImage, UploadError } from '@/modules/storage/service'

export interface NewProductState {
  error?: string
  notice?: string
  /** Near-matches shown as a warning before a duplicate is created. */
  similar?: { id: string; name: string; slug: string; pack_size: string | null }[]
}

const schema = z.object({
  name: requiredText('Product name', 160),
  categoryId: uuid('category'),
  brand: optionalText(80),
  packSize: optionalText(40),
  unitOfMeasure: requiredText('Unit', 30).catch('unit'),
  gtin: z
    .string()
    .trim()
    .regex(/^\d{8,14}$/, { message: 'A barcode is 8 to 14 digits.' })
    .optional()
    .or(z.literal('').transform(() => undefined)),
  qty: quantity('Quantity', 0),
  price: nairaAmount('Price', 1),
  minOrderQty: quantity('Minimum order', 1).default(1),
  reorderLevel: quantity('Reorder level', 0).default(5),
  /** Set once the seller has seen the duplicate warning and chosen to proceed. */
  confirmed: z.literal('yes').optional(),
})

/**
 * Create a catalogue product and list it in one step.
 *
 * A shop cannot sell what the catalogue does not have, so sellers must be able
 * to add entries. But the master catalogue is a shared single source of truth
 * (Inventory doc §1) and stops being useful the moment it fills with five
 * copies of the same tin of milk. Two guards, in order of strength:
 *
 *  1. Barcode. If the GTIN already exists, the existing product is reused
 *     outright - that is an exact identity match, not a guess.
 *  2. Name similarity. Near-matches are shown once as a warning; the seller
 *     can look, and then proceed deliberately if theirs really is different.
 */
export async function createAndListProductAction(
  _prev: NewProductState,
  formData: FormData,
): Promise<NewProductState> {
  const user = await currentUser()
  if (!user) redirect('/login?next=/partner/catalogue')

  const org = await currentOrganisation()
  if (!org) redirect('/onboarding')
  if (org.verification !== 'verified') {
    return { error: 'Your business must be verified before you can add products to the catalogue.' }
  }

  const parsed = parseForm(schema, formData)
  if (!parsed.ok) return { error: parsed.error }
  const input = parsed.data

  // Barcode is an exact identity: reuse rather than duplicate.
  let productId: string | null = null
  if (input.gtin) {
    const existing = await getProductByBarcode(input.gtin)
    if (existing) productId = existing.id
  }

  if (!productId && !input.confirmed) {
    const similar = await findSimilarProducts(input.name)
    if (similar.length) {
      return {
        error:
          'These look like the same product. Listing an existing entry keeps price comparison working for buyers.',
        similar,
      }
    }
  }

  // A photo of the pack and the maker's logo are both accepted, and either
  // one is enough. The photo identifies the product better, so it wins where
  // both are given; the logo becomes the brand's mark and the fallback.
  let imageUrl: string | null = null
  let brandLogoUrl: string | null = null

  for (const [field, target] of [
    ['image', 'products'],
    ['brandImage', 'logos'],
  ] as const) {
    const file = formData.get(field)
    if (!(file instanceof File) || file.size === 0) continue
    try {
      const stored = await storeImage(file, target)
      if (field === 'image') imageUrl = stored.url
      else brandLogoUrl = stored.url
    } catch (err) {
      if (err instanceof UploadError) return { error: err.message }
      console.error('[catalogue] image upload failed', err)
      return { error: 'We could not save that image. Try again, or add the product without one.' }
    }
  }

  if (!input.brand && brandLogoUrl) {
    return { error: 'Enter the brand name so we know which company that logo belongs to.' }
  }

  try {
    if (!productId) {
      const brandId = input.brand ? await findOrCreateBrand(input.brand, brandLogoUrl) : null
      const product = await createProduct({
        name: input.name,
        gtin: input.gtin ?? null,
        brandId,
        categoryId: input.categoryId,
        unitOfMeasure: input.unitOfMeasure,
        packSize: input.packSize,
        imageUrl,
        actorUserId: user.id,
        description: [input.brand, input.name, input.packSize && `Sold in ${input.packSize}.`]
          .filter(Boolean)
          .join(' '),
      })
      productId = product.id
    } else if (input.brand && brandLogoUrl) {
      // The product already existed, but the seller supplied a brand mark the
      // catalogue was missing. Worth keeping.
      await findOrCreateBrand(input.brand, brandLogoUrl)
    }

    // Outlets price for consumers; every other tier supplies businesses.
    const isRetail = org.type === 'outlet'
    await upsertStock({
      organisationId: org.id,
      productId,
      qty: input.qty,
      retailPrice: isRetail ? toMinor(input.price) : null,
      wholesalePrice: isRetail ? null : toMinor(input.price),
      minOrderQty: input.minOrderQty,
      reorderLevel: input.reorderLevel,
      actorUserId: user.id,
      note: 'Added from the catalogue',
    })
  } catch (err) {
    console.error('[catalogue] create failed', err)
    return { error: 'We could not add that product. Please try again.' }
  }

  revalidatePath('/partner/catalogue')
  revalidatePath('/partner/inventory')
  revalidatePath('/admin/products')
  revalidatePath('/', 'layout')

  const withImagery = imageUrl
    ? ' with its photo'
    : brandLogoUrl
      ? ` with the ${input.brand} logo`
      : ''

  return {
    notice: `${input.name} is in your inventory${withImagery} and live to buyers nearby.`,
  }
}
