<script setup lang="ts">
import { onMounted, onUnmounted, computed, watch, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Plus, MoreVertical, Pin, PinOff, Edit3, Trash2, Square } from 'lucide-vue-next'
import { useAgentChatStore } from '@/stores/agentChat'
import { useCreditsStore } from '@/stores/credits'
import { useNotificationsStore } from '@/stores/notifications'
import { useAgentNarration } from '@/composables/useAgentNarration'
import { useAgentRun } from '@/composables/useAgentRun'
import { useAgentStream } from '@/composables/useAgentStream'
import { useAgentCost } from '@/composables/useAgentCost'
import * as api from '@/api/agent'
import { handleSessionIdTransition } from './session-watchers'
import AppButton from '@/components/common/AppButton.vue'
import AgentChatHeader from '@/components/agent/AgentChatHeader.vue'
import AgentFirstRun from '@/components/agent/AgentFirstRun.vue'
import AgentMessageList from '@/components/agent/AgentMessageList.vue'
import AgentInputArea from '@/components/agent/AgentInputArea.vue'
import AgentBudgetExceededModal from '@/components/agent/AgentBudgetExceededModal.vue'
import AgentLowBalanceModal from '@/components/agent/AgentLowBalanceModal.vue'
import type { SupportContact } from '@/types/agent'

interface Props {
  sessionId: string
  agentId: number | null
  readOnly: boolean
}

const props = defineProps<Props>()

const router = useRouter()
const store = useAgentChatStore()
const creditsStore = useCreditsStore()
const notifications = useNotificationsStore()
const narration = useAgentNarration()
const runCtrl = useAgentRun()
const { start: startStream, stop: stopStream, isStreaming } = useAgentStream()
const cost = useAgentCost()

const supportContact = ref<SupportContact>({})
const showLowBalance = ref(false)
const sidebarOpen = ref(false)

const isNewSession = computed(() => props.sessionId === 'new')
const isLoadingSnapshot = computed(() => store.loadingSnapshot)
const hasSnapshotError = computed(() => store.sessionError !== null)
const showFirstRun = computed(
  () => isNewSession.value && store.messages.length === 0 && !!store.currentAgent
)

// Sum cycle + booster + trial pools via the store's totalRemain getter.
const currentBalance = computed(() => creditsStore.totalRemain)
const isMember = computed(
  () => creditsStore.displayState === 'trial' || creditsStore.displayState === 'pro'
)

const filteredSessions = computed(() => {
  if (!props.agentId) return store.recentSessions
  return store.recentSessions.filter((s) => s.agent_skill_id === props.agentId)
})

const handleSend = async (text: string): Promise<void> => {
  if (!store.currentAgent) return
  if (currentBalance.value < 50) {
    showLowBalance.value = true
    return
  }
  try {
    await startStream({
      agent_skill_id: store.currentAgent.id,
      input_text: text,
      session_id: props.sessionId !== 'new' ? props.sessionId : undefined,
      attachment_urls: store.attachments.map((a) => a.url)
    })
  } catch (err) {
    const msg = (err as Error)?.message ?? '发送失败,请稍后重试'
    notifications.error(`发送失败：${msg}`)
  }
}

const handleSelectStarter = (text: string): void => {
  store.inputText = text
  void handleSend(text)
}

const handleCancel = async (): Promise<void> => {
  if (!store.currentRun) return
  const used = store.currentRun.credits_used ?? 0
  await runCtrl.cancel()
  narration.stop()
  runCtrl.stopStatusPolling()
  notifications.info(`已取消任务 · 本次消耗 ${used} 积分`)
}

const handleAnswerSubmitted = (runId: number): void => {
  // The run paused for ask_user_question and the SSE stream already ended at the
  // waiting terminal. The backend re-runs the agent (non-stream) on /answer,
  // writing narration + final to the DB — so resume by polling rather than
  // reopening the stream. Optimistically flip the card to "已回答" for instant
  // feedback (the polling run_resumed handler sets the same flag idempotently).
  store.markQuestionAnswered(runId)
  narration.start()
  runCtrl.startStatusPolling()
}

const handleEstimateRequest = async (text: string): Promise<void> => {
  if (!store.currentAgent) return
  await store.estimateInput(store.currentAgent.id, text)
}

const handleUpload = async (file: File): Promise<void> => {
  try {
    await store.uploadAttachment(file)
  } catch (err) {
    notifications.error(`上传失败：${(err as Error).message}`)
  }
}

const handleReject = (reason: string): void => {
  notifications.info(reason)
}

const handleBudgetContinue = async (extra: number): Promise<void> => {
  await store.extendCurrentBudget(extra)
  narration.start()
}

const handleBudgetStop = async (): Promise<void> => {
  await handleCancel()
}

const handleBudgetLowBalance = (): void => {
  showLowBalance.value = true
}

const handlePurchase = (): void => {
  router.push({ name: 'credits' })
}

const handleTryDemoTask = async (text: string): Promise<void> => {
  showLowBalance.value = false
  await handleSend(text)
}

const handleCloseLowBalance = (): void => {
  showLowBalance.value = false
}

const loadCurrentAgent = async (): Promise<void> => {
  if (!props.agentId) return
  if (store.availableAgents.length === 0) {
    await store.fetchAvailableAgents()
  }
  const agent = store.availableAgents.find((a) => a.id === props.agentId)
  if (agent) store.currentAgent = agent
}

const createNewSession = (): void => {
  sidebarOpen.value = false
  if (props.sessionId === 'new') return
  router.push({
    name: 'agent-chat',
    params: { sessionId: 'new' },
    query: { agent_id: props.agentId }
  })
}

const switchToSession = async (session: (typeof store.recentSessions)[0]): Promise<void> => {
  sidebarOpen.value = false
  if (session.session_id === props.sessionId) return
  router.push({
    name: 'agent-chat',
    params: { sessionId: session.session_id },
    query: { agent_id: props.agentId }
  })
}

// ─── 会话管理对齐 Chatbot 交互 ───
const openMenuSessionId = ref<string | null>(null)
const renameModalOpen = ref(false)
const renameInputValue = ref('')
const renameTargetSession = ref<(typeof store.recentSessions)[0] | null>(null)
const deleteConfirmId = ref<string | null>(null)
const renameInputRef = ref<HTMLInputElement | null>(null)

const openMenu = (sessionId: string): void => {
  if (openMenuSessionId.value === sessionId) {
    openMenuSessionId.value = null
  } else {
    openMenuSessionId.value = sessionId
  }
}

const onTogglePinClick = async (
  session: (typeof store.recentSessions)[0],
  event?: Event
): Promise<void> => {
  if (event) event.stopPropagation()
  openMenuSessionId.value = null
  const nextPinned = !session.is_pinned
  try {
    await store.pinSession(session.session_id, nextPinned)
    notifications.success(nextPinned ? '会话已置顶' : '已取消置顶')
  } catch (err) {
    notifications.error(`操作失败：${(err as Error).message}`)
  }
}

const onRenameClick = (session: (typeof store.recentSessions)[0], event?: Event): void => {
  if (event) event.stopPropagation()
  openMenuSessionId.value = null
  renameTargetSession.value = session
  renameInputValue.value = session.session_name || session.preview_text || '新对话'
  renameModalOpen.value = true
  setTimeout(() => {
    if (renameInputRef.value) {
      renameInputRef.value.focus()
      renameInputRef.value.select()
    }
  }, 50)
}

const closeRenameModal = (): void => {
  renameModalOpen.value = false
  renameTargetSession.value = null
  renameInputValue.value = ''
}

const confirmRename = async (): Promise<void> => {
  if (!renameTargetSession.value) return
  const trimmed = renameInputValue.value.trim()
  if (!trimmed) {
    notifications.warning('标题不能为空')
    return
  }
  try {
    await store.renameSession(renameTargetSession.value.session_id, trimmed)
    notifications.success('重命名成功')
    closeRenameModal()
  } catch (err) {
    notifications.error(`重命名失败：${(err as Error).message}`)
  }
}

const onDeleteClick = (sessionId: string, event?: Event): void => {
  if (event) event.stopPropagation()
  openMenuSessionId.value = null
  deleteConfirmId.value = sessionId
}

const cancelDelete = (event?: Event): void => {
  if (event) event.stopPropagation()
  deleteConfirmId.value = null
}

const doDelete = async (sessionId: string, event?: Event): Promise<void> => {
  if (event) event.stopPropagation()
  try {
    await store.deleteSession(sessionId)
    notifications.success('会话已删除')

    // 如果删除的是当前会话，需要平滑切换
    if (sessionId === props.sessionId) {
      const remaining = filteredSessions.value
      if (remaining.length > 0) {
        await switchToSession(remaining[0])
      } else {
        createNewSession()
      }
    }
  } catch (err) {
    notifications.error(`删除失败：${(err as Error).message}`)
  } finally {
    deleteConfirmId.value = null
  }
}

const closeAllMenus = (): void => {
  openMenuSessionId.value = null
}

onMounted(async () => {
  document.body.classList.add('agent-chat-route')
  await Promise.all([
    creditsStore.fetchBalance(),
    loadCurrentAgent(),
    store.fetchRecentSessions(),
    api.getSupportContact().then((c) => {
      supportContact.value = c
    })
  ])

  if (isNewSession.value) {
    const storedRunId = sessionStorage.getItem('agentChat:currentRunId')
    if (storedRunId) {
      const runId = Number(storedRunId)
      try {
        const run = await api.getRun(runId)
        if (run.status === 'running' || run.status === 'pending') {
          store.currentRun = run
          narration.start()
          runCtrl.startStatusPolling()
        }
      } catch {
        sessionStorage.removeItem('agentChat:currentRunId')
        sessionStorage.removeItem('agentChat:currentSessionId')
      }
    }
  } else {
    if (props.sessionId) {
      await store.loadSessionSnapshot(props.sessionId, props.readOnly)
    }
  }

  cost.watchThresholds()
  window.addEventListener('click', closeAllMenus)
})

watch(
  () => props.sessionId,
  async (newSessionId, oldSessionId) => {
    await handleSessionIdTransition(newSessionId, oldSessionId, {
      loadSnapshot: (id, ro) => store.loadSessionSnapshot(id, ro),
      resetLocal: () => {
        store.messages = []
        store.currentRun = null
        store.narrationEvents = []
        store.lastNarrationTs = ''
        store.stuckSince = null
        store.attachments = []
        store.inputText = ''
        store.estimate = null
        store.isReadOnly = false
        sessionStorage.removeItem('agentChat:currentRunId')
        sessionStorage.removeItem('agentChat:currentSessionId')
      },
      readOnly: props.readOnly,
      isStreaming: isStreaming.value,
      isRunning: store.isRunning
    })
  }
)

watch(
  () => store.currentRun?.session_id,
  (newSessionId) => {
    if (newSessionId && props.sessionId === 'new') {
      router.replace({
        name: 'agent-chat',
        params: { sessionId: newSessionId },
        query: { agent_id: props.agentId }
      })
      void store.fetchRecentSessions()
    }
  }
)

watch(
  () => cost.budgetExceeded.value,
  (exceeded) => {
    if (exceeded) {
      narration.stop()
    }
  }
)

onUnmounted(() => {
  document.body.classList.remove('agent-chat-route')
  narration.stop()
  stopStream()
  runCtrl.stopStatusPolling()
  store.reset()
  window.removeEventListener('click', closeAllMenus)
})

const goBackToHome = (): void => {
  router.push({ name: 'home' })
}

const handleRetrySnapshot = async (): Promise<void> => {
  if (props.sessionId) {
    await store.loadSessionSnapshot(props.sessionId, props.readOnly)
  }
}
</script>

<template>
  <div class="agent-view">
    <!-- 加载快照中 -->
    <div v-if="isLoadingSnapshot" class="page-loading">
      <div class="loading-spinner" />
      <div class="loading-text">加载中...</div>
    </div>

    <!-- 快照加载失败 -->
    <div v-else-if="hasSnapshotError" class="state-error">
      <div class="error-icon">😢</div>
      <h2 class="error-title">会话加载失败</h2>
      <p class="error-msg">{{ store.sessionError }}</p>
      <div class="error-actions">
        <AppButton @click="handleRetrySnapshot">重试</AppButton>
        <AppButton variant="secondary" @click="goBackToHome">返回首页</AppButton>
      </div>
    </div>

    <!-- 正常 / First-run / 历史 / readOnly -->
    <div v-else class="app-container">
      <!-- Sidebar -->
      <aside class="sidebar" :class="{ 'mobile-open': sidebarOpen }">
        <!-- 返回首页 -->
        <button type="button" class="nav__back" @click="goBackToHome">
          <ArrowLeft :size="16" aria-hidden="true" />
          <span>返回首页</span>
        </button>

        <button class="new-chat-btn" @click="createNewSession">
          <Plus :size="18" />
          <span>新对话</span>
        </button>

        <div class="sessions-list">
          <div
            v-for="session in filteredSessions"
            :key="session.session_id"
            class="session-item"
            :class="{
              'session-item--active': session.session_id === props.sessionId,
              'session-item--pinned': session.is_pinned,
              active: session.session_id === props.sessionId
            }"
            @click="switchToSession(session)"
          >
            <span class="session-title">{{
              session.session_name || session.preview_text || '新对话'
            }}</span>
            <div class="session-menu-container">
              <button
                class="session-menu-btn"
                @click.stop="openMenu(session.session_id)"
                aria-label="更多操作"
              >
                <MoreVertical :size="16" />
              </button>

              <div
                class="session-menu-dropdown"
                :class="{ show: openMenuSessionId === session.session_id }"
                @click.stop
              >
                <button class="session-menu-item" @click.stop="onTogglePinClick(session, $event)">
                  <PinOff v-if="session.is_pinned" :size="14" />
                  <Pin v-else :size="14" />
                  <span>{{ session.is_pinned ? '取消置顶' : '置顶' }}</span>
                </button>
                <button class="session-menu-item" @click.stop="onRenameClick(session, $event)">
                  <Edit3 :size="14" />
                  <span>重命名</span>
                </button>
                <button
                  class="session-menu-item danger"
                  @click.stop="onDeleteClick(session.session_id, $event)"
                >
                  <Trash2 :size="14" />
                  <span>删除</span>
                </button>
              </div>
            </div>
          </div>
          <div v-if="filteredSessions.length === 0" class="sessions-empty">暂无对话</div>
        </div>
      </aside>

      <!-- Sidebar Overlay (Mobile) -->
      <div class="sidebar-overlay" :class="{ show: sidebarOpen }" @click="sidebarOpen = false" />

      <!-- Main Chat Area -->
      <main class="main-stage">
        <!-- Header -->
        <AgentChatHeader
          :agent="store.currentAgent"
          :run="store.currentRun"
          :read-only="readOnly"
          :cancelling="store.cancelling"
          :cancel-always-enabled="narration.cancelAlwaysEnabled.value"
          :sidebar-open="sidebarOpen"
          @toggle-sidebar="sidebarOpen = !sidebarOpen"
          @cancel="handleCancel"
        />

        <div class="chat-wrapper">
          <AgentFirstRun
            v-if="showFirstRun"
            :agent="store.currentAgent!"
            @select-starter="handleSelectStarter"
          />

          <AgentMessageList
            v-else
            :messages="store.messages"
            :read-only="readOnly"
            @answer-submitted="handleAnswerSubmitted"
          />
        </div>

        <div v-if="!readOnly && store.currentAgent" class="input-area-wrapper">
          <!-- Abort button — visible only while SSE stream is active -->
          <div v-if="isStreaming" class="abort-bar">
            <button class="abort-btn" type="button" aria-label="中止流式响应" @click="stopStream">
              <Square :size="14" aria-hidden="true" />
              <span>中止</span>
            </button>
          </div>

          <AgentInputArea
            :agent-id="store.currentAgent.id"
            :estimate="store.estimate"
            :attachments="store.attachments"
            :sending="store.sendingMessage"
            :disabled="isStreaming || store.isRunning || store.isWaitingForUser"
            @send="handleSend"
            @estimate-request="handleEstimateRequest"
            @upload="handleUpload"
            @remove-attachment="store.removeAttachment"
            @reject="handleReject"
          />
        </div>
      </main>
    </div>

    <!-- Budget exceeded modal -->
    <AgentBudgetExceededModal
      :open="cost.budgetExceeded.value"
      :used-credits="store.currentRun?.credits_used ?? 0"
      :current-balance="currentBalance"
      @continue="handleBudgetContinue"
      @stop="handleBudgetStop"
      @low-balance="handleBudgetLowBalance"
    />

    <!-- Low balance modal -->
    <AgentLowBalanceModal
      :open="showLowBalance"
      :balance="currentBalance"
      :is-member="isMember"
      :support-contact="supportContact"
      @purchase="handlePurchase"
      @try="handleTryDemoTask"
      @close="handleCloseLowBalance"
    />

    <!-- 重命名对话 Modal (复用 sales-modal.css 视觉) -->
    <Teleport to="body">
      <div class="modal-overlay" :class="{ open: renameModalOpen }">
        <div
          class="modal-card modal-card-simple"
          role="dialog"
          aria-modal="true"
          @keydown.escape="closeRenameModal"
        >
          <div class="modal-header">
            <span class="modal-title">重命名对话</span>
          </div>
          <div class="modal-body-simple">
            <input
              ref="renameInputRef"
              v-model="renameInputValue"
              type="text"
              maxlength="200"
              class="form-input"
              placeholder="对话名称"
              @keydown.enter="confirmRename"
            />
          </div>
          <div class="modal-footer">
            <button class="btn-secondary" @click="closeRenameModal">取消</button>
            <button class="btn-primary" @click="confirmRename"><span>保存</span></button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认 Modal -->
    <Teleport to="body">
      <div v-if="deleteConfirmId !== null" class="modal-overlay open" @click.self="cancelDelete">
        <div class="modal-dialog">
          <div class="modal-title">删除对话</div>
          <div class="modal-desc">确定删除这个对话吗？删除后无法恢复。</div>
          <div class="modal-actions">
            <button class="modal-btn secondary" @click="cancelDelete">取消</button>
            <button class="modal-btn danger" @click="doDelete(deleteConfirmId!)">删除</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<!-- Unscoped: route-level overrides -->
<style>
body.agent-chat-route {
  --sidebar-width: 260px;
  --text-light: var(--text-muted);
  --bg: #ffffff;

  margin: 0;
  padding: 0;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--text);
}

body.agent-chat-route #app {
  height: 100%;
}

/* ===== Delete Dialog Modal ===== */
body.agent-chat-route .modal-overlay .modal-dialog {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xl);
  padding: 36px;
  width: 90%;
  max-width: 380px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.12);
  animation: dialog-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
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

body.agent-chat-route .modal-overlay .modal-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 8px;
}

body.agent-chat-route .modal-overlay .modal-desc {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 24px;
}

body.agent-chat-route .modal-overlay .modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

body.agent-chat-route .modal-overlay .modal-btn {
  padding: 10px 24px;
  border-radius: 12px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

body.agent-chat-route .modal-overlay .modal-btn.secondary {
  background: var(--surface-hover);
  color: var(--text-secondary);
}

body.agent-chat-route .modal-overlay .modal-btn.secondary:hover {
  background: var(--border-light);
}

body.agent-chat-route .modal-overlay .modal-btn.danger {
  background: #ef4444;
  color: white;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
}

body.agent-chat-route .modal-overlay .modal-btn.danger:hover {
  background: #dc2626;
}
</style>

<style scoped>
@import '@/assets/styles/sales-modal.css';

.agent-view {
  width: 100%;
  height: 100%;
}

.app-container {
  display: flex;
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--bg);
}

/* ===== Page Loading ===== */
.page-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: var(--text-muted);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-light);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

.loading-text {
  font-size: 14px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ===== Back Button ===== */
.nav__back {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px;
  margin: 0 12px 8px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: hsl(160, 18%, 52%);
  font-size: 14px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
  transition:
    color 200ms ease,
    background 200ms ease;
}

.nav__back:hover {
  color: hsl(160, 40%, 36%);
  background: hsla(160, 45%, 50%, 0.1);
}

/* ===== Sidebar ===== */
.sidebar {
  width: var(--sidebar-width);
  height: 100%;
  background: hsla(160, 30%, 96%, 0.65);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border-right: 1px solid hsla(160, 20%, 88%, 0.5);
  display: flex;
  flex-direction: column;
  z-index: 10;
  padding-top: 16px;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.new-chat-btn {
  margin: 0 12px 12px;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  color: var(--primary);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: var(--shadow-sm);
  font-size: 0.9rem;
}

.new-chat-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px;
}

.sessions-empty {
  text-align: center;
  color: var(--text-light);
  font-size: 0.85rem;
  padding: 24px 0;
}

.session-item {
  position: relative;
  padding: 12px;
  margin-bottom: 4px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.session-item:hover {
  background: hsla(160, 45%, 50%, 0.1);
  color: var(--text);
}

.session-item.active {
  background: hsla(160, 50%, 50%, 0.14);
  color: var(--primary);
  font-weight: 600;
}

.session-title {
  font-size: 0.9rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

/* ===== Sidebar Overlay ===== */
.sidebar-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 5;
}

.sidebar-overlay.show {
  display: block;
  touch-action: none;
}

/* ===== Main Stage ===== */
.main-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.chat-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* ===== Responsive ===== */
@media (max-width: 768px) {
  .sidebar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    transform: translateX(-100%);
  }

  .sidebar.mobile-open {
    transform: translateX(0);
  }
}

.state-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
}

.error-icon {
  font-size: 56px;
  margin-bottom: 16px;
}

.error-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0 0 8px;
}

.error-msg {
  font-size: 14px;
  color: var(--color-text-muted, #6b7280);
  margin: 0 0 24px;
}

.error-actions {
  display: flex;
  gap: 8px;
}

/* ─── 会话管理样式对齐 Chatbot ─── */
.session-item:hover .session-menu-btn {
  opacity: 1;
}

.session-item--pinned {
  border-left: 2px solid var(--primary) !important;
  padding-left: 10px !important;
}

.session-menu-container {
  margin-left: auto;
  position: relative;
}

.session-menu-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  opacity: 0;
  padding: 4px;
  cursor: pointer;
  transition: all 0.2s;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.session-menu-btn :deep(svg) {
  width: 16px;
  height: 16px;
  stroke-width: 2;
}

.session-menu-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.session-menu-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  min-width: 140px;
  z-index: 100;
  overflow: hidden;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transform: translateY(-4px);
  transition:
    opacity 150ms ease,
    transform 150ms ease,
    visibility 150ms ease;
}

.session-menu-dropdown.show {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transform: translateY(0);
}

.session-menu-item {
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: all 0.15s;
  color: var(--text);
  font-size: 0.85rem;
  text-align: left;
}

.session-menu-item :deep(svg) {
  width: 14px;
  height: 14px;
  stroke-width: 2;
}

.session-menu-item:hover {
  background: rgba(0, 0, 0, 0.04);
}

.session-menu-item.danger {
  color: #ef4444;
}

.session-menu-item.danger:hover {
  background: rgba(239, 68, 68, 0.08);
}

/* ===== Abort / Stop Streaming ===== */
.input-area-wrapper {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.abort-bar {
  display: flex;
  justify-content: center;
  padding: 4px 32px 0;
}

.abort-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 16px;
  background: transparent;
  border: 1px solid var(--border-light, rgba(0, 0, 0, 0.12));
  border-radius: 20px;
  color: var(--text-muted);
  font-size: 13px;
  font-family: var(--font-sans);
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s,
    border-color 0.2s;
}

.abort-btn:hover {
  background: rgba(239, 68, 68, 0.06);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}
</style>
