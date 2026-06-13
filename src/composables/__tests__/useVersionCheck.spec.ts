/**
 * useVersionCheck.spec.ts — agent-wait-ux 5b.
 *
 * After a frontend deploy, an already-open tab keeps running the OLD bundle and
 * the user has no signal to refresh (dev 2026-06-13: the user tested a fix on a
 * stale tab and concluded it was "not fixed"). The page's index.html is served
 * no-store, and its hashed bundle name (index-<hash>.js) changes on every build,
 * so polling it is a zero-backend version signal. These tests pin the pure
 * helpers that pick the modern bundle hash and decide when to prompt.
 *
 * Permanent regression protection (NDF Rule 11). RED before the helpers exist.
 */
import { describe, it, expect } from 'vitest'
import { extractBundleHash, isNewVersion } from '../useVersionCheck'

const INDEX_HTML = `<!doctype html><html><head>
  <script type="module" crossorigin src="/assets/index-Cr0e4Rqo.js"></script>
  <script nomodule src="/assets/index-legacy-BRsovt6g.js"></script>
</head><body></body></html>`

describe('useVersionCheck helpers', () => {
  it('extracts the modern bundle hash, ignoring the legacy bundle', () => {
    expect(extractBundleHash(INDEX_HTML)).toBe('index-Cr0e4Rqo.js')
  })

  it('returns null when no hashed bundle is present (e.g. vite dev)', () => {
    expect(extractBundleHash('<html><body>no bundle</body></html>')).toBeNull()
  })

  it('isNewVersion is false against the same hash', () => {
    expect(isNewVersion('index-Cr0e4Rqo.js', 'index-Cr0e4Rqo.js')).toBe(false)
  })

  it('isNewVersion is true when the deployed hash changed', () => {
    expect(isNewVersion('index-Cr0e4Rqo.js', 'index-Zxk91abc.js')).toBe(true)
  })

  it('isNewVersion never fires on a null/unknown current (transient fetch miss)', () => {
    expect(isNewVersion('index-Cr0e4Rqo.js', null)).toBe(false)
    expect(isNewVersion(null, 'index-Cr0e4Rqo.js')).toBe(false)
  })
})
