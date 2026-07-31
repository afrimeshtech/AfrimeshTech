import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  toMinor,
  toMajor,
  formatMoney,
  formatMoneyCompact,
  platformFee,
  cashbackFor,
} from './money.ts'

describe('money', () => {
  test('converts between major and minor units without float drift', () => {
    assert.equal(toMinor(1500.5), 150050)
    assert.equal(toMinor(0.1), 10)
    // 8.2 * 100 is 819.9999... in binary floating point; rounding is required.
    assert.equal(toMinor(8.2), 820)
    assert.equal(toMajor(150050), 1500.5)
  })

  test('round-trips every kobo value exactly', () => {
    for (let kobo = 0; kobo < 1000; kobo++) {
      assert.equal(toMinor(toMajor(kobo)), kobo, `failed at ${kobo}`)
    }
  })

  test('formats naira with a symbol, and hides kobo when it is zero', () => {
    assert.equal(formatMoney(150000), '₦1,500')
    assert.equal(formatMoney(150050), '₦1,500.50')
    assert.equal(formatMoney(0), '₦0')
  })

  test('renders a dash rather than ₦0 for an absent price', () => {
    // An unpriced listing and a free item are different things, and the UI
    // must not claim the second when it means the first.
    assert.equal(formatMoney(null), '—')
    assert.equal(formatMoney(undefined), '—')
  })

  test('compacts large figures for dashboard tiles', () => {
    // Expressed via toMinor so the naira value being asserted is unambiguous.
    assert.equal(formatMoneyCompact(toMinor(450)), '₦450')
    assert.equal(formatMoneyCompact(toMinor(124_000)), '₦124k')
    assert.equal(formatMoneyCompact(toMinor(2_500_000)), '₦2.5m')
  })

  test('compacting never loses the order of magnitude', () => {
    assert.equal(formatMoneyCompact(toMinor(999)), '₦999')
    assert.equal(formatMoneyCompact(toMinor(1_000)), '₦1k')
    assert.equal(formatMoneyCompact(toMinor(999_999)), '₦1000k')
    assert.equal(formatMoneyCompact(toMinor(1_000_000)), '₦1.0m')
  })

  describe('platform fee', () => {
    test('applies the configured basis points', () => {
      // Default 150 bps = 1.5%
      assert.equal(platformFee(1_000_000), 15_000)
    })

    test('always returns a whole number of kobo', () => {
      for (const subtotal of [1, 7, 33, 101, 999, 12_345]) {
        assert.ok(Number.isInteger(platformFee(subtotal)), `not an integer for ${subtotal}`)
      }
    })

    test('never exceeds the subtotal', () => {
      for (const subtotal of [0, 1, 100, 10_000_000]) {
        assert.ok(platformFee(subtotal) <= subtotal)
      }
    })
  })

  describe('cashback', () => {
    test('is a fraction of the goods value', () => {
      // Default 50 bps = 0.5%
      assert.equal(cashbackFor(1_000_000), 5_000)
    })

    test('is capped at the commission rate so a reward never exceeds its funding', () => {
      // This is the invariant that stops a misconfigured CASHBACK_BPS from
      // making every order lose money.
      const previous = process.env.CASHBACK_BPS
      process.env.CASHBACK_BPS = '9000' // absurdly generous, 90%
      try {
        const subtotal = 1_000_000
        assert.ok(
          cashbackFor(subtotal) <= platformFee(subtotal),
          'cashback exceeded the commission that funds it',
        )
      } finally {
        if (previous === undefined) delete process.env.CASHBACK_BPS
        else process.env.CASHBACK_BPS = previous
      }
    })

    test('is zero for a zero-value order', () => {
      assert.equal(cashbackFor(0), 0)
    })
  })
})
