/**
 * Unit tests for AgentBuilder.vue (M9b)
 *
 * Strategy: mock @/api/agent (API layer) + vue-router + useToast.
 * Real Pinia store runs with mocked API underneath.
 * Covers: init modes, validation gate, save success, after-save modal, dirty check.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'

// ── API mock ────────────────────────────────────────────────────────────────
vi.mock('@/api/agentBuilder', () => ({
  listAgents: vi.fn(),
  getAgent: vi.fn(),
  createAgent: vi.fn(),
  patchAgent: vi.fn(),
  deleteAgent: vi.fn(),
  listAgentHistory: vi.fn(),
  restoreAgent: vi.fn(),
  toggleAgentAdvanced: vi.fn(),
  listSkillTemplates: vi.fn()
}))

// ── Toast mock ──────────────────────────────────────────────────────────────
const toastSpy = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock('@/stores/notifications', () => ({ useNotificationsStore: () => toastSpy }))

// ── vue-router onBeforeRouteLeave mock ──────────────────────────────────────
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return {
    ...actual,
    onBeforeRouteLeave: vi.fn() // no-op in tests — we test dirty state directly
  }
})

// ── Import AFTER vi.mock ────────────────────────────────────────────────────
import AgentBuilder from '@/views/config/agents/AgentBuilder.vue'
import * as agentApi from '@/api/agentBuilder'
import type { Agent, SkillTemplate } from '@/types/agentBuilder'

// ── Router ──────────────────────────────────────────────────────────────────
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div/>' } },
    { path: '/config/agents/builder', component: { template: '<div/>' } },
    { path: '/config/agents/:id', component: { template: '<div/>' } },
    { path: '/config/agents/:id/edit', component: { template: '<div/>' } }
  ]
})

// ── Sample data factories ───────────────────────────────────────────────────
function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 1,
    parent_user_id: 100,
    name: '测试助手',
    description: '这是一个十字符以上的描述文本',
    icon_url: 'lucide:Bot',
    welcome_message: '欢迎使用本助手，这是一条超过二十字符的欢迎语测试文本',
    starters: [],
    questionnaire_answers: {
      q6: ['analyze_data'],
      q7: ['text'],
      q8: 800,
      q9: 'no_web_search',
      q10: '',
      q11: '',
      q12: 'friendly'
    },
    generated_skill_body: '',
    advanced_mode: false,
    custom_skill_body: '',
    tool_flags: {},
    credit_cap_per_session: null,
    daily_credit_cap: null,
    version: 1,
    is_active: true,
    source_template_id: null,
    created_by: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function makeTemplate(overrides: Partial<SkillTemplate> = {}): SkillTemplate {
  return {
    id: 99,
    name: '模板助手',
    description: '这是模板助手的描述信息，超过十字',
    icon_url: 'lucide:Sparkles',
    welcome_message: '你好，我是模板助手，超过二十字符的欢迎语占位文本',
    starters: ['示例问题一', '示例问题二'],
    questionnaire_answers: {
      q6: ['generate_content'],
      q7: ['text'],
      q8: 600,
      q9: 'no_web_search',
      q12: 'professional'
    },
    tool_flags: {},
    credit_cap_per_session: null,
    daily_credit_cap: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

// ── Mount helper ────────────────────────────────────────────────────────────
interface MountOptions {
  props?: Record<string, unknown>
  query?: Record<string, string>
}

async function mountBuilder(opts: MountOptions = {}) {
  setActivePinia(createPinia())
  if (opts.query) {
    await router.push({ path: '/config/agents/builder', query: opts.query })
  } else {
    await router.push('/')
  }
  await router.isReady()

  const wrapper = mount(AgentBuilder, {
    props: { mode: 'create', ...opts.props },
    global: {
      plugins: [router]
    },
    attachTo: document.body
  })
  await flushPromises()
  return wrapper
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('AgentBuilder — create mode (scratch)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders title '创建新助手' in create mode", async () => {
    const wrapper = await mountBuilder()
    expect(wrapper.text()).toContain('创建新助手')
  })

  it('shows validation errors when save clicked with empty form', async () => {
    const wrapper = await mountBuilder()
    // 模板第一个 <button> 是 header 里的"返回"按钮，必须按文案找"保存"
    // 才能触发 handleSave（之前 find('button') 点的是返回按钮，不会跑校验）
    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('保存'))
    expect(saveBtn).toBeDefined()
    await saveBtn!.trigger('click')
    await flushPromises()
    // Should NOT call createAgent
    expect(agentApi.createAgent).not.toHaveBeenCalled()
    // Validation error text should appear
    expect(wrapper.text()).toMatch(/请输入助手名字|请输入描述|请输入欢迎语/)
  })

  it('calls store.create and opens AfterSaveModal on valid form save', async () => {
    const saved = makeAgent({ id: 42, name: '新建助手' })
    vi.mocked(agentApi.createAgent).mockResolvedValue(saved)

    const wrapper = await mountBuilder()

    // Populate form with valid values via v-model (update:modelValue)
    const form = wrapper.findComponent({ name: 'QuestionnaireForm' })
    await form.vm.$emit('update:modelValue', {
      name: '新建助手',
      icon_url: 'lucide:Bot',
      description: '这是超过十字的助手描述内容',
      welcome_message: '欢迎使用本助手，这是超过二十字的欢迎语文本内容',
      starters: [],
      questionnaire_answers: {
        q6: ['analyze_data'],
        q7: ['text'],
        q8: 800,
        q9: 'no_web_search',
        q10: '',
        q11: '',
        q12: 'friendly'
      },
      tool_flags: {},
      credit_cap_per_session: null,
      daily_credit_cap: null
    })
    await flushPromises()

    // Click save button
    const saveBtn = wrapper
      .findAllComponents({ name: 'AppButton' })
      .find((b) => b.text().includes('保存'))
    expect(saveBtn).toBeTruthy()
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(agentApi.createAgent).toHaveBeenCalled()
    // AfterSaveModal should become visible
    const afterModal = wrapper.findComponent({ name: 'AfterSaveModal' })
    expect(afterModal.props('visible')).toBe(true)
  })
})

describe('AgentBuilder — create mode (from template)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls fetchTemplates and prefills form from template', async () => {
    const template = makeTemplate({ id: 1, name: '模板助手' })
    vi.mocked(agentApi.listSkillTemplates).mockResolvedValue([template])

    const wrapper = await mountBuilder({
      query: { from: 'template:1' }
    })

    expect(agentApi.listSkillTemplates).toHaveBeenCalled()
    // Form should be prefilled with template name
    const form = wrapper.findComponent({ name: 'QuestionnaireForm' })
    expect((form.props('modelValue') as { name: string }).name).toBe('模板助手')
  })

  it('passes source_template_id to createAgent when saving from template', async () => {
    const template = makeTemplate({ id: 7 })
    const saved = makeAgent({ id: 50, source_template_id: 7 })
    vi.mocked(agentApi.listSkillTemplates).mockResolvedValue([template])
    vi.mocked(agentApi.createAgent).mockResolvedValue(saved)

    const wrapper = await mountBuilder({ query: { from: 'template:7' } })

    // Populate required fields via emit
    const form = wrapper.findComponent({ name: 'QuestionnaireForm' })
    await form.vm.$emit('update:modelValue', {
      name: template.name,
      icon_url: template.icon_url,
      description: template.description,
      welcome_message: template.welcome_message,
      starters: template.starters,
      questionnaire_answers: template.questionnaire_answers,
      tool_flags: {},
      credit_cap_per_session: null,
      daily_credit_cap: null
    })
    await flushPromises()

    const saveBtn = wrapper
      .findAllComponents({ name: 'AppButton' })
      .find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()

    const callArg = vi.mocked(agentApi.createAgent).mock.calls[0]?.[0]
    expect(callArg?.source_template_id).toBe(7)
  })
})

describe('AgentBuilder — create mode (from copy)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("calls fetchOne(sourceId) and prefills name with '- 副本' suffix", async () => {
    const source = makeAgent({ id: 5, name: '原始助手' })
    vi.mocked(agentApi.getAgent).mockResolvedValue(source)

    const wrapper = await mountBuilder({ query: { from: 'copy:5' } })

    expect(agentApi.getAgent).toHaveBeenCalledWith(5)
    const form = wrapper.findComponent({ name: 'QuestionnaireForm' })
    expect((form.props('modelValue') as { name: string }).name).toBe('原始助手 - 副本')
  })
})

describe('AgentBuilder — edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders '编辑：...' title and fetches agent", async () => {
    const agent = makeAgent({ id: 10, name: '被编辑助手' })
    vi.mocked(agentApi.getAgent).mockResolvedValue(agent)

    const wrapper = await mountBuilder({
      props: { mode: 'edit', agentId: 10 }
    })

    expect(agentApi.getAgent).toHaveBeenCalledWith(10)
    expect(wrapper.text()).toContain('编辑：被编辑助手')
  })

  it('calls patchAgent (via store.update) on save in edit mode', async () => {
    const agent = makeAgent({ id: 10, name: '被编辑助手' })
    const updated = makeAgent({ id: 10, name: '被编辑助手' })
    vi.mocked(agentApi.getAgent).mockResolvedValue(agent)
    vi.mocked(agentApi.patchAgent).mockResolvedValue(updated)

    const wrapper = await mountBuilder({
      props: { mode: 'edit', agentId: 10 }
    })

    const saveBtn = wrapper
      .findAllComponents({ name: 'AppButton' })
      .find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(agentApi.patchAgent).toHaveBeenCalledWith(10, expect.any(Object))
  })

  it('does NOT show advanced-mode link in create mode', async () => {
    const wrapper = await mountBuilder()
    expect(wrapper.find('.advanced-link').exists()).toBe(false)
  })

  it('shows advanced-mode link in edit mode', async () => {
    const agent = makeAgent({ id: 10 })
    vi.mocked(agentApi.getAgent).mockResolvedValue(agent)

    const wrapper = await mountBuilder({
      props: { mode: 'edit', agentId: 10 }
    })
    expect(wrapper.find('.advanced-link').exists()).toBe(true)
  })
})

describe('AgentBuilder — validation errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows name error when name is too short', async () => {
    const wrapper = await mountBuilder()

    // Set a single-char name
    const form = wrapper.findComponent({ name: 'QuestionnaireForm' })
    await form.vm.$emit('update:modelValue', {
      name: 'A',
      icon_url: 'lucide:Bot',
      description: '',
      welcome_message: '',
      starters: [],
      questionnaire_answers: {
        q6: [],
        q7: [],
        q8: 800,
        q9: 'no_web_search',
        q10: '',
        q11: '',
        q12: 'friendly'
      },
      tool_flags: {},
      credit_cap_per_session: null,
      daily_credit_cap: null
    })
    await flushPromises()

    const saveBtn = wrapper
      .findAllComponents({ name: 'AppButton' })
      .find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(agentApi.createAgent).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('名字应为 2-20 字')
  })
})

describe('AgentBuilder — AfterSaveModal interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("navigates to agent detail on 'skip'", async () => {
    const saved = makeAgent({ id: 77 })
    vi.mocked(agentApi.createAgent).mockResolvedValue(saved)

    const wrapper = await mountBuilder()

    // Open modal by triggering save with valid data
    const form = wrapper.findComponent({ name: 'QuestionnaireForm' })
    await form.vm.$emit('update:modelValue', {
      name: '完整助手名',
      icon_url: 'lucide:Bot',
      description: '这是超过十字的助手描述内容',
      welcome_message: '欢迎使用本助手，这是超过二十字的欢迎语文本内容',
      starters: [],
      questionnaire_answers: {
        q6: ['analyze_data'],
        q7: ['text'],
        q8: 800,
        q9: 'no_web_search',
        q10: '',
        q11: '',
        q12: 'friendly'
      },
      tool_flags: {},
      credit_cap_per_session: null,
      daily_credit_cap: null
    })
    await flushPromises()

    const saveBtn = wrapper
      .findAllComponents({ name: 'AppButton' })
      .find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()

    // Emit skip from AfterSaveModal
    const afterModal = wrapper.findComponent({ name: 'AfterSaveModal' })
    await afterModal.vm.$emit('skip')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/config/agents/77')
  })

  it("shows toast on 'trial-chat' then navigates to detail", async () => {
    const saved = makeAgent({ id: 88 })
    vi.mocked(agentApi.createAgent).mockResolvedValue(saved)

    const wrapper = await mountBuilder()

    const form = wrapper.findComponent({ name: 'QuestionnaireForm' })
    await form.vm.$emit('update:modelValue', {
      name: '完整助手名',
      icon_url: 'lucide:Bot',
      description: '这是超过十字的助手描述内容',
      welcome_message: '欢迎使用本助手，这是超过二十字的欢迎语文本内容',
      starters: [],
      questionnaire_answers: {
        q6: ['analyze_data'],
        q7: ['text'],
        q8: 800,
        q9: 'no_web_search',
        q10: '',
        q11: '',
        q12: 'friendly'
      },
      tool_flags: {},
      credit_cap_per_session: null,
      daily_credit_cap: null
    })
    await flushPromises()

    const saveBtn = wrapper
      .findAllComponents({ name: 'AppButton' })
      .find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()

    const afterModal = wrapper.findComponent({ name: 'AfterSaveModal' })
    await afterModal.vm.$emit('trial-chat')
    await flushPromises()

    expect(toastSpy.info).toHaveBeenCalledWith('试聊功能即将上线')
    expect(router.currentRoute.value.path).toBe('/config/agents/88')
  })
})
