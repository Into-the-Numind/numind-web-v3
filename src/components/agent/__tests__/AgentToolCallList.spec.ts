import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import AgentToolCallList from '../AgentToolCallList.vue'
import type { ToolCallAggregate, NarrationState } from '@/types/agent'

const grp = (id: string, state: NarrationState, toolName = 'web_search'): ToolCallAggregate => ({
  tool_call_id: id,
  tool_name: toolName,
  current_state: state,
  events: [
    {
      run_id: 1,
      tool_call_id: id,
      tool_name: toolName,
      state,
      message: '正在搜索：X',
      timestamp: '2026-06-14T00:00:00Z'
    }
  ]
})

describe('AgentToolCallList — flat process timeline (no card)', () => {
  it('renders one flat line per tool, with no collapse-card chrome', () => {
    const w = mount(AgentToolCallList, {
      props: { toolGroups: [grp('a', 'result'), grp('b', 'use')] }
    })
    expect(w.findAll('.tl-line')).toHaveLength(2)
    // the old collapsed-card chrome is gone
    expect(w.find('.tool-summary').exists()).toBe(false)
    expect(w.find('.summary-text').exists()).toBe(false)
    expect(w.text()).not.toContain('已运行')
    expect(w.text()).not.toContain('已完成')
  })

  it('renders nothing when there are no tool groups', () => {
    const w = mount(AgentToolCallList, { props: { toolGroups: [] } })
    expect(w.find('.tool-timeline').exists()).toBe(false)
  })

  // #6: ask_user_question is a yield tool that never resolves → its line would spin
  // forever. It is shown by the QuestionPrompt card instead, so the timeline drops it.
  it('filters out ask_user_question (the never-resolving yield) from the timeline', () => {
    const w = mount(AgentToolCallList, {
      props: { toolGroups: [grp('a', 'result'), grp('q', 'use', 'ask_user_question')] }
    })
    expect(w.findAll('.tl-line')).toHaveLength(1)
  })

  it('renders no timeline when the only group is an ask_user_question', () => {
    const w = mount(AgentToolCallList, {
      props: { toolGroups: [grp('q', 'use', 'ask_user_question')] }
    })
    expect(w.find('.tool-timeline').exists()).toBe(false)
  })
})
