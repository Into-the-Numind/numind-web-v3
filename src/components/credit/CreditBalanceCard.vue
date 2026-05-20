<template>
  <div class="credit-balance-card" :data-state="cardState">
    <!-- credits 模式：试用 + 会员 + 加量包 三档 -->
    <template v-if="cardState === 'credits'">
      <div v-if="trialRemaining > 0" class="credit-row trial">
        <span class="label">试用积分</span>
        <span class="value">
          <strong>{{ trialRemaining }}</strong>
        </span>
        <span v-if="trialExpiresAtStr" class="sublabel">
          {{ formatDate(trialExpiresAtStr) }} 过期
        </span>
      </div>
      <div v-if="showCycleRow" class="credit-row subscription">
        <span class="label">会员积分</span>
        <span class="value">
          <strong>{{ cycleRemaining }}</strong>
        </span>
        <span v-if="subExpiresAtStr" class="sublabel">
          {{ formatDate(subExpiresAtStr) }} 过期
        </span>
      </div>
      <div v-if="boosterTotal > 0" class="credit-row booster">
        <span class="label">加量包</span>
        <span class="value">
          <strong>{{ boosterTotal }}</strong>
          <span class="suffix"> 积分</span>
        </span>
        <span v-if="isBoosterFrozen" class="sublabel sublabel-warn"> 需开通会员后可用 </span>
      </div>
    </template>

    <!-- free：无任何积分 → B2B2C 模式，子账户联系父账户管理员开通 -->
    <template v-else>
      <p class="upgrade-hint">成为会员解锁 AI 能力</p>
      <p class="contact-admin">请联系您的管理员开通会员</p>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * CreditBalanceCard — 二态余额展示
 *
 * 数据源：credits store 的 BalanceDTO（GET /v1/credits/balance）
 *   - trial_remaining / cycle_remaining：积分余额
 *   - booster_total：加量包剩余积分（注：后端字段名 total 但语义=remaining）
 *   - booster_usable：加量包可用积分（冻结时=0）
 *   - membership_state：会员状态 'free' / 'trial' / 'pro'
 *
 * 二态判定：
 *   1. 任一池非零（trial / cycle / booster）或会员状态 != free → 'credits'
 *   2. 其它 → 'free'（B2B2C 提示联系管理员）
 *
 * 加量包显示单数字「N 积分」（后端只暴露剩余值无累计购买总额，分子/分母分式
 * 会让前端永远显示 0/N，已废弃）。冻结时增加 sublabel 提示而非数字归零，
 * 让用户清楚知道额度仍在只是暂不可用。
 */
import { computed } from 'vue'
import { useCreditsStore } from '@/stores/credits'

const credits = useCreditsStore()

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
const isBoosterFrozen = computed((): boolean => credits.isBoosterFrozen)
const displayState = computed(() => credits.displayState)

const showCycleRow = computed(
  (): boolean => displayState.value === 'pro' || cycleRemaining.value > 0
)

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

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
</script>

<style scoped>
.credit-balance-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md, 12px);
  padding: var(--space-lg, 16px);
  background: #fff;
  border: 1px solid var(--border, #e8e9ee);
  border-radius: var(--radius-md, 12px);
}

.credit-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.label {
  font-size: 12px;
  color: var(--text-secondary, #6b7085);
}

.value {
  font-size: 20px;
  font-weight: 600;
  color: var(--text, #1a1d26);
}

.value strong {
  font-weight: 700;
}

.value .suffix {
  font-weight: 400;
  font-size: 14px;
  color: var(--text-secondary, #6b7085);
  margin-left: 2px;
}

.sublabel {
  font-size: 11px;
  color: var(--text-tertiary, #9ea1b1);
}

.sublabel-warn {
  color: #d97706;
}

.upgrade-hint {
  font-size: 14px;
  color: var(--text-secondary, #6b7085);
  margin: 0 0 var(--space-xs, 4px);
}

.contact-admin {
  font-size: 13px;
  color: var(--text-tertiary, #9ea1b1);
  margin: 0;
}
</style>
