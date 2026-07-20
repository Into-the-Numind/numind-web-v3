import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import AgentMessageItem from '../AgentMessageItem.vue'
import { useAgentChatStore } from '@/stores/agentChat'
import { useFeishuStore } from '@/stores/feishu'
import type { AgentMessage } from '@/types/agent'
import type { FeishuRefreshResult } from '@/api/feishu'

const ts = '2026-05-21T10:00:00Z'

// Stub real child components — keep AgentMessageItem's own dispatch logic under test,
// but isolate from child side effects (matchMedia, Teleport, Pinia, markdown lib)
const globalStubs = {
  AgentPlanCard: {
    props: ['steps'],
    template: '<div class="plan-stub"><span v-for="s in steps" :key="s">{{ s }}</span></div>'
  },
  AgentToolCallList: {
    props: ['toolGroups'],
    template:
      '<div class="tool-stub"><span v-for="g in toolGroups" :key="g.tool_call_id" :data-state="g.current_state">{{ g.events[g.events.length - 1].message }}</span></div>'
  },
  AgentArtifactItem: {
    props: ['artifact'],
    template: '<div class="artifact-stub"><a :href="artifact.url">{{ artifact.filename }}</a></div>'
  },
  AgentFinalAnswer: {
    props: ['markdown', 'runId'],
    template: '<div class="final-stub">{{ markdown }}</div>'
  },
  AgentImagePreview: {
    props: ['url'],
    template: '<div class="img-preview-stub" :data-url="url"></div>'
  },
  QuestionPrompt: {
    props: ['runId', 'questions', 'answered'],
    emits: ['answer-submitted'],
    template:
      '<button data-testid="question-answer" @click="$emit(\'answer-submitted\', { q: { selected: [], free_text: \'普通回答\' } })">问题卡</button>'
  },
  FeishuActionCard: {
    props: ['action', 'busy', 'error'],
    emits: ['resume', 'refresh', 'confirmed'],
    template: `
      <div data-testid="feishu-action-card-stub" :data-busy="String(busy)" :data-error="error">
        <button data-testid="feishu-resume" @click="$emit('resume', action.operation_id)">继续</button>
        <button data-testid="feishu-refresh" @click="$emit('refresh', action.session_id)">刷新</button>
        <button data-testid="feishu-confirm" @click="$emit('confirmed', action.operation_id)">确认</button>
      </div>
    `
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('AgentMessageItem', () => {
  it('renders user message with text + attachments', () => {
    const msg: AgentMessage = {
      id: '1',
      type: 'user',
      text: 'hello',
      attachments: [{ id: 1, filename: 'a.xlsx', url: 'x' }],
      timestamp: ts
    }
    const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
    expect(wrapper.text()).toContain('hello')
    expect(wrapper.text()).toContain('a.xlsx')
  })

  it('renders assistant text', () => {
    const msg: AgentMessage = { id: '2', type: 'assistant', markdown: 'hi there', timestamp: ts }
    const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
    expect(wrapper.text()).toContain('hi there')
  })

  it('enlarges inline images in the streaming assistant bubble on click', async () => {
    const msg: AgentMessage = {
      id: 'img-1',
      type: 'assistant',
      markdown: '生成好了：\n![图](https://example.com/gen.png)',
      timestamp: ts
    }
    const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
    const img = wrapper.find('.markdown-body img')
    expect(img.exists()).toBe(true)
    await img.trigger('click')
    // 点击图片把 URL 传给共享预览组件
    expect(wrapper.find('.img-preview-stub').attributes('data-url')).toBe(
      'https://example.com/gen.png'
    )
  })

  it('renders plan steps via AgentPlanCard', () => {
    const msg: AgentMessage = {
      id: '3',
      type: 'plan',
      plan_steps: ['step A', 'step B'],
      timestamp: ts
    }
    const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
    expect(wrapper.find('.plan-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('step A')
    expect(wrapper.text()).toContain('step B')
  })

  it('renders tool_group dispatches to AgentToolCallList with both groups', () => {
    const msg: AgentMessage = {
      id: '4',
      type: 'tool_group',
      tool_calls: [
        {
          tool_call_id: 'tc-1',
          tool_name: 'q',
          current_state: 'result',
          events: [
            {
              run_id: 1,
              tool_call_id: 'tc-1',
              tool_name: 'q',
              state: 'result',
              message: '完成',
              timestamp: ts
            }
          ]
        },
        {
          tool_call_id: 'tc-2',
          tool_name: 'q',
          current_state: 'error',
          events: [
            {
              run_id: 1,
              tool_call_id: 'tc-2',
              tool_name: 'q',
              state: 'error',
              message: '失败',
              timestamp: ts
            }
          ]
        }
      ],
      timestamp: ts
    }
    const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
    const stub = wrapper.find('.tool-stub')
    expect(stub.exists()).toBe(true)
    expect(stub.text()).toContain('完成')
    expect(stub.text()).toContain('失败')
    expect(stub.findAll('[data-state]').length).toBe(2)
  })

  it('continued agent-flow message renders under one avatar (no repeated avatar)', () => {
    const msg: AgentMessage = {
      id: 'c',
      type: 'tool_group',
      tool_calls: [],
      timestamp: ts
    }
    const cont = mount(AgentMessageItem, {
      props: { msg, continued: true },
      global: { stubs: globalStubs }
    })
    expect(cont.find('.msg').classes()).toContain('continued')

    const fresh = mount(AgentMessageItem, {
      props: { msg, continued: false },
      global: { stubs: globalStubs }
    })
    expect(fresh.find('.msg').classes()).not.toContain('continued')
  })

  it('renders artifact via AgentArtifactItem', () => {
    const msg: AgentMessage = {
      id: '5',
      type: 'artifact',
      artifact: { id: 1, filename: 'report.docx', url: '/x.docx', mime: 'application/docx' },
      timestamp: ts
    }
    const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
    expect(wrapper.find('a').attributes('href')).toBe('/x.docx')
    expect(wrapper.text()).toContain('report.docx')
  })

  it('renders final_answer markdown via AgentFinalAnswer', () => {
    const msg: AgentMessage = {
      id: '6',
      type: 'final_answer',
      markdown: '## 报告\n内容',
      timestamp: ts
    }
    const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
    expect(wrapper.find('.final-stub').exists()).toBe(true)
    expect(wrapper.text()).toContain('报告')
  })

  it('renders system messages with subtype-based text', () => {
    const types = ['restored', 'stuck', 'cancelled', 'failed', 'retry'] as const
    for (const sub of types) {
      const msg: AgentMessage = {
        id: 's',
        type: 'system',
        system_subtype: sub,
        timestamp: ts
      }
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      expect(wrapper.text().length).toBeGreaterThan(0)
    }
  })

  describe('Feishu external action', () => {
    const externalAction = (): Extract<AgentMessage, { type: 'external_action' }> => ({
      id: 'feishu-action-1',
      type: 'external_action',
      run_id: 7,
      operation_id: 'op-1',
      session_id: 'session-1',
      phase: 'user_auth',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      url: 'https://open.feishu.cn/authorize?opaque=exact',
      action_status: 'pending',
      timestamp: ts
    })

    it('renders an external action card and resumes its server-owned operation without a user bubble', async () => {
      const store = useAgentChatStore()
      const msg = externalAction()
      store.messages = [msg]
      const resume = vi.spyOn(store, 'resumeFeishuOperation').mockResolvedValue({
        operation_id: msg.operation_id,
        state: 'executing'
      })
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })

      expect(wrapper.get('[data-testid="feishu-action-card-stub"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="question-answer"]').exists()).toBe(false)
      await wrapper.get('[data-testid="feishu-resume"]').trigger('click')
      await flushPromises()

      expect(resume).toHaveBeenCalledWith('op-1', 'session-1')
      expect(wrapper.emitted('answer-submitted')).toBeUndefined()
      expect(store.messages).toHaveLength(1)
      expect(store.messages[0].type).toBe('external_action')
    })

    it('routes a legacy confirmation through its compatibility action only', async () => {
      const store = useAgentChatStore()
      const msg = externalAction()
      store.messages = [msg]
      const resume = vi.spyOn(store, 'resumeFeishuOperation').mockResolvedValue({
        operation_id: msg.operation_id,
        state: 'executing'
      })
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })

      await wrapper.get('[data-testid="feishu-confirm"]').trigger('click')
      await flushPromises()

      expect(resume).toHaveBeenCalledOnce()
      expect(resume).toHaveBeenCalledWith('op-1', 'session-1', 'confirmed')
    })

    it('clears an old transport error only when the exact action session changes', async () => {
      const store = useAgentChatStore()
      const msg = externalAction()
      vi.spyOn(store, 'resumeFeishuOperation').mockRejectedValueOnce(new Error('旧链接请求失败'))
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })

      await wrapper.get('[data-testid="feishu-resume"]').trigger('click')
      await flushPromises()
      expect(wrapper.get('[data-testid="feishu-action-card-stub"]').attributes('data-error')).toBe(
        '旧链接请求失败'
      )

      await wrapper.setProps({
        msg: { ...msg, notice_code: 'authorization_pending' as const }
      })
      expect(wrapper.get('[data-testid="feishu-action-card-stub"]').attributes('data-error')).toBe(
        '旧链接请求失败'
      )

      await wrapper.setProps({
        msg: {
          ...msg,
          session_id: 'session-2',
          url: 'https://open.feishu.cn/authorize?opaque=fresh',
          notice_code: 'authorization_updated' as const
        }
      })
      expect(wrapper.get('[data-testid="feishu-action-card-stub"]').attributes('data-error')).toBe(
        ''
      )
    })

    it('does not let an old request clear the busy state or set an error on a new session', async () => {
      const store = useAgentChatStore()
      const msg = externalAction()
      let rejectOld!: (error: Error) => void
      let resolveCurrent!: () => void
      vi.spyOn(store, 'resumeFeishuOperation')
        .mockReturnValueOnce(
          new Promise((_, reject) => {
            rejectOld = reject
          })
        )
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveCurrent = () => resolve({ operation_id: msg.operation_id, state: 'executing' })
          })
        )
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })

      await wrapper.get('[data-testid="feishu-resume"]').trigger('click')
      expect(wrapper.get('[data-testid="feishu-action-card-stub"]').attributes('data-busy')).toBe(
        'true'
      )
      const replacement = {
        ...msg,
        session_id: 'session-current',
        url: 'https://open.feishu.cn/authorize?opaque=current'
      }
      await wrapper.setProps({ msg: replacement })
      expect(wrapper.get('[data-testid="feishu-action-card-stub"]').attributes('data-busy')).toBe(
        'false'
      )
      await wrapper.get('[data-testid="feishu-resume"]').trigger('click')
      expect(wrapper.get('[data-testid="feishu-action-card-stub"]').attributes('data-busy')).toBe(
        'true'
      )

      rejectOld(new Error('旧请求迟到'))
      await flushPromises()
      expect(wrapper.get('[data-testid="feishu-action-card-stub"]').attributes('data-busy')).toBe(
        'true'
      )
      expect(wrapper.get('[data-testid="feishu-action-card-stub"]').attributes('data-error')).toBe(
        ''
      )

      resolveCurrent()
      await flushPromises()
      expect(wrapper.get('[data-testid="feishu-action-card-stub"]').attributes('data-busy')).toBe(
        'false'
      )
    })

    it('keeps an in-flight request busy across a notice-only update', async () => {
      const store = useAgentChatStore()
      const msg = externalAction()
      let resolveRequest!: () => void
      vi.spyOn(store, 'resumeFeishuOperation').mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRequest = () => resolve({ operation_id: msg.operation_id, state: 'executing' })
        })
      )
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })

      await wrapper.get('[data-testid="feishu-resume"]').trigger('click')
      await wrapper.setProps({
        msg: { ...msg, notice_code: 'authorization_processing' as const }
      })

      expect(wrapper.get('[data-testid="feishu-action-card-stub"]').attributes('data-busy')).toBe(
        'true'
      )
      resolveRequest()
      await flushPromises()
      expect(wrapper.get('[data-testid="feishu-action-card-stub"]').attributes('data-busy')).toBe(
        'false'
      )
    })

    it('does not write a late request error after the message item unmounts', async () => {
      const store = useAgentChatStore()
      const msg = externalAction()
      let rejectRequest!: (error: Error) => void
      vi.spyOn(store, 'resumeFeishuOperation').mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectRequest = reject
        })
      )
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      const componentState = wrapper.vm as unknown as {
        feishuActionBusy: boolean
        feishuActionError: string
      }

      await wrapper.get('[data-testid="feishu-resume"]').trigger('click')
      expect(componentState.feishuActionBusy).toBe(true)
      wrapper.unmount()
      rejectRequest(new Error('卸载后的迟到错误'))
      await flushPromises()

      expect(componentState.feishuActionBusy).toBe(true)
      expect(componentState.feishuActionError).toBe('')
    })

    it('does not write a rejected request after the Agent session epoch changes', async () => {
      const store = useAgentChatStore()
      store.beginSession('route-before-resume')
      const msg = externalAction()
      let rejectRequest!: (error: Error) => void
      vi.spyOn(store, 'resumeFeishuOperation').mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectRequest = reject
        })
      )
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      const componentState = wrapper.vm as unknown as {
        feishuActionBusy: boolean
        feishuActionError: string
      }

      await wrapper.get('[data-testid="feishu-resume"]').trigger('click')
      store.beginSession('route-after-resume')
      rejectRequest(new Error('旧路由请求失败'))
      await flushPromises()

      expect(componentState.feishuActionBusy).toBe(true)
      expect(componentState.feishuActionError).toBe('')
    })

    it('refreshes a link into the original external-action message', async () => {
      const agentStore = useAgentChatStore()
      const feishuStore = useFeishuStore()
      const msg = externalAction()
      agentStore.beginSession('route-refresh')
      agentStore.currentRun = {
        id: msg.run_id,
        session_id: 'route-refresh',
        status: 'running',
        state_reason: 'waiting_for_user_choice',
        created_at: '',
        updated_at: ''
      } as never
      agentStore.messages = [msg]
      vi.spyOn(feishuStore, 'refreshAction').mockResolvedValue({
        action: {
          operation_id: msg.operation_id,
          session_id: 'session-2',
          phase: 'user_auth',
          expires_at: new Date(Date.now() + 120_000).toISOString(),
          url: 'https://open.feishu.cn/authorize?opaque=fresh'
        }
      })
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })

      await wrapper.get('[data-testid="feishu-refresh"]').trigger('click')
      await flushPromises()

      expect(feishuStore.refreshAction).toHaveBeenCalledWith('session-1')
      expect(agentStore.messages).toHaveLength(1)
      expect(agentStore.messages[0]).toMatchObject({
        type: 'external_action',
        session_id: 'session-2',
        url: 'https://open.feishu.cn/authorize?opaque=fresh'
      })
    })

    it('recovers a URL-free snapshot action once without waiting for a user reload', async () => {
      const agentStore = useAgentChatStore()
      const feishuStore = useFeishuStore()
      const msg = externalAction()
      delete msg.url
      agentStore.beginSession('route-auto-refresh')
      agentStore.currentRun = {
        id: msg.run_id,
        session_id: 'route-auto-refresh',
        status: 'running',
        state_reason: 'waiting_for_user_choice',
        created_at: '',
        updated_at: ''
      } as never
      agentStore.messages = [msg]
      const refresh = vi.spyOn(feishuStore, 'refreshAction').mockResolvedValue({
        action: {
          operation_id: msg.operation_id,
          session_id: 'session-auto-refreshed',
          phase: 'user_auth',
          expires_at: new Date(Date.now() + 120_000).toISOString(),
          url: 'https://open.feishu.cn/authorize?opaque=auto-refreshed'
        }
      })

      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      await flushPromises()

      expect(refresh).toHaveBeenCalledTimes(1)
      expect(refresh).toHaveBeenCalledWith('session-1')
      expect(agentStore.messages[0]).toMatchObject({
        type: 'external_action',
        session_id: 'session-auto-refreshed',
        url: 'https://open.feishu.cn/authorize?opaque=auto-refreshed'
      })

      await wrapper.setProps({ msg: agentStore.messages[0] })
      await flushPromises()
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    it('keeps a URL-free app-scope approval actionable without an unsupported refresh', async () => {
      const agentStore = useAgentChatStore()
      const feishuStore = useFeishuStore()
      const msg = externalAction()
      msg.phase = 'app_scope'
      delete msg.url
      agentStore.beginSession('route-app-scope-snapshot')
      agentStore.currentRun = {
        id: msg.run_id,
        session_id: 'route-app-scope-snapshot',
        status: 'running',
        state_reason: 'waiting_for_user_choice',
        created_at: '',
        updated_at: ''
      } as never
      agentStore.messages = [msg]
      const refresh = vi.spyOn(feishuStore, 'refreshAction')

      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      await flushPromises()

      expect(refresh).not.toHaveBeenCalled()
      expect(wrapper.get('[data-testid="feishu-resume"]').attributes('disabled')).toBeUndefined()
    })

    it('settles the exact stale action when refresh reports a terminal operation', async () => {
      const agentStore = useAgentChatStore()
      const feishuStore = useFeishuStore()
      const msg = externalAction()
      msg.action_status = 'expired'
      msg.expires_at = new Date(Date.now() - 60_000).toISOString()
      agentStore.beginSession('route-terminal-refresh')
      agentStore.currentRun = {
        id: msg.run_id,
        session_id: 'route-terminal-refresh',
        status: 'running',
        state_reason: 'waiting_for_user_choice',
        created_at: '',
        updated_at: ''
      } as never
      agentStore.messages = [msg]
      vi.spyOn(feishuStore, 'refreshAction').mockResolvedValue({
        terminal: { operation_id: msg.operation_id, state: 'failed' }
      })
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })

      await wrapper.get('[data-testid="feishu-refresh"]').trigger('click')
      await flushPromises()

      expect(agentStore.messages[0]).toMatchObject({
        type: 'external_action',
        operation_id: msg.operation_id,
        action_status: 'terminal'
      })
      expect(agentStore.messages[0]).not.toHaveProperty('url')
      expect(agentStore.currentRun).toMatchObject({
        id: msg.run_id,
        status: 'cancelled',
        state_reason: 'aborted_tools'
      })
    })

    it('keeps observing the exact Agent run when refresh reports a succeeded operation', async () => {
      const agentStore = useAgentChatStore()
      const feishuStore = useFeishuStore()
      const msg = externalAction()
      msg.action_status = 'expired'
      msg.expires_at = new Date(Date.now() - 60_000).toISOString()
      agentStore.beginSession('route-succeeded-refresh')
      agentStore.currentRun = {
        id: msg.run_id,
        session_id: 'route-succeeded-refresh',
        status: 'running',
        state_reason: 'waiting_for_user_choice',
        created_at: '',
        updated_at: ''
      } as never
      agentStore.messages = [msg]
      vi.spyOn(feishuStore, 'refreshAction').mockResolvedValue({
        terminal: { operation_id: msg.operation_id, state: 'succeeded' }
      })
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })

      await wrapper.get('[data-testid="feishu-refresh"]').trigger('click')
      await flushPromises()

      expect(agentStore.messages[0]).toMatchObject({
        type: 'external_action',
        operation_id: msg.operation_id,
        action_status: 'completed',
        terminal_state: 'succeeded'
      })
      expect(agentStore.currentRun).toMatchObject({
        id: msg.run_id,
        status: 'running',
        state_reason: 'external_resume_ready'
      })
      expect(agentStore.isQueuedExternalContinuationActive).toBe(true)
    })

    it('ignores a terminal refresh result for a different operation', async () => {
      const agentStore = useAgentChatStore()
      const feishuStore = useFeishuStore()
      const msg = externalAction()
      agentStore.beginSession('route-mismatched-terminal-refresh')
      agentStore.currentRun = {
        id: msg.run_id,
        session_id: 'route-mismatched-terminal-refresh',
        status: 'running',
        state_reason: 'waiting_for_user_choice',
        created_at: '',
        updated_at: ''
      } as never
      agentStore.messages = [msg]
      vi.spyOn(feishuStore, 'refreshAction').mockResolvedValue({
        terminal: { operation_id: 'op-other', state: 'failed' }
      })
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })

      await wrapper.get('[data-testid="feishu-refresh"]').trigger('click')
      await flushPromises()

      expect(agentStore.messages).toEqual([msg])
    })

    it('does not revive a refresh response after the route session epoch changes', async () => {
      const agentStore = useAgentChatStore()
      const feishuStore = useFeishuStore()
      const msg = externalAction()
      agentStore.beginSession('route-before-refresh')
      agentStore.currentRun = {
        id: msg.run_id,
        session_id: 'route-before-refresh',
        status: 'running',
        state_reason: 'waiting_for_user_choice',
        created_at: '',
        updated_at: ''
      } as never
      agentStore.messages = [msg]
      let resolveRefresh!: (result: FeishuRefreshResult) => void
      vi.spyOn(feishuStore, 'refreshAction').mockReturnValue(
        new Promise((resolve) => {
          resolveRefresh = resolve
        })
      )
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })

      await wrapper.get('[data-testid="feishu-refresh"]').trigger('click')
      agentStore.beginSession('route-after-refresh')
      resolveRefresh({
        action: {
          operation_id: msg.operation_id,
          session_id: 'session-fresh',
          phase: 'user_auth',
          expires_at: new Date(Date.now() + 120_000).toISOString(),
          url: 'https://open.feishu.cn/authorize?opaque=stale'
        }
      })
      await flushPromises()

      expect(agentStore.messages).toEqual([msg])
    })

    it('does not write a refresh response after the current action identity changes', async () => {
      const agentStore = useAgentChatStore()
      const feishuStore = useFeishuStore()
      const msg = externalAction()
      agentStore.beginSession('route-current')
      agentStore.currentRun = {
        id: msg.run_id,
        session_id: 'route-current',
        status: 'running',
        state_reason: 'waiting_for_user_choice',
        created_at: '',
        updated_at: ''
      } as never
      agentStore.messages = [msg]
      let resolveRefresh!: (result: FeishuRefreshResult) => void
      vi.spyOn(feishuStore, 'refreshAction').mockReturnValue(
        new Promise((resolve) => {
          resolveRefresh = resolve
        })
      )
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })

      await wrapper.get('[data-testid="feishu-refresh"]').trigger('click')
      const replacement = {
        ...msg,
        operation_id: 'op-replacement',
        session_id: 'session-replacement',
        url: 'https://open.feishu.cn/authorize?opaque=replacement'
      }
      agentStore.messages = [replacement]
      await wrapper.setProps({ msg: replacement })
      resolveRefresh({
        action: {
          operation_id: msg.operation_id,
          session_id: 'session-fresh',
          phase: 'user_auth',
          expires_at: new Date(Date.now() + 120_000).toISOString(),
          url: 'https://open.feishu.cn/authorize?opaque=stale'
        }
      })
      await flushPromises()

      expect(agentStore.messages).toEqual([replacement])
    })

    it.each([
      ['completed', 'completed'],
      ['terminal', 'error']
    ] as const)(
      'does not revive a %s action when an in-flight refresh response returns',
      async (expectedStatus, terminalReason) => {
        const agentStore = useAgentChatStore()
        const feishuStore = useFeishuStore()
        const msg = externalAction()
        agentStore.beginSession('route-terminal-race')
        agentStore.currentRun = {
          id: msg.run_id,
          session_id: 'route-terminal-race',
          status: 'running',
          state_reason: 'waiting_for_user_choice',
          created_at: '',
          updated_at: ''
        } as never
        agentStore.messages = [msg]
        let resolveRefresh!: (result: FeishuRefreshResult) => void
        vi.spyOn(feishuStore, 'refreshAction').mockReturnValue(
          new Promise((resolve) => {
            resolveRefresh = resolve
          })
        )
        const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })

        await wrapper.get('[data-testid="feishu-refresh"]').trigger('click')
        agentStore.applyStreamEvent(
          {
            type: 'terminal',
            seq: 2,
            ts: new Date().toISOString(),
            run_id: msg.run_id,
            data: { reason: terminalReason, duration_ms: 1, step_count: 1 }
          } as never,
          agentStore.currentSessionEpoch()
        )
        const settled = agentStore.messages[0]
        await wrapper.setProps({ msg: settled })
        expect(settled).toMatchObject({ action_status: expectedStatus })
        expect(settled).not.toHaveProperty('url')

        resolveRefresh({
          action: {
            operation_id: msg.operation_id,
            session_id: 'session-fresh',
            phase: 'user_auth',
            expires_at: new Date(Date.now() + 120_000).toISOString(),
            url: 'https://open.feishu.cn/authorize?opaque=stale'
          }
        })
        await flushPromises()

        expect(agentStore.messages[0]).toMatchObject({ action_status: expectedStatus })
        expect(agentStore.messages[0]).not.toHaveProperty('url')
      }
    )

    it('keeps ordinary questions on the existing answer-submitted path', async () => {
      const msg: AgentMessage = {
        id: 'question-1',
        type: 'question_prompt',
        run_id: 7,
        questions: [{ question: '下一步？', options: [], multi_select: false }],
        answer_status: 'pending',
        pause_type: 'question',
        timestamp: ts
      }
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })

      await wrapper.get('[data-testid="question-answer"]').trigger('click')
      expect(wrapper.emitted('answer-submitted')).toEqual([
        [7, { q: { selected: [], free_text: '普通回答' } }]
      ])
    })

    it('does not convert legacy auth questions into an ordinary answer submission', () => {
      const msg: AgentMessage = {
        id: 'legacy-auth-1',
        type: 'question_prompt',
        run_id: 7,
        questions: [{ question: '请完成飞书授权', options: [], multi_select: false }],
        answer_status: 'pending',
        pause_type: 'auth',
        auth_url: 'https://open.feishu.cn/legacy',
        timestamp: ts
      }
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })

      expect(wrapper.find('[data-testid="question-answer"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="feishu-action-card-stub"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="legacy-feishu-auth-notice"]').text()).toContain(
        '旧的飞书授权步骤已失效'
      )
      expect(wrapper.html()).not.toContain('https://open.feishu.cn/legacy')
      expect(wrapper.emitted('answer-submitted')).toBeUndefined()
    })
  })

  // agent-wait-ux 5a (dev run 150): the long final-report generation has a 1-3
  // min tool-silent window; the old copy "任务似乎卡住了" framed that normal
  // wait as a fault. The hint must read as "still working", not "stuck".
  it('stuck hint reads as still-working, not a fault', () => {
    const msg: AgentMessage = { id: 's', type: 'system', system_subtype: 'stuck', timestamp: ts }
    const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
    const text = wrapper.text()
    expect(text).not.toContain('卡住')
    expect(text).toMatch(/处理|生成|稍候|耐心|继续/)
  })

  // T12 — streaming cursor
  describe('streaming cursor', () => {
    it('shows ▎ cursor when isStreaming=true', () => {
      const msg: AgentMessage = {
        id: 'sc-1',
        type: 'assistant',
        markdown: 'Hello world',
        isStreaming: true,
        timestamp: ts
      }
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      expect(wrapper.find('.streaming-cursor').exists()).toBe(true)
      expect(wrapper.find('.streaming-cursor').text()).toBe('▎')
    })

    it('hides cursor when isStreaming=false', () => {
      const msg: AgentMessage = {
        id: 'sc-2',
        type: 'assistant',
        markdown: 'Done streaming',
        isStreaming: false,
        timestamp: ts
      }
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      expect(wrapper.find('.streaming-cursor').exists()).toBe(false)
    })

    it('hides cursor when isStreaming is absent', () => {
      const msg: AgentMessage = {
        id: 'sc-3',
        type: 'assistant',
        markdown: 'No streaming field',
        timestamp: ts
      }
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      expect(wrapper.find('.streaming-cursor').exists()).toBe(false)
    })

    it('cursor stays at end as markdown grows (re-render)', async () => {
      const msg: AgentMessage = {
        id: 'sc-4',
        type: 'assistant',
        markdown: 'Start',
        isStreaming: true,
        timestamp: ts
      }
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      expect(wrapper.find('.streaming-cursor').exists()).toBe(true)

      // simulate token delta by updating the prop
      await wrapper.setProps({
        msg: { ...msg, markdown: 'Start growing text...' }
      })
      expect(wrapper.find('.streaming-cursor').exists()).toBe(true)
      // cursor must remain the last child of .streaming-answer (after .markdown-body) as markdown grows
      const answerEl = wrapper.find('.msg-assistant .streaming-answer')
      const lastChild = answerEl.element.lastElementChild as Element
      expect(lastChild.textContent).toBe('▎')
    })

    it('cursor disappears when isStreaming transitions to false', async () => {
      const msg: AgentMessage = {
        id: 'sc-5',
        type: 'assistant',
        markdown: 'Streaming...',
        isStreaming: true,
        timestamp: ts
      }
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      expect(wrapper.find('.streaming-cursor').exists()).toBe(true)

      await wrapper.setProps({
        msg: { ...msg, markdown: 'Streaming... done', isStreaming: false }
      })
      expect(wrapper.find('.streaming-cursor').exists()).toBe(false)
    })
  })

  // followup3 FE-3: the live "writing code" box shows the active generation tool's
  // streamed argument content and collapses once the tool finishes.
  describe('streaming code box (FE-3)', () => {
    function seedActiveCodeTool(store: ReturnType<typeof useAgentChatStore>): void {
      store.applyStreamEvent({
        type: 'tool_call_start',
        seq: 1,
        ts,
        run_id: 1,
        step: 0,
        data: { tool_call_id: 'tc-code', tool_name: 'run_python', input_digest: 'd' }
      })
      store.applyStreamEvent({
        type: 'tool_call_args_delta',
        seq: 2,
        ts,
        run_id: 1,
        step: 0,
        data: { tool_call_id: 'tc-code', function_name: 'run_python', args_delta: 'print(1)\n' }
      })
    }

    it('renders the code box with streamed content while a generation tool is active', async () => {
      const store = useAgentChatStore()
      seedActiveCodeTool(store)
      const msg: AgentMessage = {
        id: 'cb-1',
        type: 'assistant',
        markdown: '',
        isStreaming: true,
        timestamp: ts
      }
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      await flushPromises()
      const box = wrapper.find('.code-stream-body')
      expect(box.exists()).toBe(true)
      expect(box.text()).toContain('print(1)')
      // default expanded
      expect(wrapper.find('.code-stream-toggle').exists()).toBe(true)
    })

    it('keeps the "正在生成…" indicator visible alongside the code box (FE-3 review P1)', async () => {
      const store = useAgentChatStore()
      seedActiveCodeTool(store)
      const msg: AgentMessage = {
        id: 'cb-p1',
        type: 'assistant',
        markdown: '',
        isStreaming: true,
        timestamp: ts
      }
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      await flushPromises()
      // spinner indicator and code box must co-exist while a tool streams its code —
      // they used to be mutually exclusive (isGenerating suppressed by active tool).
      expect(wrapper.find('.generation-stall').exists()).toBe(true)
      expect(wrapper.find('.code-stream-body').exists()).toBe(true)
    })

    it('toggles the code box via the arrow button (collapse hides body, expand shows it)', async () => {
      const store = useAgentChatStore()
      seedActiveCodeTool(store)
      const msg: AgentMessage = {
        id: 'cb-toggle',
        type: 'assistant',
        markdown: '',
        isStreaming: true,
        timestamp: ts
      }
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      await flushPromises()
      const toggle = wrapper.find('.code-stream-toggle')
      // aria-expanded mirrors codeBoxExpanded — definitive signal for the toggle
      // logic (more robust than isVisible() against jsdom v-show display:none).
      expect(toggle.attributes('aria-expanded')).toBe('true') // default expanded
      await toggle.trigger('click')
      expect(wrapper.find('.code-stream-toggle').attributes('aria-expanded')).toBe('false')
      // body is hidden (v-show → inline display:none) when collapsed
      expect(wrapper.find('.code-stream-body').attributes('style')).toContain('display: none')
      await wrapper.find('.code-stream-toggle').trigger('click')
      expect(wrapper.find('.code-stream-toggle').attributes('aria-expanded')).toBe('true')
    })

    it('hides the code box at the step boundary (step_done)', async () => {
      const store = useAgentChatStore()
      seedActiveCodeTool(store)
      const msg: AgentMessage = {
        id: 'cb-2',
        type: 'assistant',
        markdown: '',
        isStreaming: true,
        timestamp: ts
      }
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      await flushPromises()
      expect(wrapper.find('.code-stream-body').exists()).toBe(true)
      // step boundary → buffer cleared → activeCodeStream empties → box collapses.
      // (NOT tool_call_result — args-delta provider id ≠ result backend UUID.)
      store.applyStreamEvent({ type: 'step_done', seq: 3, ts, run_id: 1, step: 0, data: {} })
      await flushPromises()
      expect(wrapper.find('.code-stream-body').exists()).toBe(false)
    })

    it('does not render the code box when the bubble is not streaming', async () => {
      const store = useAgentChatStore()
      seedActiveCodeTool(store)
      const msg: AgentMessage = {
        id: 'cb-3',
        type: 'assistant',
        markdown: 'done',
        isStreaming: false,
        timestamp: ts
      }
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      await flushPromises()
      expect(wrapper.find('.code-stream-body').exists()).toBe(false)
    })
  })

  // followup3 FE-1: the token-silent "正在生成…" indicator is a LEADING spinner
  // + text, NOT trailing pulsing dots. Regression guard so a revert to .gen-dots
  // (or removal of the spinner) fails here.
  describe('generation indicator (FE-1 spinner)', () => {
    it('shows a leading spinner + "正在生成…" while streaming-but-silent, with no pulse dots', async () => {
      const store = useAgentChatStore()
      // Force isGenerationStalled() true: streaming, no active tool, last delta long ago.
      store.lastStreamDeltaAt = Date.now() - 5000
      const msg: AgentMessage = {
        id: 'gen-1',
        type: 'assistant',
        markdown: 'partial',
        isStreaming: true,
        timestamp: ts
      }
      const wrapper = mount(AgentMessageItem, { props: { msg }, global: { stubs: globalStubs } })
      await flushPromises()
      const stall = wrapper.find('.generation-stall')
      expect(stall.exists()).toBe(true)
      expect(stall.text()).toContain('正在生成')
      // spinner present; the old pulse-dots element is gone
      expect(wrapper.find('.gen-spinner').exists()).toBe(true)
      expect(wrapper.find('.gen-dots').exists()).toBe(false)
      // and the bare caret is not shown when the generation indicator is up
      expect(wrapper.find('.streaming-cursor').exists()).toBe(false)
    })
  })
})
