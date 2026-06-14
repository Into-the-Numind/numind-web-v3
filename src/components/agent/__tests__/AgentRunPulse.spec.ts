import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AgentRunPulse from '../AgentRunPulse.vue'
import { silenceLadder } from '@/utils/agentRunPulse'
import { useAgentChatStore } from '@/stores/agentChat'
import type { AgentRun, AgentMessage } from '@/types/agent'

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

const streamingAssistant = (): AgentMessage =>
  ({ id: 'a', type: 'assistant', markdown: 'x', isStreaming: true, timestamp: '' }) as AgentMessage

beforeEach(() => setActivePinia(createPinia()))

describe('silenceLadder', () => {
  it('escalates honestly, never claims progress', () => {
    expect(silenceLadder(0)).toBe('处理中…')
    expect(silenceLadder(12)).toBe('仍在处理中…')
    expect(silenceLadder(45)).toContain('几分钟')
    for (const s of [0, 30, 90, 300]) expect(silenceLadder(s)).not.toMatch(/[0-9%]|步/)
  })
})

describe('AgentRunPulse — inline live line (relay)', () => {
  it('hidden when nothing is running', () => {
    const w = mount(AgentRunPulse)
    expect(w.find('.run-pulse').exists()).toBe(false)
  })

  it('shows while running, not waiting, last message not streaming', () => {
    const store = useAgentChatStore()
    store.currentRun = runningRun()
    const w = mount(AgentRunPulse)
    expect(w.find('.run-pulse').exists()).toBe(true)
  })

  it('yields (hidden) when the last message is actively streaming — caret relay', () => {
    const store = useAgentChatStore()
    store.currentRun = runningRun()
    store.messages.push(streamingAssistant())
    const w = mount(AgentRunPulse)
    expect(w.find('.run-pulse').exists()).toBe(false)
  })

  it('is suppressed while waiting for the user', () => {
    const store = useAgentChatStore()
    store.currentRun = runningRun({ state_reason: 'waiting_for_user_choice' })
    const w = mount(AgentRunPulse)
    expect(w.find('.run-pulse').exists()).toBe(false)
  })

  it('shows the honest ladder word, never a tool echo (no duplication)', () => {
    const store = useAgentChatStore()
    store.currentRun = runningRun()
    store.stuckSince = performance.now() - 50_000
    const w = mount(AgentRunPulse)
    expect(w.find('.word').text()).toContain('几分钟')
  })
})
