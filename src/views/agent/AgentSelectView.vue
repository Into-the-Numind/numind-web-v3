<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { useAgentChatStore } from '@/stores/agentChat'
import MainLayout from '@/components/layout/MainLayout.vue'
import AgentCardGrid from '@/components/agent/AgentCardGrid.vue'
import RecentSessionList from '@/components/agent/RecentSessionList.vue'
import AppButton from '@/components/common/AppButton.vue'

const store = useAgentChatStore()
const router = useRouter()

const goHome = (): void => {
  router.push('/')
}

onMounted(async () => {
  await Promise.all([store.fetchAvailableAgents(), store.fetchRecentSessions()])
})

const handleSelect = (agentId: number): void => {
  router.push({
    name: 'agent-chat',
    params: { sessionId: 'new' },
    query: { agent_id: String(agentId) }
  })
}

const handleContinue = (sessionId: string): void => {
  router.push({ name: 'agent-chat', params: { sessionId } })
}

const handleView = (sessionId: string): void => {
  router.push({
    name: 'agent-chat',
    params: { sessionId }
  })
}

const handleRetry = async (): Promise<void> => {
  await store.fetchAvailableAgents()
}

const goHistory = (): void => {
  router.push({ name: 'agent-history' })
}

const hasMoreHistory = computed(() => store.recentSessions.length > 0)
</script>

<template>
  <MainLayout>
    <div class="agent-select-page">
      <div class="back-link" @click="goHome">
        <ArrowLeft :size="16" />
        <span>返回工作台</span>
      </div>

      <header class="page-header">
        <h1 class="page-title">AI 助手</h1>
        <p class="page-subtitle">选一个助手开始多步骤任务</p>
      </header>

      <section class="agents-section">
        <h2 class="section-title">可用助手</h2>
        <AgentCardGrid
          :loading="store.loadingAgents"
          :error="store.agentsError"
          :agents="store.availableAgents"
          @retry="handleRetry"
          @select="handleSelect"
        />
      </section>

      <RecentSessionList
        :sessions="store.recentSessions"
        @continue="handleContinue"
        @view="handleView"
      />

      <div v-if="hasMoreHistory" class="more-history">
        <AppButton variant="secondary" @click="goHistory">查看全部历史</AppButton>
      </div>
    </div>
  </MainLayout>
</template>

<style scoped>
.agent-select-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 24px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--color-text-muted, #6b7280);
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 20px;
  user-select: none;
}

.back-link:hover {
  color: var(--color-accent, #2563eb);
}

.page-header {
  margin-bottom: 32px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text, #1f2937);
  margin: 0 0 8px;
}

.page-subtitle {
  font-size: 14px;
  color: var(--color-text-muted, #6b7280);
  margin: 0;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0 0 16px;
}

.agents-section {
  margin-bottom: 32px;
}

.more-history {
  margin-top: 24px;
  text-align: center;
}
</style>
