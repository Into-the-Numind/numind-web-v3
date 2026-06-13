/**
 * useVersionCheck — agent-wait-ux 5b.
 *
 * Detects a frontend deploy so an already-open tab can prompt the user to
 * refresh instead of silently running the OLD bundle (dev 2026-06-13: the user
 * tested a fix on a stale tab and concluded it was "not fixed").
 *
 * Signal: index.html is served no-store and references a content-hashed bundle
 * (`/assets/index-<hash>.js`) that changes on every build. Polling index.html
 * and comparing the hash needs zero backend support. On vite dev (no hashed
 * bundle) extractBundleHash returns null and the check is inert.
 */
import { ref, onMounted, onUnmounted } from 'vue'

const INDEX_URL = '/index.html'
const CHECK_INTERVAL_MS = 5 * 60 * 1000

/**
 * extractBundleHash pulls the MODERN entry bundle filename (e.g.
 * "index-Cr0e4Rqo.js") out of an index.html, ignoring the `index-legacy-*`
 * nomodule fallback. Returns null when no hashed bundle is present.
 */
export function extractBundleHash(html: string): string | null {
  const all = [...html.matchAll(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/g)].map((m) => m[1])
  if (all.length === 0) return null
  return all.find((f) => !f.includes('legacy')) ?? all[0]
}

/**
 * isNewVersion reports whether `current` is a different, known build than
 * `baseline`. A null on either side (transient fetch miss / vite dev) is never
 * treated as an update, so the prompt can't fire on noise.
 */
export function isNewVersion(baseline: string | null, current: string | null): boolean {
  if (!baseline || !current) return false
  return baseline !== current
}

export interface UseVersionCheckApi {
  updateAvailable: import('vue').Ref<boolean>
  reload: () => void
}

export function useVersionCheck(): UseVersionCheckApi {
  const updateAvailable = ref(false)
  let baseline: string | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  const fetchHash = async (): Promise<string | null> => {
    try {
      // Cache-bust defensively even though index.html is served no-store.
      const res = await fetch(`${INDEX_URL}?_=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) return null
      return extractBundleHash(await res.text())
    } catch {
      return null
    }
  }

  const stopPolling = (): void => {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
    document.removeEventListener('visibilitychange', onVisible)
  }

  const check = async (): Promise<void> => {
    if (updateAvailable.value) return // already prompting; stop polling work
    const current = await fetchHash()
    if (current === null) return
    if (baseline === null) {
      baseline = current // first successful read = the build this tab is running
      return
    }
    if (isNewVersion(baseline, current)) {
      updateAvailable.value = true
      stopPolling() // nothing more to detect; stop the 5-min no-op ticks
    }
  }

  const onVisible = (): void => {
    if (document.visibilityState === 'visible') void check()
  }

  onMounted(() => {
    void check() // establish baseline
    timer = setInterval(() => void check(), CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisible)
  })

  onUnmounted(stopPolling)

  const reload = (): void => {
    window.location.reload()
  }

  return { updateAvailable, reload }
}
