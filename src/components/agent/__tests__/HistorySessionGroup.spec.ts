import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import HistorySessionGroup from '../HistorySessionGroup.vue'
import type { RecentSession } from '@/types/agent'

const mkSession = (
  id: number,
  daysAgo: number,
  status: RecentSession['status'] = 'completed'
): RecentSession => ({
  session_id: id,
  agent_skill_id: 1,
  agent_name: 'agent A',
  agent_emoji: '🤖',
  last_active_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  status,
  preview_text: 'preview'
})

beforeEach(() => {
  // Pin date to Wednesday 12:00 to make week boundary deterministic
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-21T12:00:00')) // Wed
})

afterEach(() => {
  vi.useRealTimers()
})

describe('HistorySessionGroup', () => {
  it('renders empty state when no sessions', () => {
    const wrapper = mount(HistorySessionGroup, { props: { sessions: [] } })
    expect(wrapper.text()).toContain('暂无历史会话')
  })

  it('groups today / yesterday / this week / earlier correctly', () => {
    const sessions: RecentSession[] = [
      mkSession(1, 0), // today
      mkSession(2, 1), // yesterday
      mkSession(3, 3), // this week (Sunday, 4 days back is still this week if Mon=start? wed-4=sat last week)
      mkSession(4, 10) // earlier
    ]
    const wrapper = mount(HistorySessionGroup, { props: { sessions } })
    const titles = wrapper.findAll('.group-title').map((n) => n.text())
    // 顺序：今天 → 昨天 → 本周 → 更早
    // 第 3 条（3 天前 = Sun = 本周）应在"本周"组
    expect(titles).toContain('今天')
    expect(titles).toContain('昨天')
    expect(titles).toContain('更早')
  })

  it('renders 继续 button for running status', () => {
    const wrapper = mount(HistorySessionGroup, {
      props: { sessions: [mkSession(1, 0, 'running')] }
    })
    expect(wrapper.text()).toContain('继续')
    expect(wrapper.text()).not.toContain('查看')
  })

  it('renders 查看 button for completed status', () => {
    const wrapper = mount(HistorySessionGroup, {
      props: { sessions: [mkSession(1, 0, 'completed')] }
    })
    expect(wrapper.text()).toContain('查看')
  })

  it('emits continue with sessionId on 继续 click', async () => {
    const wrapper = mount(HistorySessionGroup, {
      props: { sessions: [mkSession(42, 0, 'pending')] }
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('continue')).toEqual([[42]])
  })

  it('emits view with sessionId on 查看 click', async () => {
    const wrapper = mount(HistorySessionGroup, {
      props: { sessions: [mkSession(99, 0, 'failed')] }
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('view')).toEqual([[99]])
  })
})
