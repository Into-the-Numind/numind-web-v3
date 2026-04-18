<template>
  <MainLayout>
    <div class="settings-page" :data-tier="tier">
      <!-- Page Header -->
      <div class="page-header">
        <h1 class="page-title">设置</h1>
      </div>

      <!-- Section: 我的积分（credits-system Phase 2 Task 2.4）
           CreditBalanceCard 自动按 user.tier + billing_mode 三态渲染；
           BoosterPurchaseCard 以 4 态灰态交互。余额数据由 credits store 的
           fetchBalance() 填充（onMounted 触发）。 -->
      <div class="settings-section">
        <div class="section-label">我的积分</div>
        <div class="credit-grid">
          <CreditBalanceCard />
          <BoosterPurchaseCard @purchase="handleBoosterPurchase" />
        </div>
      </div>

      <!-- Section: 个人信息 -->
      <div class="settings-section">
        <div class="section-label">个人信息</div>
        <div class="settings-group">
          <div class="settings-row">
            <div class="row-label">头像</div>
            <div class="row-value">
              <div class="profile-avatar">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
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
            </div>
          </div>
          <div class="settings-row">
            <div class="row-label">昵称</div>
            <div class="row-value">{{ displayName }}</div>
          </div>
          <div class="settings-row">
            <div class="row-label">用户 ID</div>
            <div class="row-value row-value-mono">{{ displayId }}</div>
          </div>
        </div>
      </div>

      <!-- Section: 会员信息 -->
      <div class="settings-section">
        <div class="section-label">会员信息</div>
        <div class="settings-group">
          <div class="settings-row">
            <div class="row-label">会员状态</div>
            <div class="row-value">
              <span class="badge-tier">{{ tierLabel }}</span>
            </div>
          </div>
          <div v-if="expiryText !== '—'" class="settings-row">
            <div class="row-label">有效期至</div>
            <div class="row-value">{{ expiryText }}</div>
          </div>
        </div>
      </div>

      <!-- Section: 用量统计 -->
      <div class="settings-section">
        <div class="section-label">用量统计</div>
        <div class="settings-group">
          <div class="settings-row settings-row-block">
            <div class="row-label">额度使用率</div>
            <div class="row-value-full">
              <div class="quota-bar-wrap">
                <div class="quota-bar">
                  <div
                    class="quota-fill quota-fill-subscription"
                    :style="{ width: subscriptionPercent + '%' }"
                  ></div>
                  <div
                    v-if="!isOldMember"
                    class="quota-fill quota-fill-booster"
                    :style="{ width: boosterPercent + '%', left: subscriptionPercent + '%' }"
                  ></div>
                </div>
                <span class="quota-percent">{{ quotaLabel }}</span>
              </div>
              <div v-if="!isOldMember" class="quota-legend">
                <span class="quota-legend-item">
                  <span class="quota-legend-dot subscription"></span>
                  订阅额度
                </span>
                <span class="quota-legend-item">
                  <span class="quota-legend-dot booster"></span>
                  加量包
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Section: 账号 -->
      <div class="settings-section">
        <div class="section-label">账号</div>
        <div class="settings-group">
          <button class="settings-row settings-row-action" @click="handleLogout">
            <div class="row-label row-label-danger">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
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
            </div>
            <svg
              class="row-chevron"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
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
import { useCreditsStore } from '@/stores/credits'
import { useNotificationsStore } from '@/stores/notifications'
import { getUserInfo } from '@/api/auth'
import MainLayout from '@/components/layout/MainLayout.vue'
import CreditBalanceCard from '@/components/credit/CreditBalanceCard.vue'
import BoosterPurchaseCard from '@/components/credit/BoosterPurchaseCard.vue'

const router = useRouter()
const userStore = useUserStore()
const creditsStore = useCreditsStore()
const notifications = useNotificationsStore()

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

const isOldMember = computed(() => {
  const t = tier.value
  return t === 'standard' || t === 'premium' || t === 'vip'
})

// 额度进度条计算（兼容新老会员）
const subscriptionPercent = computed(() => {
  if (isOldMember.value) {
    const t = tier.value
    if (t === 'premium' || t === 'vip') return 100
    const limit = t === 'standard' ? 20 : 10 // standard 20次/月, trial 10次
    const used = userData.value.monthly_sop_runs ?? 0
    const remain = Math.max(limit - used, 0)
    return Math.round((remain / limit) * 100)
  }
  const total = userStore.quotaSubTotal + userStore.quotaBoosterTotal
  if (total <= 0) return 0
  return Math.round((userStore.quotaSubRemain / total) * 100)
})
const boosterPercent = computed(() => {
  if (isOldMember.value) return 0
  const total = userStore.quotaSubTotal + userStore.quotaBoosterTotal
  if (total <= 0) return 0
  return Math.round((userStore.quotaBoosterRemain / total) * 100)
})
const quotaLabel = computed(() => {
  if (isOldMember.value) {
    const t = tier.value
    if (t === 'premium' || t === 'vip') return '无限次'
    const limit = t === 'standard' ? 20 : 10
    const used = userData.value.monthly_sop_runs ?? 0
    return `${Math.max(limit - used, 0)}/${limit} 次`
  }
  return `${userStore.creditBalance}`
})

const tierLabel = computed(() => {
  const t = tier.value
  if (t === 'premium' || t === 'vip') return '高级会员'
  if (t === 'standard') return '普通会员'
  if (t === 'trial') return '体验会员'
  if (t === 'free' && userStore.creditBalance > 0) return 'Pro'
  return 'Free'
})

// Computed: profile
const displayName = computed(() => userData.value.nickname || userStore.nickname || '加载中..')
const displayId = computed(
  () => userData.value.id || userData.value.user_id || userStore.userInfo?.id || '--'
)

// Computed: expiry
const expiryText = computed(() => {
  // 老会员用 tier_expires
  const tierExpiry =
    userData.value.tier_expires || userData.value.membership_expires || userData.value.expires_at
  if (isOldMember.value && tierExpiry) {
    const d = new Date(tierExpiry)
    if (d.getFullYear() > 2090) return '永久有效'
    return d.toLocaleDateString('zh-CN')
  }
  // 新用户用 credit_expires (需要后端返回)
  // 目前设置页 getUserInfo 不返回 credit_expires，暂用 '—'
  if (!isOldMember.value && userStore.creditBalance > 0) return '—'
  return '—'
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

/**
 * BoosterPurchaseCard 触发 purchase 事件（credits 模式会员点击"立即购买"）。
 *
 * 当前订单流程尚未接入（Phase 2 Task 2.5 才会对齐 admin 端加量包订单 API），
 * 先 toast 提示，保留埋点。父级负责最终订单路由。
 */
function handleBoosterPurchase(): void {
  notifications.info('加量包购买流程即将上线，敬请期待')
}

onMounted(() => {
  void fetchData()
  // credits-system：拉 credits store 的完整 QuotaBreakdown（含 billing_mode / 过期）
  void creditsStore.fetchBalance()
})
</script>

<style scoped>
.settings-page {
  max-width: 640px;
  margin: 0 auto;
  padding: 20px 0 60px;
}

/* ===== Page Header ===== */
.page-header {
  margin-bottom: 36px;
}

.page-title {
  font-family: var(--font-sans);
  font-size: 28px;
  font-weight: 700;
  color: #1a1d26;
  letter-spacing: -0.02em;
  margin: 0;
}

/* ===== Section ===== */
.settings-section {
  margin-bottom: 32px;
}

/* credits-system Phase 2: 两张 credit 卡片并排（宽屏）→ 纵排（窄屏） */
.credit-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: stretch;
}

.section-label {
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  color: #8b90a0;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 10px;
  padding-left: 4px;
}

/* ===== Settings Group (card wrapper) ===== */
.settings-group {
  background: #ffffff;
  border: 1px solid #e8e9ee;
  border-radius: 14px;
  overflow: hidden;
}

/* ===== Settings Row ===== */
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  min-height: 48px;
}

.settings-row + .settings-row {
  border-top: 1px solid #f0f1f5;
}

.settings-row-block {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

/* Action row (button) */
.settings-row-action {
  appearance: none;
  background: none;
  border: none;
  width: 100%;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: background 0.15s;
}

.settings-row-action:hover {
  background: #fafbfc;
}

/* ===== Row Label / Value ===== */
.row-label {
  font-size: 14px;
  font-weight: 500;
  color: #3d4055;
  display: flex;
  align-items: center;
  gap: 8px;
}

.row-label-danger {
  color: #ef4444;
}

.row-value {
  font-size: 14px;
  color: #1a1d26;
  font-weight: 500;
}

.row-value-mono {
  font-family: var(--font-mono, monospace);
  font-size: 13px;
  color: #6b7085;
}

.row-value-num {
  font-family: var(--font-mono, monospace);
  font-size: 15px;
  font-weight: 600;
}

.row-value-full {
  width: 100%;
}

.row-chevron {
  color: #c4c6d0;
  flex-shrink: 0;
}

/* ===== Avatar ===== */
.profile-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981, #059669);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.settings-page[data-tier='premium'] .profile-avatar {
  background: linear-gradient(135deg, hsl(45, 100%, 55%), hsl(38, 100%, 50%));
}

/* ===== Tier Badge ===== */
.badge-tier {
  display: inline-block;
  padding: 3px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  background: #f3f4f6;
  color: #6b7280;
}

.settings-page[data-tier='trial'] .badge-tier {
  background: #eff6ff;
  color: #2563eb;
}

.settings-page[data-tier='standard'] .badge-tier {
  background: #ecfdf5;
  color: #059669;
}

.settings-page[data-tier='premium'] .badge-tier {
  background: linear-gradient(135deg, hsl(45, 100%, 55%), hsl(38, 100%, 50%));
  color: white;
  box-shadow: 0 2px 4px rgba(251, 191, 36, 0.3);
}

/* ===== Confirm Dialog ===== */
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.confirm-dialog {
  background: #ffffff;
  border: 1px solid #e8e9ee;
  border-radius: 16px;
  padding: 28px 32px;
  width: 360px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
  animation: dialog-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dialog-pop {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.confirm-title {
  font-size: 18px;
  font-weight: 700;
  color: #1a1d26;
  margin-bottom: 8px;
}

.confirm-message {
  font-size: 14px;
  color: #6b7085;
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
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.confirm-btn-cancel {
  background: #f5f5f7;
  border: 1px solid #e8e9ee;
  color: #3d4055;
}

.confirm-btn-cancel:hover {
  background: #eeeef1;
}

.confirm-btn-ok {
  background: #ef4444;
  border: none;
  color: #fff;
}

.confirm-btn-ok:hover {
  background: #dc2626;
}

/* ===== Quota Progress Bar ===== */
.quota-bar-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.quota-bar {
  flex: 1;
  height: 8px;
  background: #e2e4ea;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.quota-fill {
  position: absolute;
  top: 0;
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.quota-fill-subscription {
  left: 0;
  background: #10b981;
  z-index: 2;
}

.quota-fill-booster {
  background: #34d399;
  z-index: 1;
}

.quota-percent {
  font-size: 14px;
  font-weight: 600;
  color: #3d4055;
  min-width: 40px;
  text-align: right;
}

.quota-legend {
  display: flex;
  gap: 16px;
  margin-top: 6px;
}

.quota-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #8b90a0;
}

.quota-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.quota-legend-dot.subscription {
  background: #10b981;
}

.quota-legend-dot.booster {
  background: #34d399;
}

/* ===== Responsive ===== */
@media (max-width: 768px) {
  .settings-page {
    padding: 12px 0 40px;
  }

  .page-title {
    font-size: 24px;
  }

  .settings-row {
    padding: 12px 14px;
  }

  .credit-grid {
    grid-template-columns: 1fr;
  }
}
</style>
