/**
 * Playwright 自动化诊断工具。
 *
 * 用于 debug 前端 UI bug：自动收集浏览器 console、网络请求/响应、
 * JS 错误、DOM 文本、截图。
 *
 * 用法（在一次性 debug spec 中）：
 *
 *   import { test } from '@playwright/test'
 *   import { createDiagnostics } from './helpers/diagnose'
 *
 *   test('diagnose: sidebar run count card', async ({ page }) => {
 *     const diag = createDiagnostics(page)
 *     await page.goto('/')
 *     await page.waitForTimeout(3000)
 *     diag.dump()
 *     diag.networkFor('/users/me')
 *     console.log(await diag.domText('.run-count-card'))
 *     await diag.screenshot('sidebar-bug')
 *   })
 */

import type { Page } from '@playwright/test'

export interface ConsoleEntry {
  type: string
  text: string
}

export interface NetworkEntry {
  method: string
  url: string
  status: number
  body?: unknown
}

export interface Diagnostics {
  /** 打印所有收集到的 console 日志、网络请求、JS 错误 */
  dump(): void
  /** 过滤并打印匹配 urlPattern 的网络请求和响应体 */
  networkFor(urlPattern: string): void
  /** 截图保存到 test-results/debug-{name}.png */
  screenshot(name: string): Promise<void>
  /** 读取指定 CSS 选择器元素的 textContent */
  domText(selector: string): Promise<string>
  /** 原始数据访问 */
  consoleLogs: ConsoleEntry[]
  networkRequests: NetworkEntry[]
  errors: string[]
}

/**
 * 在指定 page 上注册诊断监听器，返回诊断工具对象。
 * 必须在 page.goto() 之前调用，以捕获完整的请求链。
 */
export function createDiagnostics(page: Page): Diagnostics {
  const consoleLogs: ConsoleEntry[] = []
  const networkRequests: NetworkEntry[] = []
  const errors: string[] = []

  // 收集 console 输出
  page.on('console', (msg) => {
    consoleLogs.push({ type: msg.type(), text: msg.text() })
  })

  // 收集 JS 错误
  page.on('pageerror', (err) => {
    errors.push(err.message)
  })

  // 收集网络请求和响应
  page.on('response', async (response) => {
    const url = response.url()
    const method = response.request().method()
    const status = response.status()

    let body: unknown = undefined
    try {
      const contentType = response.headers()['content-type'] || ''
      if (contentType.includes('application/json')) {
        body = await response.json()
      }
    } catch {
      // 忽略解析失败
    }

    networkRequests.push({ method, url, status, body })
  })

  const diag: Diagnostics = {
    consoleLogs,
    networkRequests,
    errors,

    dump() {
      console.log('\n====== DIAGNOSTICS DUMP ======\n')

      console.log('── Console Logs ──')
      if (consoleLogs.length === 0) {
        console.log('  (none)')
      } else {
        for (const entry of consoleLogs) {
          console.log(`  [${entry.type}] ${entry.text}`)
        }
      }

      console.log('\n── Network Requests ──')
      if (networkRequests.length === 0) {
        console.log('  (none)')
      } else {
        for (const req of networkRequests) {
          const bodyStr = req.body ? ` ${JSON.stringify(req.body).slice(0, 200)}` : ''
          console.log(`  [${req.method}] ${req.status} ${req.url}${bodyStr}`)
        }
      }

      console.log('\n── JS Errors ──')
      if (errors.length === 0) {
        console.log('  (none)')
      } else {
        for (const err of errors) {
          console.log(`  ${err}`)
        }
      }

      console.log('\n==============================\n')
    },

    networkFor(urlPattern: string) {
      const matches = networkRequests.filter((r) => r.url.includes(urlPattern))
      console.log(`\n── Network for "${urlPattern}" (${matches.length} match) ──`)
      if (matches.length === 0) {
        console.log('  (no matching requests)')
      } else {
        for (const req of matches) {
          console.log(`  [${req.method}] ${req.status} ${req.url}`)
          if (req.body) {
            console.log(`  body: ${JSON.stringify(req.body, null, 2).slice(0, 500)}`)
          }
        }
      }
    },

    async screenshot(name: string) {
      const path = `test-results/debug-${name}.png`
      await page.screenshot({ path, fullPage: true })
      console.log(`\n── Screenshot saved: ${path} ──`)
    },

    async domText(selector: string) {
      const el = page.locator(selector).first()
      const count = await page.locator(selector).count()
      if (count === 0) {
        const text = `(selector "${selector}" not found)`
        console.log(`\n── DOM Text ── ${selector} → ${text}`)
        return text
      }
      const text = ((await el.textContent()) || '').trim()
      console.log(`\n── DOM Text ── ${selector} → "${text}"`)
      return text
    },
  }

  return diag
}
