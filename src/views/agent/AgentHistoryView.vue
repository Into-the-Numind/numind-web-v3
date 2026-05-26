<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import * as api from '@/api/agent'
import type { RecentSession } from '@/types/agent'
import MainLayout from '@/components/layout/MainLayout.vue'
import HistorySessionGroup from '@/components/agent/HistorySessionGroup.vue'
import AppButton from '@/components/common/AppButton.vue'

const router = useRouter()

const goBack = (): void => {
  router.push({ name: 'agent-select' })
}
const sessions = ref<RecentSession[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    sessions.value = await api.listAllHistorySessions()
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    loading.value = false
  }
})

const handleContinue = (sessionId: string): void => {
  router.push({ name: 'agent-chat', params: { sessionId } })
}

const handleView = (sessionId: string): void => {
  router.push({
    name: 'agent-chat',
    params: { sessionId },
    query: { read_only: '1' }
  })
}

// Task 3.5: jump to FULLTEXT search page.
const handleSearch = (): void => {
  router.push({ name: 'agent-history-search' })
}
</script>

<template>
  <MainLayout>
    <div class="agent-history-page">
      <div class="back-link" @click="goBack">
        <ArrowLeft :size="16" />
        <span>返回 AI 助手</span>
      </div>

      <header class="page-header">
        <h1 class="page-title">AI 助手 · 历史会话</h1>
        <AppButton variant="secondary" @click="handleSearch">搜索历史</AppButton>
      </header>

      <div v-if="loading" class="loading">加载中...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <HistorySessionGroup
        v-else
        :sessions="sessions"
        @continue="handleContinue"
        @view="handleView"
      />
    </div>
  </MainLayout>
</template>

<style scoped>
.agent-history-page {
  max-width: 960px;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text, #1f2937);
  margin: 0;
}

.loading,
.error {
  text-align: center;
  padding: 40px;
  color: var(--color-text-muted, #6b7280);
}
</style>
