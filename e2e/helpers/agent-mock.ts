/**
 * agent-mock.ts — Playwright route interceptors for Agent Student UX e2e
 *
 * Intercepts the three "bootstrap" network calls that the AgentSelectView and
 * AgentChatView make on mount, so tests can run without a live backend.
 *
 * The following endpoints are NOT intercepted here because they are handled
 * entirely by src/api/agent.mock.ts when VITE_AGENT_MOCK=true is set in the
 * dev server environment (see playwright.config.ts webServer.env):
 *   /v1/agent-runs/**
 *   /v1/agent-sessions/history
 *   /v1/sessions/**
 *   /v1/tenant-settings/support-contact
 *   /v1/agent-attachments
 *
 * Usage:
 *   import { setupAgentMocks } from './helpers/agent-mock'
 *   test.beforeEach(async ({ page }) => { await setupAgentMocks(page) })
 */

import type { Page, Route } from '@playwright/test'

interface MockAgent {
  id: number
  name: string
  description: string
  emoji?: string
  welcome_message?: string
  conversation_starters?: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

const DEMO_AGENTS: MockAgent[] = [
  {
    id: 1,
    name: '爆款分析师',
    description: '帮你找出笔记里哪些话题效果最好',
    emoji: '🤖',
    welcome_message:
      '你好！我是爆款分析师，可以帮你找出你的笔记里哪些话题、形式和发布时间效果最好，让你少走弯路、多出好内容。',
    conversation_starters: ['帮我分析这周的笔记', '找出爆款规律', '我该发什么'],
    is_active: true,
    created_at: '2026-05-01T10:00:00+08:00',
    updated_at: '2026-05-20T15:30:00+08:00'
  },
  {
    id: 2,
    name: '数据复盘助手',
    description: '帮你整理本周数据，看看哪里可以改进',
    emoji: '📊',
    welcome_message: '我是数据复盘助手。上传你的数据表，我帮你做一次完整复盘。',
    conversation_starters: ['做本周复盘', '看看哪类内容数据下滑了', '对比上周表现'],
    is_active: true,
    created_at: '2026-05-01T10:00:00+08:00',
    updated_at: '2026-05-19T10:00:00+08:00'
  },
  {
    id: 3,
    name: '作业批改助手',
    description: '给你的作业提供详细点评和改进建议',
    emoji: '📝',
    welcome_message: '把你的作业贴过来，我帮你点评。',
    conversation_starters: ['批改这篇笔记', '看看我的标题', '给我打个分'],
    is_active: true,
    created_at: '2026-05-01T10:00:00+08:00',
    updated_at: '2026-05-18T10:00:00+08:00'
  }
]

/**
 * Install Playwright route interceptors for the three bootstrap API calls that
 * the Agent UX pages make on mount.  Call this inside test.beforeEach before
 * page.goto() so the intercepts are in place before any navigation happens.
 */
export const setupAgentMocks = async (page: Page): Promise<void> => {
  // GET /v1/agent-skills/available
  await page.route('**/v1/agent-skills/available', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: { list: DEMO_AGENTS, total: DEMO_AGENTS.length }
      })
    })
  })

  // GET /v1/agent-sessions/recent (with optional query params like ?limit=5)
  await page.route('**/v1/agent-sessions/recent**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: [] })
    })
  })

  await page.route('**/v1/agent-sessions/history', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, message: 'ok', data: [] })
    })
  })

  // GET /v1/credits/balance — stub a healthy pro-member balance so all
  // balance-gated views render correctly (isMember=true, balance >= 50).
  await page.route('**/v1/credits/balance', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          balance: 1500,
          cycle_remaining: 1500,
          booster_usable: 0,
          trial_remaining: 0,
          membership_state: 'pro'
        }
      })
    })
  })
}
