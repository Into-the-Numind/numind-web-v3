/**
 * Unit tests for AgentList.vue (M7)
 *
 * Strategy: mock @/api/agent (API layer), let real Pinia store run.
 * setActivePinia(createPinia()) called inside mountView per test.
 * attachTo: document.body keeps router-linked controls mounted consistently in jsdom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import type { Agent } from '@/types/agentBuilder'

// ---- Mock API module ----
vi.mock('@/api/agentBuilder', () => ({
  listAgents: vi.fn(),
  deleteAgent: vi.fn(),
  getAgent: vi.fn(),
  createAgent: vi.fn(),
  patchAgent: vi.fn(),
  listAgentHistory: vi.fn(),
  restoreAgent: vi.fn()
}))

// ---- Toast mock ----
const toastSpy = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock('@/stores/notifications', () => ({ useNotificationsStore: () => toastSpy }))

// Import AFTER vi.mock so we get the mocked versions
import AgentList from '@/views/config/agents/AgentList.vue'
import * as agentApi from '@/api/agentBuilder'

// ---- Router ----
const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', component: { template: '<div/>' } }]
})

// ---- Sample data factory ----
function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 1,
    parent_user_id: 100,
    name: '测试助手',
    description: '这是一个测试助手',
    icon_url: 'lucide:Bot',
    welcome_message: '你好！',
    starters: [],
    questionnaire_answers: {},
    generated_skill_body: '',
    advanced_mode: false,
    custom_skill_body: '',
    tool_flags: {},
    daily_credit_cap: null,
    version: 1,
    is_active: true,
    source_template_id: null,
    created_by: 100,
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-21T09:00:00Z',
    ...overrides
  }
}

/** Default empty list response */
const emptyListResp = { list: [], total: 0 }

async function mountView() {
  setActivePinia(createPinia())
  const wrapper = mount(AgentList, {
    global: { plugins: [router] },
    attachTo: document.body
  })
  await flushPromises()
  return wrapper
}

// ---- Test suite ----
describe('AgentList.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    // Default: listAgents returns empty list
    ;(agentApi.listAgents as ReturnType<typeof vi.fn>).mockResolvedValue(emptyListResp)
    ;(agentApi.deleteAgent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
  })

  // ----------------------------------------------------------------
  // 1. Empty state
  // ----------------------------------------------------------------
  it('shows empty state text when list is empty and not loading', async () => {
    const wrapper = await mountView()
    expect(wrapper.text()).toContain('暂无 AI 智能体')
  })

  // ----------------------------------------------------------------
  // 2. Loading skeleton — card grid shows loading cards before API resolves
  // ----------------------------------------------------------------
  it('shows card skeletons while API is pending', async () => {
    // Make listAgents hang indefinitely so loading stays true
    ;(agentApi.listAgents as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}))

    setActivePinia(createPinia())
    const wrapper = mount(AgentList, {
      global: { plugins: [router] },
      attachTo: document.body
    })
    // Do NOT flushPromises — let the API call stay pending
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.tool-card--loading')).toHaveLength(4)

    document.body.innerHTML = ''
  })

  // ----------------------------------------------------------------
  // 3. Error banner shown on generic 500 error
  // ----------------------------------------------------------------
  it('shows error banner + retry when API rejects with 500', async () => {
    const err = Object.assign(new Error('Server error'), {
      response: { status: 500, data: { message: 'internal error' } }
    })
    ;(agentApi.listAgents as ReturnType<typeof vi.fn>).mockRejectedValue(err)

    const wrapper = await mountView()

    const banner = wrapper.find('.agent-list__error-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('internal error')
    expect(banner.text()).toContain('重试')
  })

  // ----------------------------------------------------------------
  // 4. 403 → friendly child-account message
  // ----------------------------------------------------------------
  it('shows friendly message for 403 child account error', async () => {
    const err = Object.assign(new Error('Forbidden'), {
      response: { status: 403, data: { message: 'forbidden' } }
    })
    ;(agentApi.listAgents as ReturnType<typeof vi.fn>).mockRejectedValue(err)

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('仅父账户可配置 AI 智能体，请联系机构主')
  })

  // ----------------------------------------------------------------
  // 5. Success — card grid renders agents
  // ----------------------------------------------------------------
  it('renders agent rows when API returns agents', async () => {
    ;(agentApi.listAgents as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [
        makeAgent({ id: 1, name: '助手一', description: '描述一' }),
        makeAgent({ id: 2, name: '助手二', description: '描述二' })
      ],
      total: 2
    })

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('助手一')
    expect(wrapper.text()).toContain('助手二')
  })

  // ----------------------------------------------------------------
  // 6. Search filters by name (client-side computed)
  // ----------------------------------------------------------------
  it('filters list by name when user types in search', async () => {
    ;(agentApi.listAgents as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [
        makeAgent({ id: 1, name: '数学老师', description: '帮助数学学习' }),
        makeAgent({ id: 2, name: '英语助手', description: '帮助英语学习' })
      ],
      total: 2
    })

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('数学老师')
    expect(wrapper.text()).toContain('英语助手')

    const input = wrapper.find('input')
    await input.setValue('数学')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('数学老师')
    expect(wrapper.text()).not.toContain('英语助手')
  })

  // ----------------------------------------------------------------
  // 7. Search also matches description
  // ----------------------------------------------------------------
  it('filters list by description when user types in search', async () => {
    ;(agentApi.listAgents as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [
        makeAgent({ id: 1, name: '助手A', description: '专注理科辅导' }),
        makeAgent({ id: 2, name: '助手B', description: '专注文科写作' })
      ],
      total: 2
    })

    const wrapper = await mountView()

    const input = wrapper.find('input')
    await input.setValue('文科')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('理科')
    expect(wrapper.text()).toContain('文科')
  })

  // ----------------------------------------------------------------
  // 8. List request includes inactive agents so status filter can work
  // ----------------------------------------------------------------
  it('requests inactive agents for status filtering', async () => {
    await mountView()

    expect(agentApi.listAgents).toHaveBeenCalledWith({
      page: 1,
      page_size: 20,
      include_inactive: true
    })
  })

  // ----------------------------------------------------------------
  // 9. Status filter switches between active and inactive agents
  // ----------------------------------------------------------------
  it('filters list by active status', async () => {
    ;(agentApi.listAgents as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [
        makeAgent({ id: 1, name: '启用助手', is_active: true }),
        makeAgent({ id: 2, name: '下架助手', is_active: false })
      ],
      total: 2
    })

    const wrapper = await mountView()

    expect(wrapper.text()).toContain('启用助手')
    expect(wrapper.text()).toContain('下架助手')

    const inactiveBtn = wrapper.findAll('button').find((b) => b.text() === '已下架')
    expect(inactiveBtn).toBeDefined()
    await inactiveBtn!.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).not.toContain('启用助手')
    expect(wrapper.text()).toContain('下架助手')
  })

  // ----------------------------------------------------------------
  // 10. Card click opens edit page
  // ----------------------------------------------------------------
  it('opens edit page when the card is clicked', async () => {
    ;(agentApi.listAgents as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [makeAgent({ id: 5, name: '可编辑助手' })],
      total: 1
    })

    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined)
    const wrapper = await mountView()
    await wrapper.find('.tool-card').trigger('click')

    expect(pushSpy).toHaveBeenCalledWith('/config/agents/5/edit')
    pushSpy.mockRestore()
  })

  // ----------------------------------------------------------------
  // 11. Card action is delete icon with ConfirmModal
  // ----------------------------------------------------------------
  it('opens delete confirmation and deletes after confirm', async () => {
    ;(agentApi.listAgents as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [makeAgent({ id: 5, name: '可删除助手' })],
      total: 1
    })

    const pushSpy = vi.spyOn(router, 'push').mockResolvedValue(undefined)
    const wrapper = await mountView()
    const deleteButton = wrapper.find('.delete-action')

    expect(deleteButton.exists()).toBe(true)
    expect(wrapper.text()).not.toContain('编辑')

    await deleteButton.trigger('click')
    await flushPromises()

    expect(pushSpy).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('确认删除')
    expect(document.body.textContent).toContain('可删除助手')
    expect(agentApi.deleteAgent).not.toHaveBeenCalled()

    const confirmButton = document.body.querySelector('.confirm-btn--danger')
    expect(confirmButton).toBeTruthy()
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(agentApi.deleteAgent).toHaveBeenCalledWith(5)
    expect(toastSpy.success).toHaveBeenCalledWith('AI 智能体已删除')
    pushSpy.mockRestore()
  })

  // ----------------------------------------------------------------
  // 12. Retry button re-invokes listAgents
  // ----------------------------------------------------------------
  it('retry button calls listAgents again after an error', async () => {
    const err = Object.assign(new Error('timeout'), {
      response: { status: 503, data: { message: '服务不可用' } }
    })
    ;(agentApi.listAgents as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(emptyListResp)

    const wrapper = await mountView()

    // Error banner visible
    const banner = wrapper.find('.agent-list__error-banner')
    expect(banner.exists()).toBe(true)

    // Click retry
    const retryBtn = banner.findAll('button').find((b) => b.text().includes('重试'))
    expect(retryBtn).toBeDefined()
    await retryBtn!.trigger('click')
    await flushPromises()

    // onMounted call + retry = 2 total
    expect(agentApi.listAgents).toHaveBeenCalledTimes(2)
  })
})
