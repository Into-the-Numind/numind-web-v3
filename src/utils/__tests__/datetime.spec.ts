/**
 * Unit tests for src/utils/datetime.ts
 *
 * All formatting is in UTC+8 (Asia/Shanghai).
 *
 * Key edge cases:
 *  - null / undefined / empty → '—'
 *  - UTC midnight crosses into the next calendar day in UTC+8
 *  - Explicit +08:00 offset stays on the same calendar day
 */
import { describe, it, expect } from 'vitest'
import { formatDate, formatDateTime } from '../datetime'

describe('formatDate', () => {
  it('null returns em-dash', () => {
    expect(formatDate(null)).toBe('—')
  })

  it('undefined returns em-dash', () => {
    expect(formatDate(undefined)).toBe('—')
  })

  it('empty string returns em-dash', () => {
    expect(formatDate('')).toBe('—')
  })

  it('2026-05-15T16:00:00Z → 2026-05-16 (UTC+8 is next calendar day)', () => {
    // 2026-05-15 16:00 UTC = 2026-05-16 00:00 CST
    expect(formatDate('2026-05-15T16:00:00Z')).toBe('2026-05-16')
  })

  it('2026-05-15T00:00:00+08:00 → 2026-05-15 (same calendar day in UTC+8)', () => {
    expect(formatDate('2026-05-15T00:00:00+08:00')).toBe('2026-05-15')
  })

  it('2026-01-01T00:00:00+08:00 → 2026-01-01', () => {
    expect(formatDate('2026-01-01T00:00:00+08:00')).toBe('2026-01-01')
  })

  it('returns YYYY-MM-DD format (correct separators)', () => {
    const result = formatDate('2026-05-15T00:00:00+08:00')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('formatDateTime', () => {
  it('null returns em-dash', () => {
    expect(formatDateTime(null)).toBe('—')
  })

  it('undefined returns em-dash', () => {
    expect(formatDateTime(undefined)).toBe('—')
  })

  it('empty string returns em-dash', () => {
    expect(formatDateTime('')).toBe('—')
  })

  it('2026-05-15T16:00:00Z → 2026-05-16 00:00 (UTC+8)', () => {
    // 2026-05-15 16:00 UTC = 2026-05-16 00:00 CST
    expect(formatDateTime('2026-05-15T16:00:00Z')).toBe('2026-05-16 00:00')
  })

  it('2026-05-15T08:30:00+08:00 → 2026-05-15 08:30', () => {
    expect(formatDateTime('2026-05-15T08:30:00+08:00')).toBe('2026-05-15 08:30')
  })

  it('returns YYYY-MM-DD HH:mm format', () => {
    const result = formatDateTime('2026-05-15T08:30:00+08:00')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })
})
