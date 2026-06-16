<template>
  <MainLayout>
    <!-- 加载状态 -->
    <div v-if="pageLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <div class="loading-text">加载中...</div>
    </div>

    <template v-else>
      <!-- Hero 区域：打招呼标题在左，通知铃铛在同一行右上角（notif-dropdown） -->
      <div class="hero-section">
        <div class="hero-content">
          <h1 class="hero-title">
            {{ greeting }}，{{ displayName }}
            <br />
            <span class="hero-title-sub">开始今天的工作吧</span>
          </h1>
        </div>
        <NotificationMegaphone />
      </div>

      <!-- 空工作台：两个 section 都没有内容时，给一个友好的引导而不是双 empty label -->
      <div v-if="isWorkspaceEmpty" class="empty-workspace">
        <div class="empty-workspace__art" aria-hidden="true">
          <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- 剪贴板主体 -->
            <rect
              x="20"
              y="18"
              width="56"
              height="64"
              rx="6"
              stroke="#cfd2dc"
              stroke-width="1.5"
              fill="#fafbfc"
            />
            <!-- 剪贴板顶部夹子 -->
            <rect
              x="36"
              y="12"
              width="24"
              height="12"
              rx="3"
              stroke="#cfd2dc"
              stroke-width="1.5"
              fill="#ffffff"
            />
            <!-- 三行待开通的列表占位 -->
            <line
              x1="32"
              y1="40"
              x2="58"
              y2="40"
              stroke="#e3e5ec"
              stroke-width="1.4"
              stroke-linecap="round"
            />
            <line
              x1="32"
              y1="52"
              x2="52"
              y2="52"
              stroke="#e3e5ec"
              stroke-width="1.4"
              stroke-linecap="round"
            />
            <line
              x1="32"
              y1="64"
              x2="60"
              y2="64"
              stroke="#e3e5ec"
              stroke-width="1.4"
              stroke-linecap="round"
            />
            <!-- 翠绿小圆点：从亮到淡，暗示"开通之后会依次到来" -->
            <circle cx="25" cy="40" r="2" fill="hsl(160, 75%, 42%)" />
            <circle cx="25" cy="52" r="2" fill="hsl(160, 55%, 65%)" />
            <circle cx="25" cy="64" r="2" fill="hsl(160, 40%, 80%)" />
          </svg>
        </div>
        <h2 class="empty-workspace__title">我翻了好几遍，这里还是空的</h2>
        <p class="empty-workspace__desc">
          这里没有任何 AI 工具——<br />
          不是 bug，是管理员还没来得及为您开通而已。
        </p>
        <div class="empty-workspace__hint">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M3 4.5C3 3.67157 3.67157 3 4.5 3H11.5C12.3284 3 13 3.67157 13 4.5V11C13 11.8284 12.3284 12.5 11.5 12.5H5.5L3 14.5V4.5Z"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
          </svg>
          去戳一下管理员，工具就会出现
        </div>
      </div>

      <!-- AI 工作流 -->
      <div v-if="sopWorkflows.length" class="workspace-section">
        <div class="section-label">AI 工作流</div>
        <div class="feature-cards">
          <button
            v-for="(workflow, index) in sopWorkflows"
            :key="workflow.key"
            type="button"
            class="feature-card"
            :class="{
              loading: launchingWorkflowKey === workflow.key,
              'no-permission': !workflow.hasPermission
            }"
            :disabled="launchingWorkflowKey === workflow.key"
            @click="handleWorkflowClick(workflow)"
          >
            <svg
              v-if="!workflow.hasPermission"
              class="lock-badge"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="5"
                y="11"
                width="14"
                height="10"
                rx="2"
                stroke="currentColor"
                stroke-width="1.5"
                fill="none"
              />
              <path
                d="M8 11V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7V11"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
            <div class="card-left">
              <div class="feature-card-title">{{ workflow.title }}</div>
              <div class="feature-card-desc">{{ truncateDesc(workflow.subtitle) }}</div>
            </div>
            <div class="card-right">
              <div class="feature-card-icon" :class="'icon-variant-' + (index % 3)">
                <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect
                    x="4"
                    y="6"
                    width="10"
                    height="10"
                    rx="2"
                    stroke="currentColor"
                    stroke-width="1.5"
                    fill="none"
                  />
                  <path
                    d="M14 11H18M18 11C18 13.2091 19.7909 15 22 15C24.2091 15 26 13.2091 26 11C26 8.79086 24.2091 7 22 7C19.7909 7 18 8.79086 18 11Z"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                  />
                  <path
                    d="M22 11H26"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                  />
                  <circle
                    cx="7"
                    cy="25"
                    r="3"
                    stroke="currentColor"
                    stroke-width="1.5"
                    fill="none"
                  />
                  <path
                    d="M10 25H14"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                  />
                  <rect
                    x="14"
                    y="22"
                    width="10"
                    height="6"
                    rx="1"
                    stroke="currentColor"
                    stroke-width="1.5"
                    fill="none"
                  />
                </svg>
              </div>
              <div class="feature-card-label">AI 工作流</div>
            </div>
          </button>
        </div>
      </div>

      <!-- AI 助手 (销售智能体 + chatbot 统一排序，unlocked 在前) -->
      <div v-if="agentCards.length" class="workspace-section">
        <div class="section-label">AI 助手</div>
        <div class="feature-cards">
          <button
            v-for="card in agentCards"
            :key="card.key"
            type="button"
            class="feature-card"
            :class="{
              loading: launchingWorkflowKey === card.key,
              'no-permission': !card.hasPermission
            }"
            :disabled="launchingWorkflowKey === card.key"
            @click="handleAgentCardClick(card)"
          >
            <svg
              v-if="!card.hasPermission"
              class="lock-badge"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="5"
                y="11"
                width="14"
                height="10"
                rx="2"
                stroke="currentColor"
                stroke-width="1.5"
                fill="none"
              />
              <path
                d="M8 11V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7V11"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
            <div class="card-left">
              <div class="feature-card-title">{{ card.title }}</div>
              <div class="feature-card-desc">{{ truncateDesc(card.subtitle) }}</div>
            </div>
            <div class="card-right">
              <div class="feature-card-icon icon-variant-1">
                <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle
                    cx="16"
                    cy="10"
                    r="4"
                    stroke="currentColor"
                    stroke-width="1.5"
                    fill="none"
                  />
                  <path
                    d="M10 22C10 18.6863 12.6863 16 16 16C19.3137 16 22 18.6863 22 22"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                  />
                  <path
                    d="M20 10L24 6M24 6L28 10M24 6V14"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </div>
              <div class="feature-card-label">AI 助手</div>
            </div>
          </button>
        </div>
      </div>

      <!-- AI 智能体入口 -->
      <div v-if="agentChatStore.availableAgents.length" class="workspace-section">
        <div class="section-label">AI 智能体</div>
        <div class="feature-cards">
          <button
            v-for="agent in agentChatStore.availableAgents"
            :key="agent.id"
            type="button"
            class="feature-card"
            @click="handleAgentClick(agent.id)"
          >
            <div class="card-left">
              <div class="feature-card-title">{{ agent.name }}</div>
              <div class="feature-card-desc">
                {{ truncateDesc(agent.description || '多步骤自主任务') }}
              </div>
            </div>
            <div class="card-right">
              <div class="feature-card-icon icon-variant-2">
                <span v-if="agent.emoji" class="agent-emoji">{{ agent.emoji }}</span>
                <svg v-else viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect
                    x="4"
                    y="13"
                    width="24"
                    height="14"
                    rx="3"
                    stroke="currentColor"
                    stroke-width="1.5"
                    fill="none"
                  />
                  <circle
                    cx="16"
                    cy="6"
                    r="3"
                    stroke="currentColor"
                    stroke-width="1.5"
                    fill="none"
                  />
                  <path
                    d="M16 9v4"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                  />
                  <circle
                    cx="10"
                    cy="21"
                    r="2"
                    stroke="currentColor"
                    stroke-width="1.5"
                    fill="none"
                  />
                  <circle
                    cx="22"
                    cy="21"
                    r="2"
                    stroke="currentColor"
                    stroke-width="1.5"
                    fill="none"
                  />
                </svg>
              </div>
              <div class="feature-card-label">AI 智能体</div>
            </div>
          </button>
        </div>
      </div>
    </template>

    <!-- 权限不足模态框 -->
    <Teleport to="body">
      <div
        v-if="showPermissionModal"
        class="permission-overlay"
        @click.self="showPermissionModal = false"
      >
        <div class="permission-dialog">
          <svg
            class="permission-icon"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="14"
              y="20"
              width="20"
              height="18"
              rx="3"
              stroke="currentColor"
              stroke-width="2"
              fill="none"
            />
            <path
              d="M18 20V14C18 10.6863 20.6863 8 24 8C27.3137 8 30 10.6863 30 14V20"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
            <circle cx="24" cy="30" r="2" fill="currentColor" />
            <path d="M24 32V34" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          <div class="permission-title">没有运行权限</div>
          <div class="permission-desc">{{ permissionMessage }}</div>
          <button class="permission-btn" @click="showPermissionModal = false">我知道了</button>
        </div>
      </div>
    </Teleport>
  </MainLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import request from '@/api/request'
import { checkSalesPermission } from '@/api/sales'
import { listVisibleChatbots, checkChatbotPermission } from '@/api/chatbot'
import MainLayout from '@/components/layout/MainLayout.vue'
import NotificationMegaphone from '@/components/notification/NotificationMegaphone.vue'
import { useUserStore } from '@/stores/user'
import { useAgentChatStore } from '@/stores/agentChat'
import type { ChatbotConfig } from '@/types/config'

interface SopTemplate {
  ID?: number
  id?: number
  Id?: number
  name?: string
  description?: string
  /**
   * Backend tells us whether current user can run this template.
   * Undefined → assume true (old backend compat; click-time
   * checkTemplatePermission still enforces gate).
   */
  has_permission?: boolean
}

interface OnlineWorkflow {
  key: string
  type: 'sop'
  title: string
  subtitle: string
  templateId?: number
  /** Mirror of template.has_permission for UI lock badge. */
  hasPermission: boolean
}

interface AgentCard {
  key: string
  type: 'sales' | 'chatbot'
  title: string
  subtitle: string
  hasPermission: boolean
  /** Original ChatbotConfig kept so the click handler can route by id. */
  chatbot?: ChatbotConfig
}

const router = useRouter()
const userStore = useUserStore()
const agentChatStore = useAgentChatStore()

const templateWorkflows = ref<OnlineWorkflow[]>([])
const launchingWorkflowKey = ref<string | null>(null)
// 三个独立 loading flag：等三个请求全部完成才退出 loading，避免空状态在
// chatbot/sales-check 还在加载时短暂闪现 (S0 视觉抖动).
const templatesLoading = ref(true)
const chatbotsLoading = ref(true)
const salesLoading = ref(true)
const agentsLoading = ref(true)
const pageLoading = computed(
  () => templatesLoading.value || chatbotsLoading.value || salesLoading.value || agentsLoading.value
)
const showPermissionModal = ref(false)
const hasSalesPermission = ref(true)
const permissionMessage = ref('')
const chatbots = ref<ChatbotConfig[]>([])

const displayName = computed(() => userStore.nickname || userStore.username || '用户')

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

const sopWorkflows = computed<OnlineWorkflow[]>(() => templateWorkflows.value)

// 卡片描述统一截断到 20 个字符内，超出补省略号，避免长描述撑破卡片布局。
const DESC_MAX = 20
const truncateDesc = (s?: string): string => {
  const t = (s ?? '').trim()
  return t.length > DESC_MAX ? t.slice(0, DESC_MAX) + '…' : t
}

// agentCards 合并"销售智能体"和普通 chatbot 成同构数组，一起按 hasPermission 排序
// （销售智能体本质上也是一种 chatbot，不应永远占位 index 0）。
// Stable sort 保留组内原始顺序：sales 先于 chatbot（初始），chatbots 内部按后端返回顺序。
//
// sop-salesrag-parent-scope 多租户隔离 (2026-05-19):
// 销售智能体磁贴**仅在 hasSalesPermission=true 时渲染**, 不再"无权限时显示带锁卡片"。
// 产品语义: 销售智能体只属于 user 30 及其子账户, 其他租户根本看不到 (不只是锁住).
// 后端 /v1/sales-rag/check-permission 返回 has_permission=false 即视为"不属于本租户",
// 完整 hide 磁贴。
const agentCards = computed<AgentCard[]>(() => {
  const all: AgentCard[] = []

  if (hasSalesPermission.value) {
    all.push({
      key: 'agent-sales',
      type: 'sales',
      title: '销售智能体',
      subtitle: 'AI驱动的智能销售助手',
      hasPermission: true
    })
  }

  all.push(
    ...chatbots.value.map<AgentCard>((bot) => ({
      key: `chatbot-${bot.id}`,
      type: 'chatbot',
      title: bot.name,
      subtitle: bot.description || '智能对话助手',
      hasPermission: bot.has_permission ?? true,
      chatbot: bot
    }))
  )

  all.sort((a, b) => Number(b.hasPermission) - Number(a.hasPermission))
  return all
})

// 工作台完全空 (两个 section 都 0 条) -> 渲染 empty state 而不是孤立的 section 标签.
// loading 阶段由 pageLoading 提前 short-circuit, 这里只看派生数据.
const isWorkspaceEmpty = computed(
  () =>
    sopWorkflows.value.length === 0 &&
    agentCards.value.length === 0 &&
    agentChatStore.availableAgents.length === 0
)

const getTemplateId = (template: SopTemplate): number | null => {
  const rawId = template.ID ?? template.id ?? template.Id
  const numericId = Number(rawId)
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return null
  }
  return numericId
}

const checkTemplatePermission = async (templateId: number): Promise<boolean> => {
  try {
    const res = await request.get(`/v1/sop/templates/${templateId}/check-permission`)
    const permission = (res as any)?.data?.has_permission
    return permission === true
  } catch (error) {
    console.error(`检查模板 ${templateId} 权限失败:`, error)
    return false
  }
}

const fetchTemplates = async () => {
  templatesLoading.value = true
  try {
    const res = await request.get('/v1/sop/templates')
    const payload = (res as any)?.data
    const templates: SopTemplate[] = Array.isArray(payload?.templates)
      ? payload.templates
      : Array.isArray(payload)
        ? payload
        : []

    const workflows: OnlineWorkflow[] = []
    for (const template of templates) {
      const templateId = getTemplateId(template)
      if (!templateId) {
        continue
      }

      workflows.push({
        key: `sop-${templateId}`,
        type: 'sop',
        title: template.name || '未命名SOP',
        subtitle: template.description || '',
        templateId,
        // fallback true when backend doesn't send field yet (old API) — click-time
        // checkTemplatePermission still enforces gate so a missed lock won't let
        // a denied user actually run.
        hasPermission: template.has_permission ?? true
      })
    }

    // Sort unlocked (hasPermission=true) before locked (hasPermission=false);
    // stable within each group preserves backend order (e.g. publish time).
    workflows.sort((a, b) => Number(b.hasPermission) - Number(a.hasPermission))

    templateWorkflows.value = workflows
  } catch (error) {
    console.error('获取SOP模板失败:', error)
    templateWorkflows.value = []
  } finally {
    templatesLoading.value = false
  }
}

const handleWorkflowClick = async (workflow: OnlineWorkflow) => {
  if (launchingWorkflowKey.value) {
    return
  }

  launchingWorkflowKey.value = workflow.key

  try {
    if (!workflow.templateId) {
      return
    }

    const hasPermission = await checkTemplatePermission(workflow.templateId)
    if (!hasPermission) {
      permissionMessage.value = '未开通该 SOP 的运行权限，请联系管理员'
      showPermissionModal.value = true
      return
    }

    await router.push({
      path: '/sop/run',
      query: { templateId: String(workflow.templateId) }
    })
  } finally {
    launchingWorkflowKey.value = null
  }
}

// handleAgentCardClick 统一处理"销售智能体"和 chatbot 卡片的点击：
// - sales: 复用 hasSalesPermission 即时判定，跳 /sales
// - chatbot: 点击时再查 checkChatbotPermission（race-guard，防父账号在列表加载后撤权）
const handleAgentCardClick = async (card: AgentCard) => {
  if (launchingWorkflowKey.value) {
    return
  }
  launchingWorkflowKey.value = card.key

  try {
    if (card.type === 'sales') {
      if (!hasSalesPermission.value) {
        permissionMessage.value = '未开通销售智能体权限，请联系管理员'
        showPermissionModal.value = true
        return
      }
      await router.push('/sales')
      return
    }

    // chatbot path
    if (!card.chatbot) {
      return
    }
    const hasPermission = await checkChatbotPermission(card.chatbot.id)
    if (!hasPermission) {
      permissionMessage.value = '未开通该智能体的运行权限，请联系管理员'
      showPermissionModal.value = true
      return
    }
    await router.push(`/chatbot/${card.chatbot.id}`)
  } finally {
    launchingWorkflowKey.value = null
  }
}

const handleAgentClick = (agentId: number) => {
  void router.push({
    name: 'agent-chat',
    params: { sessionId: 'new' },
    query: { agent_id: String(agentId) }
  })
}

const fetchChatbots = async () => {
  chatbotsLoading.value = true
  try {
    const res = await listVisibleChatbots()
    // No sort here — agentCards computed does the unified sort (sales + chatbots
    // together by hasPermission desc), so sales-agent can interleave correctly.
    chatbots.value = ((res as any)?.data as ChatbotConfig[]) ?? []
  } catch (error) {
    console.error('获取智能体列表失败:', error)
    chatbots.value = []
  } finally {
    chatbotsLoading.value = false
  }
}

const fetchSalesPermission = async () => {
  salesLoading.value = true
  try {
    hasSalesPermission.value = await checkSalesPermission()
  } finally {
    salesLoading.value = false
  }
}

const fetchAvailableAgents = async () => {
  agentsLoading.value = true
  try {
    await agentChatStore.fetchAvailableAgents()
  } catch (error) {
    console.error('获取可用助手失败:', error)
  } finally {
    agentsLoading.value = false
  }
}

onMounted(() => {
  // 四个请求并行, 各自维护自己的 loading flag.
  // pageLoading (computed) 等全部完成才退出, 防止 empty state flicker.
  void fetchTemplates()
  void fetchChatbots()
  void fetchSalesPermission()
  void fetchAvailableAgents()
})
</script>

<style scoped>
/* ===== Hero Section ===== */
.hero-section {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  max-width: 1200px;
  margin: 0 auto 48px;
  padding: 20px 0 0;
}

.hero-content {
  flex: 1;
}

.hero-title {
  font-family: var(--font-sans);
  font-size: 36px;
  font-weight: 700;
  color: #1a1d26;
  line-height: 1.3;
  letter-spacing: -0.02em;
  margin: 0;
}

.hero-title-sub {
  color: hsl(160, 55%, 44%);
  font-weight: 500;
}

/* ===== Section ===== */
.workspace-section {
  max-width: 1200px;
  margin: 0 auto 40px;
}

.section-label {
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  color: #8b90a0;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 16px;
  padding-left: 4px;
}

/* ===== Feature Cards (已上线) ===== */
.feature-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.feature-card {
  appearance: none;
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  text-align: left;
  padding: 20px 20px 20px 22px;
  min-height: 0;
  gap: 16px;
  background: #ffffff;
  /* Default: green border to match hover color, signalling "runnable".
     Denied cards override back to neutral gray below. */
  border: 1px solid hsl(158, 50%, 78%);
  border-radius: 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  font-family: var(--font-sans);
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  text-decoration: none;
}

.feature-card:hover {
  transform: translateY(-3px);
  background: #ffffff;
  box-shadow:
    0 8px 28px rgba(0, 0, 0, 0.08),
    0 0 0 1px hsl(158 40% 80% / 0.5);
  border-color: hsl(158, 50%, 78%);
}

.feature-card.loading {
  opacity: 0.7;
  pointer-events: none;
}

/* Denied cards render with normal colors + lock badge top-right.
   Only signal is the lock icon; cursor hints the click will be blocked.
   Border reverts to neutral gray to further distinguish from runnable cards.
   No opacity/grayscale — per 2026-04-21 homeview-locked-cards D5. */
.feature-card.no-permission {
  border-color: #e8e9ee;
  cursor: not-allowed;
}

.feature-card.no-permission:hover {
  transform: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

/* Card layout */
.card-left {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.card-right {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

/* Card icon */
.feature-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(160, 50%, 62%);
}

.feature-card-icon svg {
  width: 28px;
  height: 28px;
}

.agent-emoji {
  font-size: 26px;
  line-height: 1;
}

.feature-card-label {
  font-size: 11px;
  font-weight: 500;
  color: hsl(160, 45%, 58%);
  white-space: nowrap;
}

/* Lock badge */
.lock-badge {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 16px;
  height: 16px;
  color: #8b90a0;
  opacity: 0.7;
}

.feature-card-title {
  font-size: 17px;
  font-weight: 650;
  color: #1e2130;
  margin-bottom: 8px;
  line-height: 1.3;
}

.feature-card-desc {
  font-size: 13.5px;
  color: #6b7085;
  line-height: 1.55;
  flex: 1;
}

/* ===== Empty Workspace =====
   触发条件: SOP + agent 两个 section 都 0 条 (新租户尚未开通任何工具).
   设计目标: 替代孤立的"section 标签 + 空白"格局, 给一个明确的"下一步".
   - 衬线 heading 承袭品牌「刊物气质 + 工业可靠」, 与 hero title 同字体
   - 翠绿胶囊 hint 不做成 button (offline 动作: 联系客户经理), 但保留视觉权重
   - SVG 用三档渐变的小圆点暗示"开通后会依次到来"的节奏感, 非装饰性 illustration */
/* 垂直居中: 占满 hero 以下的剩余视口 (主面板 padding 72px + hero ~160px ≈ 232px),
   留 24px 余量 → 256px. 用 100dvh 兼容移动端浏览器 chrome 收缩. */
.empty-workspace {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 32px;
  min-height: calc(100dvh - 256px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  animation: empty-enter 0.45s cubic-bezier(0.2, 0, 0, 1);
}

@keyframes empty-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.empty-workspace__art {
  width: 96px;
  height: 96px;
  margin-bottom: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-workspace__art svg {
  width: 100%;
  height: 100%;
}

.empty-workspace__title {
  font-family: var(--font-sans);
  font-size: 24px;
  font-weight: 650;
  color: #1e2130;
  margin: 0 0 14px;
  letter-spacing: -0.01em;
  line-height: 1.35;
}

.empty-workspace__desc {
  font-family: var(--font-sans);
  font-size: 14.5px;
  line-height: 1.75;
  color: #6b7085;
  margin: 0 0 24px;
  max-width: 420px;
}

.empty-workspace__hint {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: hsl(160, 38%, 32%);
  padding: 10px 18px;
  background: hsl(160, 50%, 96%);
  border: 1px solid hsl(160, 40%, 88%);
  border-radius: 999px;
  letter-spacing: 0.01em;
}

.empty-workspace__hint svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: hsl(160, 75%, 42%);
}

/* ===== Loading ===== */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 120px 20px;
  color: var(--text-secondary);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #eeeff3;
  border-top-color: hsl(160, 75%, 42%);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 14px;
  color: var(--text-secondary);
}

/* ===== Permission Modal ===== */
.permission-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.permission-dialog {
  background: #ffffff;
  border: 1px solid #e8e9ee;
  border-radius: 20px;
  padding: 36px;
  width: 90%;
  max-width: 380px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.12);
  animation: dialog-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

@keyframes dialog-pop {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.permission-icon {
  width: 48px;
  height: 48px;
  color: hsl(160, 75%, 42%);
  margin-bottom: 16px;
}

.permission-title {
  font-size: 18px;
  font-weight: 700;
  color: #1e2130;
  margin-bottom: 8px;
}

.permission-desc {
  font-size: 14px;
  color: #6b7085;
  line-height: 1.5;
  margin-bottom: 24px;
}

.permission-btn {
  padding: 10px 36px;
  border-radius: 12px;
  border: none;
  background: hsl(160, 75%, 42%);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.2, 0, 0, 1);
  box-shadow: 0 2px 10px hsl(160 75% 42% / 0.25);
}

.permission-btn:hover {
  background: hsl(160, 75%, 36%);
  box-shadow: 0 4px 16px hsl(160 75% 42% / 0.35);
  transform: translateY(-1px);
}

/* ===== Responsive ===== */
@media (max-width: 1100px) {
  .feature-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .hero-section {
    /* 保持横向：标题在左、铃铛在右上同行（移动端也不单独占行） */
    flex-direction: row;
    align-items: flex-start;
    margin-bottom: 24px;
    padding: 12px 0 0;
  }

  .hero-title {
    font-size: 24px;
  }

  .workspace-section {
    margin-bottom: 28px;
  }

  .feature-cards {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .feature-card {
    padding: 16px;
    border-radius: 16px;
  }

  .feature-card-title {
    font-size: 15px;
  }

  .feature-card-desc {
    font-size: 13px;
  }

  .empty-workspace {
    /* 移动端 hero 更紧凑 (~100px) + main-panel padding 不同, 留稍少的余量. */
    padding: 0 20px;
    min-height: calc(100dvh - 200px);
  }

  .empty-workspace__art {
    width: 80px;
    height: 80px;
    margin-bottom: 20px;
  }

  .empty-workspace__title {
    font-size: 22px;
  }

  .empty-workspace__desc {
    font-size: 13.5px;
  }
}
</style>
