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
      plugins: [createPinia()],
      stubs: {
        ConfirmModal: {
          props: ['modelValue', 'title', 'message'],
          emits: ['confirm', 'update:modelValue'],
          template: `
            <div v-if="modelValue" data-testid="disconnect-confirm">
              <p>{{ title }}</p><p>{{ message }}</p>
              <button data-testid="confirm-disconnect" @click="$emit('confirm')">解绑</button>
            </div>
          `
        }
      }
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

  it('restores a URL-free exact action before allowing completion', async () => {
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
    vi.mocked(api.refreshFeishuAction).mockResolvedValue({
      action: {
        operation_id: 'connect-op-1',
        session_id: 'connect-session-2',
        phase: 'user_auth',
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        url: 'https://open.feishu.cn/open-apis/authen/v1/authorize?state=restored'
      }
    })
    const wrapper = mountConnection()
    await flushPromises()

    expect(wrapper.find('[data-testid="feishu-manual-continue"]').exists()).toBe(false)
    await wrapper.get('[data-testid="feishu-manual-restore"]').trigger('click')
    await flushPromises()

    expect(api.refreshFeishuAction).toHaveBeenCalledWith('connect-session-1')
    expect(wrapper.get('[data-testid="feishu-open-action"]').attributes('href')).toContain('state=restored')
    expect(wrapper.get('[data-testid="feishu-manual-continue"]').exists()).toBe(true)
  })

  it('removes a cancelled old connection card and refreshes to the current state', async () => {
	const liveStatus = status({
	  state: 'waiting_user_auth',
	  active_action: {
		operation_id: 'stale-op',
		session_id: 'stale-session',
		phase: 'user_auth',
		expires_at: new Date(Date.now() + 300_000).toISOString(),
		link_available: false
	  }
	})
	vi.mocked(api.getFeishuStatus).mockResolvedValueOnce(liveStatus).mockResolvedValueOnce(status())
	vi.mocked(api.refreshFeishuAction).mockResolvedValue({
	  action: {
		operation_id: 'stale-op',
		session_id: 'stale-session-live',
		phase: 'user_auth',
		expires_at: new Date(Date.now() + 300_000).toISOString(),
		url: 'https://open.feishu.cn/open-apis/authen/v1/authorize?state=stale'
	  }
	})
	vi.mocked(api.resumeFeishuOperation).mockResolvedValue({
	  operation_id: 'stale-op',
	  state: 'cancelled'
	})
	const wrapper = mountConnection()
	await flushPromises()
	await wrapper.get('[data-testid="feishu-manual-restore"]').trigger('click')
	await flushPromises()

	await wrapper.get('[data-testid="feishu-manual-continue"]').trigger('click')
	await flushPromises()

	expect(api.resumeFeishuOperation).toHaveBeenCalledWith('stale-op', 'stale-session-live')
	expect(api.getFeishuStatus).toHaveBeenCalledTimes(2)
	expect(wrapper.find('[data-testid="feishu-manual-action"]').exists()).toBe(false)
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
    expect(cardText).toContain('重新授权')
    expect(cardText).toContain('解绑')
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

  it('keeps reauthorization as a maintenance action', async () => {
    vi.mocked(api.getFeishuStatus).mockResolvedValue(
      status({ state: 'reauth_required', connected: false, app_id_masked: 'cli_****recover' })
    )
    vi.mocked(api.connectFeishu).mockResolvedValue({ state: 'reauth_required' })
    const wrapper = mountConnection()
    await flushPromises()

    expect(wrapper.get('[data-testid="feishu-reauthorize"]').text()).toContain('重新授权')
    expect(wrapper.text()).not.toContain('cli_****recover')
    await wrapper.get('[data-testid="feishu-reauthorize"]').trigger('click')
    await flushPromises()
    expect(push).not.toHaveBeenCalled()
    expect(api.connectFeishu).toHaveBeenCalledTimes(1)
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

  it('uses ConfirmModal before unbinding and clarifies that the remote app remains', async () => {
    vi.mocked(api.getFeishuStatus).mockResolvedValue(status({ state: 'connected', connected: true }))
    vi.mocked(api.unbindFeishuConnection).mockResolvedValue({
      state: 'none',
      connected: false,
      message: '有数侧连接已删除'
    })
    const wrapper = mountConnection()
    await flushPromises()

    await wrapper.get('[data-testid="feishu-unbind"]').trigger('click')
    expect(wrapper.get('[data-testid="disconnect-confirm"]').text()).toContain('远端应用会保留')

    await wrapper.get('[data-testid="confirm-disconnect"]').trigger('click')
    await flushPromises()
    expect(api.unbindFeishuConnection).toHaveBeenCalledOnce()
  })
})
