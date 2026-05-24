/**
 * skill-detail-shape.spec.ts — 复现 /config/skills/:id 页面空白 bug
 *
 * Bug: 客户访问 http://49.233.219.254:9200/config/skills/3 看到空白页面,
 *      只有顶部 tab 显示,主内容区完全没渲染.
 *
 * 根因 (Playwright diagnose 2026-05-24):
 *   - 后端 GetSkill 返回 data: { skill: {...}, bound_agents: [...] }
 *   - 前端 src/api/skill.ts getSkill 直接 return res.data → 拿到 {skill, bound_agents}
 *   - store.skill.current = {skill, bound_agents}, 不是 skill 本体
 *   - SkillDetail.vue:101 store.current.allowed_tools.length 触发
 *     TypeError: Cannot read properties of undefined (reading 'length')
 *   - Vue 渲染整个 template 区域炸成空 (<!---->)
 *
 * 期望: 访问已存在 skill 的详情页应能正常渲染 — 至少 "返回列表" 按钮 + h2 skill 名可见.
 *
 * NDF Rule 11 — Bug-from-Customer 强制规则: 这是 fix commit 之前先 commit 的失败复现测试,
 * fix 后必须 PASS, 永久留库做回归保护.
 */

import { test, expect } from '@playwright/test'

const USERNAME = process.env.E2E_USERNAME ?? ''
const PASSWORD = process.env.E2E_PASSWORD ?? ''

if (!USERNAME) throw new Error('E2E_USERNAME required')

test('skill detail page renders without TypeError (regression for /config/skills/:id blank)', async ({
  page
}) => {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })

  // login
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await page.locator('#username').fill(USERNAME)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('.login-button').click()
  await expect(page).toHaveURL('/', { timeout: 15_000 })

  // find a real skill id
  const token = await page.evaluate(() => localStorage.getItem('token'))
  const r = await page.request.get('/api/v1/skills?page_size=1', {
    headers: { Authorization: `Bearer ${token}` }
  })
  const body = await r.json()
  expect(body.code, 'GET /v1/skills failed').toBe(0)
  expect(body.data.list.length, 'no skills in this account; cannot test detail').toBeGreaterThan(0)
  const skillId = body.data.list[0].id as number
  const skillName = body.data.list[0].name as string

  // navigate to detail page
  await page.goto(`/config/skills/${skillId}`, { waitUntil: 'networkidle' })

  // assertion 1: no TypeError errors in console / pageerror
  const errorMsgs = [...pageErrors, ...consoleErrors].filter(
    (m) => m.includes('Cannot read properties of undefined') || m.includes('TypeError')
  )
  expect(errorMsgs, `unexpected TypeError on detail page: ${errorMsgs.join('\n')}`).toHaveLength(0)

  // assertion 2: main content区域不是空（有 h2 skill 名 + 返回按钮）
  await expect(page.locator('.skill-detail__title-block h2')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('.skill-detail__title-block h2')).toHaveText(skillName)
})
