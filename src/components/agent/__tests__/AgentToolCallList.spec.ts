import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import AgentToolCallList from '../AgentToolCallList.vue'
import type { ToolCallAggregate, NarrationState } from '@/types/agent'

const grp = (id: string, state: NarrationState): ToolCallAggregate => ({
  tool_call_id: id,
  tool_name: 'web_search',
  current_state: state,
  events: [
    {
      run_id: 1,
      tool_call_id: id,
      tool_name: 'web_search',
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
})
