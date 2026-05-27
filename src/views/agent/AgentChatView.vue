<script setup lang="ts">
import { onMounted, onUnmounted, computed, watch, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowLeft,
  Plus,
  MessageSquare,
  MoreVertical,
  Pin,
  Edit3,
  Trash2,
  Check,
  X
} from 'lucide-vue-next'
import { useAgentChatStore } from '@/stores/agentChat'
import { useCreditsStore } from '@/stores/credits'
import { useNotificationsStore } from '@/stores/notifications'
import { useAgentNarration } from '@/composables/useAgentNarration'
import { useAgentRun } from '@/composables/useAgentRun'
import { useAgentCost } from '@/composables/useAgentCost'
import * as api from '@/api/agent'
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
    await runCtrl.start(store.currentAgent.id, text, props.sessionId)
    narration.start()
    runCtrl.startStatusPolling()
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
    query: { agent_id: props.agentId, read_only: session.status === 'completed' ? '1' : undefined }
  })
}

// ─── 会话管理 (置顶、删除、重命名) ───
const activeMenuSessionId = ref<string | null>(null)
const editingSessionId = ref<string | null>(null)
const editingName = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)
const confirmDeleteSessionId = ref<string | null>(null)

const toggleMenu = (sessionId: string): void => {
  if (activeMenuSessionId.value === sessionId) {
    activeMenuSessionId.value = null
  } else {
    activeMenuSessionId.value = sessionId
  }
}

const handlePin = async (session: (typeof store.recentSessions)[0], event?: Event): Promise<void> => {
  if (event) event.stopPropagation()
  activeMenuSessionId.value = null
  const nextPinned = !session.is_pinned
  try {
    await store.pinSession(session.session_id, nextPinned)
    notifications.success(nextPinned ? '会话已置顶' : '已取消置顶')
  } catch (err) {
    notifications.error(`操作失败：${(err as Error).message}`)
  }
}

const startRename = (session: (typeof store.recentSessions)[0], event?: Event): void => {
  if (event) event.stopPropagation()
  activeMenuSessionId.value = null
  editingSessionId.value = session.session_id
  editingName.value = session.session_name || session.preview_text || '新对话'
  setTimeout(() => {
    if (renameInputRef.value) {
      renameInputRef.value.focus()
      renameInputRef.value.select()
    }
  }, 50)
}

const isSavingRename = ref(false)
const saveRename = async (session: (typeof store.recentSessions)[0]): Promise<void> => {
  if (isSavingRename.value) return
  const trimmed = editingName.value.trim()
  if (!trimmed) {
    editingSessionId.value = null
    return
  }
  if (trimmed === (session.session_name || session.preview_text || '新对话')) {
    editingSessionId.value = null
    return
  }
  isSavingRename.value = true
  try {
    await store.renameSession(session.session_id, trimmed)
    notifications.success('重命名成功')
  } catch (err) {
    notifications.error(`重命名失败：${(err as Error).message}`)
  } finally {
    editingSessionId.value = null
    isSavingRename.value = false
  }
}

const cancelRename = (): void => {
  editingSessionId.value = null
}

const triggerDelete = (session: (typeof store.recentSessions)[0], event?: Event): void => {
  if (event) event.stopPropagation()
  activeMenuSessionId.value = null
  confirmDeleteSessionId.value = session.session_id
}

const confirmDelete = async (session: (typeof store.recentSessions)[0], event?: Event): Promise<void> => {
  if (event) event.stopPropagation()
  try {
    await store.deleteSession(session.session_id)
    notifications.success('会话已删除')
    
    // 如果删除的是当前会话，需要平滑切换
    if (session.session_id === props.sessionId) {
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
    confirmDeleteSessionId.value = null
  }
}

const cancelDelete = (event?: Event): void => {
  if (event) event.stopPropagation()
  confirmDeleteSessionId.value = null
}

const closeAllMenus = (): void => {
  activeMenuSessionId.value = null
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
  async (newSessionId) => {
    if (newSessionId === 'new') {
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
    } else {
      await store.loadSessionSnapshot(newSessionId, props.readOnly)
    }
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
  runCtrl.stopStatusPolling()
  store.reset()
  window.removeEventListener('click', closeAllMenus)
})

const goBackToList = (): void => {
  router.push({ name: 'agent-select' })
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
        <AppButton variant="secondary" @click="goBackToList">返回 Agent 列表</AppButton>
      </div>
    </div>

    <!-- 正常 / First-run / 历史 / readOnly -->
    <div v-else class="app-container">
      <!-- Sidebar -->
      <aside class="sidebar" :class="{ 'mobile-open': sidebarOpen }">
        <!-- 返回列表 -->
        <button type="button" class="nav__back" @click="goBackToList">
          <ArrowLeft :size="16" aria-hidden="true" />
          <span>返回助手列表</span>
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
              active: session.session_id === props.sessionId,
              pinned: session.is_pinned
            }"
            @click="switchToSession(session)"
          >
            <!-- 逻辑删除中 -->
            <template v-if="confirmDeleteSessionId === session.session_id">
              <div class="delete-confirm-wrapper" @click.stop>
                <span class="delete-confirm-text">确定删除？</span>
                <button class="confirm-btn success-color" @click.stop="confirmDelete(session)" title="确认">
                  <Check :size="14" />
                </button>
                <button class="confirm-btn cancel-color" @click.stop="cancelDelete" title="取消">
                  <X :size="14" />
                </button>
              </div>
            </template>

            <!-- 重命名中 -->
            <template v-else-if="editingSessionId === session.session_id">
              <input
                ref="renameInputRef"
                v-model="editingName"
                class="rename-input"
                type="text"
                maxlength="50"
                @keydown.enter.stop="saveRename(session)"
                @keydown.esc.stop="cancelRename"
                @blur="saveRename(session)"
                @click.stop
              />
            </template>

            <!-- 正常状态 -->
            <template v-else>
              <MessageSquare class="session-icon" :size="16" />
              <span class="session-title" :title="session.session_name || session.preview_text || '新对话'">
                {{ session.session_name || session.preview_text || '新对话' }}
              </span>
              
              <!-- 置顶徽章 -->
              <Pin v-if="session.is_pinned" class="pinned-badge" :size="12" />

              <!-- 三点菜单触发按钮 -->
              <button
                type="button"
                class="action-trigger"
                :class="{ 'action-trigger--active': activeMenuSessionId === session.session_id }"
                @click.stop="toggleMenu(session.session_id)"
              >
                <MoreVertical :size="14" />
              </button>

              <!-- 气泡 Dropdown 菜单 -->
              <div
                v-if="activeMenuSessionId === session.session_id"
                class="session-menu-dropdown"
                @click.stop
              >
                <button class="menu-item" @click="handlePin(session, $event)">
                  <Pin :size="14" :class="{ 'pinned-active': session.is_pinned }" />
                  <span>{{ session.is_pinned ? '取消置顶' : '置顶会话' }}</span>
                </button>
                <button class="menu-item" @click="startRename(session, $event)">
                  <Edit3 :size="14" />
                  <span>重命名</span>
                </button>
                <div class="menu-divider" />
                <button class="menu-item menu-item--danger" @click="triggerDelete(session, $event)">
                  <Trash2 :size="14" />
                  <span>删除会话</span>
                </button>
              </div>
            </template>
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
          :balance="currentBalance"
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

          <AgentMessageList v-else :messages="store.messages" :read-only="readOnly" />
        </div>

        <AgentInputArea
          v-if="!readOnly && store.currentAgent"
          :agent-id="store.currentAgent.id"
          :estimate="store.estimate"
          :attachments="store.attachments"
          :sending="store.sendingMessage"
          :disabled="store.isRunning || store.isWaitingForUser"
          @send="handleSend"
          @estimate-request="handleEstimateRequest"
          @upload="handleUpload"
          @remove-attachment="store.removeAttachment"
          @reject="handleReject"
        />
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
</style>

<style scoped>
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

/* ─── 会话管理样式 ─── */
/* 置顶会话左侧翡翠绿竖条指示 */
.session-item.pinned::before {
  content: '';
  position: absolute;
  left: 0;
  top: 15%;
  height: 70%;
  width: 3.5px;
  background: hsl(160, 50%, 45%);
  border-radius: 0 3px 3px 0;
}

.pinned-badge {
  color: hsl(160, 45%, 45%);
  margin-left: 6px;
  transform: rotate(45deg);
  opacity: 0.8;
  flex-shrink: 0;
}

.pinned-active {
  color: hsl(160, 50%, 45%);
}

/* 三点操作菜单触发器 */
.action-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-light);
  cursor: pointer;
  opacity: 0;
  transition: all 0.2s ease;
  flex-shrink: 0;
  margin-left: 4px;
}

.session-item:hover .action-trigger {
  opacity: 1;
}

.action-trigger:hover,
.action-trigger--active {
  background: hsla(160, 45%, 50%, 0.12);
  color: hsla(160, 45%, 35%, 1);
  opacity: 1 !important;
}

/* 玻璃气泡下拉菜单 */
.session-menu-dropdown {
  position: absolute;
  right: 12px;
  top: 36px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid hsla(160, 20%, 88%, 0.95);
  border-radius: 8px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.08);
  z-index: 50;
  display: flex;
  flex-direction: column;
  padding: 4px;
  min-width: 120px;
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.85rem;
  font-family: var(--font-sans);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
  width: 100%;
}

.menu-item:hover {
  background: hsla(160, 45%, 50%, 0.08);
  color: hsla(160, 45%, 35%, 1);
}

.menu-item--danger {
  color: #ef4444;
}

.menu-item--danger:hover {
  background: rgba(239, 68, 68, 0.08);
  color: #dc2626;
}

.menu-divider {
  height: 1px;
  background: hsla(160, 20%, 88%, 0.6);
  margin: 4px 0;
}

/* 内联重命名输入框 */
.rename-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 6px;
  border: 1.5px solid hsl(160, 50%, 45%);
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.95);
  color: var(--text);
  font-size: 0.85rem;
  outline: none;
  font-family: var(--font-sans);
}

/* 内联二次删除确认 */
.delete-confirm-wrapper {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding-right: 4px;
}

.delete-confirm-text {
  font-size: 0.8rem;
  color: #ef4444;
  font-weight: 600;
  white-space: nowrap;
  margin-right: auto;
}

.confirm-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  background: transparent;
}

.confirm-btn.success-color {
  color: hsl(160, 50%, 40%);
}

.confirm-btn.success-color:hover {
  background: hsla(160, 50%, 40%, 0.12);
}

.confirm-btn.cancel-color {
  color: var(--text-light);
}

.confirm-btn.cancel-color:hover {
  background: rgba(0, 0, 0, 0.05);
}
</style>
