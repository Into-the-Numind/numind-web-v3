/**
 * Unit tests for AgentBuilder.vue
 *
 * Strategy: mock @/api/agentBuilder (API layer) + vue-router + useToast.
 * Real Pinia store runs with mocked API underneath.
 * Covers: init modes, validation gate (incl. required system_prompt), save
 * success, payload shape (no questionnaire_answers), post-create navigation
 * to the edit page (inline 装载 skill).
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
  deleteAgent: vi.fn()
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
import type { Agent } from '@/types/agentBuilder'

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
    system_prompt: '你是一个测试助手，负责回答用户的问题。',
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
    created_by: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

/** A complete, valid form-state to emit from AgentForm in create-mode tests. */
function validFormState(overrides: Record<string, unknown> = {}) {
  return {
    name: '完整助手名',
    icon_url: 'lucide:Bot',
    description: '这是超过十字的助手描述内容',
    welcome_message: '欢迎使用本助手，这是超过二十字的欢迎语文本内容',
    system_prompt: '你是一个销售助手，负责帮助用户解决问题。',
    starters: [],
    tool_flags: {},
    daily_credit_cap: null,
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
      plugins: [router],
      // Edit mode now renders the inline 装载 skill panel — stub it so these
      // form/save unit tests don't pull in the skill store + API.
      stubs: { SkillBindingPanel: true }
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
    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('保存'))
    expect(saveBtn).toBeDefined()
    await saveBtn!.trigger('click')
    await flushPromises()
    expect(agentApi.createAgent).not.toHaveBeenCalled()
    // 只有 name + system_prompt 是必填（description/welcome 已改选填）
    expect(wrapper.text()).toMatch(/请输入助手名字|请输入提示词/)
  })

  it('blocks save when system_prompt is empty (required)', async () => {
    const wrapper = await mountBuilder()
    const form = wrapper.findComponent({ name: 'AgentForm' })
    await form.vm.$emit('update:modelValue', validFormState({ system_prompt: '' }))
    await flushPromises()

    const saveBtn = wrapper
      .findAllComponents({ name: 'AppButton' })
      .find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(agentApi.createAgent).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请输入提示词')
  })

  it('calls store.create and navigates to the edit page (inline 装载 skill) on valid save', async () => {
    const saved = makeAgent({ id: 42, name: '新建助手' })
    vi.mocked(agentApi.createAgent).mockResolvedValue(saved)

    const wrapper = await mountBuilder()

    const form = wrapper.findComponent({ name: 'AgentForm' })
    await form.vm.$emit('update:modelValue', validFormState({ name: '新建助手' }))
    await flushPromises()

    const saveBtn = wrapper
      .findAllComponents({ name: 'AppButton' })
      .find((b) => b.text().includes('保存'))
    expect(saveBtn).toBeTruthy()
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(agentApi.createAgent).toHaveBeenCalled()
    expect(router.currentRoute.value.path).toBe('/config/agents/42/edit')
  })

  it('create payload includes system_prompt and NO questionnaire_answers', async () => {
    const saved = makeAgent({ id: 43 })
    vi.mocked(agentApi.createAgent).mockResolvedValue(saved)

    const wrapper = await mountBuilder()
    const form = wrapper.findComponent({ name: 'AgentForm' })
    await form.vm.$emit(
      'update:modelValue',
      validFormState({ system_prompt: '你是一个客服助手，态度友好。' })
    )
    await flushPromises()

    const saveBtn = wrapper
      .findAllComponents({ name: 'AppButton' })
      .find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()

    const callArg = vi.mocked(agentApi.createAgent).mock.calls[0]?.[0]
    expect(callArg?.system_prompt).toBe('你是一个客服助手，态度友好。')
    expect(callArg).not.toHaveProperty('questionnaire_answers')
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
    const form = wrapper.findComponent({ name: 'AgentForm' })
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

  it('seeds system_prompt from generated_skill_body for old questionnaire agents', async () => {
    const agent = makeAgent({
      id: 11,
      system_prompt: '',
      generated_skill_body: '这是旧问卷模式生成的提示词正文'
    })
    vi.mocked(agentApi.getAgent).mockResolvedValue(agent)

    const wrapper = await mountBuilder({
      props: { mode: 'edit', agentId: 11 }
    })

    const form = wrapper.findComponent({ name: 'AgentForm' })
    expect((form.props('modelValue') as { system_prompt: string }).system_prompt).toBe(
      '这是旧问卷模式生成的提示词正文'
    )
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
})

describe('AgentBuilder — validation errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows name error when name is too short', async () => {
    const wrapper = await mountBuilder()

    const form = wrapper.findComponent({ name: 'AgentForm' })
    await form.vm.$emit('update:modelValue', validFormState({ name: 'A' }))
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

describe('AgentBuilder — after create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigates to the edit page (inline 装载 skill) and toasts success after create', async () => {
    const saved = makeAgent({ id: 88 })
    vi.mocked(agentApi.createAgent).mockResolvedValue(saved)

    const wrapper = await mountBuilder()

    const form = wrapper.findComponent({ name: 'AgentForm' })
    await form.vm.$emit('update:modelValue', validFormState())
    await flushPromises()

    const saveBtn = wrapper
      .findAllComponents({ name: 'AppButton' })
      .find((b) => b.text().includes('保存'))
    await saveBtn!.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/config/agents/88/edit')
    expect(toastSpy.success).toHaveBeenCalled()
  })
})
