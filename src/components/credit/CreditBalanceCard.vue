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
 * 状态判定（spec §4.2.4，按优先级）：
 *   1. user.tier === 'free'                                → 'free'   联系管理员提示
 *   2. balance.billing_mode === 'legacy_tier'              → 'legacy' 次数用量
 *   3. 其它（credits 新制 / trial 走新制）                  → 'credits' 双档
 *
 * 跨 store：user.tier 来自 `useUserStore`，balance 来自 `useCreditsStore`。
 * 采用 `userInfo.user_tier` 字段（项目既存约定，见 SettingsView.vue），不要求
 * user store 暴露 `tier` getter——避免触碰 Phase 0 冻结外的文件。
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

/** 三态 — 优先级顺序见 jsdoc。 */
const cardState = computed<'free' | 'legacy' | 'credits'>(() => {
  if (tier.value === 'free') return 'free'
  if (balance.value?.billing_mode === 'legacy_tier') return 'legacy'
  return 'credits'
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
