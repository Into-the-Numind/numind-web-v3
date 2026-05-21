<script setup lang="ts">
import { onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentChatStore } from '@/stores/agentChat'
import { useCreditsStore } from '@/stores/credits'
import { useNotificationsStore } from '@/stores/notifications'
import { useAgentNarration } from '@/composables/useAgentNarration'
import { useAgentRun } from '@/composables/useAgentRun'
import { useAgentCost } from '@/composables/useAgentCost'
import * as api from '@/api/agent'
import MainLayout from '@/components/layout/MainLayout.vue'
import AppButton from '@/components/common/AppButton.vue'
import AgentChatHeader from '@/components/agent/AgentChatHeader.vue'
import AgentFirstRun from '@/components/agent/AgentFirstRun.vue'
import AgentMessageList from '@/components/agent/AgentMessageList.vue'
import AgentInputArea from '@/components/agent/AgentInputArea.vue'
import AgentBudgetExceededModal from '@/components/agent/AgentBudgetExceededModal.vue'
import AgentLowBalanceModal from '@/components/agent/AgentLowBalanceModal.vue'
import type { SupportContact } from '@/types/agent'
import { ref } from 'vue'

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

const isNewSession = computed(() => props.sessionId === 'new')
const isLoadingSnapshot = computed(() => store.loadingSnapshot)
const hasSnapshotError = computed(() => store.sessionError !== null)
const hasMessages = computed(() => store.messages.length > 0)
const showFirstRun = computed(
  () => isNewSession.value && !hasMessages.value && !!store.currentAgent
)

// Sum cycle + booster + trial pools via the store's totalRemain getter.
// The legacy `.balance` field on QuotaBreakdown is 0 under the new credits
// schema (cycle_remaining / booster_usable / trial_remaining), so reading it
// directly causes the "0 积分" false alarm even for users with 1000+ credits.
const currentBalance = computed(() => creditsStore.totalRemain)
const isMember = computed(
  () => creditsStore.displayState === 'trial' || creditsStore.displayState === 'pro'
)

const handleSend = async (text: string): Promise<void> => {
  if (!store.currentAgent) return
  if (currentBalance.value < 50) {
    showLowBalance.value = true
    return
  }
  try {
    await runCtrl.start(store.currentAgent.id, text)
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

onMounted(async () => {
  await Promise.all([
    creditsStore.fetchBalance(),
    loadCurrentAgent(),
    api.getSupportContact().then((c) => {
      supportContact.value = c
    })
  ])

  if (isNewSession.value) {
    // 尝试 sessionStorage 恢复进行中的 run
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
    // 历史会话 — sessionId 是 UUID string (backend agent_run.session_id varchar)
    if (props.sessionId) {
      await store.loadSessionSnapshot(props.sessionId, props.readOnly)
    }
  }

  cost.watchThresholds()
})

watch(
  () => cost.budgetExceeded.value,
  (exceeded) => {
    if (exceeded) {
      narration.stop()
    }
  }
)

onUnmounted(() => {
  narration.stop()
  runCtrl.stopStatusPolling()
  store.reset()
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
  <MainLayout>
    <div class="agent-chat-page">
      <!-- 加载快照中 -->
      <div v-if="isLoadingSnapshot" class="state-loading">
        <div v-for="i in 3" :key="i" class="skeleton-msg"></div>
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
      <template v-else>
        <AgentChatHeader
          :agent="store.currentAgent"
          :run="store.currentRun"
          :balance="currentBalance"
          :read-only="readOnly"
          :cancelling="store.cancelling"
          :cancel-always-enabled="narration.cancelAlwaysEnabled.value"
          @cancel="handleCancel"
        />

        <AgentFirstRun
          v-if="showFirstRun"
          :agent="store.currentAgent!"
          @select-starter="handleSelectStarter"
        />

        <AgentMessageList v-else :messages="store.messages" :read-only="readOnly" />

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
      </template>

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
  </MainLayout>
</template>

<style scoped>
.agent-chat-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
}

.state-loading {
  flex: 1;
  padding: 20px;
}

.skeleton-msg {
  height: 80px;
  background: linear-gradient(90deg, #f3f4f6, #e5e7eb, #f3f4f6);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite linear;
  border-radius: 12px;
  margin-bottom: 16px;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
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
</style>
