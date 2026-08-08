import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { KNOWN_AREAS, describeArea, nearestArea } from './areas.ts'
import { bearingDegrees, cellDegrees, compassPoint, haversineKm, KM_PER_DEGREE } from './geo.ts'

/**
 * Naming a place, and the grid the territory analytics aggregate into. Both
 * are read by people making stocking decisions, so "roughly right" is not the
 * bar — a hotspot labelled with the wrong neighbourhood sends stock to the
 * wrong shop.
 */

const IKEJA = KNOWN_AREAS[0]
const YABA = KNOWN_AREAS[1]

describe('naming a location', () => {
  test('a point inside an area is simply that area', () => {
    assert.equal(describeArea(IKEJA), 'Ikeja, Lagos')
  })

  test('a point a short walk away is still that area', () => {
    // ~1.1 km north: close enough that qualifying it would be noise.
    assert.equal(describeArea({ lat: IKEJA.lat + 0.01, lng: IKEJA.lng }), 'Ikeja, Lagos')
  })

  test('a point well outside is described by direction and distance', () => {
    const described = describeArea({ lat: IKEJA.lat + 0.09, lng: IKEJA.lng })
    assert.match(described, /^\d+ km N of Ikeja, Lagos$/)
  })

  test('the direction is stated from the area towards the point', () => {
    // Against a single-area table, so this tests the bearing rather than which
    // of the real, tightly-packed Lagos suburbs happens to win. Lagos areas
    // sit within a few kilometres of each other - a point 10 km south of Ikeja
    // is genuinely nearer Yaba, and saying so is the correct answer.
    const only = [IKEJA]
    assert.match(describeArea({ lat: IKEJA.lat, lng: IKEJA.lng + 0.09 }, only), /km E of Ikeja/)
    assert.match(describeArea({ lat: IKEJA.lat - 0.09, lng: IKEJA.lng }, only), /km S of Ikeja/)
  })

  test('a point is named after whichever area is closest, not the first listed', () => {
    // Between Ikeja and Yaba, nearer Yaba.
    const between = { lat: YABA.lat + 0.01, lng: YABA.lng }
    assert.match(describeArea(between), /Yaba, Lagos$/)
  })

  test('a point far from anything known falls back to coordinates', () => {
    // Mid-Atlantic: naming the nearest Nigerian suburb would be absurd.
    assert.equal(describeArea({ lat: 0, lng: -20 }), '0.00°N, 20.00°W')
  })

  test('the nearest area is genuinely the nearest', () => {
    const near = nearestArea({ lat: YABA.lat + 0.005, lng: YABA.lng })
    assert.equal(near?.area.label, 'Yaba, Lagos')
    assert.ok(near!.distanceKm < 1)
  })

  test('every known area names itself', () => {
    // Guards against a typo in the table putting an area nearer a neighbour
    // than itself, which would silently mislabel a whole city.
    for (const area of KNOWN_AREAS) {
      assert.equal(describeArea(area), area.label)
    }
  })
})

describe('bearings', () => {
  test('due north is 0 degrees and due east is 90', () => {
    assert.equal(Math.round(bearingDegrees(IKEJA, { lat: IKEJA.lat + 1, lng: IKEJA.lng })), 0)
    assert.equal(Math.round(bearingDegrees(IKEJA, { lat: IKEJA.lat, lng: IKEJA.lng + 1 })), 90)
  })

  test('a bearing is always within a full turn', () => {
    for (const area of KNOWN_AREAS) {
      const bearing = bearingDegrees(IKEJA, area)
      assert.ok(bearing >= 0 && bearing < 360, `${area.label} gave ${bearing}`)
    }
  })

  test('compass points read as a person would say them', () => {
    assert.equal(compassPoint(IKEJA, { lat: IKEJA.lat + 1, lng: IKEJA.lng }), 'N')
    assert.equal(compassPoint(IKEJA, { lat: IKEJA.lat + 1, lng: IKEJA.lng + 1 }), 'NE')
    assert.equal(compassPoint(IKEJA, { lat: IKEJA.lat - 1, lng: IKEJA.lng }), 'S')
  })
})

describe('the aggregation grid', () => {
  test('a cell is the size it claims to be', () => {
    const km = 2
    const degrees = cellDegrees(km)
    const south = { lat: 6.5, lng: 3.35 }
    const north = { lat: south.lat + degrees, lng: south.lng }
    assert.ok(Math.abs(haversineKm(south, north) - km) < 0.05)
  })

  test('cells scale linearly, so a coarser grid is a whole multiple', () => {
    assert.ok(Math.abs(cellDegrees(10) - cellDegrees(1) * 10) < 1e-12)
  })

  test('a degree of latitude is the distance the grid assumes', () => {
    const measured = haversineKm({ lat: 6, lng: 3 }, { lat: 7, lng: 3 })
    assert.ok(Math.abs(measured - KM_PER_DEGREE) < 0.5, `measured ${measured} km`)
  })

  test('points within one cell share a cell index', () => {
    // This is what makes a cell's identity a plain function of its position,
    // with no lookup table and no state. Measured from a cell boundary, since
    // an arbitrary point plus 0.4 of a cell may legitimately cross into the
    // next one — the grid is absolute, not relative to whoever asks first.
    const degrees = cellDegrees(5)
    const index = (value: number) => Math.floor(value / degrees)
    const base = Math.floor(6.6018 / degrees) * degrees

    assert.equal(index(base), index(base + degrees * 0.4))
    assert.equal(index(base), index(base + degrees * 0.99))
    assert.notEqual(index(base), index(base + degrees * 1.01))
  })
})
