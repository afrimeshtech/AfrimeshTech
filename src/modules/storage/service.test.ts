import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { validateImage, UploadError, MAX_IMAGE_BYTES } from './service.ts'

/** Minimal valid file headers, so the sniffer has real bytes to read. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64),
])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)])
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.alloc(4),
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(64),
])

function asFile(body: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(body)], name, { type })
}

describe('image upload validation', () => {
  test('accepts PNG, JPEG and WebP', async () => {
    for (const [body, type] of [
      [PNG, 'image/png'],
      [JPEG, 'image/jpeg'],
      [WEBP, 'image/webp'],
    ] as const) {
      const result = await validateImage(asFile(body, 'photo', type))
      assert.equal(result.contentType, type)
    }
  })

  test('goes by the bytes, not the declared type', async () => {
    // A text file renamed to .png and sent as image/png must be refused.
    const fake = asFile(Buffer.from('#!/bin/sh\nrm -rf /'), 'photo.png', 'image/png')
    await assert.rejects(() => validateImage(fake), UploadError)
  })

  test('rejects SVG, which can carry script', async () => {
    // Serving a user-uploaded SVG from our origin would be stored XSS.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
    await assert.rejects(() => validateImage(asFile(svg, 'logo.svg', 'image/svg+xml')), UploadError)
  })

  test('rejects an empty file', async () => {
    await assert.rejects(
      () => validateImage(asFile(Buffer.alloc(0), 'empty.png', 'image/png')),
      UploadError,
    )
  })

  test('rejects anything over the size limit', async () => {
    const huge = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES + 1)])
    await assert.rejects(() => validateImage(asFile(huge, 'huge.png', 'image/png')), UploadError)
  })

  test('states the actual size in the error, so the person can act on it', async () => {
    const huge = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES + 1)])
    await assert.rejects(
      () => validateImage(asFile(huge, 'huge.png', 'image/png')),
      (err: Error) => err.message.includes('MB'),
    )
  })
})
