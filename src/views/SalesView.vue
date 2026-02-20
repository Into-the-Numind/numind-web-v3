<template>
  <MainLayout>
    <div class="sales-page">
      <section class="sales-main">
        <header class="sales-header">
          <div>
            <h1>销售智能体</h1>
            <p>围绕客户信息和销售阶段，生成更有针对性的跟进话术。</p>
          </div>

          <div class="header-actions">
            <button type="button" class="btn-ghost" @click="goWorkspace">返回工作区</button>
            <button type="button" class="btn-primary" @click="startNewSession">新建对话</button>
          </div>
        </header>

        <div class="session-strip">
          <button
            type="button"
            class="session-item"
            :class="{ active: currentSessionId === null }"
            @click="startNewSession"
          >
            当前草稿
          </button>
          <button
            v-for="session in sessions"
            :key="session.id"
            type="button"
            class="session-item"
            :class="{ active: currentSessionId === session.id }"
            @click="selectSession(session.id)"
          >
            {{ session.title }}
          </button>
        </div>

        <div class="chat-panel">
          <div v-if="loadingMessages" class="chat-placeholder">正在加载历史消息...</div>
          <div v-else-if="!messages.length" class="chat-placeholder">
            <strong>开始第一条消息</strong>
            <span>你可以直接提问，或使用下方快捷提问。</span>
          </div>

          <div v-else ref="messageListRef" class="message-list">
            <ChatMessage v-for="message in messages" :key="message.id" :message="message" />
          </div>
        </div>

        <QuickReply :items="quickReplies" :disabled="sending" @select="handleQuickReply" />

        <form class="composer" @submit.prevent="sendMessage">
          <div class="composer-tip">
            对话上下文: <span>{{ currentSessionTitle }}</span>
            <template v-if="selectedTemplateName">
              ｜ 参考模板: <span>{{ selectedTemplateName }}</span>
            </template>
          </div>

          <textarea
            v-model="draft"
            class="composer-input"
            placeholder="输入客户问题，回车发送，Shift+回车换行"
            rows="3"
            :disabled="sending"
            @keydown="handleInputKeydown"
          />

          <div class="composer-footer">
            <p v-if="errorText" class="error-text">{{ errorText }}</p>
            <button type="submit" class="btn-send" :disabled="sending || !canSend">
              {{ sending ? '发送中...' : '发送' }}
            </button>
          </div>
        </form>
      </section>

      <aside class="sales-side">
        <CustomerInfo v-model="customerProfile" :stage-options="stageOptions" />
        <SOPSelector
          v-model:selected-id="selectedTemplateId"
          :options="sopTemplates"
          :loading="loadingTemplates"
          @refresh="loadSopTemplates"
        />
      </aside>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import MainLayout from '@/components/layout/MainLayout.vue'
import ChatMessage from '@/components/sales/ChatMessage.vue'
import CustomerInfo, { type CustomerProfileForm } from '@/components/sales/CustomerInfo.vue'
import QuickReply from '@/components/sales/QuickReply.vue'
import SOPSelector from '@/components/sales/SOPSelector.vue'
import {
  createSalesSession,
  fetchSalesMessages,
  fetchSalesSessions,
  fetchSalesSopTemplates,
  sendSalesMessageStream,
  type SalesMessage,
  type SalesSession,
  type SalesSopTemplate
} from '@/api/sales'

const router = useRouter()

const sessions = ref<SalesSession[]>([])
const currentSessionId = ref<number | null>(null)
const messages = ref<SalesMessage[]>([])
const draft = ref('')

const loadingMessages = ref(false)
const loadingTemplates = ref(false)
const sending = ref(false)
const errorText = ref('')

const messageListRef = ref<HTMLElement | null>(null)
const sopTemplates = ref<SalesSopTemplate[]>([])
const selectedTemplateId = ref<number | null>(null)

const customerProfile = ref<CustomerProfileForm>({
  name: '',
  company: '',
  stage: '',
  notes: ''
})

const stageOptions = [
  { label: '线索初联', value: 'initial-contact' },
  { label: '需求确认', value: 'need-clarify' },
  { label: '方案讲解', value: 'solution-pitch' },
  { label: '异议处理', value: 'objection-handle' },
  { label: '成交推进', value: 'closing' }
]

const quickReplies = [
  '客户说价格偏高，怎么回复更容易推进成交？',
  '客户迟迟不回消息，帮我写一段跟进话术。',
  '请给我一段首轮破冰开场白。',
  '客户对比竞品时，我应该怎么强调优势？'
]

const currentSessionTitle = computed(() => {
  if (currentSessionId.value === null) return '当前草稿'
  const session = sessions.value.find((item) => item.id === currentSessionId.value)
  return session?.title || `会话 #${currentSessionId.value}`
})

const selectedTemplateName = computed(() => {
  if (!selectedTemplateId.value) return ''
  const template = sopTemplates.value.find((item) => item.id === selectedTemplateId.value)
  return template?.name || ''
})

const canSend = computed(() => draft.value.trim().length > 0)

const goWorkspace = async () => {
  await router.push('/')
}

const parseError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return '请求失败，请稍后重试'
}

const loadSessions = async () => {
  const loaded = await fetchSalesSessions()
  loaded.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  sessions.value = loaded

  if (currentSessionId.value !== null) {
    const exists = loaded.some((item) => item.id === currentSessionId.value)
    if (!exists) {
      currentSessionId.value = null
      messages.value = []
    }
    return
  }

  if (loaded.length > 0) {
    currentSessionId.value = loaded[0].id
    await loadMessages(loaded[0].id)
  }
}

const loadSopTemplates = async () => {
  loadingTemplates.value = true
  try {
    const loaded = await fetchSalesSopTemplates()
    sopTemplates.value = loaded
    if (!selectedTemplateId.value && loaded.length > 0) {
      selectedTemplateId.value = loaded[0].id
    }
  } catch (error) {
    errorText.value = `模板加载失败：${parseError(error)}`
  } finally {
    loadingTemplates.value = false
  }
}

const loadMessages = async (sessionId: number) => {
  loadingMessages.value = true
  errorText.value = ''
  try {
    const loaded = await fetchSalesMessages(sessionId)
    messages.value = loaded
  } catch (error) {
    errorText.value = `消息加载失败：${parseError(error)}`
    messages.value = []
  } finally {
    loadingMessages.value = false
  }
}

const selectSession = async (sessionId: number) => {
  if (currentSessionId.value === sessionId) return
  currentSessionId.value = sessionId
  await loadMessages(sessionId)
}

const startNewSession = () => {
  currentSessionId.value = null
  messages.value = []
  errorText.value = ''
}

const createLocalMessage = (role: SalesMessage['role'], content: string): SalesMessage => {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    role,
    content,
    createdAt: new Date().toISOString()
  }
}

const ensureSession = async (question: string): Promise<number> => {
  if (currentSessionId.value) {
    return currentSessionId.value
  }

  const profileTitleSeed = customerProfile.value.name || customerProfile.value.company
  const title = (question.trim() || profileTitleSeed || '新对话').slice(0, 40)

  const created = await createSalesSession({
    title,
    salesStage: customerProfile.value.stage,
    customerProfile: customerProfile.value.notes
  })

  if (!created) {
    throw new Error('会话创建失败')
  }

  currentSessionId.value = created.id
  sessions.value = [created, ...sessions.value.filter((item) => item.id !== created.id)]
  return created.id
}

const buildFallbackReply = (question: string): string => {
  const stageLabel =
    stageOptions.find((item) => item.value === customerProfile.value.stage)?.label || '当前阶段未设置'
  const customerName = customerProfile.value.name || '客户'
  return [
    `已收到问题：「${question}」`,
    `建议先围绕「${customerName}」在「${stageLabel}」阶段的核心顾虑给出回应。`,
    '当前已返回本地兜底结果，后续会继续补齐流式回复与实时状态。'
  ].join('\n')
}

const sendMessage = async () => {
  const question = draft.value.trim()
  if (!question || sending.value) return

  sending.value = true
  errorText.value = ''

  try {
    const sessionId = await ensureSession(question)
    messages.value.push(createLocalMessage('user', question))
    draft.value = ''

    const assistantMessage = createLocalMessage('assistant', '')
    messages.value.push(assistantMessage)

    let hasToken = false
    let streamErrorText = ''

    try {
      await sendSalesMessageStream(
        sessionId,
        {
          query: question,
          sales_stage: customerProfile.value.stage,
          deep_thinking: false,
          chat_mode: 'sales'
        },
        (event) => {
          if (event.type === 'token' && typeof event.data === 'string') {
            hasToken = true
            assistantMessage.content += event.data
            return
          }
          if (event.type === 'error' && typeof event.data === 'string') {
            streamErrorText = event.data
          }
        }
      )
    } catch (error) {
      streamErrorText = parseError(error)
      errorText.value = `API 回复异常：${streamErrorText}`
    }

    if (!hasToken || !assistantMessage.content.trim()) {
      assistantMessage.content = buildFallbackReply(question)
    }

    if (streamErrorText) {
      assistantMessage.content += `\n\n[接口异常] ${streamErrorText}`
    }

    void loadSessions()
  } catch (error) {
    errorText.value = parseError(error)
    messages.value.push(createLocalMessage('system', `发送失败：${parseError(error)}`))
  } finally {
    sending.value = false
  }
}

const handleQuickReply = async (text: string) => {
  draft.value = text
  await sendMessage()
}

const handleInputKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void sendMessage()
  }
}

watch(
  () => messages.value.length,
  async () => {
    await nextTick()
    const el = messageListRef.value
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }
)

onMounted(async () => {
  try {
    await Promise.all([loadSopTemplates(), loadSessions()])
  } catch (error) {
    errorText.value = parseError(error)
  }
})
</script>

<style scoped>
.sales-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 18px;
  max-width: 1600px;
  margin: 0 auto;
}

.sales-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sales-header {
  border-radius: var(--radius-xl);
  border: 1px solid hsl(158 50% 86%);
  background: radial-gradient(circle at top right, hsl(158 64% 92%) 0%, #fff 55%);
  padding: 18px 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.sales-header h1 {
  font-size: 24px;
  color: var(--text);
  letter-spacing: -0.02em;
}

.sales-header p {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 14px;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.btn-ghost,
.btn-primary,
.btn-send {
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  padding: 8px 14px;
  border: 1px solid transparent;
}

.btn-ghost {
  border-color: var(--border);
  background: #fff;
  color: var(--text-secondary);
}

.btn-primary,
.btn-send {
  background: linear-gradient(135deg, hsl(158 64% 45%), hsl(158 58% 38%));
  color: #fff;
}

.btn-send:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.session-strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 2px;
}

.session-item {
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.session-item.active {
  border-color: var(--accent);
  color: var(--accent-hover);
  background: var(--accent-soft);
}

.chat-panel {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, #fff 0%, hsl(150 30% 98%) 100%);
  min-height: 420px;
  max-height: 520px;
}

.chat-placeholder {
  height: 100%;
  min-height: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 14px;
}

.chat-placeholder strong {
  color: var(--text-secondary);
}

.message-list {
  height: 100%;
  max-height: 520px;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.composer {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--surface);
  padding: 14px;
}

.composer-tip {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.composer-tip span {
  color: var(--text-secondary);
  font-weight: 700;
}

.composer-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  resize: vertical;
  min-height: 78px;
  line-height: 1.55;
}

.composer-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px hsl(158 64% 90% / 0.55);
}

.composer-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  gap: 12px;
}

.error-text {
  font-size: 12px;
  color: hsl(0 72% 50%);
}

.sales-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (max-width: 1280px) {
  .sales-page {
    grid-template-columns: 1fr;
  }
}
</style>
