<template>
  <div class="credit-balance-card" :data-state="cardState">
    <!-- credits 模式：订阅 + 加量包双档 -->
    <template v-if="cardState === 'credits'">
      <div class="credit-row subscription">
        <span class="label">会员积分</span>
        <span class="value">
          <strong>{{ balance?.sub_remain ?? 0 }}</strong>
          <span class="total"> / {{ balance?.sub_total ?? 0 }}</span>
        </span>
        <span v-if="balance?.sub_expires_at" class="sublabel">
          {{ formatMonthEnd(balance.sub_expires_at) }} 过期
        </span>
      </div>
      <div v-if="(balance?.booster_total ?? 0) > 0" class="credit-row booster">
        <span class="label">加量包</span>
        <span class="value">
          <strong>{{ balance?.booster_remain ?? 0 }}</strong>
          <span class="total"> / {{ balance?.booster_total ?? 0 }}</span>
        </span>
        <span v-if="balance?.booster_earliest_expires_at" class="sublabel">
          最早 {{ formatDate(balance.booster_earliest_expires_at) }} 过期
        </span>
      </div>
    </template>

    <!-- legacy_tier：grandfathering 老会员 -->
    <template v-else-if="cardState === 'legacy'">
      <div class="credit-row legacy">
        <span class="label">本月运行次数</span>
        <span v-if="balance?.monthly_limit === null" class="value">
          <strong>无限</strong>
        </span>
        <span v-else class="value">
          已用 <strong>{{ legacyUsed }}</strong> / {{ balance?.monthly_limit ?? 0 }}
        </span>
      </div>
    </template>

    <!-- free：未购买过任何付费 → B2B2C 模式，子账户联系父账户管理员开通 -->
    <template v-else>
      <p class="upgrade-hint">成为会员解锁 AI 能力</p>
      <p class="contact-admin">请联系您的管理员开通会员</p>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * CreditBalanceCard — 三态余额展示（credits-system Track E.2，Q2 改造）
 *
 * 状态判定（按优先级）：
 *   1. billing_mode === 'credits' 且有积分包 → 'credits' 双档
 *   2. billing_mode === 'legacy_tier'        → 'legacy'  次数用量
 *   3. user_tier !== 'free'（兼容）          → 'credits'
 *   4. 其它                                  → 'free'    联系管理员提示
 *
 * 注意：credits 制下 user_tier 始终为 'free'（该字段属于 legacy 体系），
 * 因此必须优先检查 billing_mode，不能以 user_tier 作为首要判据。
 *
 * Q2 变更：C 端不能自购会员（B2B2C 模式）。free state 移除"升级会员"CTA，
 * 仅展示"请联系您的管理员开通会员"静态文案。父账户（parent user）在
 * 客户管理 / 子账户会员管理视图中帮子账户开通。
 */
import { computed } from 'vue'
import { useUserStore } from '@/stores/user'
import { useCreditsStore } from '@/stores/credits'

const user = useUserStore()
const credits = useCreditsStore()

const balance = computed(() => credits.balance)

/** 从 userInfo 读 tier（'free' | 'trial' | 'standard' | 'premium'）。 */
const tier = computed(() => {
  const info = user.userInfo as Record<string, unknown> | null
  const raw = (info?.user_tier ?? info?.tier ?? info?.plan ?? 'free') as string
  return String(raw).toLowerCase()
})

/**
 * 三态判定（修正优先级）：
 *   1. billing_mode === 'credits' 且有活跃订阅（sub_total > 0）→ 'credits'
 *   2. billing_mode === 'legacy_tier'                           → 'legacy'
 *   3. 其它（free，无订阅）                                      → 'free'
 *
 * 旧逻辑先看 user_tier，但 credits 制下 user_tier 始终为 'free'，
 * 导致已购会员的 credits 用户被误判为 free。
 */
const cardState = computed<'free' | 'legacy' | 'credits'>(() => {
  if (
    balance.value?.billing_mode === 'credits' &&
    (balance.value.sub_total > 0 || balance.value.booster_total > 0)
  )
    return 'credits'
  if (balance.value?.billing_mode === 'legacy_tier') return 'legacy'
  if (tier.value !== 'free') return 'credits' // legacy tier 未标记 billing_mode 的兼容
  return 'free'
})

const legacyUsed = computed(() => {
  const limit = balance.value?.monthly_limit ?? 0
  const remain = balance.value?.remaining_runs ?? 0
  return Math.max(limit - remain, 0)
})

function formatMonthEnd(iso: string): string {
  try {
    const d = new Date(iso)
    return `${d.getMonth() + 1}月底`
  } catch {
    return iso
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${m}-${day}`
  } catch {
    return iso
  }
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

.value .total {
  font-weight: 400;
  font-size: 14px;
  color: var(--text-secondary, #6b7085);
}

.sublabel {
  font-size: 11px;
  color: var(--text-tertiary, #9ea1b1);
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
