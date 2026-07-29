<template>
  <MainLayout>
    <div class="settings-page">
      <!-- Page Header -->
      <div class="page-header">
        <h1 class="page-title">设置</h1>
      </div>

      <!-- Section: 积分与加量包
           CreditBalanceCard 二态渲染（credits / free）按 creditsStore.displayState；
           BoosterPurchaseCard 三态交互（credits / trial / free）按同一 displayState。
           余额数据由 creditsStore.fetchBalance()（onMounted 触发）填充。 -->
      <div class="settings-section">
        <div class="section-header">
          <div class="section-label">积分与加量包</div>
          <button type="button" class="section-action" @click="logOpen = true">
            积分消耗记录
            <svg
              width="14"
              height="14"
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
            <div class="row-label">用户 ID</div>
            <div class="row-value row-value-mono">{{ displayId }}</div>
          </div>
          <!-- nickname-edit：昵称展示 + 「修改」按钮触发弹窗编辑；所有账户可用 -->
          <div class="settings-row">
            <div class="row-label">昵称</div>
            <div class="row-value nickname-display-cell">
              <span class="nickname-display-value">{{ displayName }}</span>
              <button type="button" class="nickname-edit-btn" @click="openNicknameEdit">
                修改
              </button>
            </div>
          </div>
          <!-- org-branding：公司名称仅展示 + 「修改」按钮触发弹窗编辑；仅父账户可见，子账户继承父名无此项 -->
          <div v-if="userStore.isParentUser" class="settings-row">
            <div class="row-label">公司名称</div>
            <div class="row-value company-display-cell">
              <span class="company-display-value" :class="{ 'is-empty': !companyName }">
                {{ companyName || '有数AI' }}
              </span>
              <button type="button" class="row-edit-btn" @click="openCompanyEdit">修改</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Section: 账号连接
           FeishuConnection 只展示飞书状态；授权/重新授权必须从 Agent 任务中触发。 -->
      <div class="settings-section">
        <div class="section-label">账号连接</div>
        <FeishuConnection />
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
    <CreditConsumptionLogModal v-model:open="logOpen" />

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

    <!-- org-branding：公司名称编辑弹窗（点「修改」触发，确认/取消） -->
    <Teleport to="body">
      <div v-if="companyEditVisible" class="confirm-overlay" @click.self="closeCompanyEdit">
        <div class="confirm-dialog">
          <div class="confirm-title">修改公司名称</div>
          <input
            ref="companyEditFieldRef"
            v-model="companyEditInput"
            class="company-edit-input"
            type="text"
            maxlength="10"
            :disabled="savingCompany"
            @compositionstart="imeComposing = true"
            @compositionend="imeComposing = false"
            @keydown.enter="onEnterKey"
          />
          <div class="company-edit-counter">{{ companyEditInput.length }}/10</div>
          <div class="confirm-actions">
            <button class="confirm-btn-cancel" :disabled="savingCompany" @click="closeCompanyEdit">
              取消
            </button>
            <button class="confirm-btn-save" :disabled="savingCompany" @click="confirmCompanyEdit">
              {{ savingCompany ? '保存中…' : '确认' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- nickname-edit：昵称编辑弹窗（点「修改」触发，确认/取消；所有账户可用） -->
    <Teleport to="body">
      <div v-if="nicknameEditVisible" class="confirm-overlay" @click.self="closeNicknameEdit">
        <div class="confirm-dialog">
          <div class="confirm-title">修改昵称</div>
          <input
            ref="nicknameEditFieldRef"
            v-model="nicknameEditInput"
            class="nickname-edit-input"
            type="text"
            :maxlength="NICKNAME_MAX"
            :disabled="savingNickname"
            @compositionstart="nicknameImeComposing = true"
            @compositionend="nicknameImeComposing = false"
            @keydown.enter="onNicknameEnterKey"
          />
          <div class="nickname-edit-counter">{{ nicknameEditInput.length }}/{{ NICKNAME_MAX }}</div>
          <div class="confirm-actions">
            <button
              class="confirm-btn-cancel"
              :disabled="savingNickname"
              @click="closeNicknameEdit"
            >
              取消
            </button>
            <button
              class="confirm-btn-save"
              :disabled="savingNickname"
              @click="confirmNicknameEdit"
            >
              {{ savingNickname ? '保存中…' : '确认' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useCreditsStore } from '@/stores/credits'
import { useNotificationsStore } from '@/stores/notifications'
import { getUserInfo, updateProfile } from '@/api/auth'
import MainLayout from '@/components/layout/MainLayout.vue'
import CreditBalanceCard from '@/components/credit/CreditBalanceCard.vue'
import BoosterPurchaseCard from '@/components/credit/BoosterPurchaseCard.vue'
import BoosterPurchaseDialog from '@/components/BoosterPurchaseDialog.vue'
import CreditConsumptionLogModal from '@/components/credit/CreditConsumptionLogModal.vue'
import FeishuConnection from '@/components/feishu/FeishuConnection.vue'

const router = useRouter()
const userStore = useUserStore()
const creditsStore = useCreditsStore()
const notifications = useNotificationsStore()

// Raw data from API
const userData = ref<Record<string, any>>({})
const loading = ref(true)

// org-branding：公司名称展示态 + 弹窗编辑态（仅父账户）
const companyName = ref('') // 当前已保存的公司名（空=未设置）
const companyEditVisible = ref(false) // 编辑弹窗开关
const companyEditInput = ref('') // 弹窗内输入缓冲
const companyEditFieldRef = ref<HTMLInputElement | null>(null)
const savingCompany = ref(false)
const imeComposing = ref(false) // 中文输入法组合中（用于回车守卫）
const COMPANY_NAME_MAX = 10 // 公司名字符上限

// nickname-edit：昵称展示态 + 弹窗编辑态（所有账户可用，与公司名弹窗独立）
const savedNickname = ref('') // 当前已保存的昵称（空=未设置，展示回退到用户名）
const nicknameEditVisible = ref(false) // 编辑弹窗开关
const nicknameEditInput = ref('') // 弹窗内输入缓冲
const nicknameEditFieldRef = ref<HTMLInputElement | null>(null)
const savingNickname = ref(false)
const nicknameImeComposing = ref(false) // 中文输入法组合中（回车守卫）
const NICKNAME_MAX = 10 // 昵称字符上限

// Confirm dialog
const confirmVisible = ref(false)

// 加量包购买弹窗（BoosterPurchaseCard 点击 → 打开多份数购买 Dialog）
const purchaseDialogOpen = ref(false)

// 积分消耗记录弹窗
const logOpen = ref(false)

// 受益人 user_id（自购场景 = 当前登录用户）。Dialog 要求 number 类型，缺失时降级 0。
const currentUserId = computed((): number => {
  const id = userStore.userInfo?.id
  return typeof id === 'number' ? id : parseInt(String(id ?? '0'), 10)
})

// Computed: profile
const displayName = computed(() => savedNickname.value || userStore.nickname || '加载中..')
const displayId = computed(
  () => userData.value.id || userData.value.user_id || userStore.userInfo?.id || '--'
)

// Fetch user data
const fetchData = async () => {
  loading.value = true
  try {
    const res = await getUserInfo()
    if (res.code === 200 || res.code === 0) {
      userData.value = res.data || {}
      // org-branding：初始化展示用公司名（父账户用自己的值）
      companyName.value = (userData.value.company_name || '').trim()
      // nickname-edit：初始化展示用昵称（空则展示回退到用户名）
      savedNickname.value = (userData.value.nickname || '').trim()
    }
  } catch (error) {
    console.error('获取用户信息失败:', error)
  } finally {
    loading.value = false
  }
}

// org-branding：打开编辑弹窗（用当前值预填，自动聚焦输入框）
const openCompanyEdit = () => {
  companyEditInput.value = companyName.value
  companyEditVisible.value = true
  void nextTick(() => companyEditFieldRef.value?.focus())
}

// 关闭弹窗（保存中禁止关闭，避免半途态）
const closeCompanyEdit = () => {
  if (savingCompany.value) return
  companyEditVisible.value = false
}

// 回车确认：中文输入法组合期间的回车用于选词/确认候选，不能当作"确定"提交。
// 用 keydown（keyup 时机晚于组合结束，守不住）+ isComposing / keyCode 229 多重守卫。
const onEnterKey = (e: KeyboardEvent) => {
  if (imeComposing.value || e.isComposing || e.keyCode === 229) return
  void confirmCompanyEdit()
}

// 确认保存：trim + 校验 + 调接口 + 刷新侧边栏 + toast
const confirmCompanyEdit = async () => {
  if (savingCompany.value) return
  const next = companyEditInput.value.trim()
  // 无变化直接关闭，不发请求
  if (next === companyName.value) {
    companyEditVisible.value = false
    return
  }
  if (next.length > COMPANY_NAME_MAX) {
    notifications.error(`公司名称不能超过 ${COMPANY_NAME_MAX} 个字符`)
    return
  }
  savingCompany.value = true
  try {
    const res = await updateProfile({ company_name: next })
    if (res.code === 200 || res.code === 0) {
      // 刷新用户信息 → 左上角侧边栏品牌名同步更新
      await userStore.fetchUserInfo()
      // 以服务端回写的有效值为准（避免后端规范化导致漂移）
      const fresh = (userStore.userInfo?.company_name || '').trim()
      companyName.value = fresh
      companyEditVisible.value = false
      notifications.success(fresh ? '公司名称已更新' : '已清空公司名称，将显示"有数AI"')
    } else {
      notifications.error(res.message || res.msg || '保存失败')
    }
  } catch (err) {
    console.error('保存公司名称失败:', err)
    notifications.error(err instanceof Error ? err.message : '网络错误，请稍后重试')
  } finally {
    savingCompany.value = false
  }
}

// nickname-edit：打开昵称编辑弹窗（用当前值预填，自动聚焦输入框）
const openNicknameEdit = () => {
  nicknameEditInput.value = savedNickname.value
  nicknameEditVisible.value = true
  void nextTick(() => nicknameEditFieldRef.value?.focus())
}

// 关闭弹窗（保存中禁止关闭，避免半途态）
const closeNicknameEdit = () => {
  if (savingNickname.value) return
  nicknameEditVisible.value = false
}

// 回车确认：中文输入法组合期间的回车用于选词/确认候选，不当作"确定"提交。
// 守卫同公司名弹窗（keydown + isComposing / keyCode 229）。
const onNicknameEnterKey = (e: KeyboardEvent) => {
  if (nicknameImeComposing.value || e.isComposing || e.keyCode === 229) return
  void confirmNicknameEdit()
}

// 确认保存：trim + 必填/上限校验 + 调接口 + 刷新用户信息 + toast
const confirmNicknameEdit = async () => {
  if (savingNickname.value) return
  const next = nicknameEditInput.value.trim()
  // 无变化直接关闭，不发请求
  if (next === savedNickname.value) {
    nicknameEditVisible.value = false
    return
  }
  // 昵称必填（后端校验最小长度 1）
  if (next.length === 0) {
    notifications.error('昵称不能为空')
    return
  }
  if (next.length > NICKNAME_MAX) {
    notifications.error(`昵称不能超过 ${NICKNAME_MAX} 个字符`)
    return
  }
  savingNickname.value = true
  try {
    const res = await updateProfile({ nickname: next })
    if (res.code === 200 || res.code === 0) {
      // 刷新用户信息 → 侧边栏等处昵称同步更新
      await userStore.fetchUserInfo()
      // 以服务端回写的有效值为准（避免后端规范化导致漂移）
      const fresh = (userStore.userInfo?.nickname || '').trim()
      savedNickname.value = fresh || next
      nicknameEditVisible.value = false
      notifications.success('昵称已更新')
    } else {
      notifications.error(res.message || res.msg || '保存失败')
    }
  } catch (err) {
    console.error('保存昵称失败:', err)
    notifications.error(err instanceof Error ? err.message : '网络错误，请稍后重试')
  } finally {
    savingNickname.value = false
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

/* credits-system Phase 2: 两张 credit 卡片并排（宽屏）→ 纵排（窄屏）
   align-items: stretch 让两卡等高；
   余额卡的 .pools/.footer flex 布局 + 加量包卡的 .stub/.body flex:1 各占一半
   负责把多出的高度撑满，避免内部留白。 */
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

/* org-branding + nickname-edit：可编辑展示行（值 + 「修改」按钮，只展示不内联编辑）*/
.company-display-cell,
.nickname-display-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.company-display-value,
.nickname-display-value {
  font-size: 14px;
  font-weight: 500;
  color: #1a1d26;
}

/* 未设置时显示兜底"有数AI"，用更淡的灰提示这是默认值而非用户所设 */
.company-display-value.is-empty {
  color: #9ca0ad;
}

.row-edit-btn,
.nickname-edit-btn {
  appearance: none;
  border: 1px solid #e2e4ea;
  background: #ffffff;
  color: var(--color-primary);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  padding: 4px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.row-edit-btn:hover,
.nickname-edit-btn:hover {
  background: #f3faf7;
  border-color: var(--color-primary);
}

/* 编辑弹窗内的输入框（沿用 confirm-dialog 风格；company & nickname 弹窗共用）*/
.company-edit-input,
.nickname-edit-input {
  width: 100%;
  box-sizing: border-box;
  font-family: var(--font-sans);
  font-size: 15px;
  color: #1a1d26;
  border: 1px solid #e2e4ea;
  border-radius: 10px;
  padding: 10px 12px;
  background: #ffffff;
  outline: none;
  margin: 4px 0;
  transition: border-color 0.15s;
}

.company-edit-input:focus,
.nickname-edit-input:focus {
  border-color: var(--color-primary);
}

.company-edit-input:disabled,
.nickname-edit-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 弹窗内字符数计数（右对齐淡灰，提示 10 字上限；company & nickname 共用）*/
.company-edit-counter,
.nickname-edit-counter {
  font-size: 12px;
  color: #9ca0ad;
  text-align: right;
  margin: 6px 2px 20px;
  font-variant-numeric: tabular-nums;
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
.confirm-btn-ok,
.confirm-btn-save {
  padding: 8px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

/* org-branding：保存按钮（非销毁性操作，用品牌绿，区别于退出登录的红色 ok）*/
.confirm-btn-save {
  background: var(--color-primary);
  border: none;
  color: #fff;
}

.confirm-btn-save:hover {
  filter: brightness(0.94);
}

.confirm-btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.section-header .section-label {
  margin-bottom: 0; /* 头部已提供间距，避免 flex 子项 margin 叠加 + 基线偏移 */
}
.section-action {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: none;
  background: none;
  padding: 0;
  font-size: 13px;
  color: var(--color-primary, #2563eb);
  cursor: pointer;
}
.section-action:hover {
  opacity: 0.8;
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
