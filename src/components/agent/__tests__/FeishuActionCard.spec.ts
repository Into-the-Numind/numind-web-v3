import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { ExternalActionMessage } from '@/types/agent'

import FeishuActionCard from '../FeishuActionCard.vue'

const AUTH_URL =
  'https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=cli_x&redirect_uri=https%3A%2F%2Fnumind.example%2Fcallback&state=opaque-value'

const createAction = (overrides: Partial<ExternalActionMessage> = {}): ExternalActionMessage => ({
  id: 'message-1',
  type: 'external_action',
  run_id: 7,
  operation_id: 'op-1',
  session_id: 'session-1',
  phase: 'user_auth',
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  url: AUTH_URL,
  action_status: 'pending',
  timestamp: '2026-07-15T10:00:00Z',
  ...overrides
})

const mountCard = (props: Record<string, unknown> = {}): VueWrapper =>
  mount(FeishuActionCard, { props: { action: createAction(), ...props } })

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('FeishuActionCard', () => {
  it.each([
    ['create_app', '创建个人应用', '为你的有数账号创建一个独立飞书自建应用'],
    ['app_scope', '等待管理员批准', '这项能力需要飞书管理员批准'],
    ['confirmation', '正在继续原任务', '旧版确认步骤已取消']
  ] as const)('renders the precise %s phase copy', async (phase, heading, description) => {
    const wrapper = mountCard({ action: createAction({ phase, url: undefined }) })
    await flushPromises()

    expect(wrapper.find('[data-testid="feishu-phase"]').text()).toContain(heading)
    expect(wrapper.text()).toContain(description)
  })

  it('renders the simplified user authorization card', async () => {
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.get('[data-testid="feishu-phase"]').text()).toBe('飞书授权')
    expect(wrapper.find('[data-testid="feishu-url"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-copy-link"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(AUTH_URL)
    expect(wrapper.text()).not.toContain('请授权本次任务需要的文档权限')
    expect(wrapper.text()).not.toContain('复制链接')
    expect(wrapper.text()).not.toContain('扫码打开')
    expect(wrapper.text()).not.toContain('或在浏览器打开完整链接')
    expect(wrapper.text()).not.toContain('请在链接有效期内完成此步骤')
    expect(wrapper.text()).not.toContain('我已完成，继续')
    expect(wrapper.get('[data-testid="feishu-open-link"]').attributes('href')).toBe(AUTH_URL)
    expect(wrapper.get('[data-testid="feishu-open-link"]').text()).toContain('打开链接')
    expect(wrapper.get('[data-testid="feishu-continue"]').text()).toContain('确认继续')
  })

  it('keeps the open action current when the server replaces the opaque URL', async () => {
    const wrapper = mountCard()
    await flushPromises()
    const freshURL = `${AUTH_URL}&refresh=2`

    await wrapper.setProps({ action: createAction({ url: freshURL }) })
    await flushPromises()

    expect(wrapper.get('[data-testid="feishu-open-link"]').attributes('href')).toBe(freshURL)
  })

  it.each([
    ['authorization_pending', '尚未检测到授权完成，请完成后再继续。'],
    ['authorization_processing', '正在确认授权状态，请稍候。'],
    ['authorization_rejected', '本次授权未通过，已生成新的授权链接。'],
    ['authorization_expired', '原链接已过期，已生成新的授权链接。'],
    ['authorization_updated', '授权步骤已更新，正在加载最新操作。']
  ] as const)('announces the fixed %s notice copy', (noticeCode, expected) => {
    const wrapper = mountCard({ action: createAction({ notice_code: noticeCode }) })

    expect(wrapper.get('[data-testid="feishu-notice"]').text()).toBe(expected)
    expect(wrapper.get('[data-testid="feishu-notice"]').attributes('role')).toBe('status')
  })

  it('announces processing once and prevents duplicate lifecycle actions', async () => {
    const wrapper = mountCard({
      action: createAction({ notice_code: 'authorization_processing' })
    })

    expect(wrapper.get('[data-testid="feishu-notice"]').attributes('aria-live')).toBe('polite')
    expect(wrapper.get('[data-testid="feishu-continue"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="feishu-continue"]').trigger('click')
    expect(wrapper.emitted('resume')).toBeUndefined()

    await wrapper.setProps({ action: createAction(), busy: true })
    expect(wrapper.get('[data-testid="feishu-continue"]').attributes('disabled')).toBeDefined()
  })

  it.each(['authorization_rejected', 'authorization_expired', 'authorization_updated'] as const)(
    'points the open link at a %s replacement',
    async (noticeCode) => {
      const wrapper = mountCard()
      await flushPromises()
      const freshURL = `${AUTH_URL}&notice=${noticeCode}`

      await wrapper.setProps({
        action: createAction({
          session_id: `session-${noticeCode}`,
          url: freshURL,
          notice_code: noticeCode
        })
      })
      await flushPromises()

      expect(wrapper.get('[data-testid="feishu-open-link"]').attributes('href')).toBe(freshURL)
    }
  )

  it('emits an operation resume instead of a question answer', async () => {
    const wrapper = mountCard()
    await wrapper.get('[data-testid="feishu-continue"]').trigger('click')

    expect(wrapper.emitted('resume')).toEqual([['op-1']])
    expect(wrapper.emitted('answer-submitted')).toBeUndefined()
  })

  it('emits refresh with the action session for a missing current link', async () => {
    const wrapper = mountCard({ action: createAction({ url: undefined }) })
    await wrapper.get('[data-testid="feishu-refresh"]').trigger('click')

    expect(wrapper.emitted('refresh')).toEqual([['session-1']])
  })

  it('renders a missing-link status exactly once', () => {
    const wrapper = mountCard({ action: createAction({ url: undefined }) })

    expect(wrapper.text().match(/正在获取当前步骤的最新飞书链接。/g)).toHaveLength(1)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('expires safely: it removes the old URL, disables continue, and offers refresh', async () => {
    const wrapper = mountCard({
      action: createAction({ expires_at: new Date(Date.now() - 1_000).toISOString() })
    })
    await flushPromises()

    expect(wrapper.text()).toContain('链接已过期')
    expect(wrapper.find('[data-testid="feishu-url"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-open-link"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="feishu-continue"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="feishu-refresh"]').exists()).toBe(true)
  })

  it('only shows a URL while the current action remains pending', async () => {
    const wrapper = mountCard({ action: createAction({ action_status: 'completed' }) })
    await flushPromises()

    expect(wrapper.text()).toContain('正在继续原任务')
    expect(wrapper.find('[data-testid="feishu-url"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-open-link"]').exists()).toBe(false)
  })

  it('does not revive a terminal action after its old authorization deadline', () => {
    const wrapper = mountCard({
      action: createAction({
        action_status: 'terminal',
        expires_at: new Date(Date.now() - 1_000).toISOString()
      })
    })

    expect(wrapper.text()).toContain('原飞书任务已结束，请根据最新状态决定下一步。')
    expect(wrapper.text()).not.toContain('重新发送原指令')
    expect(wrapper.find('[data-testid="feishu-refresh"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-continue"]').exists()).toBe(false)
  })

  it.each([
    ['failed', '原飞书任务已结束，请重新发送原指令。'],
    ['unknown', '原飞书操作结果未知，请先在飞书中核对后再试。'],
    ['cancelled', '原飞书操作已取消。']
  ] as const)('renders a safe %s terminal instruction', (terminalState, expected) => {
    const action = Object.assign(createAction({ action_status: 'terminal' }), {
      terminal_state: terminalState
    })
    const wrapper = mountCard({ action })

    expect(wrapper.text()).toContain(expected)
    expect(wrapper.find('[data-testid="feishu-refresh"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-continue"]').exists()).toBe(false)
  })

  it('does not tell the user to replay a succeeded operation', () => {
    const action = Object.assign(createAction({ action_status: 'completed' }), {
      terminal_state: 'succeeded' as const
    })
    const wrapper = mountCard({ action })

    expect(wrapper.text()).toContain('飞书操作已完成，正在继续原任务。')
    expect(wrapper.text()).not.toContain('重新发送原指令')
  })

  it('migrates an expired confirmation without refreshing an authorization link', () => {
    const wrapper = mountCard({
      action: createAction({
        phase: 'confirmation',
        expires_at: new Date(Date.now() - 1_000).toISOString()
      })
    })

    expect(wrapper.text()).toContain('正在继续原任务')
    expect(wrapper.find('[data-testid="feishu-confirm"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-cancel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-refresh"]').exists()).toBe(false)
    expect(wrapper.emitted('confirmed')).toEqual([['op-1']])
    expect(wrapper.emitted('refresh')).toBeUndefined()
  })

  it('lets an expired app-scope authorization rebuild its official approval link', async () => {
    const wrapper = mountCard({
      action: createAction({
        phase: 'app_scope',
        expires_at: new Date(Date.now() - 1_000).toISOString()
      })
    })

    expect(wrapper.text()).toContain('管理员批准步骤已失效，请重新生成链接')
    expect(wrapper.find('[data-testid="feishu-continue"]').exists()).toBe(false)
    await wrapper.get('[data-testid="feishu-refresh"]').trigger('click')
    expect(wrapper.emitted('refresh')).toEqual([['session-1']])
  })

  it('lets a URL-free current app-scope card continue from the already-open Feishu page', async () => {
    const wrapper = mountCard({ action: createAction({ phase: 'app_scope', url: undefined }) })

    expect(wrapper.text()).toContain('请在刚才打开的飞书页面完成批准后继续')
    expect(wrapper.find('[data-testid="feishu-refresh"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="feishu-continue"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-testid="feishu-continue"]').trigger('click')
    expect(wrapper.emitted('resume')).toEqual([['op-1']])
  })

  it('clears the authorization expiry timer once the action is no longer pending', async () => {
    vi.useFakeTimers()
    const wrapper = mountCard({
      action: createAction({ expires_at: new Date(Date.now() + 60_000).toISOString() })
    })

    expect(vi.getTimerCount()).toBe(1)

    await wrapper.setProps({ action: createAction({ action_status: 'completed' }) })

    expect(vi.getTimerCount()).toBe(0)
  })

  it('never renders business confirmation controls', async () => {
    const wrapper = mountCard({ action: createAction({ phase: 'confirmation', url: undefined }) })
    await flushPromises()

    expect(wrapper.find('[data-testid="feishu-confirm"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-cancel"]').exists()).toBe(false)
    expect(wrapper.emitted('confirmed')).toEqual([['op-1']])
  })

  it('migrates an expired legacy confirmation without rendering business confirmation controls', async () => {
    const wrapper = mountCard({
      action: createAction({
        phase: 'confirmation',
        url: undefined,
        expires_at: new Date(Date.now() - 60_000).toISOString()
      })
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="feishu-confirm"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-cancel"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('确认已过期')
    expect(wrapper.emitted('confirmed')).toEqual([['op-1']])
  })

  it('automatically retries a transient legacy confirmation migration failure', async () => {
    vi.useFakeTimers()
    const wrapper = mountCard({
      action: createAction({
        phase: 'confirmation',
        url: undefined,
        expires_at: new Date(Date.now() - 60_000).toISOString()
      })
    })
    expect(wrapper.emitted('confirmed')).toEqual([['op-1']])

    await wrapper.setProps({ error: '服务暂时不可用' })
    await vi.advanceTimersByTimeAsync(900)
    expect(wrapper.emitted('confirmed')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(100)

    expect(wrapper.emitted('confirmed')).toEqual([['op-1'], ['op-1']])
  })

  it('renders the real terminal outcome for a migrated confirmation', () => {
    const action = Object.assign(
      createAction({ phase: 'confirmation', action_status: 'terminal', url: undefined }),
      { terminal_state: 'failed' as const }
    )
    const wrapper = mountCard({ action })

    expect(wrapper.text()).toContain('原飞书任务已结束，请重新发送原指令。')
    expect(wrapper.text()).not.toContain('正在继续原任务。')
    expect(wrapper.emitted('confirmed')).toBeUndefined()
  })

  it('uses polite live announcements and an alert role for actionable errors', () => {
    const wrapper = mountCard({
      action: createAction({ notice_code: 'authorization_pending' }),
      error: '暂时无法刷新链接，请稍后重试。'
    })

    expect(wrapper.get('[data-testid="feishu-notice"]').attributes('aria-live')).toBe('polite')
    expect(wrapper.get('[role="alert"]').text()).toContain('暂时无法刷新链接')
  })
})
