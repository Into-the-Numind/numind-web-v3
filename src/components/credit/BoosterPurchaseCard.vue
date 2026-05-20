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
      <div v-if="cardState === 'credits'" class="subtitle">脑洞临时透支，为脑力加量</div>
    </div>

    <div class="body">
      <div class="price-row">
        <span class="price-value">¥{{ price }}</span>
        <span class="price-unit">/ {{ credits }} 积分</span>
      </div>
    </div>

    <div v-if="cardState === 'credits'" class="footer">
      <span class="cta-label">立即购买</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * BoosterPurchaseCard — 3 状态加量包购买卡（B2B2C 模式）
 *
 * ## 三态交互矩阵
 *
 * | cardState  | 条件                                                  | 点击行为           | 渲染                   |
 * |------------|-------------------------------------------------------|--------------------|------------------------|
 * | `credits`  | displayState='pro' 或 booster_total>0                 | emit purchase      | 价格行 + perks + CTA   |
 * | `trial`    | displayState='trial'                                  | 无动作（禁用）     | 价格行（仅信息，无 CTA）|
 * | `free`     | displayState='free' 且无 booster 余额                 | 无动作（禁用）     | 价格行（仅信息，无 CTA）|
 *
 * B2B2C 现状：C 端不能自购会员；trial 体验期当前禁用自购（spec §4.2.6 与 CLAUDE.md §1
 * 的"booster 不受 B2B2C 限制"存在文字冲突，但 prod 行为锁定为 trial 禁用 — 改动需走
 * 独立 spec 决策）。free / trial 灰态仅展示价格信息，不提供 CTA 也不跳转。
 *
 * ## Emits
 *
 * - `purchase`：仅 credits 状态下点击触发，父组件接管订单流程
 */
import { computed } from 'vue'
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

const creditsStore = useCreditsStore()

/**
 * 三态判定（数据源：credits store displayState 计算自 BalanceDTO.membership_state）：
 *   - 'pro'（在期会员）          → 'credits'（可购买）
 *   - 'trial'（体验期）           → 'trial'（按当前业务规则禁用自购）
 *   - 'free' 且无 booster 余额    → 'free'（禁用，提示联系管理员）
 *   - 'free' 但有 booster 余额    → 'credits'（兼容历史 Pro 过期但仍有加量包余额场景）
 */
const cardState = computed<'credits' | 'free' | 'trial'>(() => {
  const ds = creditsStore.displayState
  if (ds === 'pro') return 'credits'
  if (ds === 'trial') return 'trial'
  const bal = creditsStore.balance as unknown as Record<string, unknown> | null
  const boosterTotal = typeof bal?.booster_total === 'number' ? bal.booster_total : 0
  if (boosterTotal > 0) return 'credits'
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
