import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { initialsOf, businessLogoSvg } from './placeholder.ts'

describe('initials', () => {
  test('takes the first letter of the first two words', () => {
    assert.equal(initialsOf('Grace Stores'), 'GS')
    assert.equal(initialsOf('Apapa Distribution Hub'), 'AD')
  })

  test('takes two letters from a single word', () => {
    assert.equal(initialsOf('Indomie'), 'IN')
  })

  test('skips pure numbers so a size does not become the initial', () => {
    // "Peak Milk Powder 400g" must not read as "P4".
    assert.equal(initialsOf('Peak Milk Powder 400g'), 'PM')
  })

  test('survives punctuation and never returns empty', () => {
    assert.equal(initialsOf('Coca-Cola 50cl (Pack of 12)'), 'CC')
    assert.equal(initialsOf('...'), '?')
    assert.equal(initialsOf(''), '?')
  })
})

describe('generated imagery', () => {
  test('is deterministic, so a business keeps its look across reseeds', () => {
    assert.equal(businessLogoSvg('Grace Stores'), businessLogoSvg('Grace Stores'))
  })

  test('differs between businesses', () => {
    assert.notEqual(businessLogoSvg('Grace Stores'), businessLogoSvg('Apapa Distribution Hub'))
  })

  test('produces valid, self-contained SVG', () => {
    const svg = businessLogoSvg('Grace Stores')
    assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'))
    assert.ok(svg.trimEnd().endsWith('</svg>'))
    // No external references: these render offline and cost no extra request.
    assert.ok(!svg.includes('http://') || svg.includes('www.w3.org'))
    assert.ok(!svg.includes('<image'))
  })

  test('escapes names so a crafted business name cannot inject markup', () => {
    const svg = businessLogoSvg('<script>alert(1)</script> Stores')
    assert.ok(!svg.includes('<script>'))
    assert.ok(svg.includes('&lt;script&gt;') || !svg.includes('alert(1)'))
  })

  test('carries an accessible label', () => {
    assert.ok(businessLogoSvg('Grace Stores').includes('aria-label="Grace Stores"'))
  })
})
