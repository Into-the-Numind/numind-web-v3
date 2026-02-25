<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="logo-icon"></div>
      <div class="sidebar-title">AI Workflow</div>
    </div>

    <nav class="nav-menu">
      <RouterLink
        v-for="item in menuItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path) }"
      >
        <span>{{ item.title }}</span>
      </RouterLink>
    </nav>

    <div class="sidebar-footer">
      <div class="run-count-card" :class="tierClass">
        <!-- Premium -->
        <template v-if="tier === 'premium'">
          <div class="run-count-header">
            <span class="run-count-title">本月运行次数</span>
            <span class="premium-badge">&infin; 无限次</span>
          </div>
          <div class="run-count-value">{{ monthlyRuns }}</div>
          <div class="run-count-label premium">本月累计 &uarr;</div>
        </template>
        <!-- Standard -->
        <template v-else-if="tier === 'standard'">
          <div class="run-count-title">本月运行次数</div>
          <div class="run-count-value">{{ standardUsed }}<span class="run-count-total">/{{ standardTotal }}</span></div>
          <div class="run-count-label standard">剩余 {{ standardRemaining }} 次</div>
          <div class="run-count-progress">
            <div class="run-count-progress-bar" :class="progressClass" :style="{ width: standardPercent + '%' }"></div>
          </div>
        </template>
        <!-- Loading -->
        <template v-else-if="userStore.loading">
          <div class="run-count-title">SOP 运行次数</div>
          <div class="run-count-value run-count-loading">加载中...</div>
        </template>
        <!-- No user info (load failed) -->
        <template v-else-if="!userStore.userInfo && !userStore.loading">
          <div class="run-count-title">SOP 运行次数</div>
          <div class="run-count-value run-count-error">加载失败</div>
        </template>
        <!-- Free -->
        <template v-else>
          <div class="run-count-title">SOP 运行次数</div>
          <div class="run-count-value">--</div>
          <div class="run-count-label">升级会员解锁</div>
        </template>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const userStore = useUserStore()

// ── Run Count Card ─────────────────────────────────────────────
// Tier: normalized from store (aligns with SettingsView logic)
const tier = computed(() => {
  const info = userStore.userInfo
  if (!info) return 'free'
  const raw = String(info.user_tier || info.tier || info.plan || 'free').toLowerCase()
  if (raw === 'vip' || raw === 'pro') return 'premium'
  return raw
})

const monthlyRuns = computed(() => userStore.userInfo?.monthly_sop_runs ?? 0)
const remainingRuns = computed(() => userStore.userInfo?.remaining_sop_runs ?? -1)

const standardTotal = 20
const standardUsed = computed(() => Math.min(monthlyRuns.value, standardTotal))
const standardRemaining = computed(() => {
  if (remainingRuns.value >= 0) return remainingRuns.value
  return standardTotal - standardUsed.value
})
const standardPercent = computed(() => Math.round((standardUsed.value / standardTotal) * 100))

const tierClass = computed(() => {
  if (tier.value === 'premium') return 'premium'
  if (tier.value === 'standard') return 'standard'
  return 'free'
})

const progressClass = computed(() => {
  if (standardRemaining.value <= 3) return 'danger'
  if (standardRemaining.value <= 8) return 'warning'
  return ''
})

// Refresh full user data from API; store updates reactively
onMounted(() => {
  userStore.fetchUserInfo()
})

// ── Menu Items ─────────────────────────────────────────────────
const menuItems = computed(() => {
  const items = [
    { path: '/', title: '工作区' },
    { path: '/sop', title: '运行记录' }
  ]

  // 客户管理：仅父用户可见（parent_user_id 不存在时为父用户）
  const parentUserId = userStore.userInfo?.parent_user_id
  if (!parentUserId) {
    items.push({ path: '/customers', title: '客户管理' })
  }

  items.push({ path: '/knowledge', title: '知识库管理' })
  items.push({ path: '/settings', title: '设置' })

  return items
})

const isActive = (path: string) => {
  if (path === '/') {
    return route.path === '/'
  }
  return route.path === path || route.path.startsWith(`${path}/`)
}
</script>

<style scoped>
.sidebar {
  width: 260px;
  height: 100vh;
  background: #003811;
  border: none;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  box-shadow: none;
  overflow: hidden;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 24px 20px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 12px;
}

.logo-icon {
  width: 180px;
  height: 72px;
  background-image: url('https://numind-dev-1334169463.cos.ap-chengdu.myqcloud.com/sop/logo/%E8%8E%AB%E5%B0%8F%E6%B4%BElogo2.png');
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
}

.sidebar-title {
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 0;
}

.nav-menu {
  flex: 1;
  padding: 0 12px 12px;
  overflow: hidden;
}

.nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin-bottom: 4px;
  border-radius: var(--radius-md);
  color: #fff;
  font-size: 14px;
  text-decoration: none;
  border: 1px solid transparent;
  position: relative;
  transition: all 0.2s;
}

.nav-item:hover {
  background-color: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav-item.active {
  background-color: var(--sidebar-active-bg);
  color: var(--sidebar-active-text);
  font-weight: 500;
}

.nav-item.active::after {
  content: '';
  position: absolute;
  right: 16px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--accent);
}

.sidebar-footer {
  padding: 0 12px 20px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  margin-top: auto;
  gap: 0;
}

.run-count-card {
  width: 100%;
  padding: 16px;
  background-color: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: var(--radius-md);
  border: 1px solid rgba(192, 202, 198, 0.5);
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 8%), 0 1px 2px -1px rgb(0 0 0 / 8%);
}

.run-count-title {
  font-size: 13px;
  font-weight: 500;
  color: hsl(150, 10%, 15%);
  margin-bottom: 8px;
}

.run-count-value {
  font-size: 28px;
  font-weight: 700;
  color: hsl(150, 10%, 15%);
  margin-bottom: 4px;
  line-height: 1.2;
}

.run-count-label {
  font-size: 12px;
  color: hsl(150, 10%, 40%);
}

/* Run count header row (premium) */
.run-count-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.run-count-header .run-count-title {
  margin-bottom: 0;
}

.premium-badge {
  font-size: 11px;
  font-weight: 600;
  color: hsl(45, 100%, 40%);
  background: linear-gradient(135deg, hsl(45, 100%, 95%), hsl(45, 100%, 88%));
  padding: 2px 8px;
  border-radius: 10px;
}

.run-count-total {
  font-size: 16px;
  font-weight: 500;
  color: hsl(150, 10%, 45%);
}

.run-count-label.premium {
  color: hsl(45, 100%, 40%);
}

.run-count-label.standard {
  color: hsl(158, 64%, 35%);
}

/* Premium card */
.run-count-card.premium {
  background: linear-gradient(135deg, hsl(45, 60%, 97%), hsl(45, 50%, 92%));
  border-color: hsl(45, 60%, 80%);
}

/* Standard card */
.run-count-card.standard {
  background: linear-gradient(135deg, hsl(158, 40%, 97%), hsl(158, 30%, 93%));
  border-color: hsl(158, 40%, 80%);
}

/* Progress bar */
.run-count-progress {
  margin-top: 8px;
  width: 100%;
  height: 4px;
  background: hsl(150, 10%, 88%);
  border-radius: 2px;
  overflow: hidden;
}

.run-count-progress-bar {
  height: 100%;
  background: hsl(158, 64%, 45%);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.run-count-progress-bar.warning {
  background: hsl(40, 90%, 50%);
}

.run-count-progress-bar.danger {
  background: hsl(0, 70%, 55%);
}

.run-count-value.run-count-loading {
  font-size: 14px;
  color: hsl(150, 10%, 45%);
  font-weight: 500;
}

.run-count-value.run-count-error {
  font-size: 14px;
  color: hsl(0, 60%, 50%);
  font-weight: 500;
}

@media (max-width: 1024px) {
  .sidebar {
    width: 220px;
  }
}

@media (max-width: 768px) {
  .sidebar {
    width: 100%;
    height: auto;
    max-height: 260px;
  }

  .sidebar-header {
    padding-top: 16px;
    padding-bottom: 12px;
  }

  .logo-icon {
    width: 150px;
    height: 60px;
  }
}
</style>
