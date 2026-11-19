import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import HomeView from '../HomeView.vue'
import request from '@/api/request'
import { checkSalesPermission } from '@/api/sales'
import { listVisibleChatbots } from '@/api/chatbot'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  fetchAvailableAgents: vi.fn(),
  availableAgents: [] as Array<{ id: number; name: string; description?: string }>
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
    availableAgents: mocks.availableAgents,
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
    mocks.availableAgents = [{ id: 21, name: '项目推进专家' }]

    vi.mocked(request.get).mockResolvedValue({
      data: {
        templates: [
          {
            id: 1,
            name: '客户拜访顾问',
            description: '根据客户背景生成开场话术、痛点判断和跟进待办。',
            has_permission: true
          },
          {
            id: 2,
            name: '方案润色专家',
            description: '把粗糙材料整理成客户可读的方案结构。'
          },
          {
            id: 3,
            name: '销售预测复盘',
            description: '汇总团队机会点、成交阻力和预测偏差。'
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

  it('shows distinct decorative icons based on the card purpose', async () => {
    const wrapper = mountHomeView()
    await flushPromises()

    const cards = wrapper.findAll('.feature-card')
    const expectedIcons = {
      客户拜访顾问: 'briefcase-business',
      方案润色专家: 'file-pen-line',
      销售预测复盘: 'chart-no-axes-column-increasing',
      知识库问答专家: 'book-open',
      项目推进专家: 'list-checks'
    }

    for (const [title, icon] of Object.entries(expectedIcons)) {
      const card = cards.find((item) => item.get('.feature-card-title').text() === title)
      const avatar = card?.get('.feature-card-avatar')
      expect(avatar?.attributes('aria-hidden'), title).toBe('true')
      expect(avatar?.find(`svg.lucide-${icon}`).exists(), title).toBe(true)
    }
  })

  it('assigns a distinct icon to each card observed in the production workspace', async () => {
    const workflows = [
      ['小红书图文生成智能体', 'images'],
      ['AI文稿创作：流量选题口播稿', 'mic'],
      ['AI朋友圈：深度思考文案', 'lightbulb']
    ]
    const chatbots = [
      ['AI写封面标题（流量/营销脚本）', 'type'],
      ['靚靚镜像大脑', 'brain'],
      ['钩子话术调整', 'magnet'],
      ['引流话术调整', 'funnel'],
      ['会议记录批量生成朋友圈', 'files'],
      ['会议记录沉淀', 'archive'],
      ['营销脚本改稿', 'file-pen-line'],
      ['流量脚本改稿', 'trending-up']
    ]
    const agents = [
      ['选题规划智能体', 'calendar-days'],
      ['黄金人设信息卡提炼', 'id-card'],
      ['爆款素材加工打标', 'tags']
    ]

    vi.mocked(request.get).mockResolvedValue({
      data: { templates: workflows.map(([name], index) => ({ id: index + 1, name })) }
    })
    vi.mocked(listVisibleChatbots).mockResolvedValue({
      data: chatbots.map(([name], index) => ({ id: index + 1, name }))
    })
    mocks.availableAgents = agents.map(([name], index) => ({ id: index + 1, name }))

    const wrapper = mountHomeView()
    await flushPromises()

    const cards = wrapper.findAll('.feature-card')
    const expectedCards = [...workflows, ['销售智能体', 'briefcase-business'], ...chatbots, ...agents]
    expect(cards.map((card) => card.get('.feature-card-title').text())).toEqual(
      expectedCards.map(([name]) => name)
    )
    for (const [index, [name, icon]] of expectedCards.entries()) {
      expect(cards[index].find(`.feature-card-avatar svg.lucide-${icon}`).exists(), name).toBe(true)
    }
  })
})
