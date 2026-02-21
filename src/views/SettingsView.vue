<template>
  <MainLayout>
    <div class="settings-page" :data-tier="tier">
      <div class="settings-container">
        <div class="settings-grid">
          <!-- Left: Profile Card -->
          <section class="settings-card">
            <div class="profile-section">
              <div class="profile-avatar">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>

              <div class="profile-name-area">
                <div class="profile-name">{{ displayName }}</div>
                <div class="profile-id">ID: {{ displayId }}</div>
              </div>

              <div class="profile-badges">
                <span class="badge-pill badge-tier">{{ tierLabel }}</span>
              </div>

              <div class="profile-expiry-area">
                <div class="expiry-label">会员有效期至</div>
                <div class="expiry-value">{{ expiryText }}</div>
              </div>

              <button class="btn-logout" @click="handleLogout" title="退出登录">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                退出登录
              </button>
            </div>
          </section>

          <!-- Right: Usage Stats Card -->
          <section class="settings-card">
            <div class="usage-header">
              <div class="usage-icon-wrap">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <span>运行用量统计</span>
            </div>

            <div class="usage-stats-row">
              <div class="usage-stat-item">
                <div class="usage-stat-num" :class="{ infinite: isPremium }">
                  {{ isPremium ? '\u221E' : remainingRuns }}
                </div>
                <div class="usage-stat-label">本月剩余</div>
              </div>
              <div class="usage-stat-item">
                <div class="usage-stat-num">{{ monthlyUsage }}</div>
                <div class="usage-stat-label">本月已用</div>
              </div>
            </div>

            <!-- Progress bar (hidden for premium) -->
            <div v-if="!isPremium" class="usage-progress-wrapper">
              <div class="progress-header">
                <span>额度使用率</span>
                <span>{{ usagePercent }}%</span>
              </div>
              <div class="usage-progress-bar">
                <div class="usage-progress-fill" :style="{ width: usagePercent + '%' }"></div>
              </div>
            </div>

            <!-- Premium unlimited message -->
            <div v-if="isPremium" class="premium-msg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="vertical-align: middle; margin-right: 4px"
              >
                <path
                  d="m2 4 3 12h14l3-12-5 4-5-6-5 6-5-4Z"
                />
                <path d="M4 18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2" />
              </svg>
              尊享无限次运行权限
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- Logout Confirm Dialog -->
    <Teleport to="body">
      <div v-if="confirmVisible" class="confirm-overlay" @click.self="confirmVisible = false">
        <div class="confirm-dialog">
          <div class="confirm-title">退出登录</div>
          <div class="confirm-message">确定要退出登录吗？</div>
          <div class="confirm-actions">
            <button class="confirm-btn-cancel" @click="confirmVisible = false">取消</button>
            <button class="confirm-btn-ok" @click="doLogout">确定</button>
          </div>
        </div>
      </div>
    </Teleport>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { getUserInfo } from '@/api/auth'
import MainLayout from '@/components/layout/MainLayout.vue'

const router = useRouter()
const userStore = useUserStore()

// Raw data from API
const userData = ref<Record<string, any>>({})
const loading = ref(true)

// Confirm dialog
const confirmVisible = ref(false)

// Computed: tier
const tier = computed(() => {
  const raw = userData.value.user_tier || userData.value.tier || userData.value.plan || 'free'
  return String(raw).toLowerCase()
})

const isPremium = computed(() => tier.value === 'premium' || tier.value === 'vip')

const tierLabel = computed(() => {
  const labels: Record<string, string> = {
    free: '免费用户',
    standard: '普通会员',
    premium: '高级会员',
    vip: '高级会员',
    pro: '高级会员'
  }
  return labels[tier.value] || '免费用户'
})

// Computed: profile
const displayName = computed(() => userData.value.nickname || userStore.nickname || '加载中..')
const displayId = computed(
  () => userData.value.id || userData.value.user_id || userStore.userInfo?.id || '--',
)

// Computed: expiry
const expiryText = computed(() => {
  const expiry =
    userData.value.tier_expires || userData.value.membership_expires || userData.value.expires_at
  if (!expiry) return '永久有效'
  const d = new Date(expiry)
  if (d.getFullYear() > 2090) return '永久有效'
  return d.toLocaleDateString('zh-CN')
})

// Computed: usage
const monthlyUsage = computed(() => userData.value.monthly_sop_runs ?? 0)

const remainingRuns = computed(() => userData.value.remaining_sop_runs ?? 0)

const usagePercent = computed(() => {
  if (isPremium.value) return 0
  const totalLimit = tier.value === 'standard' ? 20 : 10
  const pct = Math.min(Math.round((monthlyUsage.value / totalLimit) * 100), 100)
  return pct
})

// Fetch user data
const fetchData = async () => {
  loading.value = true
  try {
    const res = await getUserInfo()
    if (res.code === 200 || res.code === 0) {
      userData.value = res.data || {}
    }
  } catch (error) {
    console.error('获取用户信息失败:', error)
  } finally {
    loading.value = false
  }
}

// Logout
const handleLogout = () => {
  confirmVisible.value = true
}

const doLogout = () => {
  confirmVisible.value = false
  userStore.logout()
  router.push('/login')
}

onMounted(() => {
  void fetchData()
})
</script>

<style scoped>
.settings-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 0;
}

.settings-container {
  width: 100%;
}

.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: stretch;
}

/* Card */
.settings-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 240px;
  transition: all 0.2s ease;
}

.settings-card:hover {
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.1);
  border-color: #d1fae5;
}

/* Premium card styling */
.settings-page[data-tier='premium'] .settings-card {
  border: 1px solid hsl(45, 100%, 85%);
}

.settings-page[data-tier='premium'] .settings-card:hover {
  border-color: hsl(45, 100%, 60%);
  box-shadow: 0 0 12px rgba(251, 191, 36, 0.25), 0 4px 12px rgba(0, 0, 0, 0.08);
}

/* ===== Profile Section ===== */
.profile-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
}

.profile-avatar {
  width: 88px;
  height: 88px;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #059669);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
  box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);
  color: #fff;
}

.settings-page[data-tier='premium'] .profile-avatar {
  background: linear-gradient(135deg, hsl(45, 100%, 55%), hsl(38, 100%, 50%));
  box-shadow: 0 4px 12px rgba(251, 191, 36, 0.4);
}

.profile-name-area {
  margin-bottom: 8px;
}

.profile-name {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
}

.profile-id {
  color: #6b7280;
  font-size: 13px;
  font-family: var(--font-mono, monospace);
}

/* Badges */
.profile-badges {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
}

.badge-pill {
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
}

.badge-tier {
  background: #f3f4f6;
  color: #6b7280;
}

.settings-page[data-tier='standard'] .badge-tier {
  background: #ecfdf5;
  color: #059669;
}

.settings-page[data-tier='premium'] .badge-tier {
  background: linear-gradient(135deg, hsl(45, 100%, 55%), hsl(38, 100%, 50%));
  color: white;
  border: none;
  box-shadow: 0 2px 4px rgba(251, 191, 36, 0.3);
}

/* Expiry */
.profile-expiry-area {
  margin-top: 24px;
  margin-bottom: 24px;
  font-size: 12px;
  color: #6b7280;
  width: 100%;
}

.expiry-label {
  margin-bottom: 4px;
}

.expiry-value {
  color: #1f2937;
  font-weight: 600;
}

/* Logout button */
.btn-logout {
  margin-top: 16px;
  background: transparent;
  border: 1px solid #ef4444;
  color: #ef4444;
  padding: 8px 24px;
  border-radius: 9999px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-logout:hover {
  background: #fef2f2;
}

/* ===== Usage Stats ===== */
.usage-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
  color: #6b7280;
  font-size: 14px;
  font-weight: 500;
}

.usage-icon-wrap {
  background: #ecfdf5;
  padding: 8px;
  border-radius: 8px;
  display: flex;
  color: #10b981;
}

.settings-page[data-tier='premium'] .usage-icon-wrap {
  background: hsl(45, 100%, 96%);
  color: hsl(45, 100%, 55%);
}

.usage-stats-row {
  display: flex;
  justify-content: space-around;
  margin-bottom: 28px;
}

.usage-stat-item {
  text-align: center;
}

.usage-stat-num {
  font-size: 36px;
  font-weight: 800;
  color: #1f2937;
  line-height: 1.2;
  font-family: var(--font-mono, monospace);
}

.usage-stat-num.infinite {
  font-size: 42px;
  color: hsl(150, 10%, 15%);
}

.usage-stat-label {
  font-size: 12px;
  color: #6b7280;
  margin-top: 4px;
}

.settings-page[data-tier='premium'] .usage-stat-label {
  color: hsl(45, 100%, 40%);
  font-weight: 500;
}

/* Progress bar */
.usage-progress-wrapper {
  background: #ecfdf5;
  padding: 16px;
  border-radius: 12px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}

.usage-progress-bar {
  height: 8px;
  background: #fff;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 8px;
}

.usage-progress-fill {
  height: 100%;
  background: #10b981;
  border-radius: 4px;
  transition: width 0.5s ease;
}

/* Premium unlimited message */
.premium-msg {
  text-align: center;
  margin-top: 12px;
  background: #fffbeb;
  color: #d97706;
  padding: 8px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
}

.settings-page[data-tier='premium'] .premium-msg {
  background: linear-gradient(135deg, hsl(45, 100%, 95%), hsl(45, 100%, 90%));
  color: hsl(45, 100%, 40%);
}

/* ===== Confirm Dialog ===== */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.confirm-dialog {
  background: #fff;
  border-radius: 16px;
  padding: 28px 32px;
  width: 360px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.confirm-title {
  font-size: 18px;
  font-weight: 700;
  color: #1f2937;
  margin-bottom: 8px;
}

.confirm-message {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 24px;
}

.confirm-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.confirm-btn-cancel,
.confirm-btn-ok {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.confirm-btn-cancel {
  background: #fff;
  border: 1px solid #e5e7eb;
  color: #374151;
}

.confirm-btn-cancel:hover {
  background: #f9fafb;
}

.confirm-btn-ok {
  background: #ef4444;
  border: none;
  color: #fff;
}

.confirm-btn-ok:hover {
  background: #dc2626;
}

/* Responsive */
@media (max-width: 768px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }

  .settings-card {
    min-height: auto;
  }

  .settings-page {
    padding: 20px 0;
  }
}
</style>
