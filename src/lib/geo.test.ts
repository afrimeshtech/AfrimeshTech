import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  haversineKm,
  estimateEtaMinutes,
  formatDistance,
  formatEta,
  distanceKmSqlOn,
} from './geo.ts'

const IKEJA = { lat: 6.6018, lng: 3.3515 }
const YABA = { lat: 6.5095, lng: 3.3711 }
const KANO = { lat: 12.0022, lng: 8.5236 }

describe('haversine distance', () => {
  test('is zero for the same point', () => {
    assert.equal(haversineKm(IKEJA, IKEJA), 0)
  })

  test('matches a known short urban distance', () => {
    // Ikeja to Yaba is roughly 10.5 km as the crow flies.
    const km = haversineKm(IKEJA, YABA)
    assert.ok(km > 10 && km < 11, `expected ~10.5 km, got ${km}`)
  })

  test('matches a known long-haul distance', () => {
    // Lagos to Kano is roughly 825 km.
    const km = haversineKm(IKEJA, KANO)
    assert.ok(km > 800 && km < 850, `expected ~825 km, got ${km}`)
  })

  test('is symmetric', () => {
    assert.equal(haversineKm(IKEJA, KANO).toFixed(6), haversineKm(KANO, IKEJA).toFixed(6))
  })

  test('satisfies the triangle inequality', () => {
    const direct = haversineKm(IKEJA, KANO)
    const viaYaba = haversineKm(IKEJA, YABA) + haversineKm(YABA, KANO)
    assert.ok(viaYaba >= direct - 1e-9, 'detour was shorter than the direct route')
  })
})

describe('delivery estimates', () => {
  test('includes the dispatch overhead even at zero distance', () => {
    // A shop next door still has to pick and pack.
    assert.equal(estimateEtaMinutes(0, 30), 30)
  })

  test('grows with distance', () => {
    const near = estimateEtaMinutes(1, 20)
    const far = estimateEtaMinutes(15, 20)
    assert.ok(far > near, 'a longer trip was not estimated as slower')
  })

  test('returns whole minutes', () => {
    for (const km of [0.3, 1.7, 9.9, 44.4]) {
      assert.ok(Number.isInteger(estimateEtaMinutes(km)), `not an integer for ${km} km`)
    }
  })
})

describe('formatting', () => {
  test('shows metres under a kilometre and kilometres above', () => {
    assert.equal(formatDistance(0.4), '400 m')
    assert.equal(formatDistance(1), '1.0 km')
    assert.equal(formatDistance(12.34), '12.3 km')
  })

  test('shows hours once past sixty minutes', () => {
    assert.equal(formatEta(45), '45 min')
    assert.equal(formatEta(60), '1h')
    assert.equal(formatEta(135), '2h 15m')
  })

  test('renders a dash for unknown values rather than "0"', () => {
    assert.equal(formatDistance(null), '—')
    assert.equal(formatEta(undefined), '—')
  })
})

describe('SQL distance expression', () => {
  test('references the supplied column expressions and parameters', () => {
    const sql = distanceKmSqlOn('d.pickup_lat', 'd.pickup_lng', '$1', '$2')
    assert.ok(sql.includes('d.pickup_lat'))
    assert.ok(sql.includes('d.pickup_lng'))
    assert.ok(sql.includes('$1') && sql.includes('$2'))
    // Guards against a column name leaking in from the generic helper.
    assert.ok(!sql.includes('.lat -') || sql.includes('d.pickup_lat -'))
  })
})
