import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AgentRunPulse from '../AgentRunPulse.vue'
import { silenceLadder } from '@/utils/agentRunPulse'
import { useAgentChatStore } from '@/stores/agentChat'
import type { AgentRun, NarrationEvent } from '@/types/agent'

// The store imports the api module at load; stub it (no call happens on mount).
vi.mock('@/api/agent', () => ({
  fetchNarrationEvents: vi.fn(),
  getRun: vi.fn(),
  getSessionSnapshot: vi.fn()
}))

const runningRun = (extra: Partial<AgentRun> = {}): AgentRun =>
  ({
    id: 1,
    session_id: 's',
    user_id: 1,
    agent_skill_id: 1,
    status: 'running',
    state_reason: 'running',
    created_at: '',
    updated_at: '',
    started_at: '2026-01-01T00:00:00Z',
    ...extra
  }) as AgentRun

const useEvent = (message: string): NarrationEvent => ({
  run_id: 1,
  tool_call_id: 'tc',
  tool_name: 'image_gen',
  state: 'use',
  message,
  timestamp: '2026-01-01T00:00:00Z'
})

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('silenceLadder', () => {
  it('escalates honestly with real silence', () => {
    expect(silenceLadder(0)).toBe('处理中…')
    expect(silenceLadder(11)).toBe('处理中…')
    expect(silenceLadder(12)).toBe('仍在处理中…')
    expect(silenceLadder(44)).toBe('仍在处理中…')
    expect(silenceLadder(45)).toContain('几分钟')
    expect(silenceLadder(179)).toContain('几分钟')
    expect(silenceLadder(180)).toContain('随时停止')
  })

  it('never claims a number / percent / step count (no fake progress)', () => {
    for (const s of [0, 20, 60, 120, 300]) {
      expect(silenceLadder(s)).not.toMatch(/[0-9%]|步/)
    }
  })
})

describe('AgentRunPulse — visibility (the relay)', () => {
  it('is hidden when nothing is running', () => {
    const w = mount(AgentRunPulse)
    expect(w.find('.run-pulse').classes()).not.toContain('show')
  })

  it('shows while running, not waiting, not streaming', () => {
    const store = useAgentChatStore()
    store.currentRun = runningRun()
    const w = mount(AgentRunPulse, { props: { isStreaming: false } })
    expect(w.find('.run-pulse').classes()).toContain('show')
  })

  it('yields (hidden) while the SSE stream is delivering tokens — cursor carries it', () => {
    const store = useAgentChatStore()
    store.currentRun = runningRun()
    const w = mount(AgentRunPulse, { props: { isStreaming: true } })
    expect(w.find('.run-pulse').classes()).not.toContain('show')
  })

  it('is suppressed while waiting for the user (the inverse lie)', () => {
    const store = useAgentChatStore()
    store.currentRun = runningRun({ state_reason: 'waiting_for_user_choice' })
    const w = mount(AgentRunPulse)
    expect(w.find('.run-pulse').classes()).not.toContain('show')
  })
})

describe('AgentRunPulse — the word', () => {
  it('echoes the active tool message when a tool is in-flight', () => {
    const store = useAgentChatStore()
    store.currentRun = runningRun()
    store.narrationEvents.push(useEvent('正在生成 图片'))
    const w = mount(AgentRunPulse)
    expect(w.find('.word').text()).toBe('正在生成 图片')
  })

  it('falls back to the honest silence ladder in a gap (no active tool)', () => {
    const store = useAgentChatStore()
    store.currentRun = runningRun()
    store.stuckSince = performance.now() - 50_000 // 50s of real silence
    const w = mount(AgentRunPulse)
    expect(w.find('.word').text()).toContain('几分钟')
  })
})

describe('AgentRunPulse — completion settle', () => {
  it('shows 已完成 briefly when the run completes', async () => {
    const store = useAgentChatStore()
    store.currentRun = runningRun()
    const w = mount(AgentRunPulse)
    expect(w.find('.run-pulse').classes()).toContain('show')
    // run finishes
    store.currentRun = runningRun({ status: 'completed', state_reason: 'done' })
    await w.vm.$nextTick()
    expect(w.find('.run-pulse').classes()).toContain('settle')
    expect(w.find('.word').text()).toBe('已完成')
  })

  it('does NOT bleed 已完成 into a new run started right after completion', async () => {
    const store = useAgentChatStore()
    store.currentRun = runningRun()
    const w = mount(AgentRunPulse)
    store.currentRun = runningRun({ status: 'completed', state_reason: 'done' })
    await w.vm.$nextTick()
    expect(w.find('.word').text()).toBe('已完成')
    // a new run starts immediately (within the 1.4s settle window)
    store.currentRun = runningRun()
    await w.vm.$nextTick()
    expect(w.find('.run-pulse').classes()).not.toContain('settle')
    expect(w.find('.word').text()).not.toBe('已完成')
  })
})
