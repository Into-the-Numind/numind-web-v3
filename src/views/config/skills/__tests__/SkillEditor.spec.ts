import { describe, expect, it, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import SkillEditor from '../SkillEditor.vue'
import { useUserStore } from '@/stores/user'

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  getUserInfo: vi.fn()
}))

vi.mock('@/api/credits', () => ({
  getCreditBalance: vi.fn()
}))

function makeRouter(path = '/config/skills/new') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/config/skills', component: { template: '<div />' } },
      { path: '/config/skills/new', component: { template: '<div />' } }
    ]
  })
  router.push(path)
  return router
}

async function mountEditor() {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = makeRouter()
  await router.isReady()

  const userStore = useUserStore()
  userStore.userInfo = { id: 1, username: 'parent', parent_user_id: null }
  userStore.fetchUserInfo = vi.fn(async () => true)

  const wrapper = mount(SkillEditor, {
    props: { mode: 'create' },
    global: {
      plugins: [pinia, router],
      stubs: {
        CodeMirrorEditor: {
          props: ['modelValue', 'height', 'placeholder'],
          template: '<textarea data-testid="codemirror-stub" :value="modelValue" />'
        },
        ConfirmModal: true
      }
    }
  })

  await flushPromises()
  return { wrapper, router }
}

describe('SkillEditor header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('shows a back button and removes the old explanatory subtitle', async () => {
    const { wrapper, router } = await mountEditor()

    expect(wrapper.text()).toContain('返回列表')
    expect(wrapper.text()).not.toContain(
      '用 Markdown + frontmatter 定义可复用的技能资产，左侧编辑器与右侧表单实时同步。'
    )

    await wrapper.get('.skill-editor__back').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/config/skills')
  })
})
