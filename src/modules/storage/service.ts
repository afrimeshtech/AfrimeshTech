import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * MODULE: storage
 *
 * "Object storage for images, invoices, and documents" - System Architecture
 * Document, Technology Stack.
 *
 * Same shape as the payment module: one interface, swappable drivers. A local
 * disk driver serves development; an S3-compatible driver is the production
 * swap and nothing that stores a file changes.
 *
 * The local driver writes into `public/uploads`, which Next serves statically.
 * That works for a single server and does not survive a serverless deploy or a
 * second instance - which is exactly why the interface exists.
 */

export type StorageScope = 'products' | 'logos' | 'proofs'

export interface StoredFile {
  /** Public URL the browser can load. */
  url: string
  /** Driver-internal key, for deletion. */
  key: string
  bytes: number
  contentType: string
}

export interface StorageDriver {
  readonly name: string
  put(input: {
    scope: StorageScope
    filename: string
    contentType: string
    body: Buffer
  }): Promise<StoredFile>
  remove(key: string): Promise<void>
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Raster formats only.
 *
 * SVG is deliberately excluded: it is a document format that can carry
 * `<script>`, and serving a user-uploaded SVG from our own origin would be a
 * stored XSS. (The seed generates SVGs, but those are ours, not uploads.)
 */
const ALLOWED: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

/** Extensions the driver can write, including server-generated assets. */
const EXTENSIONS: Record<string, string> = { ...ALLOWED, 'image/svg+xml': 'svg' }

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024 // 2 MB

export class UploadError extends Error {}

/** Magic-number check: the declared MIME type is attacker-controlled. */
function sniff(body: Buffer): string | null {
  if (body.length < 12) return null
  if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'image/jpeg'
  if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png'
  const riff = body.subarray(0, 4).toString('ascii')
  const webp = body.subarray(8, 12).toString('ascii')
  if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp'
  if (body.subarray(4, 12).toString('ascii').startsWith('ftyp')) return 'image/avif'
  return null
}

export async function validateImage(file: File): Promise<{ body: Buffer; contentType: string }> {
  if (!file || file.size === 0) throw new UploadError('Choose an image to upload.')
  if (file.size > MAX_IMAGE_BYTES) {
    throw new UploadError(
      `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`,
    )
  }

  const body = Buffer.from(await file.arrayBuffer())
  const actual = sniff(body)

  if (!actual || !ALLOWED[actual]) {
    throw new UploadError('That file is not a JPEG, PNG, WebP or AVIF image.')
  }
  // A file claiming to be a PNG while actually being something else is either
  // a broken client or an attempt; either way we go by the bytes.
  return { body, contentType: actual }
}

// ---------------------------------------------------------------------------
// Local disk driver
// ---------------------------------------------------------------------------

const PUBLIC_DIR = join(process.cwd(), 'public')
const UPLOAD_ROOT = 'uploads'

const localDriver: StorageDriver = {
  name: 'local',

  async put({ scope, contentType, body }) {
    const extension = EXTENSIONS[contentType] ?? 'bin'
    // Random name, never the client's filename: a supplied name can carry
    // path traversal, and it leaks whatever the uploader called the file.
    const key = `${UPLOAD_ROOT}/${scope}/${randomUUID()}.${extension}`
    const target = join(PUBLIC_DIR, key)

    await mkdir(join(PUBLIC_DIR, UPLOAD_ROOT, scope), { recursive: true })
    await writeFile(target, body)

    return { url: `/${key}`, key, bytes: body.length, contentType }
  },

  async remove(key) {
    if (!key.startsWith(`${UPLOAD_ROOT}/`)) return
    try {
      await unlink(join(PUBLIC_DIR, key))
    } catch {
      // Already gone; deletion is idempotent.
    }
  },
}

/*
 * The production driver plugs in here, e.g.:
 *
 *   const s3: StorageDriver = {
 *     name: 's3',
 *     async put({ scope, contentType, body }) {
 *       const key = `${scope}/${randomUUID()}.${ALLOWED[contentType]}`
 *       await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body,
 *         ContentType: contentType, CacheControl: 'public, max-age=31536000' }))
 *       return { url: `${process.env.CDN_BASE_URL}/${key}`, key, ... }
 *     },
 *     async remove(key) { ... },
 *   }
 *
 * Resizing and format conversion belong in that pipeline, not here - the local
 * driver stores what it is given, so the size limit above is the only guard.
 */

const DRIVERS: Record<string, StorageDriver> = { local: localDriver }

export function storage(): StorageDriver {
  return DRIVERS[process.env.STORAGE_DRIVER ?? 'local'] ?? localDriver
}

/** Store an uploaded image after validating it. */
export async function storeImage(file: File, scope: StorageScope): Promise<StoredFile> {
  const { body, contentType } = await validateImage(file)
  return storage().put({ scope, filename: file.name, contentType, body })
}

/**
 * Store an asset this server generated, bypassing upload validation.
 *
 * Only for content we produced ourselves - the seed's brand tiles. SVG is
 * refused from uploads because it can carry script; an SVG we wrote a moment
 * ago in this process is a different proposition.
 */
export async function storeGeneratedSvg(
  svg: string,
  scope: StorageScope,
  name: string,
): Promise<StoredFile> {
  return storage().put({
    scope,
    filename: `${name}.svg`,
    contentType: 'image/svg+xml',
    body: Buffer.from(svg, 'utf8'),
  })
}

/**
 * Remove a previously stored file, given its public URL. Used when an image is
 * replaced, so the old object does not linger and accumulate cost.
 */
export async function removeStoredUrl(url: string | null | undefined): Promise<void> {
  if (!url || !url.startsWith(`/${UPLOAD_ROOT}/`)) return
  await storage().remove(url.slice(1))
}
