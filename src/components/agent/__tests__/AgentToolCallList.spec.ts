import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import AgentToolCallList from '../AgentToolCallList.vue'
import type { ToolCallAggregate, NarrationState } from '@/types/agent'

const grpAt = (id: string, state: NarrationState, timestamps: string[]): ToolCallAggregate => ({
  tool_call_id: id,
  tool_name: 'web_search',
  current_state: state,
  events: timestamps.map((ts) => ({
    run_id: 1,
    tool_call_id: id,
    tool_name: 'web_search',
    state,
    message: '已获取搜索结果',
    timestamp: ts
  }))
})

const grp = (id: string, state: NarrationState): ToolCallAggregate =>
  grpAt(id, state, ['2026-06-09T00:00:00Z'])

describe('AgentToolCallList', () => {
  // When generation is done, the record folds: only the progress summary
  // ("已完成 N 步") + a one-line preview of the last step shows.
  it('collapses to preview when no tool is active (completed / reload)', () => {
    const w = mount(AgentToolCallList, {
      props: { toolGroups: [grp('a', 'result'), grp('b', 'result')] }
    })
    expect(w.find('.tool-detail').exists()).toBe(false) // expanded list NOT shown
    expect(w.find('.tool-preview').exists()).toBe(true) // collapsed preview shown
    expect(w.text()).toContain('已完成 2 步')
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

  // While running, show a live progress count so a long silent step never reads
  // as "stuck". The running status dot also renders (spinner).
  it('shows 执行中 + done count while a tool is still active', () => {
    const w = mount(AgentToolCallList, {
      props: { toolGroups: [grp('a', 'result'), grp('b', 'use')] }
    })
    expect(w.text()).toContain('执行中')
    expect(w.text()).toContain('已完成 1 步')
    expect(w.find('.summary-status--running').exists()).toBe(true)
  })

  // 用时 is derived from the first→last narration timestamps (server-side delta,
  // skew-free, stable on reload) and only surfaces once the step group is done.
  it('shows 用时 derived from first→last event timestamps when finished', () => {
    const w = mount(AgentToolCallList, {
      props: {
        toolGroups: [grpAt('a', 'result', ['2026-06-09T00:00:00Z', '2026-06-09T00:01:30Z'])]
      }
    })
    expect(w.text()).toContain('已完成 1 步')
    expect(w.text()).toContain('用时 1分30秒')
    expect(w.find('.summary-status--done').exists()).toBe(true)
  })

  // A finished group with a single timestamp (no measurable span) omits 用时
  // rather than printing "用时 0秒".
  it('omits 用时 when there is no measurable span', () => {
    const w = mount(AgentToolCallList, {
      props: { toolGroups: [grp('a', 'result')] }
    })
    expect(w.text()).toContain('已完成 1 步')
    expect(w.text()).not.toContain('用时')
  })

  // Once the user manually toggles, auto-follow stops fighting them: a new tool
  // re-activating the group must NOT snap the list back open.
  it('respects a manual collapse even when a new tool re-activates the group', async () => {
    const w = mount(AgentToolCallList, {
      props: { toolGroups: [grp('a', 'use')] }
    })
    expect(w.find('.tool-detail').exists()).toBe(true) // auto-expanded while active
    await w.find('.tool-summary').trigger('click') // user collapses
    expect(w.find('.tool-detail').exists()).toBe(false)
    await w.setProps({ toolGroups: [grp('a', 'result')] }) // a finishes (all terminal)
    await w.setProps({ toolGroups: [grp('a', 'result'), grp('b', 'use')] }) // b re-activates
    expect(w.find('.tool-detail').exists()).toBe(false) // stays collapsed per user intent
  })
})
