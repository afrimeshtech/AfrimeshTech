import { getSql } from '@/db/client'

/** MODULE: favourites - "Saved favourites" from the PRD Consumer Module. */

export async function toggleFavouriteProduct(userId: string, productId: string): Promise<boolean> {
  const sql = await getSql()
  const existing = await sql.one<{ product_id: string }>(
    `SELECT product_id FROM favourites WHERE user_id = $1 AND product_id = $2`,
    [userId, productId],
  )
  if (existing) {
    await sql.query(`DELETE FROM favourites WHERE user_id = $1 AND product_id = $2`, [
      userId,
      productId,
    ])
    return false
  }
  await sql.query(`INSERT INTO favourites (user_id, product_id) VALUES ($1,$2)`, [
    userId,
    productId,
  ])
  return true
}

export async function toggleFavouriteSeller(userId: string, orgId: string): Promise<boolean> {
  const sql = await getSql()
  const existing = await sql.one<{ organisation_id: string }>(
    `SELECT organisation_id FROM favourites WHERE user_id = $1 AND organisation_id = $2`,
    [userId, orgId],
  )
  if (existing) {
    await sql.query(`DELETE FROM favourites WHERE user_id = $1 AND organisation_id = $2`, [
      userId,
      orgId,
    ])
    return false
  }
  await sql.query(`INSERT INTO favourites (user_id, organisation_id) VALUES ($1,$2)`, [
    userId,
    orgId,
  ])
  return true
}

export async function favouriteProductIds(userId: string): Promise<Set<string>> {
  const sql = await getSql()
  const rows = await sql.query<{ product_id: string }>(
    `SELECT product_id FROM favourites WHERE user_id = $1 AND product_id IS NOT NULL`,
    [userId],
  )
  return new Set(rows.map((r) => r.product_id))
}

export async function listFavourites(userId: string) {
  const sql = await getSql()
  const products = await sql.query<{
    id: string
    name: string
    slug: string
    image_url: string | null
    category_name: string | null
  }>(
    `SELECT p.id, p.name, p.slug, p.image_url, c.name AS category_name
       FROM favourites f
       JOIN products p ON p.id = f.product_id
       LEFT JOIN categories c ON c.id = p.category_id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC`,
    [userId],
  )

  const sellers = await sql.query<{
    id: string
    name: string
    slug: string
    logo_url: string | null
    city: string | null
    rating: number
    rating_count: number
  }>(
    `SELECT o.id, o.name, o.slug, o.logo_url, o.city, o.rating, o.rating_count
       FROM favourites f
       JOIN organisations o ON o.id = f.organisation_id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC`,
    [userId],
  )

  return { products, sellers }
}
