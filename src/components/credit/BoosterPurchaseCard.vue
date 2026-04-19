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
      <div class="subtitle">{{ subtitle }}</div>
    </div>

    <div class="body">
      <div class="price-row">
        <span class="price-value">¥{{ price }}</span>
        <span class="price-unit">/ {{ credits }} 积分</span>
      </div>
      <ul class="perks">
        <li>立即生效，有效期 90 天</li>
        <li>订阅会员专享，可叠加使用</li>
      </ul>
    </div>

    <div class="footer">
      <span class="cta-label">{{ ctaLabel }}</span>
      <span v-if="tooltip" class="tooltip">{{ tooltip }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * BoosterPurchaseCard — 4 状态加量包购买卡（credits-system Track E.4，Q2 改造）
 *
 * ## 四态交互矩阵
 *
 * | cardState  | 条件                                    | 点击行为              | CTA 文案             |
 * |------------|-----------------------------------------|-----------------------|----------------------|
 * | `credits`  | tier standard/premium + billing=credits | 触发 purchase emit    | "立即购买"           |
 * | `free`     | tier=free                               | 无动作（禁用）        | "请联系管理员开通"   |
 * | `trial`    | tier=trial                              | 无动作（禁用）        | "请联系管理员开通"   |
 * | `legacy`   | billing_mode=legacy_tier                | 无动作（禁用）        | "老会员制暂不支持"   |
 *
 * Q2 变更（B2B2C 模式）：C 端不能自购会员。free/trial 灰态点击从"跳转会员购买"
 * 改为"无动作 + 联系管理员提示"，与 CreditBalanceCard free state 保持一致。
 * 三种非 credits 状态统一 no-route，只有 credits 会员可点击触发购买（走 QR 扫码）。
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
  credits: 500
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
 * 四态优先级：
 *   1. billing_mode=legacy_tier           → 'legacy'（老会员制暂不支持）
 *   2. billing_mode=credits 且有积分包    → 'credits'（可购买）
 *   3. user_tier !== free（兼容）         → 'credits'
 *   4. user_tier=trial（legacy trial）    → 'trial'
 *   5. 其它                               → 'free'
 *
 * credits 制下 user_tier 始终为 'free'，必须优先检查 billing_mode。
 */
const cardState = computed<'credits' | 'free' | 'trial' | 'legacy'>(() => {
  const bal = creditsStore.balance
  if (bal?.billing_mode === 'legacy_tier') return 'legacy'
  if (bal?.billing_mode === 'credits' && (bal.sub_total > 0 || bal.booster_total > 0))
    return 'credits'
  if (tier.value === 'trial') return 'trial'
  if (tier.value !== 'free') return 'credits' // legacy tier 未标记 billing_mode 的兼容
  return 'free'
})

const subtitle = computed(() => {
  switch (cardState.value) {
    case 'credits':
      return '为本月 SOP 运行扩充余量'
    case 'free':
    case 'trial':
      return '会员专享服务'
    case 'legacy':
      return '到期升级后可购买'
    default:
      return ''
  }
})

const ctaLabel = computed(() => {
  switch (cardState.value) {
    case 'credits':
      return '立即购买'
    case 'free':
    case 'trial':
      return '请联系管理员开通会员'
    case 'legacy':
      return '老会员制暂不支持'
    default:
      return ''
  }
})

const tooltip = computed(() => {
  switch (cardState.value) {
    case 'free':
    case 'trial':
      return '加量包为会员专享，请联系您的管理员开通会员后使用'
    case 'legacy':
      return '老会员制暂不支持加量包，到期升级后可购买'
    default:
      return ''
  }
})

/**
 * Q2: 所有非 credits 态（free / trial / legacy）点击均无动作。
 * B2B2C 模式下 C 端不能自购会员，父账户在"客户管理"页帮子账户开通。
 */
function handleClick(): void {
  if (cardState.value === 'credits') {
    emit('purchase')
    return
  }
  // free / trial / legacy 统一无动作
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

.booster-card.is-disabled .cta-label {
  color: var(--text-tertiary, #9ea1b1);
}

.tooltip {
  font-size: 11px;
  color: var(--text-tertiary, #9ea1b1);
}
</style>
