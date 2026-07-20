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
  getFeishuStatus: vi.fn(),
  refreshFeishuAction: vi.fn(),
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

  it('starts the server-owned connection flow when an unconnected user clicks connect', async () => {
    vi.mocked(api.getFeishuStatus).mockResolvedValue(status())
    vi.mocked(api.connectFeishu).mockResolvedValue({
      state: 'waiting_user_auth',
      action: {
        operation_id: '',
        session_id: 'manual-connect-session',
        phase: 'user_auth',
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        url: 'https://open.feishu.cn/open-apis/authen/v1/authorize?state=opaque'
      }
    })
    const wrapper = mountConnection()
    await flushPromises()

    expect(wrapper.get('[data-testid="feishu-connection-empty"]').text()).toContain('直接在 AI 助手中提出飞书任务')
    expect(wrapper.text()).toContain('首次使用时按需授权')
    expect(wrapper.text()).not.toContain('发送消息')
    expect(wrapper.text()).not.toContain('IM')

    await wrapper.get('[data-testid="feishu-connect"]').trigger('click')
    await flushPromises()
    expect(api.connectFeishu).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="feishu-manual-action"]').text()).toContain('打开飞书完成授权')
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

  it('shows the masked app ID and independent Docs, Base, Wiki capability states', async () => {
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

    expect(wrapper.get('[data-testid="feishu-connection-success"]').text()).toContain('cli_****8f2a')
    expect(wrapper.get('[data-testid="feishu-capability-docs"]').text()).toContain('尚未验证')
    expect(wrapper.get('[data-testid="feishu-capability-base"]').text()).toContain('可用')
    expect(wrapper.get('[data-testid="feishu-capability-wiki"]').text()).toContain('已撤销')
    expect(wrapper.text()).toContain('不包含消息发送')
  })

  it.each([
    ['waiting_user_auth', '继续连接', 'feishu-continue-connection', undefined],
    ['reauth_required', '重新授权', 'feishu-reauthorize', 'cli_****recover']
  ] as const)('uses the Agent entry for %s without directly creating another connection', async (stateName, label, testId, appIdMasked) => {
    vi.mocked(api.getFeishuStatus).mockResolvedValue(
      status({ state: stateName, connected: false, app_id_masked: appIdMasked })
    )
    const wrapper = mountConnection()
    await flushPromises()

    expect(wrapper.get(`[data-testid="${testId}"]`).text()).toContain(label)
    if (appIdMasked) expect(wrapper.text()).toContain(appIdMasked)
    await wrapper.get(`[data-testid="${testId}"]`).trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'home' })
    expect(api.connectFeishu).not.toHaveBeenCalled()
  })

  it('keeps a disconnecting workspace out of the Agent connection path until cleanup finishes', async () => {
    vi.mocked(api.getFeishuStatus).mockResolvedValue(status({ state: 'disconnecting', connected: false }))
    const wrapper = mountConnection()
    await flushPromises()

    expect(wrapper.text()).toContain('正在安全删除')
    expect(wrapper.find('[data-testid="feishu-connect"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-continue-connection"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="feishu-reauthorize"]').exists()).toBe(false)

    await wrapper.get('[data-testid="feishu-refresh-disconnecting"]').trigger('click')
    await flushPromises()
    expect(api.connectFeishu).not.toHaveBeenCalled()
    expect(api.getFeishuStatus).toHaveBeenCalledTimes(2)
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
