import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import AgentToolCallItem from '../AgentToolCallItem.vue'
import { Loader2, AlertCircle, Search, Check } from 'lucide-vue-next'
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
  it('strips the leading 正在 so the running label reads as a clean activity', () => {
    const w = mount(AgentToolCallItem, {
      props: { group: grp('use', [ev('use', '正在搜索：四川莫小派 小红书陪跑')]) }
    })
    expect(w.find('.tl-txt').text()).toBe('搜索：四川莫小派 小红书陪跑')
  })

  it('strips a leading presentation emoji baked into the narration message (lucide owns the icon)', () => {
    // older skill templates still send "📚 正在加载技能：docx-author" — the timeline
    // renders its own lucide icon, so the message emoji must not leak (no-emoji rule).
    // (done state with only a use event falls back to that use message.)
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

  it('switches to the result message when the tool completes (done = 已…, not the stale use text)', () => {
    const w = mount(AgentToolCallItem, {
      props: {
        group: grp('result', [ev('use', '正在搜索：四川莫小派'), ev('result', '已找到 8 条结果')])
      }
    })
    // one transitioning line: once done it reads as completed, paired with the checkmark.
    expect(w.find('.tl-txt').text()).toBe('已找到 8 条结果')
  })

  it('shows a spinner while the tool is active', () => {
    const w = mount(AgentToolCallItem, { props: { group: grp('use', [ev('use', '正在搜索：X')]) } })
    expect(w.findComponent(Loader2).exists()).toBe(true)
    expect(w.find('.tl-line').classes()).toContain('active')
  })

  it('shows a checkmark (not a spinner, not the type icon) when done', () => {
    const w = mount(AgentToolCallItem, {
      props: { group: grp('result', [ev('use', '正在搜索：X'), ev('result', '已找到 3 条')]) }
    })
    expect(w.findComponent(Loader2).exists()).toBe(false)
    expect(w.findComponent(Search).exists()).toBe(false) // type icon replaced by a unified checkmark
    expect(w.findComponent(Check).exists()).toBe(true)
  })

  it('shows an alert icon on error', () => {
    const w = mount(AgentToolCallItem, {
      props: { group: grp('error', [ev('use', '正在搜索：X'), ev('error', '搜索中断')]) }
    })
    expect(w.findComponent(AlertCircle).exists()).toBe(true)
    expect(w.find('.tl-line').classes()).toContain('error')
  })

  // The reported bug: load_skill rendered two lines (加载技能 spinner + 已加载技能), and
  // the spinner stuck on completed runs. One line must transition use → done.
  it('skill load: running shows 加载技能 + spinner', () => {
    const w = mount(AgentToolCallItem, {
      props: {
        group: grp('use', [ev('use', '正在加载技能：docx-author', 'load_skill')], 'load_skill')
      }
    })
    expect(w.find('.tl-txt').text()).toBe('加载技能：docx-author')
    expect(w.findComponent(Loader2).exists()).toBe(true)
  })

  it('skill load: done shows 已加载技能 + checkmark (one line, no stuck spinner)', () => {
    const w = mount(AgentToolCallItem, {
      props: {
        group: grp(
          'result',
          [
            ev('use', '正在加载技能：docx-author', 'load_skill'),
            ev('result', '已加载技能：docx-author', 'load_skill')
          ],
          'load_skill'
        )
      }
    })
    expect(w.find('.tl-txt').text()).toBe('已加载技能：docx-author')
    expect(w.findComponent(Check).exists()).toBe(true)
    expect(w.findComponent(Loader2).exists()).toBe(false)
  })

  // 问题四: while running, the label follows the LATEST event so a tool that emits
  // progress updates shows the newest activity (not the frozen first 'use' line), and
  // flowing dots render beside the label as an extra liveness signal.
  it('progress: label follows the latest progress event + shows flowing dots while active', () => {
    const w = mount(AgentToolCallItem, {
      props: {
        group: grp(
          'progress',
          [
            ev('use', '正在生成网页...', 'create_html'),
            ev('progress', '已写入 3 个区块', 'create_html')
          ],
          'create_html'
        )
      }
    })
    expect(w.find('.tl-txt').text()).toBe('已写入 3 个区块')
    expect(w.find('.tl-dots').exists()).toBe(true)
  })

  it('done: no flowing dots (only active states show them)', () => {
    const w = mount(AgentToolCallItem, {
      props: { group: grp('result', [ev('use', '正在生成网页...'), ev('result', '网页已生成')]) }
    })
    expect(w.find('.tl-dots').exists()).toBe(false)
  })
})
