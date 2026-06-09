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
      message: '已获取搜索结果',
      timestamp: '2026-06-09T00:00:00Z'
    }
  ]
})

describe('AgentToolCallList', () => {
  // The user-facing requirement: when generation is done, the tool-call record
  // is folded (only the "已运行 N 步" summary + a one-line preview shows).
  it('collapses to preview when no tool is active (completed / reload)', () => {
    const w = mount(AgentToolCallList, {
      props: { toolGroups: [grp('a', 'result'), grp('b', 'result')] }
    })
    expect(w.find('.tool-detail').exists()).toBe(false) // expanded list NOT shown
    expect(w.find('.tool-preview').exists()).toBe(true) // collapsed preview shown
    expect(w.text()).toContain('已运行 2 步')
  })

  it('stays expanded while a tool is still active (live progress)', () => {
    const w = mount(AgentToolCallList, {
      props: { toolGroups: [grp('a', 'use')] }
    })
    expect(w.find('.tool-detail').exists()).toBe(true)
  })

  it('folds once the last active tool finishes', async () => {
    const w = mount(AgentToolCallList, {
      props: { toolGroups: [grp('a', 'use')] }
    })
    expect(w.find('.tool-detail').exists()).toBe(true)
    await w.setProps({ toolGroups: [grp('a', 'result')] })
    expect(w.find('.tool-detail').exists()).toBe(false)
  })
})
