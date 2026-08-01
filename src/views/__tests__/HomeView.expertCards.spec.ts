import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import HomeView from '../HomeView.vue'
import request from '@/api/request'
import { checkSalesPermission } from '@/api/sales'
import { listVisibleChatbots } from '@/api/chatbot'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  fetchAvailableAgents: vi.fn()
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push })
}))

vi.mock('@/stores/user', () => ({
  useUserStore: () => ({
    nickname: '知雨',
    username: 'zhiyu'
  })
}))

vi.mock('@/stores/agentChat', () => ({
  useAgentChatStore: () => ({
    availableAgents: [
      {
        id: 21,
        name: '项目推进专家',
        description: '把复杂任务拆成多步骤执行，并持续推进结果。'
      }
    ],
    fetchAvailableAgents: mocks.fetchAvailableAgents
  })
}))

vi.mock('@/api/request', () => ({
  default: {
    get: vi.fn()
  }
}))

vi.mock('@/api/sales', () => ({
  checkSalesPermission: vi.fn()
}))

vi.mock('@/api/chatbot', () => ({
  listVisibleChatbots: vi.fn(),
  checkChatbotPermission: vi.fn()
}))

const mountHomeView = () =>
  mount(HomeView, {
    global: {
      stubs: {
        MainLayout: { template: '<main><slot /></main>' },
        NotificationMegaphone: { template: '<button aria-label="通知" />' },
        Teleport: true
      }
    }
  })

describe('HomeView expert-style workspace cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.fetchAvailableAgents.mockResolvedValue(undefined)

    vi.mocked(request.get).mockResolvedValue({
      data: {
        templates: [
          {
            id: 1,
            name: '客户拜访顾问',
            description: '根据客户背景生成开场话术、痛点判断和跟进待办。',
            has_permission: true
          }
        ]
      }
    })

    vi.mocked(checkSalesPermission).mockResolvedValue(true)
    vi.mocked(listVisibleChatbots).mockResolvedValue({
      data: [
        {
          id: 11,
          user_id: 1,
          name: '知识库问答专家',
          description: '面向客服与销售，把知识库答案组织成可信回复。',
          system_prompt: '',
          status: 'published',
          greeting_enabled: false,
          greeting_message: '',
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-01T00:00:00Z',
          has_permission: true
        }
      ]
    })
  })

  it('renders each workspace card as avatar, name, description, and tags only', async () => {
    const wrapper = mountHomeView()

    await flushPromises()
    await flushPromises()

    const cards = wrapper.findAll('.feature-card')
    expect(cards.length).toBeGreaterThanOrEqual(4)

    const firstCard = cards[0]
    const header = firstCard.find('.feature-card-header')
    const body = firstCard.find('.feature-card-body')

    expect(header.find('.feature-card-avatar').exists()).toBe(true)
    expect(header.find('.feature-card-title').text()).toBe('客户拜访顾问')
    expect(body.find('.feature-card-title').exists()).toBe(false)
    expect(firstCard.find('.feature-card-desc').text()).toContain('根据客户背景')

    const tags = firstCard.findAll('.feature-card-tag')
    expect(tags).toHaveLength(3)
    expect(tags.map((tag) => tag.text())).toEqual(['销售话术', '客户跟进', '拜访准备'])

    expect(firstCard.find('.card-right').exists()).toBe(false)
    expect(firstCard.find('.feature-card-label').exists()).toBe(false)
    expect(firstCard.find('.feature-card-icon').exists()).toBe(false)
  })
})
