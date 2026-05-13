/**
 * Idempotency key utilities.
 *
 * Generates RFC 4122 v4 UUIDs using the Web Crypto API. Prefers
 * `crypto.randomUUID()` when available, falls back to `crypto.getRandomValues`
 * for non-secure contexts (HTTP) where `randomUUID` is undefined.
 *
 * Why the fallback: `crypto.randomUUID` requires a secure context (HTTPS,
 * localhost, or file://). Plain HTTP origins like our dev site
 * (http://49.233.219.254:9200) silently get `crypto.randomUUID === undefined`
 * even on modern browsers, and calling it throws TypeError. Prod runs over
 * HTTPS so the primary path is used; this fallback only fires on HTTP.
 */

/**
 * Generate a new RFC 4122 version-4 UUID.
 * Safe to call in any context: HTTPS / HTTP / localhost / Node / Vitest jsdom.
 */
export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // Fallback: manual RFC 4122 v4 UUID using crypto.getRandomValues, which is
  // available in all secure AND insecure contexts on modern browsers.
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}
