/**
 * Idempotency key utilities.
 *
 * Generates RFC 4122 v4 UUIDs via the Web Crypto API (`crypto.randomUUID`).
 * Available in all browsers (Chrome 92+, Safari 15.4+, Firefox 95+) and
 * Node 14.17+ / jsdom environments used in Vitest.
 */

/**
 * Generate a new RFC 4122 version-4 UUID.
 * Safe to call in browser, Node, and Vitest / jsdom.
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}
