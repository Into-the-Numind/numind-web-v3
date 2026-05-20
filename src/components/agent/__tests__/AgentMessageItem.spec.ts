import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import AgentMessageItem from '../AgentMessageItem.vue'
import type { AgentMessage } from '@/types/agent'

const ts = '2026-05-21T10:00:00Z'

describe('AgentMessageItem', () => {
  it('renders user message with text + attachments', () => {
    const msg: AgentMessage = {
      id: '1',
      type: 'user',
      text: 'hello',
      attachments: [{ id: 1, filename: 'a.xlsx', url: 'x' }],
      timestamp: ts
    }
    const wrapper = mount(AgentMessageItem, { props: { msg } })
    expect(wrapper.text()).toContain('hello')
    expect(wrapper.text()).toContain('a.xlsx')
  })

  it('renders assistant text', () => {
    const msg: AgentMessage = { id: '2', type: 'assistant', markdown: 'hi there', timestamp: ts }
    const wrapper = mount(AgentMessageItem, { props: { msg } })
    expect(wrapper.text()).toContain('hi there')
  })

  it('renders plan steps', () => {
    const msg: AgentMessage = {
      id: '3',
      type: 'plan',
      plan_steps: ['step A', 'step B'],
      timestamp: ts
    }
    const wrapper = mount(AgentMessageItem, { props: { msg } })
    expect(wrapper.text()).toContain('step A')
    expect(wrapper.text()).toContain('step B')
  })

  it('renders tool_group with icons based on current_state', () => {
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
    const wrapper = mount(AgentMessageItem, { props: { msg } })
    expect(wrapper.text()).toContain('✓')
    expect(wrapper.text()).toContain('⚠️')
  })

  it('renders artifact as link', () => {
    const msg: AgentMessage = {
      id: '5',
      type: 'artifact',
      artifact: { id: 1, filename: 'report.docx', url: '/x.docx', mime: 'application/docx' },
      timestamp: ts
    }
    const wrapper = mount(AgentMessageItem, { props: { msg } })
    expect(wrapper.find('a').attributes('href')).toBe('/x.docx')
    expect(wrapper.text()).toContain('report.docx')
  })

  it('renders final_answer markdown', () => {
    const msg: AgentMessage = {
      id: '6',
      type: 'final_answer',
      markdown: '## 报告\n内容',
      timestamp: ts
    }
    const wrapper = mount(AgentMessageItem, { props: { msg } })
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
      const wrapper = mount(AgentMessageItem, { props: { msg } })
      expect(wrapper.text().length).toBeGreaterThan(0)
    }
  })
})
