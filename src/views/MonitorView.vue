<template>
  <MainLayout>
    <div class="monitor-page">
      <!-- Loading state -->
      <div v-if="permissionLoading" class="loading-state">
        <div class="loading-spinner"></div>
        <div class="loading-text">检查权限...</div>
      </div>

      <!-- No permission -->
      <div v-else-if="!store.hasPermission" class="no-permission-state">
        <div class="empty-icon">
          <svg
            viewBox="0 0 24 24"
            width="48"
            height="48"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </div>
        <h2 class="empty-title">暂无访问权限</h2>
        <p class="empty-desc">您当前的会员等级不支持竞品监控功能，请升级后使用</p>
        <button class="action-btn" @click="router.push('/')">返回首页</button>
      </div>

      <!-- Main content -->
      <template v-else>
        <!-- Hero section -->
        <div class="hero-section">
          <div class="hero-content">
            <h1 class="hero-title">竞品监控</h1>
            <p class="hero-subtitle">自动追踪小红书博主动态，AI 分析内容趋势</p>
          </div>
        </div>

        <!-- Stats -->
        <MonitorStats />

        <!-- Tab navigation -->
        <div class="tab-bar">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="tab-btn"
            :class="{ active: activeTab === tab.key }"
            @click="activeTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab content -->
        <div class="tab-content">
          <BloggerList v-if="activeTab === 'bloggers'" />
          <ContentFeed v-else-if="activeTab === 'notes'" />
          <BriefingList v-else-if="activeTab === 'briefings'" />
          <MonitorConfig v-else-if="activeTab === 'config'" />
        </div>
      </template>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMonitorStore } from '@/stores/monitor'
import MainLayout from '@/components/layout/MainLayout.vue'
import BloggerList from '@/components/monitor/BloggerList.vue'
import ContentFeed from '@/components/monitor/ContentFeed.vue'
import MonitorStats from '@/components/monitor/MonitorStats.vue'
import BriefingList from '@/components/monitor/BriefingList.vue'
import MonitorConfig from '@/components/monitor/MonitorConfig.vue'

const router = useRouter()
const store = useMonitorStore()
const activeTab = ref('bloggers')
const permissionLoading = ref(true)

const tabs = [
  { key: 'bloggers', label: '博主管理' },
  { key: 'notes', label: '内容流' },
  { key: 'briefings', label: '简报' },
  { key: 'config', label: '配置' }
]

onMounted(async () => {
  await store.checkPermission()
  permissionLoading.value = false
  if (store.hasPermission) {
    store.fetchStats()
  }
})
</script>

<style scoped>
.monitor-page {
  max-width: 1200px;
  margin: 0 auto;
}

/* Loading state */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-4xl) 0;
  gap: var(--space-lg);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-light);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* No permission */
.no-permission-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  gap: var(--space-lg);
  text-align: center;
}

.empty-icon {
  color: var(--text-muted);
  opacity: 0.5;
}

.empty-title {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--text);
  margin: 0;
}

.empty-desc {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin: 0;
  max-width: 360px;
}

.action-btn {
  margin-top: var(--space-sm);
  padding: 10px 24px;
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.action-btn:hover {
  background: var(--primary-hover);
}

/* Hero */
.hero-section {
  margin-bottom: var(--space-xl);
}

.hero-title {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--text);
  margin: 0 0 var(--space-xs) 0;
  font-family: var(--font-sans);
}

.hero-subtitle {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin: 0;
}

/* Tabs */
.tab-bar {
  display: flex;
  gap: var(--space-xs);
  border-bottom: 1px solid var(--border-light);
  margin-bottom: var(--space-xl);
}

.tab-btn {
  padding: var(--space-sm) var(--space-lg);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  font-family: var(--font-sans);
}

.tab-btn:hover {
  color: var(--text-secondary);
}

.tab-btn.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

/* Tab content */
.tab-content {
  min-height: 300px;
}

/* Responsive */
@media (max-width: 768px) {
  .tab-bar {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}
</style>
