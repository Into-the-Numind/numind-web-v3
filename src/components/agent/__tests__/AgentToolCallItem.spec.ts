// agent-mode v2 #2 (use_skill) — T08 frontend tests.
//
// Covers:
//   (1) use_skill tool_name renders generically via icon + message pipeline
//       across 3 phases (use / result / error) — backend tool-display.yaml
//       templates pre-render the message, frontend stays generic.
//   (2) .skill-use CSS class is applied when tool_name === 'use_skill'
//       so use_skill bubbles get visual emphasis vs ordinary tool calls.
//   (3) Error state inherits .narration-state-error class (handled by
//       existing state→class map, but locked in for use_skill specifically).
//   (4) Unknown tool_name triggers console.warn exactly once (de-dupe per name).
//   (5) Known tool names (existing platform tools + SOP-prefixed) do NOT warn.
//
// T13: Status badge tests also included (see bottom of file).

import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import AgentToolCallItem from '../AgentToolCallItem.vue'
import type { ToolCallAggregate, NarrationEvent } from '@/types/agent'

const ts = '2026-05-24T10:00:00Z'

const mkEvent = (
  overrides: Partial<NarrationEvent> & Pick<NarrationEvent, 'state' | 'message'>
): NarrationEvent => ({
  run_id: 1,
  tool_call_id: 'tc-skill-1',
  tool_name: 'use_skill',
  timestamp: ts,
  ...overrides
})

const mkGroup = (
  events: NarrationEvent[],
  tool_name = 'use_skill',
  tool_call_id = 'tc-skill-1'
): ToolCallAggregate => ({
  tool_call_id,
  tool_name,
  events,
  current_state: events[events.length - 1].state
})

describe('AgentToolCallItem — use_skill rendering (T08)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('renders use_skill "use" phase with backend-templated message + 📚 icon', () => {
    // Backend tool-display.yaml use_template for use_skill:
    //   "📚 正在加载技能：{{ .input.name }}"
    const group = mkGroup([
      mkEvent({
        state: 'use',
        icon: '📚',
        message: '📚 正在加载技能：销售话术训练',
        verb: '调用技能'
      })
    ])
    const wrapper = mount(AgentToolCallItem, { props: { group } })
    expect(wrapper.text()).toContain('📚')
    expect(wrapper.text()).toContain('销售话术训练')
    // .skill-use class applied on container
    expect(wrapper.find('.tool-call-item.skill-use').exists()).toBe(true)
    // use state → narration-state-use class
    expect(wrapper.find('.narration-state-use').exists()).toBe(true)
  })

  it('renders use_skill "result" phase with success message', () => {
    const group = mkGroup([
      mkEvent({ state: 'use', icon: '📚', message: '📚 正在加载技能：销售话术训练' }),
      mkEvent({ state: 'result', icon: '✓', message: '📚 已调用技能：销售话术训练' })
    ])
    const wrapper = mount(AgentToolCallItem, { props: { group } })
    // In expanded view both events should be visible
    expect(wrapper.text()).toContain('已调用技能：销售话术训练')
    expect(wrapper.find('.narration-state-result').exists()).toBe(true)
    expect(wrapper.find('.tool-call-item.skill-use').exists()).toBe(true)
  })

  it('renders use_skill "error" phase with warning styling', () => {
    const group = mkGroup([
      mkEvent({ state: 'use', message: '📚 正在加载技能：销售话术训练' }),
      mkEvent({
        state: 'error',
        icon: '⚠️',
        message: '⚠ 技能加载失败：技能不存在',
        reason: '技能不存在'
      })
    ])
    const wrapper = mount(AgentToolCallItem, { props: { group } })
    expect(wrapper.text()).toContain('⚠ 技能加载失败')
    // error state must use the .narration-state-error color class
    expect(wrapper.find('.narration-state-error').exists()).toBe(true)
    // P2 fix: error 态 use_skill 仍应保留 .skill-use 视觉标记（技能错误不应失去 skill bubble 识别）
    expect(wrapper.find('.tool-call-item.skill-use').exists()).toBe(true)
  })

  it('compact mode shows latest event only (folded preview)', () => {
    const group = mkGroup([
      mkEvent({ state: 'use', message: '📚 正在加载技能：销售话术训练' }),
      mkEvent({ state: 'result', icon: '✓', message: '📚 已调用技能：销售话术训练' })
    ])
    const wrapper = mount(AgentToolCallItem, { props: { group, compact: true } })
    // Only one .tool-line should render in compact mode
    expect(wrapper.findAll('.tool-line').length).toBe(1)
    expect(wrapper.text()).toContain('已调用技能')
    expect(wrapper.text()).not.toContain('正在加载技能')
  })

  it('does NOT add .skill-use class for non-skill tools (e.g. file_read)', () => {
    const group = mkGroup(
      [mkEvent({ state: 'result', message: '已读取文件', tool_name: 'file_read' })],
      'file_read',
      'tc-file-1'
    )
    const wrapper = mount(AgentToolCallItem, { props: { group } })
    expect(wrapper.find('.tool-call-item').exists()).toBe(true)
    expect(wrapper.find('.tool-call-item.skill-use').exists()).toBe(false)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('warns once for unknown tool_name (fallback render still works)', () => {
    const group = mkGroup(
      [mkEvent({ state: 'use', message: '正在处理 something', tool_name: 'mystery_tool' })],
      'mystery_tool',
      'tc-mystery-1'
    )
    const wrapper = mount(AgentToolCallItem, { props: { group } })
    // Fallback render: message still appears
    expect(wrapper.text()).toContain('正在处理 something')
    // console.warn called exactly once
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0][0]).toMatch(/Unknown narration tool_name: "mystery_tool"/)
  })

  it('does NOT warn for SOP-prefixed dynamic tools (binding-generated)', () => {
    const group = mkGroup(
      [mkEvent({ state: 'result', message: '已执行 SOP', tool_name: 'sop_customer_profile' })],
      'sop_customer_profile',
      'tc-sop-1'
    )
    mount(AgentToolCallItem, { props: { group } })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does NOT warn for all known platform tools', () => {
    const knownNames = [
      'use_skill',
      'ask_user_question',
      'remember',
      'plan_emit',
      'final_answer',
      'file_read',
      'file_write'
    ]
    for (const name of knownNames) {
      const group = mkGroup(
        [mkEvent({ state: 'result', message: 'ok', tool_name: name })],
        name,
        `tc-${name}`
      )
      mount(AgentToolCallItem, { props: { group } })
    }
    expect(warnSpy).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T13: Status badge — current_state reflected as colored dot in upper-right
// ─────────────────────────────────────────────────────────────────────────────
describe('AgentToolCallItem — status badge (T13)', () => {
  it('renders a .status-badge element on every tool call card', () => {
    const group = mkGroup([mkEvent({ state: 'result', message: '已完成' })])
    const wrapper = mount(AgentToolCallItem, { props: { group } })
    expect(wrapper.find('.status-badge').exists()).toBe(true)
    expect(wrapper.find('.status-dot').exists()).toBe(true)
    expect(wrapper.find('.status-label').exists()).toBe(true)
  })

  it.each([
    ['queued', 'status-badge--queued', '排队中'],
    ['use', 'status-badge--use', '执行中'],
    ['progress', 'status-badge--progress', '进行中'],
    ['result', 'status-badge--result', '已完成'],
    ['error', 'status-badge--error', '失败'],
    ['rejected', 'status-badge--rejected', '已拒绝']
  ] as const)('state "%s" → .%s class + label "%s"', (state, expectedClass, expectedLabel) => {
    const group = mkGroup([mkEvent({ state, message: 'msg' })])
    const wrapper = mount(AgentToolCallItem, { props: { group } })
    const badge = wrapper.find('.status-badge')
    expect(badge.classes()).toContain(expectedClass)
    expect(badge.find('.status-label').text()).toBe(expectedLabel)
  })

  it('badge class updates when current_state changes (state transition)', async () => {
    const group = mkGroup([mkEvent({ state: 'progress', message: '进行中' })])
    const wrapper = mount(AgentToolCallItem, { props: { group } })

    // Initial state: progress
    expect(wrapper.find('.status-badge').classes()).toContain('status-badge--progress')
    expect(wrapper.find('.status-label').text()).toBe('进行中')

    // Simulate state transition: progress → result
    const updatedGroup: ToolCallAggregate = {
      ...group,
      events: [...group.events, mkEvent({ state: 'result', message: '已完成', icon: '✓' })],
      current_state: 'result'
    }
    await wrapper.setProps({ group: updatedGroup })

    expect(wrapper.find('.status-badge').classes()).toContain('status-badge--result')
    expect(wrapper.find('.status-badge').classes()).not.toContain('status-badge--progress')
    expect(wrapper.find('.status-label').text()).toBe('已完成')
  })

  it('badge has role="status" for accessibility', () => {
    const group = mkGroup([mkEvent({ state: 'use', message: '执行中' })])
    const wrapper = mount(AgentToolCallItem, { props: { group } })
    expect(wrapper.find('.status-badge').attributes('role')).toBe('status')
  })

  it('badge renders in compact mode as well', () => {
    const group = mkGroup([
      mkEvent({ state: 'use', message: '执行中' }),
      mkEvent({ state: 'result', message: '已完成' })
    ])
    const wrapper = mount(AgentToolCallItem, { props: { group, compact: true } })
    // Badge should be present in compact mode too
    expect(wrapper.find('.status-badge').exists()).toBe(true)
    expect(wrapper.find('.status-badge').classes()).toContain('status-badge--result')
    // compact: only 1 tool-line
    expect(wrapper.findAll('.tool-line').length).toBe(1)
  })

  it('progress state badge has --progress class (spinning ring via CSS)', () => {
    const group = mkGroup([mkEvent({ state: 'progress', message: '进行中', detail: '45/87' })])
    const wrapper = mount(AgentToolCallItem, { props: { group } })
    const badge = wrapper.find('.status-badge')
    expect(badge.classes()).toContain('status-badge--progress')
    // The .status-dot should exist — CSS animation badge-spin applied via .status-badge--progress
    expect(badge.find('.status-dot').exists()).toBe(true)
  })
})
