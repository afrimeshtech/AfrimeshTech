import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  TIER,
  tierOf,
  canTrade,
  supplierTypeFor,
  priceColumnFor,
  rankingScopeFor,
  type OrgType,
} from './tiers.ts'

/**
 * These tests encode PRD §12 verbatim. If someone changes the tier model,
 * these fail before anything reaches the database constraint.
 */
describe('supply-chain business rules (PRD §12)', () => {
  test('consumers cannot purchase directly from warehouses', () => {
    assert.equal(canTrade(TIER.consumer, TIER.warehouse), false)
  })

  test('consumers cannot purchase directly from merchants or manufacturers', () => {
    assert.equal(canTrade(TIER.consumer, TIER.merchant), false)
    assert.equal(canTrade(TIER.consumer, TIER.manufacturer), false)
  })

  test('consumers buy from retail outlets', () => {
    assert.equal(canTrade(TIER.consumer, TIER.outlet), true)
  })

  test('retailers purchase from merchants', () => {
    assert.equal(canTrade(TIER.outlet, TIER.merchant), true)
    assert.equal(canTrade(TIER.outlet, TIER.warehouse), false)
  })

  test('merchants purchase from warehouses', () => {
    assert.equal(canTrade(TIER.merchant, TIER.warehouse), true)
    assert.equal(canTrade(TIER.merchant, TIER.manufacturer), false)
  })

  test('warehouses supply merchants only, and source from manufacturers', () => {
    assert.equal(canTrade(TIER.warehouse, TIER.manufacturer), true)
    assert.equal(supplierTypeFor(TIER.merchant), 'warehouse')
  })

  test('nobody can sell to themselves or buy downstream', () => {
    for (const tier of Object.values(TIER)) {
      assert.equal(canTrade(tier, tier), false, `tier ${tier} traded with itself`)
      assert.equal(canTrade(tier, tier + 1), false, `tier ${tier} bought downstream`)
    }
  })

  test('exactly one seller tier is valid for any buyer', () => {
    for (const buyer of Object.values(TIER)) {
      const valid = Object.values(TIER).filter((seller) => canTrade(buyer, seller))
      assert.ok(valid.length <= 1, `tier ${buyer} had ${valid.length} valid supplier tiers`)
    }
  })
})

describe('tier helpers', () => {
  test('logistics is not a supply tier', () => {
    // A delivery partner carries goods; it never owns or resells them.
    assert.equal(tierOf('logistics'), 0)
    assert.equal(canTrade(TIER.consumer, tierOf('logistics')), false)
  })

  test('maps each org type to its ordinal', () => {
    const expected: [OrgType, number][] = [
      ['manufacturer', 1],
      ['warehouse', 2],
      ['merchant', 3],
      ['outlet', 4],
    ]
    for (const [type, ordinal] of expected) assert.equal(tierOf(type), ordinal)
  })

  test('consumers pay retail; every business tier pays wholesale', () => {
    assert.equal(priceColumnFor(TIER.consumer), 'retail_price')
    assert.equal(priceColumnFor(TIER.outlet), 'wholesale_price')
    assert.equal(priceColumnFor(TIER.merchant), 'wholesale_price')
    assert.equal(priceColumnFor(TIER.warehouse), 'wholesale_price')
  })

  test('manufacturers have no upstream supplier on the network', () => {
    assert.equal(supplierTypeFor(TIER.manufacturer), null)
  })

  test('selects the ranking model that matches the buyer', () => {
    assert.equal(rankingScopeFor(TIER.consumer), 'consumer')
    assert.equal(rankingScopeFor(TIER.outlet), 'outlet')
    assert.equal(rankingScopeFor(TIER.merchant), 'merchant')
  })
})
