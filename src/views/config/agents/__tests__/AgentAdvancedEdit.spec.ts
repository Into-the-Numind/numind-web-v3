import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AgentAdvancedEdit from '../AgentAdvancedEdit.vue'
import type { Agent } from '@/types/agentBuilder'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// vue-router
const mockRouterBack = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ back: mockRouterBack }),
  onBeforeRouteLeave: vi.fn() // no-op in unit tests
}))

// useToast
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock('@/stores/notifications', () => ({
  useNotificationsStore: () => ({
    toasts: [],
    success: mockToastSuccess,
    error: mockToastError,
    info: vi.fn()
  })
}))

// useAgentBuilderStore — we control the store mock per test
const mockFetchOne = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/stores/agentBuilder', () => ({
  useAgentBuilderStore: vi.fn()
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 1,
    parent_user_id: 10,
    name: '测试助手',
    description: 'desc',
    icon_url: '',
    welcome_message: 'hi',
    starters: [],
    questionnaire_answers: {},
    generated_skill_body: '# 生成的 SKILL\n这是由系统生成的指令。',
    advanced_mode: true,
    custom_skill_body: '',
    tool_flags: { code_sandbox: false, media: false, dangerous: false },
    credit_cap_per_session: null,
    daily_credit_cap: null,
    version: 1,
    is_active: true,
    source_template_id: null,
    created_by: 10,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

async function mountComponent(
  agent: Agent | null = buildAgent(),
  storeOpts: Partial<{
    currentLoading: boolean
    currentError: string
    saving: boolean
  }> = {}
) {
  const { useAgentBuilderStore } = await import('@/stores/agentBuilder')
  vi.mocked(useAgentBuilderStore).mockReturnValue({
    current: agent,
    currentLoading: storeOpts.currentLoading ?? false,
    currentError: storeOpts.currentError ?? '',
    saving: storeOpts.saving ?? false,
    fetchOne: mockFetchOne,
    update: mockUpdate
  } as ReturnType<typeof useAgentBuilderStore>)

  return mount(AgentAdvancedEdit, {
    props: { agentId: 1 },
    global: {
      stubs: {
        Teleport: true // render Teleport contents inline
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentAdvancedEdit', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockFetchOne.mockResolvedValue(undefined)
    mockUpdate.mockResolvedValue(buildAgent())
  })

  // ── Rendering ──────────────────────────────────────────────────────────

  it('renders the v1 limitation NoticeBanner', async () => {
    const wrapper = await mountComponent()
    const banner = wrapper.find('.notice-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('自定义 Prompt 编辑功能即将上线')
    expect(banner.text()).toContain('v1 仅可查看 + 切换工具开关')
  })

  it('renders body text in a disabled textarea when agent is loaded', async () => {
    const agent = buildAgent({
      generated_skill_body: '# Hello World\n这是指令',
      custom_skill_body: ''
    })
    const wrapper = await mountComponent(agent)

    const textarea = wrapper.find<HTMLTextAreaElement>('textarea.advanced-textarea')
    expect(textarea.exists()).toBe(true)
    expect(textarea.element.disabled).toBe(true)
    expect(textarea.element.value).toBe('# Hello World\n这是指令')
  })

  it('prefers custom_skill_body over generated_skill_body when both present', async () => {
    const agent = buildAgent({
      generated_skill_body: 'generated body',
      custom_skill_body: 'custom body'
    })
    const wrapper = await mountComponent(agent)

    const textarea = wrapper.find<HTMLTextAreaElement>('textarea.advanced-textarea')
    expect(textarea.element.value).toBe('custom body')
  })

  it('shows agent name in header', async () => {
    const agent = buildAgent({ name: '智能问答助手' })
    const wrapper = await mountComponent(agent)

    expect(wrapper.find('.advanced-editor__title').text()).toContain('智能问答助手')
    expect(wrapper.find('.advanced-editor__title').text()).toContain('高级模式')
  })

  it('shows loading state when store.currentLoading is true', async () => {
    const wrapper = await mountComponent(null, { currentLoading: true })

    expect(wrapper.find('.advanced-editor__loading').exists()).toBe(true)
    expect(wrapper.find('textarea.advanced-textarea').exists()).toBe(false)
  })

  it('shows error state when store.currentError is set', async () => {
    const wrapper = await mountComponent(null, { currentError: '网络错误' })

    expect(wrapper.find('.advanced-editor__error').exists()).toBe(true)
    expect(wrapper.find('.advanced-editor__error').text()).toContain('网络错误')
    expect(wrapper.find('textarea.advanced-textarea').exists()).toBe(false)
  })

  it('shows not-found state when agent is null and not loading/error', async () => {
    const wrapper = await mountComponent(null)

    expect(wrapper.find('.advanced-editor__empty').exists()).toBe(true)
  })

  // ── charCount ──────────────────────────────────────────────────────────

  it('displays charCount correctly', async () => {
    const body = 'A'.repeat(100)
    const agent = buildAgent({
      generated_skill_body: body,
      custom_skill_body: ''
    })
    const wrapper = await mountComponent(agent)

    const charCountEl = wrapper.find('.advanced-editor__char-count')
    expect(charCountEl.text()).toContain('100')
  })

  it('does NOT apply char-count--warn class when charCount <= 8000', async () => {
    const body = 'A'.repeat(8000)
    const agent = buildAgent({
      generated_skill_body: body,
      custom_skill_body: ''
    })
    const wrapper = await mountComponent(agent)

    const charCountEl = wrapper.find('.advanced-editor__char-count')
    expect(charCountEl.classes()).not.toContain('char-count--warn')
  })

  it('applies char-count--warn when charCount > 8000', async () => {
    const body = 'A'.repeat(8001)
    const agent = buildAgent({
      generated_skill_body: body,
      custom_skill_body: ''
    })
    const wrapper = await mountComponent(agent)

    const charCountEl = wrapper.find('.advanced-editor__char-count')
    expect(charCountEl.classes()).toContain('char-count--warn')
  })

  // ── tool_flags checkboxes ──────────────────────────────────────────────

  it('renders tool flags checkboxes initialized from agent.tool_flags', async () => {
    const agent = buildAgent({
      tool_flags: { code_sandbox: true, media: false, dangerous: false }
    })
    const wrapper = await mountComponent(agent)

    const checkboxes = wrapper.findAll<HTMLInputElement>("input[type='checkbox']")
    // code_sandbox = index 0, media = index 1, dangerous = index 2
    expect(checkboxes[0].element.checked).toBe(true)
    expect(checkboxes[1].element.checked).toBe(false)
    expect(checkboxes[2].element.checked).toBe(false)
  })

  // ── dangerous toggle ───────────────────────────────────────────────────

  it('opens dangerous confirm modal when dangerous checkbox is newly checked', async () => {
    const agent = buildAgent({
      tool_flags: { code_sandbox: false, media: false, dangerous: false }
    })
    const wrapper = await mountComponent(agent)

    // Confirm modal should be hidden initially; dangerous confirm is the first ConfirmModal
    const allModals = wrapper.findAllComponents({ name: 'ConfirmModal' })
    const dangerousModal = allModals[0]
    expect(dangerousModal.props('visible')).toBe(false)

    // Check the dangerous checkbox
    const checkboxes = wrapper.findAll<HTMLInputElement>("input[type='checkbox']")
    const dangerousCheckbox = checkboxes[2]
    dangerousCheckbox.element.checked = true
    await dangerousCheckbox.trigger('change')

    // Modal should now be visible
    expect(wrapper.findAllComponents({ name: 'ConfirmModal' })[0].props('visible')).toBe(true)
  })

  it('reverts dangerous checkbox to false when user cancels the confirm modal', async () => {
    const agent = buildAgent({
      tool_flags: { code_sandbox: false, media: false, dangerous: false }
    })
    const wrapper = await mountComponent(agent)

    // Open dangerous confirm
    const checkboxes = wrapper.findAll<HTMLInputElement>("input[type='checkbox']")
    const dangerousCheckbox = checkboxes[2]
    dangerousCheckbox.element.checked = true
    await dangerousCheckbox.trigger('change')

    // Cancel from modal
    const dangerousModal = wrapper.findAllComponents({
      name: 'ConfirmModal'
    })[0]
    await dangerousModal.vm.$emit('cancel')
    await wrapper.vm.$nextTick()

    // Modal closed and dangerous is back to false
    expect(dangerousModal.props('visible')).toBe(false)
    const updatedCheckboxes = wrapper.findAll<HTMLInputElement>("input[type='checkbox']")
    expect(updatedCheckboxes[2].element.checked).toBe(false)
  })

  it('keeps dangerous checkbox true when user confirms the dangerous modal', async () => {
    const agent = buildAgent({
      tool_flags: { code_sandbox: false, media: false, dangerous: false }
    })
    const wrapper = await mountComponent(agent)

    // Open dangerous confirm
    const checkboxes = wrapper.findAll<HTMLInputElement>("input[type='checkbox']")
    const dangerousCheckbox = checkboxes[2]
    dangerousCheckbox.element.checked = true
    await dangerousCheckbox.trigger('change')

    // Confirm from modal
    const dangerousModal = wrapper.findAllComponents({
      name: 'ConfirmModal'
    })[0]
    await dangerousModal.vm.$emit('confirm')
    await wrapper.vm.$nextTick()

    // Modal closed and dangerous stays true
    expect(dangerousModal.props('visible')).toBe(false)
    const updatedCheckboxes = wrapper.findAll<HTMLInputElement>("input[type='checkbox']")
    expect(updatedCheckboxes[2].element.checked).toBe(true)
  })

  it('does NOT open confirm modal when dangerous is unchecked (was true)', async () => {
    const agent = buildAgent({
      tool_flags: { code_sandbox: false, media: false, dangerous: true }
    })
    const wrapper = await mountComponent(agent)

    // Uncheck the dangerous checkbox (was true → false)
    const checkboxes = wrapper.findAll<HTMLInputElement>("input[type='checkbox']")
    const dangerousCheckbox = checkboxes[2]
    expect(dangerousCheckbox.element.checked).toBe(true)

    dangerousCheckbox.element.checked = false
    await dangerousCheckbox.trigger('change')

    // Modal should remain hidden
    const dangerousModal = wrapper.findAllComponents({
      name: 'ConfirmModal'
    })[0]
    expect(dangerousModal.props('visible')).toBe(false)
  })

  // ── Save ───────────────────────────────────────────────────────────────

  it('calls store.update with current tool_flags when save button is clicked', async () => {
    const agent = buildAgent({
      tool_flags: { code_sandbox: false, media: false, dangerous: false }
    })
    const wrapper = await mountComponent(agent)

    // Toggle code_sandbox on
    const checkboxes = wrapper.findAll<HTMLInputElement>("input[type='checkbox']")
    checkboxes[0].element.checked = true
    await checkboxes[0].trigger('change')

    // Click save button
    const saveButton = wrapper.findAll('button').find((b) => b.text().includes('保存工具开关'))
    expect(saveButton).toBeDefined()
    await saveButton!.trigger('click')
    await flushPromises()

    expect(mockUpdate).toHaveBeenCalledOnce()
    const [id, payload] = mockUpdate.mock.calls[0]
    expect(id).toBe(1)
    expect(payload).toMatchObject({
      tool_flags: expect.objectContaining({ code_sandbox: true })
    })
  })

  it('shows success toast after successful save', async () => {
    const wrapper = await mountComponent()

    const saveButton = wrapper.findAll('button').find((b) => b.text().includes('保存工具开关'))
    await saveButton!.trigger('click')
    await flushPromises()

    expect(mockToastSuccess).toHaveBeenCalledWith('已保存')
  })

  it('shows error toast when store.update throws', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('服务器错误'))

    const wrapper = await mountComponent()

    const saveButton = wrapper.findAll('button').find((b) => b.text().includes('保存工具开关'))
    await saveButton!.trigger('click')
    await flushPromises()

    expect(mockToastError).toHaveBeenCalledWith('服务器错误')
    expect(mockToastSuccess).not.toHaveBeenCalled()
  })

  // ── Navigation ─────────────────────────────────────────────────────────

  it('calls router.back() when 返回 button is clicked', async () => {
    const wrapper = await mountComponent()

    const backButton = wrapper.findAll('button').find((b) => b.text().includes('返回'))
    expect(backButton).toBeDefined()
    await backButton!.trigger('click')

    expect(mockRouterBack).toHaveBeenCalledOnce()
  })

  // ── fetchOne on mount ──────────────────────────────────────────────────

  it('calls store.fetchOne on mount when store.current is null', async () => {
    const { useAgentBuilderStore } = await import('@/stores/agentBuilder')
    vi.mocked(useAgentBuilderStore).mockReturnValue({
      current: null,
      currentLoading: false,
      currentError: '',
      saving: false,
      fetchOne: mockFetchOne,
      update: mockUpdate
    } as ReturnType<typeof useAgentBuilderStore>)

    mount(AgentAdvancedEdit, {
      props: { agentId: 42 },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    expect(mockFetchOne).toHaveBeenCalledWith(42)
  })

  it('does NOT call store.fetchOne if store.current.id matches agentId', async () => {
    const agent = buildAgent({ id: 1 })
    const { useAgentBuilderStore } = await import('@/stores/agentBuilder')
    vi.mocked(useAgentBuilderStore).mockReturnValue({
      current: agent,
      currentLoading: false,
      currentError: '',
      saving: false,
      fetchOne: mockFetchOne,
      update: mockUpdate
    } as ReturnType<typeof useAgentBuilderStore>)

    mount(AgentAdvancedEdit, {
      props: { agentId: 1 },
      global: { stubs: { Teleport: true } }
    })
    await flushPromises()

    expect(mockFetchOne).not.toHaveBeenCalled()
  })
})
