import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import AgentMessageItem from '../AgentMessageItem.vue'
import type { AgentMessage } from '@/types/agent'

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
    props: ['markdown', 'runId', 'initialFeedback', 'initialNote'],
    template: '<div class="final-stub">{{ markdown }}</div>'
  },
  AgentImagePreview: {
    props: ['url'],
    template: '<div class="img-preview-stub" :data-url="url"></div>'
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
})
