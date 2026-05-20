<template>
  <div class="credit-balance-card" :data-state="cardState">
    <!-- credits 模式：仪表盘风（progress bar + tabular nums）-->
    <template v-if="cardState === 'credits'">
      <div class="head">
        <div class="title">我的积分</div>
        <div v-if="totalAvailable > 0" class="total">
          可用 <strong>{{ formatNum(totalAvailable) }}</strong>
        </div>
      </div>

      <!-- 试用积分 / 会员积分 二选一同位置展示
           displayState='trial' → 试用；'pro' → 会员；'free' → 看哪个有残留余额 -->
      <div v-if="showCycleRow" class="pool">
        <div class="pool-top">
          <span class="pool-label">会员积分</span>
          <span class="pool-val">
            {{ formatNum(cycleRemaining) }}
            <span class="pool-denom">/ {{ formatNum(SUBSCRIPTION_GRANT_MONTHLY) }}</span>
          </span>
        </div>
        <div class="bar"><div class="bar-fill" :style="{ width: cyclePct + '%' }"></div></div>
        <div class="pool-meta">
          <span v-if="cycleEndStr">{{ formatDate(cycleEndStr) }} 当期重置</span>
          <span v-else-if="subExpiresAtStr">{{ formatDate(subExpiresAtStr) }} 会员到期</span>
          <span v-if="cycleDaysLeft !== null" class="pool-meta-right"
            >剩 {{ cycleDaysLeft }} 天</span
          >
        </div>
      </div>
      <div v-else-if="showTrialRow" class="pool">
        <div class="pool-top">
          <span class="pool-label">试用积分</span>
          <span class="pool-val">
            {{ formatNum(trialRemaining) }}
            <span class="pool-denom">/ {{ formatNum(TRIAL_GRANT) }}</span>
          </span>
        </div>
        <div class="bar"><div class="bar-fill trial" :style="{ width: trialPct + '%' }"></div></div>
        <div class="pool-meta">
          <span v-if="trialExpiresAtStr">{{ formatDate(trialExpiresAtStr) }} 过期</span>
          <span v-if="trialDaysLeft !== null" class="pool-meta-right"
            >剩 {{ trialDaysLeft }} 天</span
          >
        </div>
      </div>

      <div v-if="boosterTotal > 0" class="pool" :class="{ frozen: isBoosterFrozen }">
        <div class="pool-top">
          <span class="pool-label">加量包</span>
          <span class="pool-val">
            {{ formatNum(boosterTotal) }}
            <span class="pool-denom">积分</span>
          </span>
        </div>
        <div class="bar"><div class="bar-fill booster"></div></div>
        <div class="pool-meta">
          <span v-if="isBoosterFrozen" class="warn">需开通会员后可用</span>
          <span v-else-if="boosterEarliestExpires">
            最早 {{ formatDate(boosterEarliestExpires) }} 过期
          </span>
          <span v-else>累加余额，不清零</span>
        </div>
      </div>
    </template>

    <!-- free：B2B2C 子账户路径 -->
    <template v-else>
      <div class="free-head">成为会员解锁 AI 能力</div>
      <p class="free-sub">请联系您的管理员开通会员</p>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * CreditBalanceCard — 仪表盘风余额展示（settings-credits-cards-redesign）
 *
 * 数据源：credits store 的 BalanceDTO（GET /v1/credits/balance）
 *   - trial_remaining / cycle_remaining / booster_total / booster_usable
 *   - trial_expires_at / sub_expires_at / cycle_end / booster_earliest_expires_at
 *   - membership_state：'free' / 'trial' / 'pro'
 *
 * 二态：
 *   1. 任一池非零 或 会员状态 != free → 'credits'（progress-bar 仪表盘）
 *   2. 其它 → 'free'（B2B2C 提示联系管理员）
 *
 * Progress 分母（每月固定 grant 额度）按 CLAUDE.md §1 credit_package 表，
 * 与后端 grant 逻辑保持同步：trial=200/3 天，subscription=2000/月。
 */
import { computed } from 'vue'
import { useCreditsStore } from '@/stores/credits'

const credits = useCreditsStore()

const TRIAL_GRANT = 200
const SUBSCRIPTION_GRANT_MONTHLY = 2000

const balance = computed(() => credits.balance as unknown as Record<string, unknown> | null)

function readNumber(key: string): number {
  const v = balance.value?.[key]
  return typeof v === 'number' ? v : 0
}
function readString(key: string): string {
  const v = balance.value?.[key]
  return typeof v === 'string' ? v : ''
}

const trialRemaining = computed((): number => readNumber('trial_remaining'))
const cycleRemaining = computed((): number => readNumber('cycle_remaining'))
const boosterTotal = computed((): number => readNumber('booster_total'))
const trialExpiresAtStr = computed((): string => readString('trial_expires_at'))
const subExpiresAtStr = computed((): string => readString('sub_expires_at'))
const cycleEndStr = computed((): string => readString('cycle_end'))
const boosterEarliestExpires = computed((): string => readString('booster_earliest_expires_at'))
const isBoosterFrozen = computed((): boolean => credits.isBoosterFrozen)
const displayState = computed(() => credits.displayState)

// 试用 / 会员 互斥展示规则：
//   pro → 会员行；trial → 试用行；free → 看哪个有残留余额（cycle 优先）
const showCycleRow = computed((): boolean => {
  if (displayState.value === 'pro') return true
  if (displayState.value === 'trial') return false
  return cycleRemaining.value > 0
})
const showTrialRow = computed((): boolean => {
  if (showCycleRow.value) return false
  return displayState.value === 'trial' || trialRemaining.value > 0
})

const cardState = computed<'free' | 'credits'>(() => {
  if (
    trialRemaining.value > 0 ||
    cycleRemaining.value > 0 ||
    boosterTotal.value > 0 ||
    displayState.value !== 'free'
  )
    return 'credits'
  return 'free'
})

const totalAvailable = computed((): number => {
  const booster = isBoosterFrozen.value ? 0 : boosterTotal.value
  return trialRemaining.value + cycleRemaining.value + booster
})

const trialPct = computed(() => clampPct((trialRemaining.value / TRIAL_GRANT) * 100))
const cyclePct = computed(() => clampPct((cycleRemaining.value / SUBSCRIPTION_GRANT_MONTHLY) * 100))

const trialDaysLeft = computed((): number | null => daysUntil(trialExpiresAtStr.value))
const cycleDaysLeft = computed((): number | null => {
  return daysUntil(cycleEndStr.value || subExpiresAtStr.value)
})

function clampPct(n: number): number {
  if (!isFinite(n) || n < 0) return 0
  if (n > 100) return 100
  return Math.round(n * 10) / 10
}

function daysUntil(iso: string): number | null {
  if (!iso) return null
  const target = new Date(iso).getTime()
  if (isNaN(target)) return null
  const ms = target - Date.now()
  if (ms <= 0) return 0
  return Math.ceil(ms / 86_400_000)
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const y = d.getFullYear()
  if (y > 2090) return '永久'
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatNum(n: number): string {
  return n.toLocaleString('en-US')
}
</script>

<style scoped>
.credit-balance-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px 20px 18px;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e2e4ea);
  border-radius: var(--radius-md, 12px);
  box-shadow: var(--shadow-card, 0 1px 4px rgba(0, 0, 0, 0.04), 0 0 1px rgba(0, 0, 0, 0.06));
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text, #1a1d26);
  letter-spacing: -0.005em;
}

.total {
  font-size: 12px;
  color: var(--text-secondary, #5f6577);
  font-variant-numeric: tabular-nums;
}

.total strong {
  color: var(--text, #1a1d26);
  font-weight: 600;
  margin-left: 2px;
}

.pool {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pool-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.pool-label {
  font-size: 12px;
  color: var(--text-secondary, #5f6577);
  letter-spacing: 0.02em;
}

.pool-val {
  font-size: 15px;
  font-weight: 600;
  color: var(--text, #1a1d26);
  font-variant-numeric: tabular-nums;
}

.pool-denom {
  color: var(--text-muted, #8b90a0);
  font-weight: 400;
  font-size: 13px;
  margin-left: 2px;
}

.bar {
  height: 4px;
  border-radius: 4px;
  background: var(--surface-tint, #f9fafb);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background: var(--primary, hsl(160, 72%, 40%));
  border-radius: 4px;
  transition: width 350ms ease;
}

.bar-fill.trial {
  background: hsl(160, 50%, 60%);
}

/* booster：横纹纹理表达"累计余额"而非"消耗进度"，与 trial/cycle 区分 */
.bar-fill.booster {
  width: 100%;
  background: repeating-linear-gradient(
    45deg,
    hsl(160, 72%, 40%) 0 6px,
    hsl(160, 60%, 50%) 6px 12px
  );
}

.pool.frozen .bar-fill {
  background: var(--text-muted, #8b90a0);
}

.pool-meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 11px;
  color: var(--text-muted, #8b90a0);
}

.pool-meta-right {
  color: var(--text-secondary, #5f6577);
}

.pool-meta .warn {
  /* TODO(admin-rebrand): replace with --warn token when added */
  color: #c68a0e;
}

/* free 状态：B2B2C 子账户提示 */
.free-head {
  font-size: 16px;
  font-weight: 600;
  color: var(--text, #1a1d26);
  letter-spacing: -0.005em;
  margin: 0;
}

.free-sub {
  font-size: 13px;
  color: var(--text-secondary, #5f6577);
  margin: 0;
  line-height: 1.5;
}
</style>
