<!--
  CreditsView — 积分余额页（三卡片布局）

  布局：
    Card 1: 会员状态（MembershipBadge + 到期文案）
    Card 2: 余额三栏（试用积分 / 本月配额 / 加量包）
    Card 3: 购买加量包入口（仅会员可用）

  4 状态处理：loading / error / success
  Booster 冻结：锁图标 + 灰色文案 + 提示

  Plan §Task 18 / Spec §8.1
-->
<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { useCreditsStore } from '@/stores/credits'
import { useUserStore } from '@/stores/user'
import { formatDate } from '@/utils/datetime'
import MembershipBadge from '@/components/MembershipBadge.vue'
import BoosterPurchaseDialog from '@/components/BoosterPurchaseDialog.vue'

const credits = useCreditsStore()
const user = useUserStore()
const purchaseOpen = ref(false)

onMounted(() => credits.fetchBalance())

/** 当前用户 id（number），供 BoosterPurchaseDialog userId prop */
const currentUserId = computed((): number => {
  const id = user.userInfo?.id
  return typeof id === 'number' ? id : parseInt(String(id ?? '0'), 10)
})

/** 到期文案 */
function expireText(state: string): string {
  if (state === 'trial' && credits.trialExpiresAt) {
    return `${formatDate(credits.trialExpiresAt)} 到期`
  }
  if (state === 'pro' && credits.proExpiresAt) {
    return `${formatDate(credits.proExpiresAt)} 到期`
  }
  return ''
}

/** displayState 限制在 Badge 支持的三种枚举 */
const badgeState = computed((): 'free' | 'trial' | 'pro' => {
  const s = credits.displayState
  if (s === 'trial' || s === 'pro') return s
  return 'free'
})
</script>

<template>
  <div class="credits-view">
    <!-- loading: 3 skeleton cards -->
    <template v-if="credits.loading">
      <div
        v-for="i in 3"
        :key="i"
        class="card skeleton"
        data-test="skeleton-card"
        aria-busy="true"
      />
    </template>

    <!-- error state -->
    <div v-else-if="credits.error" class="error-state" data-test="error-state">
      <p class="error-message">{{ credits.error }}</p>
      <button class="retry-btn" @click="credits.fetchBalance()">重试</button>
    </div>

    <!-- success: 3 cards -->
    <template v-else-if="credits.balance">
      <!-- Card 1: 会员状态 -->
      <section class="card membership-card" data-test="membership-card">
        <MembershipBadge :state="badgeState" />
        <p v-if="expireText(credits.displayState)" class="expire-text">
          {{ expireText(credits.displayState) }}
        </p>
      </section>

      <!-- Card 2: 余额三栏 -->
      <section class="card balance-card" data-test="balance-card">
        <div class="balance-grid">
          <!-- 试用积分 -->
          <div class="balance-item" data-test="trial-col">
            <h4 class="balance-label">试用积分</h4>
            <p class="balance-value">{{ (credits.balance as any).trial_remaining ?? 0 }}</p>
          </div>

          <!-- 本月配额 -->
          <div class="balance-item" data-test="cycle-col">
            <h4 class="balance-label">本月配额</h4>
            <p class="balance-value">{{ (credits.balance as any).cycle_remaining ?? 0 }}</p>
          </div>

          <!-- 加量包 -->
          <div
            class="balance-item"
            :class="{ frozen: credits.isBoosterFrozen }"
            data-test="booster-col"
          >
            <h4 class="balance-label">加量包</h4>
            <p
              v-if="credits.isBoosterFrozen"
              class="balance-value locked"
              data-test="booster-locked"
            >
              <i data-test="booster-locked-icon" class="icon-lock" aria-label="已锁定"></i>
              {{ (credits.balance as any).booster_total ?? 0 }}
            </p>
            <p v-else class="balance-value">
              {{ (credits.balance as any).booster_usable ?? 0 }}
            </p>
            <p v-if="credits.isBoosterFrozen" class="freeze-hint" data-test="freeze-hint">
              需要开通会员后才能使用
            </p>
          </div>
        </div>
      </section>

      <!-- Card 3: 购买加量包 -->
      <section class="card purchase-card" data-test="purchase-card">
        <button
          class="purchase-btn"
          :disabled="!credits.isMember"
          data-test="purchase-btn"
          @click="purchaseOpen = true"
        >
          购买加量包
        </button>
        <p v-if="!credits.isMember" class="hint" data-test="purchase-hint">
          开通会员后可购买加量包
        </p>
      </section>

      <BoosterPurchaseDialog
        v-model:open="purchaseOpen"
        :user-id="currentUserId"
        @success="credits.fetchBalance()"
      />
    </template>
  </div>
</template>

<style scoped>
.credits-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  max-width: 480px;
  margin: 0 auto;
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */
.skeleton {
  height: 100px;
  background: linear-gradient(
    90deg,
    var(--color-surface-muted, #f4f4f5) 25%,
    var(--color-surface-hover, #e4e4e7) 50%,
    var(--color-surface-muted, #f4f4f5) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 12px;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* ── Base card ──────────────────────────────────────────────────────────── */
.card {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e4e4e7);
  border-radius: 12px;
  padding: 20px;
}

/* ── Error state ────────────────────────────────────────────────────────── */
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
}

.error-message {
  color: var(--color-danger, #dc2626);
  font-size: 14px;
  text-align: center;
}

.retry-btn {
  padding: 8px 20px;
  border-radius: 8px;
  border: 1px solid var(--color-border, #e4e4e7);
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s;
}

.retry-btn:hover {
  background: var(--color-surface-hover, #f4f4f5);
}

/* ── Membership card ────────────────────────────────────────────────────── */
.membership-card {
  display: flex;
  align-items: center;
  gap: 12px;
}

.expire-text {
  font-size: 13px;
  color: var(--color-text-secondary, #71717a);
  margin: 0;
}

/* ── Balance card ───────────────────────────────────────────────────────── */
.balance-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.balance-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.balance-item.frozen .balance-value,
.balance-item.frozen .balance-label {
  color: var(--color-text-disabled, #a1a1aa);
}

.balance-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary, #71717a);
  margin: 0;
}

.balance-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary, #18181b);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.balance-value.locked {
  color: var(--color-text-disabled, #a1a1aa);
}

.icon-lock::before {
  content: '🔒';
  font-size: 16px;
  font-style: normal;
}

.freeze-hint {
  font-size: 11px;
  color: var(--color-text-disabled, #a1a1aa);
  margin: 0;
  line-height: 1.4;
}

/* ── Purchase card ──────────────────────────────────────────────────────── */
.purchase-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.purchase-btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary, #2563eb);
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition:
    opacity 0.15s,
    background 0.15s;
}

.purchase-btn:hover:not(:disabled) {
  background: var(--color-primary-hover, #1d4ed8);
}

.purchase-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.hint {
  font-size: 12px;
  color: var(--color-text-secondary, #71717a);
  margin: 0;
}
</style>
