<template>
  <div
    class="booster-card"
    :class="{
      'is-disabled': cardState !== 'credits',
      'no-route': cardState !== 'credits'
    }"
    :data-state="cardState"
    @click="handleClick"
  >
    <div class="header">
      <div class="title">加量包</div>
      <div v-if="cardState === 'credits'" class="subtitle">为本月 SOP 运行扩充余量</div>
    </div>

    <div class="body">
      <div class="price-row">
        <span class="price-value">¥{{ price }}</span>
        <span class="price-unit">/ {{ credits }} 积分</span>
      </div>
      <ul v-if="cardState === 'credits'" class="perks">
        <li>立即生效，有效期 90 天</li>
      </ul>
    </div>

    <div v-if="cardState === 'credits'" class="footer">
      <span class="cta-label">立即购买</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * BoosterPurchaseCard — 3 状态加量包购买卡（credits-system Track E.4，Q2 改造）
 *
 * ## 三态交互矩阵
 *
 * | cardState  | 条件                                    | 点击行为              | CTA 文案             |
 * |------------|-----------------------------------------|-----------------------|----------------------|
 * | `credits`  | tier standard/premium 且有积分包        | 触发 purchase emit    | "立即购买"           |
 * | `free`     | tier=free                               | 无动作（禁用）        | "请联系管理员开通"   |
 * | `trial`    | tier=trial                              | 无动作（禁用）        | "请联系管理员开通"   |
 *
 * Q2 变更（B2B2C 模式）：C 端不能自购会员。free/trial 灰态点击从"跳转会员购买"
 * 改为"无动作 + 联系管理员提示"，与 CreditBalanceCard free state 保持一致。
 * 两种非 credits 状态统一 no-route，只有 credits 会员可点击触发购买（走 QR 扫码）。
 *
 * ## Emits
 *
 * - `purchase`：仅 credits 状态下点击触发，父组件接管订单流程
 *
 * Refs: spec §4.2.6, plan Track E.4, Q2 gap-fill (B2B2C 子账户不自购)
 */
import { computed } from 'vue'
import { useUserStore } from '@/stores/user'
import { useCreditsStore } from '@/stores/credits'

interface Props {
  /** 单价（元）。 */
  price?: number
  /** 积分数量。 */
  credits?: number
}
withDefaults(defineProps<Props>(), {
  price: 29.9,
  credits: 600
})
const emit = defineEmits<{ (e: 'purchase'): void }>()

const user = useUserStore()
const creditsStore = useCreditsStore()

const tier = computed(() => {
  const info = user.userInfo as Record<string, unknown> | null
  const raw = (info?.user_tier ?? info?.tier ?? info?.plan ?? 'free') as string
  return String(raw).toLowerCase()
})

/**
 * 三态优先级：
 *   1. 有积分包（sub_total > 0 或 booster_total > 0）→ 'credits'（可购买）
 *   2. user_tier !== free（兼容）                    → 'credits'
 *   3. user_tier=trial                               → 'trial'
 *   4. 其它                                          → 'free'
 */
const cardState = computed<'credits' | 'free' | 'trial'>(() => {
  const bal = creditsStore.balance
  if ((bal?.sub_total ?? 0) > 0 || (bal?.booster_total ?? 0) > 0) return 'credits'
  if (tier.value === 'trial') return 'trial'
  if (tier.value !== 'free') return 'credits'
  return 'free'
})

function handleClick(): void {
  if (cardState.value === 'credits') {
    emit('purchase')
  }
}
</script>

<style scoped>
.booster-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md, 12px);
  padding: var(--space-lg, 16px);
  background: #fff;
  border: 1px solid var(--border, #e8e9ee);
  border-radius: var(--radius-md, 12px);
  cursor: pointer;
  transition:
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.booster-card:hover:not(.is-disabled) {
  box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.06));
  transform: translateY(-1px);
}

.booster-card.is-disabled {
  opacity: 0.55;
  cursor: not-allowed;
  background: var(--bg-muted, #f6f7f9);
}

.booster-card.is-disabled.no-route {
  cursor: not-allowed;
}

.title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text, #1a1d26);
}

.subtitle {
  font-size: 12px;
  color: var(--text-secondary, #6b7085);
}

.price-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.price-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--primary, #10b981);
}

.price-unit {
  font-size: 12px;
  color: var(--text-secondary, #6b7085);
}

.perks {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary, #6b7085);
}

.footer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: var(--space-sm, 8px);
  border-top: 1px dashed var(--border, #e8e9ee);
}

.cta-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--primary, #10b981);
}
</style>
