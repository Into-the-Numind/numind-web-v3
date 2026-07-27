<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { useAgentBuilderStore } from '@/stores/agentBuilder'
import { errorStatus } from '@/constants/agentErrno'
import AppButton from '@/components/common/AppButton.vue'
import AgentConfigTab from './components/AgentConfigTab.vue'
import AgentHistoryTab from './components/AgentHistoryTab.vue'
import AgentStatsTab from './components/AgentStatsTab.vue'

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  id: string | number
}

const props = defineProps<Props>()

// ── Composables ────────────────────────────────────────────────────────────

const router = useRouter()
const store = useAgentBuilderStore()

// ── Local state ────────────────────────────────────────────────────────────

type TabKey = 'config' | 'history' | 'stats'
const tab = ref<TabKey>('config')
const is404 = ref(false)

// ── Computed ───────────────────────────────────────────────────────────────

const agentId = computed(() => Number(props.id))

// ── Lifecycle ──────────────────────────────────────────────────────────────

async function loadAgent() {
  is404.value = false
  try {
    await store.fetchOne(agentId.value)
  } catch (e: unknown) {
    if (errorStatus(e) === 404) {
      is404.value = true
    }
  }
}

onMounted(loadAgent)

// ── Handlers ───────────────────────────────────────────────────────────────

function goBack() {
  router.push('/config/agents')
}

function goEdit() {
  router.push(`/config/agents/${agentId.value}/edit`)
}

function goDerive() {
  router.push(`/config/agents/builder?from=copy:${agentId.value}`)
}

async function refetch() {
  await loadAgent()
}
</script>

<template>
  <div class="agent-detail-root">
    <!-- Loading -->
    <div v-if="store.currentLoading" class="loading-skel">
      <div class="skel-bar skel-bar--wide" />
      <div class="skel-bar" />
      <div class="skel-bar skel-bar--narrow" />
    </div>

    <!-- 404 -->
    <div v-else-if="is404" class="not-found">
      <p class="not-found__msg">Agent 不存在或已下架</p>
      <AppButton variant="secondary" @click="goBack">返回列表</AppButton>
    </div>

    <!-- Generic error -->
    <div v-else-if="store.currentError" class="error-state">
      <p class="error-state__msg">{{ store.currentError }}</p>
      <AppButton variant="secondary" @click="refetch">重试</AppButton>
    </div>

    <!-- Success -->
    <div v-else-if="store.current" class="agent-detail">
      <div class="back-link" @click="goBack">
        <ArrowLeft :size="16" />
        <span>返回 AI 智能体列表</span>
      </div>

      <header class="detail-header">
        <div class="detail-header__info">
          <h1 class="detail-header__name">{{ store.current.name }}</h1>
          <p class="detail-header__desc">{{ store.current.description }}</p>
        </div>
        <div class="detail-header__actions">
          <AppButton variant="secondary" @click="goDerive">派生此 Agent</AppButton>
          <AppButton variant="primary" @click="goEdit">编辑</AppButton>
        </div>
      </header>

      <nav class="tabs" role="tablist">
        <button
          role="tab"
          class="tab-btn"
          :class="{ active: tab === 'config' }"
          @click="tab = 'config'"
        >
          基本配置
        </button>
        <button
          role="tab"
          class="tab-btn"
          :class="{ active: tab === 'history' }"
          @click="tab = 'history'"
        >
          历史版本
        </button>
        <button
          role="tab"
          class="tab-btn"
          :class="{ active: tab === 'stats' }"
          @click="tab = 'stats'"
        >
          使用数据
        </button>
      </nav>

      <div class="tab-panel">
        <AgentConfigTab v-if="tab === 'config'" :agent="store.current" />
        <AgentHistoryTab v-else-if="tab === 'history'" :agent-id="agentId" />
        <AgentStatsTab v-else />
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-detail-root {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-6);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--on-surface-variant, #6b7280);
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 20px;
  user-select: none;
}

.back-link:hover {
  color: var(--primary, #2563eb);
}

/* Loading skeleton */
.loading-skel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.skel-bar {
  height: 20px;
  width: 60%;
  background: linear-gradient(
    90deg,
    var(--surface-low) 25%,
    var(--surface-high) 50%,
    var(--surface-low) 75%
  );
  background-size: 200% 100%;
  border-radius: var(--radius-sm);
  animation: shimmer 1.5s infinite;
}

.skel-bar--wide {
  width: 80%;
}
.skel-bar--narrow {
  width: 40%;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* 404 / error */
.not-found,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-16) var(--space-6);
  text-align: center;
}

.not-found__msg,
.error-state__msg {
  font-size: var(--text-base);
  color: var(--on-surface-variant);
}

/* Detail header */
.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.detail-header__info {
  flex: 1;
  min-width: 0;
}

.detail-header__name {
  font-family: var(--font-headline);
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--on-surface);
  margin-bottom: var(--space-1);
}

.detail-header__desc {
  font-size: var(--text-sm);
  color: var(--on-surface-variant);
}

.detail-header__actions {
  display: flex;
  gap: var(--space-3);
  flex-shrink: 0;
}

/* Tabs */
.tabs {
  display: flex;
  border-bottom: 2px solid rgba(169, 180, 185, 0.1);
  margin-bottom: var(--space-6);
}

.tab-btn {
  padding: var(--space-3) var(--space-5);
  font-family: var(--font-label);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--on-surface-variant);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tab-btn:hover {
  color: var(--on-surface);
}

.tab-btn.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

.tab-panel {
  min-height: 200px;
}
</style>
