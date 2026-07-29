import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { FeishuStatus } from '@/api/feishu'

const push = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push })
}))

vi.mock('@/api/feishu', () => ({
  connectFeishu: vi.fn(),
  continueFeishuConnection: vi.fn(),
  getFeishuStatus: vi.fn(),
  refreshFeishuAction: vi.fn(),
  resumeFeishuOperation: vi.fn(),
  unbindFeishuConnection: vi.fn()
}))

import * as api from '@/api/feishu'
import FeishuConnection from '../FeishuConnection.vue'

const status = (overrides: Partial<FeishuStatus> = {}): FeishuStatus => ({
  state: 'none',
  connected: false,
  capabilities: {
    docs: { state: 'unknown' },
    base: { state: 'unknown' },
    wiki: { state: 'unknown' }
  },
  ...overrides
})

const mountConnection = (): VueWrapper =>
  mount(FeishuConnection, {
    global: {
      plugins: [createPinia()]
    }
  })

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('FeishuConnection', () => {
  it('renders a loading skeleton until the read-only status request settles', async () => {
    let resolve!: (value: FeishuStatus) => void
    vi.mocked(api.getFeishuStatus).mockReturnValue(
      new Promise<FeishuStatus>((done) => {
        resolve = done
      })
    )

    const wrapper = mountConnection()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[data-testid="feishu-connection-loading"]').attributes('aria-busy')).toBe('true')

    resolve(status())
    await flushPromises()
    expect(wrapper.find('[data-testid="feishu-connection-loading"]').exists()).toBe(false)
  })

  it('shows an unconnected state without making Settings a Feishu connection entry', async () => {
    vi.mocked(api.getFeishuStatus).mockResolvedValue(status())
    const wrapper = mountConnection()
    await flushPromises()

    expect(wrapper.get('[data-testid="feishu-connection-empty"]').text()).toContain('未连接')
    expect(wrapper.find('[data-testid="feishu-connect"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('直接在 AI 助手中提出飞书任务')
    expect(wrapper.text()).not.toContain('首次使用时按需授权')
    expect(wrapper.text()).not.toContain('发送消息')
    expect(wrapper.text()).not.toContain('IM')
    expect(api.connectFeishu).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('shows a pending connection action as read-only status without restoring or continuing', async () => {
    vi.mocked(api.getFeishuStatus).mockResolvedValue(status({
      state: 'waiting_user_auth',
      active_action: {
        operation_id: 'connect-op-1',
        session_id: 'connect-session-1',
        phase: 'user_auth',
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        link_available: false
      }
    }))
    const wrapper = mountConnection()
    await flushPromises()

    expect(wrapper.text()).toContain('等待授权')
    expect(wrapper.find('[data-testid="feishu-manual-action"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-manual-restore"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-manual-continue"]').exists()).toBe(false)
    expect(api.refreshFeishuAction).not.toHaveBeenCalled()
    expect(api.resumeFeishuOperation).not.toHaveBeenCalled()
    expect(api.continueFeishuConnection).not.toHaveBeenCalled()
  })

  it('does not expose a live authorization URL from Settings', async () => {
    vi.mocked(api.getFeishuStatus).mockResolvedValue(status({
      state: 'waiting_user_auth',
      active_action: {
        operation_id: 'connect-op-2',
        session_id: 'connect-session-2',
        phase: 'user_auth',
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        url: 'https://open.feishu.cn/open-apis/authen/v1/authorize?state=settings'
      }
    }))
    const wrapper = mountConnection()
    await flushPromises()

    expect(wrapper.text()).toContain('等待授权')
    expect(wrapper.find('[data-testid="feishu-manual-action"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-open-action"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-manual-continue"]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('state=settings')
  })

  it('renders a recoverable status error with a retry action', async () => {
    vi.mocked(api.getFeishuStatus).mockRejectedValueOnce(new Error('状态服务暂不可用'))
    vi.mocked(api.getFeishuStatus).mockResolvedValueOnce(status())
    const wrapper = mountConnection()
    await flushPromises()

    expect(wrapper.get('[data-testid="feishu-connection-error"]').attributes('role')).toBe('alert')
    expect(wrapper.text()).toContain('状态服务暂不可用')

    await wrapper.get('[data-testid="feishu-status-retry"]').trigger('click')
    await flushPromises()
    expect(api.getFeishuStatus).toHaveBeenCalledTimes(2)
  })

  it('renders the connected state as a compact status row without secondary details', async () => {
    vi.mocked(api.getFeishuStatus).mockResolvedValue(
      status({
        state: 'connected',
        connected: true,
        app_id_masked: 'cli_****8f2a',
        capabilities: {
          docs: { state: 'unknown' },
          base: { state: 'available' },
          wiki: { state: 'revoked' }
        }
      })
    )
    const wrapper = mountConnection()
    await flushPromises()

    const cardText = wrapper.get('[data-testid="feishu-connection-success"]').text()
    expect(cardText).toContain('飞书')
    expect(cardText).toContain('已连接')
    expect(cardText).not.toContain('重新授权')
    expect(cardText).not.toContain('解绑')
    expect(wrapper.find('[data-testid="feishu-reauthorize"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-unbind"]').exists()).toBe(false)
    expect(cardText).not.toContain('cli_****8f2a')
    expect(wrapper.find('[data-testid="feishu-capability-docs"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-capability-base"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-capability-wiki"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('不包含消息发送')
  })

  it('does not expose a Settings connection control for a waiting authorization state', async () => {
    vi.mocked(api.getFeishuStatus).mockResolvedValue(status({ state: 'waiting_user_auth', connected: false }))
    const wrapper = mountConnection()
    await flushPromises()

    expect(wrapper.text()).toContain('等待授权')
    expect(wrapper.find('[data-testid="feishu-connect"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-continue-connection"]').exists()).toBe(false)
    expect(api.connectFeishu).not.toHaveBeenCalled()
  })

  it('shows reauthorization required without starting Settings authorization', async () => {
    vi.mocked(api.getFeishuStatus).mockResolvedValue(
      status({ state: 'reauth_required', connected: false, app_id_masked: 'cli_****recover' })
    )
    const wrapper = mountConnection()
    await flushPromises()

    expect(wrapper.text()).toContain('需要重新授权')
    expect(wrapper.find('[data-testid="feishu-reauthorize"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-manual-action"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('cli_****recover')
    expect(push).not.toHaveBeenCalled()
    expect(api.connectFeishu).not.toHaveBeenCalled()
  })

  it('keeps a disconnecting workspace out of the Agent connection path until cleanup finishes', async () => {
    vi.mocked(api.getFeishuStatus).mockResolvedValue(status({ state: 'disconnecting', connected: false }))
    const wrapper = mountConnection()
    await flushPromises()

    expect(wrapper.text()).toContain('正在解绑')
    expect(wrapper.find('[data-testid="feishu-connect"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-continue-connection"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-reauthorize"]').exists()).toBe(false)

    await wrapper.get('[data-testid="feishu-refresh-disconnecting"]').trigger('click')
    await flushPromises()
    expect(api.connectFeishu).not.toHaveBeenCalled()
    expect(api.getFeishuStatus).toHaveBeenCalledTimes(2)
  })

  it('shows an Agent-owned business authorization as read-only instead of duplicating it', async () => {
    vi.mocked(api.getFeishuStatus).mockResolvedValue(status({
      state: 'waiting_user_auth',
      in_agent_flow: true
    }))
    const wrapper = mountConnection()
    await flushPromises()

    expect(wrapper.text()).toContain('等待授权')
    expect(wrapper.find('[data-testid="feishu-continue-connection"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-manual-action"]').exists()).toBe(false)
    expect(api.connectFeishu).not.toHaveBeenCalled()
  })

})
