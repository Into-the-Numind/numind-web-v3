/**
 * 诊断测试：AI 流式回复中切换会话后，回复丢失的 bug
 *
 * 测试场景：
 * 1. 创建两个会话 A 和 B
 * 2. 在会话 A 发送消息，AI 开始流式回复
 * 3. 流式回复进行中，切换到会话 B
 * 4. 等待一段时间，切回会话 A
 * 5. 检查 AI 回复是否可见
 */

import { test, expect } from '@playwright/test'
import { createDiagnostics } from './helpers/diagnose'

// ── Vue 3 Selectors ─────────────────────────────────────

const sel = {
  sidebar: '.sessions-list',
  sessionItem: '.session-item',
  newChatBtn: '.new-chat-btn',
  modalOverlay: '.modal-overlay',
  formInput: '.form-input',
  btnPrimary: '.btn-primary',
  textarea: 'textarea',
  sendBtn: '.main-stage button[aria-label="发送"], .main-stage .input-actions button:last-child',
  messageUser: '.message.user',
  messageAssistant: '.message.assistant',
  messageText: '.message-text',
  aiActions: '.ai-actions-container',
}

// ── Helpers ──────────────────────────────────────────────

async function waitForPageReady(page: import('@playwright/test').Page) {
  await page.goto('/sales')
  // Wait for sidebar to render (Vue 3 component)
  await page.waitForSelector(sel.sidebar, { timeout: 30_000 })
  await page.waitForTimeout(1500)
}

async function createSession(page: import('@playwright/test').Page, name: string) {
  await page.locator(sel.newChatBtn).click()
  // Wait for modal to open
  await page.waitForSelector(`${sel.modalOverlay}.open`, { timeout: 5_000 })
  await page.locator(`${sel.modalOverlay}.open ${sel.formInput}`).fill(name)
  await page.locator(`${sel.modalOverlay}.open ${sel.btnPrimary}`).click()
  // Wait for modal to close
  await page.waitForFunction(
    () => {
      const overlays = document.querySelectorAll('.modal-overlay.open')
      return overlays.length === 0
    },
    null,
    { timeout: 20_000 },
  )
  await page.waitForTimeout(1000)
}

async function getStoreSnapshot(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const app = (document.querySelector('#app') as any)?.__vue_app__
    if (!app) return { error: 'no vue app' }
    const pinia = app.config.globalProperties.$pinia
    if (!pinia) return { error: 'no pinia' }
    const store = pinia.state.value.sales
    if (!store) return { error: 'no sales store' }
    return {
      currentSessionId: store.currentSessionId,
      messagesCount: store.messages?.length ?? 0,
      messages: (store.messages || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        contentLength: m.content?.length ?? 0,
        contentPreview: (m.content || '').slice(0, 80),
      })),
      isLoading: store.isLoading,
      streamContentLen: (store.streamContent || '').length,
      streamThinkingLen: (store.streamThinkingContent || '').length,
      streamFinished: store.streamFinished,
      streamStatus: store.streamStatus,
      streamError: store.streamError,
    }
  })
}

async function waitForStreamStart(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => {
      const app = (document.querySelector('#app') as any)?.__vue_app__
      if (!app) return false
      const pinia = app.config.globalProperties.$pinia
      if (!pinia) return false
      const store = pinia.state.value.sales
      return (
        store?.isLoading === true &&
        ((store.streamContent || '').length > 0 ||
         (store.streamThinkingContent || '').length > 0 ||
         (store.streamStatus || '').length > 0)
      )
    },
    null,
    { timeout: 60_000 },
  )
}

async function waitForStreamFinish(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => {
      const app = (document.querySelector('#app') as any)?.__vue_app__
      if (!app) return false
      const pinia = app.config.globalProperties.$pinia
      if (!pinia) return false
      const store = pinia.state.value.sales
      return store?.isLoading === false && store?.messages?.some((m: any) => m.role === 'assistant')
    },
    null,
    { timeout: 90_000 },
  )
}

async function sendMessage(page: import('@playwright/test').Page, text: string) {
  const textarea = page.locator(sel.textarea).first()
  await textarea.fill(text)
  await page.locator('.send-btn').click()
}

function clickSession(page: import('@playwright/test').Page, name: string) {
  return page.locator(sel.sessionItem).filter({ hasText: name }).click()
}

// ── Tests ────────────────────────────────────────────────

// Diagnostic tests — run manually with: npx playwright test debug-stream-switch
// Skipped in CI to avoid creating test sessions on shared environments
test.describe.skip('Debug: Stream Switch Bug', () => {
  test('诊断：AI 流式回复中切换会话，回复是否丢失', async ({ page }) => {
    const diag = createDiagnostics(page)
    await waitForPageReady(page)

    // ── 创建会话 A 和 B ──
    const nameA = `诊断A_${Date.now()}`
    await createSession(page, nameA)
    console.log(`会话 A 创建: "${nameA}"`)

    const nameB = `诊断B_${Date.now()}`
    await createSession(page, nameB)
    console.log(`会话 B 创建: "${nameB}"`)

    // ── 切到会话 A，发消息 ──
    await clickSession(page, nameA)
    await page.waitForTimeout(1000)
    console.log('已切换到会话 A')

    // Track network
    const sseEvents: string[] = []
    const msgApiResults: { timestamp: number; msgCount: number; roles: string[]; lastContent: string }[] = []

    page.on('request', (req) => {
      if (req.url().includes('/chat') && req.method() === 'POST') {
        sseEvents.push(`${new Date().toISOString()} SSE 请求开始`)
      }
    })
    page.on('requestfailed', (req) => {
      if (req.url().includes('/chat') && req.method() === 'POST') {
        sseEvents.push(`${new Date().toISOString()} SSE 请求失败: ${req.failure()?.errorText}`)
      }
    })
    page.on('requestfinished', (req) => {
      if (req.url().includes('/chat') && req.method() === 'POST') {
        sseEvents.push(`${new Date().toISOString()} SSE 请求完成`)
      }
    })
    page.on('response', async (res) => {
      if (res.url().includes('/messages') && res.request().method() === 'GET') {
        try {
          const body = await res.json()
          const msgs = body?.data?.messages || []
          msgApiResults.push({
            timestamp: Date.now(),
            msgCount: msgs.length,
            roles: msgs.map((m: any) => m.role),
            lastContent: msgs.length > 0 ? (msgs[msgs.length - 1].content || '').slice(0, 80) : '',
          })
        } catch { /* ignore */ }
      }
    })

    // 发消息
    await sendMessage(page, '你好，请简单介绍一下你自己')
    console.log('消息已发送')

    // 等 AI 开始回复
    await waitForStreamStart(page)
    console.log('AI 开始回复')

    // 等内容积累一些
    await page.waitForTimeout(3000)

    const beforeSwitch = await getStoreSnapshot(page) as any
    console.log(`切换前:`, JSON.stringify(beforeSwitch, null, 2))
    await diag.screenshot('1-before-switch')

    // ── 切到会话 B ──
    await clickSession(page, nameB)
    console.log('已切换到会话 B')
    await page.waitForTimeout(1000)

    const afterSwitchB = await getStoreSnapshot(page) as any
    console.log(`切到 B 后:`, JSON.stringify(afterSwitchB, null, 2))
    await diag.screenshot('2-on-session-B')

    // ── 等 5 秒后切回（AI 可能还在处理中）──
    console.log('在 B 等待 5 秒...')
    await page.waitForTimeout(5_000)

    // ── 切回会话 A ──
    await clickSession(page, nameA)
    console.log('已切回会话 A，等待 AI 回复完成...')

    // Wait for AI response: either streaming content appears or message is in store
    await page.waitForFunction(
      () => {
        const app = (document.querySelector('#app') as any)?.__vue_app__
        if (!app) return false
        const pinia = app.config.globalProperties.$pinia
        if (!pinia) return false
        const store = pinia.state.value.sales
        if (!store) return false
        // Check: AI message in messages array OR stream content visible
        const hasAiMsg = store.messages?.some((m: any) => m.role === 'assistant' && m.content?.length > 0)
        const hasStreamContent = (store.streamContent || '').length > 0
        return hasAiMsg || hasStreamContent
      },
      null,
      { timeout: 90_000 },
    )
    console.log('AI 回复内容出现！')
    await page.waitForTimeout(2000)

    const afterSwitchBack = await getStoreSnapshot(page) as any
    console.log(`切回 A 后:`, JSON.stringify(afterSwitchBack, null, 2))
    await diag.screenshot('3-back-on-session-A')

    // ── 检查结果 ──
    const aiMsgInDom = await page.locator(sel.messageAssistant).count()
    console.log(`\n===== 诊断结果 =====`)
    console.log(`Store 消息数: ${afterSwitchBack.messagesCount}`)
    console.log(`Store 消息:`)
    for (const m of afterSwitchBack.messages || []) {
      console.log(`  [${m.role}] len=${m.contentLength} "${m.contentPreview}"`)
    }
    console.log(`DOM 中 AI 消息数: ${aiMsgInDom}`)
    console.log(`\nSSE 事件:`)
    for (const e of sseEvents) console.log(`  ${e}`)
    console.log(`\nMessages API 响应:`)
    for (const r of msgApiResults) {
      console.log(`  ${new Date(r.timestamp).toISOString()} - ${r.msgCount}条 [${r.roles.join(',')}] last="${r.lastContent}"`)
    }

    diag.dump()

    const hasAiInMessages = afterSwitchBack.messages?.some((m: any) => m.role === 'assistant' && m.contentLength > 0)
    const hasStreamContent = afterSwitchBack.streamContentLen > 0 || afterSwitchBack.streamThinkingLen > 0
    const hasAiResponse = hasAiInMessages || hasStreamContent

    console.log(`\nMessages 中有 AI 回复: ${hasAiInMessages}`)
    console.log(`Stream 中有 AI 内容: ${hasStreamContent}`)
    console.log(`DOM 中有 AI 回复: ${aiMsgInDom > 0}`)
    console.log(`总结: AI 回复${hasAiResponse ? '可见' : '丢失'}`)

    // AI response should be visible — either as a completed message or as streaming content
    expect(hasAiResponse, 'AI 回复应可见（已完成或正在流式传输）').toBeTruthy()
    expect(aiMsgInDom, 'DOM 中应该有 AI 回复').toBeGreaterThan(0)
  })

  test('诊断：快速连续切换会话', async ({ page }) => {
    const diag = createDiagnostics(page)
    await waitForPageReady(page)

    const nameA = `快切A_${Date.now()}`
    await createSession(page, nameA)
    const nameB = `快切B_${Date.now()}`
    await createSession(page, nameB)

    await clickSession(page, nameA)
    await page.waitForTimeout(1000)

    await sendMessage(page, '列举三个销售技巧')
    await waitForStreamStart(page)
    console.log('AI 开始回复')
    await page.waitForTimeout(2000)

    // 快速切换 A→B→A→B→A
    await clickSession(page, nameB)
    await page.waitForTimeout(500)
    await clickSession(page, nameA)
    await page.waitForTimeout(500)
    await clickSession(page, nameB)
    await page.waitForTimeout(500)
    await clickSession(page, nameA)
    console.log('快速切换完成，最终在 A，等待 AI 回复...')

    // Wait for AI response content to appear
    await page.waitForFunction(
      () => {
        const app = (document.querySelector('#app') as any)?.__vue_app__
        if (!app) return false
        const pinia = app.config.globalProperties.$pinia
        if (!pinia) return false
        const store = pinia.state.value.sales
        if (!store) return false
        const hasAiMsg = store.messages?.some((m: any) => m.role === 'assistant' && m.content?.length > 0)
        const hasStreamContent = (store.streamContent || '').length > 0
        return hasAiMsg || hasStreamContent
      },
      null,
      { timeout: 90_000 },
    )
    await page.waitForTimeout(2000)

    const state = await getStoreSnapshot(page) as any
    console.log(`最终状态:`, JSON.stringify(state, null, 2))
    await diag.screenshot('rapid-switch-final')

    const hasAiInMessages = state.messages?.some((m: any) => m.role === 'assistant' && m.contentLength > 0)
    const hasStreamContent = state.streamContentLen > 0 || state.streamThinkingLen > 0
    const hasAi = hasAiInMessages || hasStreamContent
    console.log(`快速切换后 AI 回复: ${hasAi} (messages: ${hasAiInMessages}, stream: ${hasStreamContent})`)

    diag.dump()
    expect(hasAi, '快速切换后应有 AI 回复').toBeTruthy()
  })

  test('诊断：AI 回复完成后切换再切回', async ({ page }) => {
    const diag = createDiagnostics(page)
    await waitForPageReady(page)

    const nameA = `完成A_${Date.now()}`
    await createSession(page, nameA)
    const nameB = `完成B_${Date.now()}`
    await createSession(page, nameB)

    await clickSession(page, nameA)
    await page.waitForTimeout(1000)

    await sendMessage(page, '用一句话回答：1+1等于多少？')
    await waitForStreamFinish(page)
    console.log('AI 回复完成')

    const completed = await getStoreSnapshot(page) as any
    console.log(`完成时:`, JSON.stringify(completed, null, 2))

    await clickSession(page, nameB)
    await page.waitForTimeout(2000)
    await clickSession(page, nameA)
    await page.waitForTimeout(3000)

    const afterSwitch = await getStoreSnapshot(page) as any
    console.log(`切回后:`, JSON.stringify(afterSwitch, null, 2))
    await diag.screenshot('completed-switch-back')

    const aiMsgCount = await page.locator(sel.messageAssistant).count()
    const hasAi = afterSwitch.messages?.some((m: any) => m.role === 'assistant' && m.contentLength > 0)
    console.log(`Store 有 AI: ${hasAi}, DOM AI 数: ${aiMsgCount}`)

    diag.dump()
    expect(hasAi, '回复完成后切换再切回应有 AI').toBeTruthy()
    expect(aiMsgCount, 'DOM 应有 AI 消息').toBeGreaterThan(0)
  })
})
