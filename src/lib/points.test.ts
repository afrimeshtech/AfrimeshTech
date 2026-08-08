import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_REFERRAL_POINTS,
  MIN_REDEEMABLE_POINTS,
  POINTS_CURRENCY,
  POINT_VALUE_MINOR,
  PROGRAMMES,
  formatPoints,
  pointsToMinor,
  programmeForRole,
  redeemablePoints,
} from './points.ts'
import { DEFAULT_CURRENCY } from './money.ts'

/**
 * The referral programme's arithmetic. These are the rules that decide what
 * the platform owes someone, so each one is pinned here rather than left to be
 * re-derived by whoever next touches the rewards module.
 */

describe('points are a separate unit of account', () => {
  test('points do not share a currency code with money', () => {
    // If these ever collided, a points wallet and a naira wallet would be the
    // same row - the UNIQUE key on wallets is (owner, currency).
    assert.notEqual(POINTS_CURRENCY, DEFAULT_CURRENCY)
  })
})

describe('conversion to cash', () => {
  test('a point converts at the configured rate', () => {
    assert.equal(pointsToMinor(500), 500 * POINT_VALUE_MINOR)
  })

  test('conversion never invents value from a fraction of a point', () => {
    // Floor, not round: rounding up half a point would credit money that was
    // never earned, once per redemption, forever.
    assert.equal(pointsToMinor(10.9), pointsToMinor(10))
  })

  test('zero points are worth nothing', () => {
    assert.equal(pointsToMinor(0), 0)
  })

  test('the result is always a whole number of minor units', () => {
    for (const points of [1, 7, 133, 9_999]) {
      assert.ok(Number.isInteger(pointsToMinor(points)), `${points} produced a fractional amount`)
    }
  })
})

describe('the redemption floor', () => {
  test('a balance below the floor is not redeemable at all', () => {
    assert.equal(redeemablePoints(MIN_REDEEMABLE_POINTS - 1), 0)
  })

  test('a balance at the floor is redeemable in full', () => {
    assert.equal(redeemablePoints(MIN_REDEEMABLE_POINTS), MIN_REDEEMABLE_POINTS)
  })
})

describe('which programme a member earns under', () => {
  test('each business tier refers its own kind', () => {
    assert.equal(programmeForRole('outlet'), 'outlet')
    assert.equal(programmeForRole('merchant'), 'merchant')
    assert.equal(programmeForRole('warehouse'), 'warehouse')
  })

  test('roles with no supply tier of their own refer as shoppers', () => {
    for (const role of ['consumer', 'delivery_partner', 'platform_admin', 'auditor', 'nonsense']) {
      assert.equal(programmeForRole(role), 'consumer', `${role} should refer as a consumer`)
    }
  })
})

describe('the award ladder', () => {
  test('every programme has a default award', () => {
    for (const programme of PROGRAMMES) {
      assert.ok(DEFAULT_REFERRAL_POINTS[programme] > 0, `${programme} has no default award`)
    }
  })

  test('awards rise with the order value the tier introduces', () => {
    assert.ok(DEFAULT_REFERRAL_POINTS.consumer < DEFAULT_REFERRAL_POINTS.outlet)
    assert.ok(DEFAULT_REFERRAL_POINTS.outlet < DEFAULT_REFERRAL_POINTS.merchant)
    assert.ok(DEFAULT_REFERRAL_POINTS.merchant <= DEFAULT_REFERRAL_POINTS.warehouse)
  })

  test('every award is worth converting on its own', () => {
    // An award smaller than the redemption floor would be unreachable for a
    // member who only ever refers one person.
    for (const programme of PROGRAMMES) {
      assert.ok(
        DEFAULT_REFERRAL_POINTS[programme] >= MIN_REDEEMABLE_POINTS,
        `a single ${programme} referral cannot be converted`,
      )
    }
  })
})

describe('formatting', () => {
  test('points read as points, never as money', () => {
    assert.equal(formatPoints(1250), '1,250 pts')
  })

  test('a missing balance is shown as a dash rather than zero', () => {
    assert.equal(formatPoints(null), '—')
    assert.equal(formatPoints(undefined), '—')
  })
})
