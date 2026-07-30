import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import AppSidebar from '../AppSidebar.vue'
import { useUserStore } from '@/stores/user'

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  getUserInfo: vi.fn()
}))

vi.mock('@/api/credits', () => ({
  getCreditBalance: vi.fn()
}))

function makeRouter(path = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/sop', component: { template: '<div />' } },
      { path: '/customers', component: { template: '<div />' } },
      { path: '/knowledge', component: { template: '<div />' } },
      { path: '/xhs', component: { template: '<div />' } },
      { path: '/config', component: { template: '<div />' } },
      { path: '/config/skills', component: { template: '<div />' } },
      { path: '/marketplace', component: { template: '<div />' } },
      { path: '/settings', component: { template: '<div />' } }
    ]
  })
  router.push(path)
  return router
}

async function mountSidebar(userInfo: { id: number; username: string; parent_user_id: number | null }) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const router = makeRouter()
  await router.isReady()

  const userStore = useUserStore()
  userStore.userInfo = userInfo
  userStore.fetchUserInfo = vi.fn(async () => true)

  return mount(AppSidebar, {
    global: {
      plugins: [pinia, router]
    }
  })
}

describe('AppSidebar homepage entries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('hides skill marketplace and meeting copilot entries for parent users', async () => {
    const wrapper = await mountSidebar({
      id: 1,
      username: 'parent',
      parent_user_id: null
    })

    expect(wrapper.text()).toContain('配置中心')
    expect(wrapper.text()).not.toContain('技能市场')
    expect(wrapper.text()).not.toContain('会议副驾')
    expect(wrapper.find('a[href="/marketplace"]').exists()).toBe(false)
    expect(wrapper.find('a[href="/meeting"]').exists()).toBe(false)
  })

  it('hides configuration and skill entries for child users', async () => {
    const wrapper = await mountSidebar({
      id: 2,
      username: 'child',
      parent_user_id: 1
    })

    expect(wrapper.text()).not.toContain('配置中心')
    expect(wrapper.text()).not.toContain('我的技能')
    expect(wrapper.text()).not.toContain('技能市场')
    expect(wrapper.text()).not.toContain('会议副驾')
    expect(wrapper.find('a[href="/config"]').exists()).toBe(false)
    expect(wrapper.find('a[href="/config/skills"]').exists()).toBe(false)
    expect(wrapper.find('a[href="/marketplace"]').exists()).toBe(false)
  })
})
