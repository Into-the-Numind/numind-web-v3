/**
 * Customer regression: long Agent sessions must restore in 100-run pages.
 *
 * The first snapshot contains the newest page. Reaching the top of the
 * conversation must fetch the next older page, prepend it, and keep the
 * reader anchored on the same visible message.
 */

import { test, expect } from '@playwright/test'
import { createDiagnostics } from './helpers/diagnose'
import { setupAgentMocks } from './helpers/agent-mock'

const SESSION_ID = 'paged-history-session'
const PAGE_SIZE = 100

test.use({ storageState: { cookies: [], origins: [] } })

function makeMessages(prefix: string, count: number, startMinute: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    type: 'user',
    text: `${prefix.toUpperCase()}_MARKER_${index} ${'历史消息内容 '.repeat(8)}`,
    timestamp: new Date(Date.UTC(2026, 7, 24, 8, startMinute + index)).toISOString()
  }))
}

test('initial load stays on the newest 100 runs until the user scrolls upward', async ({ page }) => {
  const diagnostics = createDiagnostics(page)
  const snapshotOffsets: number[] = []

  await page.addInitScript(() => {
    localStorage.setItem('token', 'history-pagination-test-token')
    localStorage.setItem('auth_token', 'history-pagination-test-token')
    const user = JSON.stringify({
      id: 1,
      username: 'history-pagination-e2e',
      parent_user_id: null,
      billing_mode: 'credits'
    })
    localStorage.setItem('userInfo', user)
    localStorage.setItem('user_info', user)
  })
  await setupAgentMocks(page)

  await page.route('**/v1/tenant-settings/support-contact', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: {} })
    })
  })

  await page.route(`**/v1/sessions/${SESSION_ID}/snapshot**`, async (route) => {
    const requestURL = new URL(route.request().url())
    const offset = Number(requestURL.searchParams.get('offset') ?? '0')
    snapshotOffsets.push(offset)

    const isOlderPage = offset === PAGE_SIZE
    const messages = isOlderPage
      ? makeMessages('older', PAGE_SIZE, 0)
      : makeMessages('latest', PAGE_SIZE, 100)

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          session_id: SESSION_ID,
          agent_skill_id: 1,
          agent_run_ids: messages.map((_, index) => offset + index + 1),
          last_active_at: '2026-08-24T12:00:00.000Z',
          status: 'completed',
          run: {
            id: 200,
            session_id: SESSION_ID,
            status: 'completed',
            created_at: '2026-08-24T12:00:00.000Z',
            updated_at: '2026-08-24T12:00:00.000Z'
          },
          messages,
          offset,
          next_offset: offset + messages.length,
          has_more: !isOlderPage,
          total_runs: PAGE_SIZE * 2
        }
      })
    })
  })

  await page.goto(`/agent/chat/${SESSION_ID}?agent_id=1`)
  await expect(page.getByText('LATEST_MARKER_99', { exact: false })).toBeAttached()

  // Mounting starts the scroll container at scrollTop=0. That browser default
  // must not be mistaken for a user request to load older history before the
  // component has positioned the newest page at the bottom.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
  await page.waitForTimeout(100)
  expect(snapshotOffsets).toEqual([0])
  await expect(page.getByText('OLDER_MARKER_0', { exact: false })).toHaveCount(0)

  const latest = page.getByText('LATEST_MARKER_99', { exact: false })
  const initialDistanceFromBottom = await latest.evaluate((element) => {
    let container: HTMLElement | null = element as HTMLElement
    while (container) {
      const style = window.getComputedStyle(container)
      if (/auto|scroll/.test(style.overflowY) && container.scrollHeight > container.clientHeight) {
        break
      }
      container = container.parentElement
    }
    if (!container) throw new Error('No scrollable ancestor found for the Agent message')
    return container.scrollHeight - container.clientHeight - container.scrollTop
  })
  expect(initialDistanceFromBottom).toBeLessThanOrEqual(2)

  const anchor = page.getByText('LATEST_MARKER_0', { exact: false })
  await expect(anchor).toBeAttached()
  const anchorTopBefore = await anchor.evaluate((element) => {
    let container: HTMLElement | null = element as HTMLElement
    while (container) {
      const style = window.getComputedStyle(container)
      if (/auto|scroll/.test(style.overflowY) && container.scrollHeight > container.clientHeight) {
        break
      }
      container = container.parentElement
    }
    if (!container) throw new Error('No scrollable ancestor found for the Agent message')
    container.style.scrollBehavior = 'auto'
    container.scrollTop = 0
    const anchorTop = element.getBoundingClientRect().top
    container.dispatchEvent(new Event('scroll', { bubbles: true }))
    return anchorTop
  })

  try {
    await expect(page.getByText('OLDER_MARKER_0', { exact: false })).toBeAttached({ timeout: 5_000 })
  } catch (error) {
    diagnostics.dump()
    diagnostics.networkFor(`/v1/sessions/${SESSION_ID}/snapshot`)
    await diagnostics.screenshot('agent-session-history-pagination-before-fix')
    throw error
  }

  expect(snapshotOffsets).toEqual([0, PAGE_SIZE])
  await expect(page.getByText('正在加载更早记录…', { exact: true })).toHaveCount(0)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
  const anchorTopAfter = await anchor.evaluate((element) => element.getBoundingClientRect().top)
  expect(Math.abs(anchorTopAfter - anchorTopBefore)).toBeLessThanOrEqual(2)
})
