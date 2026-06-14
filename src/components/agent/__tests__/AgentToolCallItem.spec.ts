import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import AgentToolCallItem from '../AgentToolCallItem.vue'
import { Loader2, AlertCircle, Search } from 'lucide-vue-next'
import type { ToolCallAggregate, NarrationState } from '@/types/agent'

const ev = (state: NarrationState, message: string, tool = 'web_search') => ({
  run_id: 1,
  tool_call_id: 'tc',
  tool_name: tool,
  state,
  message,
  timestamp: '2026-06-14T00:00:00Z'
})
const grp = (
  current_state: NarrationState,
  events: ReturnType<typeof ev>[],
  tool_name = 'web_search'
): ToolCallAggregate => ({ tool_call_id: 'tc', tool_name, current_state, events })

describe('AgentToolCallItem — flat timeline line', () => {
  it('strips the leading 正在 so the label is a stable activity, not a verb that jumps', () => {
    const w = mount(AgentToolCallItem, {
      props: { group: grp('use', [ev('use', '正在搜索：四川莫小派 小红书陪跑')]) }
    })
    expect(w.find('.tl-txt').text()).toBe('搜索：四川莫小派 小红书陪跑')
  })

  it('strips a leading presentation emoji baked into the narration message (lucide owns the icon)', () => {
    // older skill templates still send "📚 正在加载技能：docx-author" — the timeline
    // renders its own lucide icon, so the message emoji must not leak (no-emoji rule).
    const w = mount(AgentToolCallItem, {
      props: {
        group: grp(
          'result',
          [ev('use', '📚 正在加载技能：docx-author', 'load_skill')],
          'load_skill'
        )
      }
    })
    expect(w.find('.tl-txt').text()).toBe('加载技能：docx-author')
  })

  it('keeps the query visible (use message) even after the tool completes', () => {
    const w = mount(AgentToolCallItem, {
      props: {
        group: grp('result', [ev('use', '正在搜索：四川莫小派'), ev('result', '已找到 8 条结果')])
      }
    })
    // the stable activity stays — does NOT collapse to "已找到 8 条结果"
    expect(w.find('.tl-txt').text()).toBe('搜索：四川莫小派')
  })

  it('shows a spinner while the tool is active', () => {
    const w = mount(AgentToolCallItem, { props: { group: grp('use', [ev('use', '正在搜索：X')]) } })
    expect(w.findComponent(Loader2).exists()).toBe(true)
    expect(w.find('.tl-line').classes()).toContain('active')
  })

  it('shows the tool type icon (not a spinner) when done', () => {
    const w = mount(AgentToolCallItem, {
      props: { group: grp('result', [ev('use', '正在搜索：X'), ev('result', '已找到 3 条')]) }
    })
    expect(w.findComponent(Loader2).exists()).toBe(false)
    expect(w.findComponent(Search).exists()).toBe(true)
  })

  it('shows an alert icon on error', () => {
    const w = mount(AgentToolCallItem, {
      props: { group: grp('error', [ev('use', '正在搜索：X'), ev('error', '搜索中断')]) }
    })
    expect(w.findComponent(AlertCircle).exists()).toBe(true)
    expect(w.find('.tl-line').classes()).toContain('error')
  })
})
