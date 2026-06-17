/**
 * Unit tests for AgentList.vue (M7)
 *
 * Strategy: mock @/api/agent (API layer), let real Pinia store run.
 * setActivePinia(createPinia()) called inside mountView per test.
 * attachTo: document.body so Teleport (ConfirmModal) renders correctly.
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
  restoreAgent: vi.fn(),
  listSkillTemplates: vi.fn()
}))

// ---- Toast mock ----
const toastSpy = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock('@/stores/notifications', () => ({ useNotificationsStore: () => toastSpy }))

// Import AFTER vi.mock so we get the mocked versions
import AgentList from '@/views/config/agents/AgentList.vue'
import * as agentApi from '@/api/agentBuilder'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

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
    credit_cap_per_session: null,
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
    // 文案已统一改为"智能体"；空态由 DataTable 的 empty-text prop 渲染
    expect(wrapper.text()).toContain('暂无智能体')
  })

  // ----------------------------------------------------------------
  // 2. Loading skeleton — DataTable receives :loading="true" before API resolves
  // ----------------------------------------------------------------
  it('passes loading=true to DataTable while API is pending', async () => {
    // Make listAgents hang indefinitely so loading stays true
    ;(agentApi.listAgents as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}))

    setActivePinia(createPinia())
    const wrapper = mount(AgentList, {
      global: { plugins: [router] },
      attachTo: document.body
    })
    // Do NOT flushPromises — let the API call stay pending
    await wrapper.vm.$nextTick()

    const dataTable = wrapper.findComponent({ name: 'DataTable' })
    expect(dataTable.exists()).toBe(true)
    expect(dataTable.props('loading')).toBe(true)

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

    expect(wrapper.text()).toContain('仅父账户可配置 AI 助手，请联系机构主')
  })

  // ----------------------------------------------------------------
  // 5. Success — DataTable renders rows
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
  // 8. Clicking 下架 opens ConfirmModal with danger=true and agent name in title
  // ----------------------------------------------------------------
  it('opens ConfirmModal with danger when 下架 is clicked', async () => {
    ;(agentApi.listAgents as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [makeAgent({ id: 5, name: '待下架助手' })],
      total: 1
    })

    const wrapper = await mountView()

    // ConfirmModal should be hidden initially (ConfirmModal 用 v-model API)
    const modal = wrapper.findComponent(ConfirmModal)
    expect(modal.props('modelValue')).toBe(false)

    // Click the 下架 button in the action column
    const dangerBtns = wrapper.findAll('button').filter((b) => b.text().includes('下架'))
    expect(dangerBtns.length).toBeGreaterThan(0)
    await dangerBtns[0].trigger('click')
    await wrapper.vm.$nextTick()

    // ConfirmModal should now be open with variant='danger' and agent name in title
    expect(modal.props('modelValue')).toBe(true)
    expect(modal.props('variant')).toBe('danger')
    expect(modal.props('title')).toContain('待下架助手')
    expect(modal.props('title')).toContain('确认下架')
  })

  // ----------------------------------------------------------------
  // 9. Confirming 下架 calls deleteAgent and shows success toast
  // ----------------------------------------------------------------
  it('calls deleteAgent with correct id when confirm is clicked', async () => {
    ;(agentApi.listAgents as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [makeAgent({ id: 42, name: '要删除的助手' })],
      total: 1
    })

    const wrapper = await mountView()

    // Open the confirm modal by clicking 下架
    const dangerBtns = wrapper.findAll('button').filter((b) => b.text().includes('下架'))
    await dangerBtns[0].trigger('click')
    await wrapper.vm.$nextTick()

    // Trigger the confirm emit on the ConfirmModal component (bypasses Teleport DOM)
    const modal = wrapper.findComponent(ConfirmModal)
    expect(modal.props('modelValue')).toBe(true)
    await modal.vm.$emit('confirm')
    await flushPromises()

    expect(agentApi.deleteAgent).toHaveBeenCalledWith(42)
    expect(toastSpy.success).toHaveBeenCalledWith('已下架')
  })

  // ----------------------------------------------------------------
  // 10. Retry button re-invokes listAgents
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
