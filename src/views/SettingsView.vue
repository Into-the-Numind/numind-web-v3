<template>
  <MainLayout>
    <div class="settings-page" :data-tier="tier">
      <!-- Page Header -->
      <div class="page-header">
        <h1 class="page-title">设置</h1>
      </div>

      <!-- Section: 我的积分
           CreditBalanceCard 二态渲染（credits / free）按 creditsStore.displayState；
           BoosterPurchaseCard 三态交互（credits / trial / free）按同一 displayState。
           余额数据由 creditsStore.fetchBalance()（onMounted 触发）填充。 -->
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

    <!-- 加量包购买弹窗（含 1/5/10 快捷选份 + 自定义数量；membership-credits-redesign） -->
    <BoosterPurchaseDialog
      v-model:open="purchaseDialogOpen"
      :user-id="currentUserId"
      @success="handleBoosterPaid"
    />

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
import BoosterPurchaseDialog from '@/components/BoosterPurchaseDialog.vue'

const router = useRouter()
const userStore = useUserStore()
const creditsStore = useCreditsStore()
const notifications = useNotificationsStore()

// Raw data from API
const userData = ref<Record<string, any>>({})
const loading = ref(true)

// Confirm dialog
const confirmVisible = ref(false)

// 加量包购买弹窗（BoosterPurchaseCard 点击 → 打开多份数购买 Dialog）
const purchaseDialogOpen = ref(false)

// 受益人 user_id（自购场景 = 当前登录用户）。Dialog 要求 number 类型，缺失时降级 0。
const currentUserId = computed((): number => {
  const id = userStore.userInfo?.id
  return typeof id === 'number' ? id : parseInt(String(id ?? '0'), 10)
})

// 会员状态：'free' / 'trial' / 'pro' — 数据源 credits store 的 BalanceDTO.membership_state
const tier = computed(() => creditsStore.displayState)

const tierLabel = computed(() => {
  const t = tier.value
  if (t === 'pro') return 'Pro 会员'
  if (t === 'trial') return '体验会员'
  return 'Free'
})

// Computed: profile
const displayName = computed(() => userData.value.nickname || userStore.nickname || '加载中..')
const displayId = computed(
  () => userData.value.id || userData.value.user_id || userStore.userInfo?.id || '--'
)

// Computed: expiry — 数据源 credits store（pro 会员看 sub_expires_at；trial 看 trial_expires_at）
const expiryText = computed(() => {
  const t = tier.value
  const iso =
    t === 'pro' ? creditsStore.proExpiresAt : t === 'trial' ? creditsStore.trialExpiresAt : null
  if (!iso) return '—'
  const d = new Date(iso)
  if (d.getFullYear() > 2090) return '永久有效'
  return d.toLocaleDateString('zh-CN')
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
 * 打开 BoosterPurchaseDialog，让用户选份数（1/5/10/自定义）后下单 + 轮询。
 */
function handleBoosterPurchase(): void {
  purchaseDialogOpen.value = true
}

/**
 * BoosterPurchaseDialog 支付成功回调。
 *
 * 后端回调已确认支付成功，前端仅需刷新余额 + 通知用户。
 * 用 finally 确保即使 fetchBalance 失败（网络抖动等），成功 toast 依然显示，
 * 用户可手动刷新页面获取最新余额，避免"钱扣了但看不到积分"的困惑。
 *
 * 文案故意不写具体积分数：多份购买时积分 = 600 × quantity，
 * Dialog 不通过 emit 透出 quantity，因此用通用文案；用户可在卡片余额处自查。
 */
async function handleBoosterPaid(): Promise<void> {
  try {
    await creditsStore.fetchBalance()
  } catch (err) {
    // 余额刷新失败不影响扣费（后端已确认），但界面积分会暂不一致，记录便于排查
    console.warn('[handleBoosterPaid] fetchBalance failed, balance may be stale:', err)
  } finally {
    notifications.success('加量包购买成功！积分已到账，有效期 90 天')
  }
}

onMounted(() => {
  void fetchData()
  // 拉 BalanceDTO（trial_remaining / cycle_remaining / booster_total / membership_state）
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

.settings-page[data-tier='pro'] .badge-tier {
  background: #ecfdf5;
  color: #059669;
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
