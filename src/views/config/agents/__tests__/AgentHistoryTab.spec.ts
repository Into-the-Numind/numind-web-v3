/**
 * Unit tests for AgentHistoryTab.vue (M10)
 *
 * Strategy: mock @/api/agent (API layer), let real Pinia store run.
 * setActivePinia(createPinia()) called inside mountView per test.
 * attachTo: document.body so Teleport (ConfirmModal/HistoryViewModal) renders correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import type { Agent, AgentHistory } from '@/types/agentBuilder'

// ---- Mock API module ----
vi.mock('@/api/agentBuilder', () => ({
  listAgents: vi.fn(),
  deleteAgent: vi.fn(),
  getAgent: vi.fn(),
  createAgent: vi.fn(),
  patchAgent: vi.fn(),
  listAgentHistory: vi.fn(),
  restoreAgent: vi.fn(),
  toggleAgentAdvanced: vi.fn(),
  listSkillTemplates: vi.fn()
}))

// ---- Toast mock ----
const toastSpy = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock('@/stores/notifications', () => ({ useNotificationsStore: () => toastSpy }))

// Import AFTER vi.mock
import AgentHistoryTab from '@/views/config/agents/components/AgentHistoryTab.vue'
import * as agentApi from '@/api/agentBuilder'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { useAgentBuilderStore } from '@/stores/agentBuilder'

// ---- Router ----
const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', component: { template: '<div/>' } }]
})

// ---- Factories ----
function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 1,
    parent_user_id: 100,
    name: '测试助手',
    description: '描述',
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
    version: 3,
    is_active: true,
    source_template_id: null,
    created_by: 100,
    created_at: '2026-05-01T10:00:00Z',
    updated_at: '2026-05-21T09:00:00Z',
    ...overrides
  }
}

function makeHistory(overrides: Partial<AgentHistory> = {}): AgentHistory {
  return {
    id: 1,
    agent_id: 1,
    version: 1,
    snapshot: makeAgent({ version: 1 }),
    changes_summary: '初始创建',
    created_by: 100,
    created_at: '2026-05-01T10:00:00Z',
    ...overrides
  }
}

const AGENT_ID = 42

async function mountTab(currentVersion = 3) {
  setActivePinia(createPinia())

  // Seed store.current directly so AgentHistoryTab can read currentVersion.
  // The component doesn't call fetchOne itself — it relies on the parent
  // (AgentDetail) having already loaded the agent. We replicate that here.
  const store = useAgentBuilderStore()
  store.current = makeAgent({ id: AGENT_ID, version: currentVersion })

  const wrapper = mount(AgentHistoryTab, {
    props: { agentId: AGENT_ID },
    global: { plugins: [router] },
    attachTo: document.body
  })
  await flushPromises()
  return wrapper
}

// ---- Tests ----
describe('AgentHistoryTab.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    ;(agentApi.restoreAgent as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeAgent({ version: 4 })
    )
    ;(agentApi.listAgentHistory as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [],
      total: 0
    })
  })

  // ----------------------------------------------------------------
  // 1. onMounted calls fetchHistory with correct agentId
  // ----------------------------------------------------------------
  it('calls listAgentHistory with the correct agentId on mount', async () => {
    await mountTab()
    expect(agentApi.listAgentHistory).toHaveBeenCalledWith(AGENT_ID)
  })

  // ----------------------------------------------------------------
  // 2. Loading state — DataTable receives loading=true while API pending
  // ----------------------------------------------------------------
  it('passes loading=true to DataTable while API is pending', async () => {
    ;(agentApi.listAgentHistory as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}) // never resolves
    )

    setActivePinia(createPinia())
    const wrapper = mount(AgentHistoryTab, {
      props: { agentId: AGENT_ID },
      global: { plugins: [router] },
      attachTo: document.body
    })

    // Don't flush — API is still pending
    await wrapper.vm.$nextTick()

    const dataTable = wrapper.findComponent({ name: 'DataTable' })
    expect(dataTable.exists()).toBe(true)
    expect(dataTable.props('loading')).toBe(true)

    document.body.innerHTML = ''
  })

  // ----------------------------------------------------------------
  // 3. Empty history → DataTable renders with empty-text
  // ----------------------------------------------------------------
  it('shows empty state when history list is empty', async () => {
    ;(agentApi.listAgentHistory as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [],
      total: 0
    })

    const wrapper = await mountTab()
    expect(wrapper.text()).toContain('暂无历史版本')
  })

  // ----------------------------------------------------------------
  // 4. Error state → error banner + retry button
  // ----------------------------------------------------------------
  it('shows error banner and retry button when API rejects', async () => {
    ;(agentApi.listAgentHistory as ReturnType<typeof vi.fn>).mockRejectedValue(
      Object.assign(new Error('加载历史失败'), {
        response: { status: 500, data: { message: 'server error' } }
      })
    )

    const wrapper = await mountTab()

    const errorEl = wrapper.find('.history-error')
    expect(errorEl.exists()).toBe(true)

    const retryBtn = errorEl.findAll('button').find((b) => b.text().includes('重试'))
    expect(retryBtn).toBeDefined()
  })

  // ----------------------------------------------------------------
  // 5. Success — 3 history versions → DataTable renders 3 data rows
  // ----------------------------------------------------------------
  it('renders 3 rows when history has 3 versions', async () => {
    ;(agentApi.listAgentHistory as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [
        makeHistory({ id: 3, version: 3 }),
        makeHistory({ id: 2, version: 2 }),
        makeHistory({ id: 1, version: 1 })
      ],
      total: 3
    })

    const wrapper = await mountTab(3)

    // Should render version labels
    expect(wrapper.text()).toContain('v3')
    expect(wrapper.text()).toContain('v2')
    expect(wrapper.text()).toContain('v1')
  })

  // ----------------------------------------------------------------
  // 6. Current version row shows "当前版本" badge (no buttons)
  // ----------------------------------------------------------------
  it('shows 当前版本 badge for the current version row', async () => {
    ;(agentApi.listAgentHistory as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [makeHistory({ id: 3, version: 3 }), makeHistory({ id: 2, version: 2 })],
      total: 2
    })

    const wrapper = await mountTab(3) // current version = 3

    expect(wrapper.text()).toContain('当前版本')
  })

  // ----------------------------------------------------------------
  // 7. Non-current version rows show [查看] and [恢复] buttons
  // ----------------------------------------------------------------
  it('shows 查看 and 恢复 buttons for non-current versions', async () => {
    ;(agentApi.listAgentHistory as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [
        makeHistory({ id: 3, version: 3 }),
        makeHistory({ id: 2, version: 2 }),
        makeHistory({ id: 1, version: 1 })
      ],
      total: 3
    })

    const wrapper = await mountTab(3) // current = 3; versions 2 and 1 are non-current

    const allBtns = wrapper.findAll('button')
    const viewBtns = allBtns.filter((b) => b.text().includes('查看'))
    const restoreBtns = allBtns.filter((b) => b.text().includes('恢复'))

    expect(viewBtns.length).toBeGreaterThanOrEqual(1)
    expect(restoreBtns.length).toBeGreaterThanOrEqual(1)
  })

  // ----------------------------------------------------------------
  // 8. Click [恢复] → ConfirmModal opens with danger=true
  // ----------------------------------------------------------------
  it('opens ConfirmModal with danger=true when 恢复 is clicked', async () => {
    ;(agentApi.listAgentHistory as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [makeHistory({ id: 3, version: 3 }), makeHistory({ id: 2, version: 2 })],
      total: 2
    })

    const wrapper = await mountTab(3) // v2 is non-current

    const confirmModal = wrapper.findComponent(ConfirmModal)
    // ConfirmModal 用 v-model (modelValue) + variant prop（参见 components/common/ConfirmModal.vue）
    expect(confirmModal.props('modelValue')).toBe(false)

    const restoreBtns = wrapper.findAll('button').filter((b) => b.text().includes('恢复'))
    expect(restoreBtns.length).toBeGreaterThan(0)
    await restoreBtns[0].trigger('click')
    await wrapper.vm.$nextTick()

    expect(confirmModal.props('modelValue')).toBe(true)
    // restore 是销毁性操作（覆盖当前版本），ConfirmModal 应用 variant='danger'
    expect(confirmModal.props('variant')).toBe('danger')
  })

  // ----------------------------------------------------------------
  // 9. Confirm restore → store.restore called + toast.success
  // ----------------------------------------------------------------
  it('calls restoreAgent and shows success toast on confirm', async () => {
    ;(agentApi.listAgentHistory as ReturnType<typeof vi.fn>).mockResolvedValue({
      list: [makeHistory({ id: 3, version: 3 }), makeHistory({ id: 2, version: 2 })],
      total: 2
    })

    const wrapper = await mountTab(3)

    // Open restore confirm for v2
    const restoreBtns = wrapper.findAll('button').filter((b) => b.text().includes('恢复'))
    await restoreBtns[0].trigger('click')
    await wrapper.vm.$nextTick()

    // Confirm via emit on ConfirmModal component (bypasses Teleport DOM)
    const confirmModal = wrapper.findComponent(ConfirmModal)
    expect(confirmModal.props('modelValue')).toBe(true)
    await confirmModal.vm.$emit('confirm')
    await flushPromises()

    expect(agentApi.restoreAgent).toHaveBeenCalledWith(AGENT_ID, expect.any(Number))
    expect(toastSpy.success).toHaveBeenCalledWith('已恢复')
  })
})
