/**
 * Unit tests for src/utils/idempotency.ts
 *
 * Verifies:
 *  - generateIdempotencyKey() returns a valid RFC 4122 v4 UUID
 *  - Successive calls return distinct values
 */
import { describe, it, expect } from 'vitest'
import { generateIdempotencyKey } from '../idempotency'

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('generateIdempotencyKey', () => {
  it('returns a string matching the RFC 4122 v4 UUID pattern', () => {
    const key = generateIdempotencyKey()
    expect(typeof key).toBe('string')
    expect(key).toMatch(UUID_V4_RE)
  })

  it('successive calls return distinct values', () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateIdempotencyKey()))
    expect(keys.size).toBe(20)
  })

  it('version nibble is always "4"', () => {
    for (let i = 0; i < 10; i++) {
      const key = generateIdempotencyKey()
      // The 15th character (index 14) must be '4'
      expect(key[14]).toBe('4')
    }
  })

  it('variant nibble is always 8, 9, a, or b', () => {
    for (let i = 0; i < 10; i++) {
      const key = generateIdempotencyKey()
      // The 20th character (index 19, after the 4th hyphen) is the variant nibble
      expect(['8', '9', 'a', 'b']).toContain(key[19].toLowerCase())
    }
  })

  it('falls back to crypto.getRandomValues when crypto.randomUUID is undefined (HTTP/non-secure context)', () => {
    // Simulate insecure context: crypto.randomUUID is not a function. This is
    // the exact state of dev (http://49.233.219.254:9200) and any intranet HTTP
    // origin where Web Crypto's secure-context-only APIs vanish.
    const originalRandomUUID = crypto.randomUUID
    try {
      // @ts-expect-error — intentionally clobbering for the test
      crypto.randomUUID = undefined

      const key = generateIdempotencyKey()
      expect(typeof key).toBe('string')
      expect(key).toMatch(UUID_V4_RE)
      expect(key[14]).toBe('4')
      expect(['8', '9', 'a', 'b']).toContain(key[19].toLowerCase())

      // Fallback must still produce distinct values
      const keys = new Set(Array.from({ length: 10 }, () => generateIdempotencyKey()))
      expect(keys.size).toBe(10)
    } finally {
      crypto.randomUUID = originalRandomUUID
    }
  })
})
