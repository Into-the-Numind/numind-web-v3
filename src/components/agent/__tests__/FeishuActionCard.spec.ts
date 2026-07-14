import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import type { ExternalActionMessage } from '@/types/agent'

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,feishu-qr'))
  }
}))

vi.mock('@/utils/clipboard', () => ({
  copyText: vi.fn(() => Promise.resolve(true))
}))

import QRCode from 'qrcode'
import { copyText } from '@/utils/clipboard'
import FeishuActionCard from '../FeishuActionCard.vue'

const AUTH_URL =
  'https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=cli_x&redirect_uri=https%3A%2F%2Fnumind.example%2Fcallback&state=opaque-value'

const createAction = (
  overrides: Partial<ExternalActionMessage> = {}
): ExternalActionMessage => ({
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
    ['user_auth', '授权并继续', '请授权本次任务需要的文档权限'],
    ['confirmation', '确认继续原任务', '确认后将继续执行本次飞书操作']
  ] as const)('renders the precise %s phase copy', async (phase, heading, description) => {
    const wrapper = mountCard({ action: createAction({ phase, url: undefined }) })
    await flushPromises()

    expect(wrapper.find('[data-testid="feishu-phase"]').text()).toContain(heading)
    expect(wrapper.text()).toContain(description)
  })

  it('shows, copies, and QR-encodes the exact same complete URL bytes', async () => {
    const wrapper = mountCard()
    await flushPromises()

    expect(wrapper.get('[data-testid="feishu-url"]').text()).toBe(AUTH_URL)
    expect(wrapper.get('[data-testid="feishu-open-link"]').attributes('href')).toBe(AUTH_URL)
    expect(QRCode.toDataURL).toHaveBeenCalledWith(AUTH_URL, expect.any(Object))

    await wrapper.get('[data-testid="feishu-copy-link"]').trigger('click')
    await flushPromises()
    expect(copyText).toHaveBeenCalledWith(AUTH_URL)
    expect(wrapper.get('[data-testid="feishu-copy-link"]').text()).toContain('已复制')
  })

  it('regenerates the QR code when the server replaces the current opaque URL', async () => {
    const wrapper = mountCard()
    await flushPromises()
    const freshURL = `${AUTH_URL}&refresh=2`

    await wrapper.setProps({ action: createAction({ url: freshURL }) })
    await flushPromises()

    expect(wrapper.get('[data-testid="feishu-url"]').text()).toBe(freshURL)
    expect(QRCode.toDataURL).toHaveBeenLastCalledWith(freshURL, expect.any(Object))
  })

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

    expect(wrapper.text()).toContain('此操作已结束')
    expect(wrapper.find('[data-testid="feishu-refresh"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-continue"]').exists()).toBe(false)
  })

  it('treats an expired confirmation as terminal and never refreshes its operation id', () => {
    const wrapper = mountCard({
      action: createAction({
        phase: 'confirmation',
        expires_at: new Date(Date.now() - 1_000).toISOString()
      })
    })

    expect(wrapper.text()).toContain('确认已过期，请重新发起')
    expect(wrapper.find('[data-testid="feishu-confirm"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-cancel"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-refresh"]').exists()).toBe(false)
    expect(wrapper.emitted('refresh')).toBeUndefined()
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

  it('emits distinct confirmation and cancellation lifecycle actions', async () => {
    const wrapper = mountCard({ action: createAction({ phase: 'confirmation', url: undefined }) })

    await wrapper.get('[data-testid="feishu-confirm"]').trigger('click')
    await wrapper.get('[data-testid="feishu-cancel"]').trigger('click')

    expect(wrapper.emitted('confirmed')).toEqual([['op-1']])
    expect(wrapper.emitted('cancelled')).toEqual([['op-1']])
  })

  it('uses polite live announcements and an alert role for actionable errors', () => {
    const wrapper = mountCard({ error: '暂时无法刷新链接，请稍后重试。' })

    expect(wrapper.get('[data-testid="feishu-action-card"]').attributes('aria-live')).toBe('polite')
    expect(wrapper.get('[role="alert"]').text()).toContain('暂时无法刷新链接')
  })
})
