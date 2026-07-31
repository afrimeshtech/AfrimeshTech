import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { parseForm, z, uuid, quantity, nairaAmount, internalPath, phone, stars } from './forms.ts'

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.append(key, value)
  return data
}

describe('parseForm', () => {
  const schema = z.object({ id: uuid('item'), qty: quantity('Quantity', 1) })

  test('accepts well-formed input', () => {
    const result = parseForm(schema, form({ id: crypto.randomUUID(), qty: '3' }))
    assert.equal(result.ok, true)
    if (result.ok) assert.equal(result.data.qty, 3)
  })

  test('rejects a missing field with a readable message', () => {
    const result = parseForm(schema, form({ qty: '3' }))
    assert.equal(result.ok, false)
    if (!result.ok) assert.ok(result.error.length > 0)
  })

  test('rejects an id that is not a uuid', () => {
    // Without this, a crafted value reaches the database as a cast error.
    const result = parseForm(schema, form({ id: "1 OR '1'='1", qty: '1' }))
    assert.equal(result.ok, false)
  })

  test('rejects a negative quantity', () => {
    const result = parseForm(schema, form({ id: crypto.randomUUID(), qty: '-5' }))
    assert.equal(result.ok, false)
  })

  test('rejects a fractional quantity', () => {
    const result = parseForm(schema, form({ id: crypto.randomUUID(), qty: '2.5' }))
    assert.equal(result.ok, false)
  })

  test('ignores unexpected extra fields rather than failing', () => {
    const result = parseForm(schema, form({ id: crypto.randomUUID(), qty: '1', junk: 'x' }))
    assert.equal(result.ok, true)
  })
})

describe('internalPath', () => {
  test('keeps a relative path', () => {
    assert.equal(internalPath.parse('/orders'), '/orders')
  })

  test('rejects an absolute URL, closing the open-redirect hole', () => {
    // ?next=https://evil.example must not survive to a redirect().
    assert.equal(internalPath.parse('https://evil.example'), '/')
    assert.equal(internalPath.parse('http://evil.example'), '/')
  })

  test('rejects a protocol-relative URL', () => {
    assert.equal(internalPath.parse('//evil.example'), '/')
  })

  test('falls back to the root when absent', () => {
    assert.equal(internalPath.parse(undefined), '/')
  })
})

describe('field schemas', () => {
  test('accepts the phone shapes Nigerians actually type', () => {
    for (const value of ['08030000001', '+2348030000001', '234 803 000 0001', '0803-000-0001']) {
      assert.doesNotThrow(() => phone.parse(value), `rejected ${value}`)
    }
  })

  test('rejects a phone number containing letters', () => {
    assert.throws(() => phone.parse('call-me'))
  })

  test('bounds a rating to one through five', () => {
    assert.equal(stars.parse('5'), 5)
    assert.throws(() => stars.parse('0'))
    assert.throws(() => stars.parse('6'))
  })

  test('rejects a money amount above the single-transaction limit', () => {
    assert.throws(() => nairaAmount('Amount').parse('999999999'))
  })

  test('rejects non-numeric money', () => {
    assert.throws(() => nairaAmount('Amount').parse('abc'))
  })
})
