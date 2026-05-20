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
    <!-- Top stub：刊物 italic eyebrow + serif headline + 等价锚定 -->
    <div class="stub">
      <div class="stub-eyebrow">Booster · 加量包</div>
      <div class="stub-head">兑一张<br />给脑力的加量券</div>
      <div class="stub-anchor">≈ 一份咖啡换 {{ credits }} 次脑力补给</div>
    </div>

    <!-- 中间撕口分隔线（::before / ::after 两侧月牙凹槽配合）-->
    <div class="perforation" aria-hidden="true"></div>

    <!-- Bottom stub：价格 + 印章 + 单 perk + CTA -->
    <div class="body">
      <div class="price-row">
        <div class="price">
          <span class="currency">¥</span>
          <span class="num">{{ price }}</span>
          <span class="unit">/ 张</span>
        </div>
        <div class="stamp">+{{ credits }}</div>
      </div>

      <div class="perk">立即到账，余额累加不清零</div>

      <button v-if="cardState === 'credits'" class="cta" type="button">兑换一张</button>
      <div v-else-if="cardState === 'trial'" class="hint">体验期暂不可购买</div>
      <div v-else class="hint">请联系您的管理员开通会员后购买</div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * BoosterPurchaseCard — 3 状态加量包购买卡（票券风）
 *
 * 视觉隐喻：纸质票券。上下两半 + 中间撕口虚线 + 两侧月牙凹槽 + 翠绿橡皮章 `+N`。
 *
 * 三态交互矩阵：
 *
 * | cardState  | 条件                                                  | 点击行为      | 渲染          |
 * |------------|-------------------------------------------------------|---------------|---------------|
 * | `credits`  | displayState='pro' 或 booster_total>0                 | emit purchase | CTA 按钮      |
 * | `trial`    | displayState='trial'                                  | 无动作（禁用）| hint 文案     |
 * | `free`     | displayState='free' 且无 booster 余额                 | 无动作（禁用）| hint 文案     |
 *
 * B2B2C 现状：C 端不能自购会员；trial 体验期当前禁用自购（spec §4.2.6 与 CLAUDE.md §1
 * 的"booster 不受 B2B2C 限制"存在文字冲突，但 prod 行为锁定为 trial 禁用 — 改动需走
 * 独立 spec 决策）。free / trial 灰态仅展示 hint，不提供 CTA 也不跳转。
 *
 * Emits：
 *   - `purchase`：仅 credits 状态下点击触发，父组件接管订单流程
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
  --serif: var(--font-heading, Georgia, 'Songti SC', 'SimSun', serif);
  --primary: var(--primary, hsl(160, 72%, 40%));
  --primary-hover: var(--primary-hover, hsl(160, 72%, 34%));
  --bg-around: var(--bg, #f7f8fb);

  position: relative;
  background: var(--surface, #fff);
  border: 1px solid var(--border, #e2e4ea);
  border-radius: 8px;
  box-shadow: var(--shadow-md, 0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04));
  cursor: pointer;
  overflow: visible;
  transition:
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.booster-card:hover:not(.is-disabled) {
  box-shadow: var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.03));
  transform: translateY(-1px);
}

.booster-card.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--surface-tint, #f9fafb);
}

/* 两侧月牙凹槽——票券"咬掉一口"视觉。
   无 border + bg 匹配页面背景，让卡片白色被圆形遮住一半，
   像真的从纸上剪出来一样（带 border 会变成贴纸圆点）。 */
.booster-card::before,
.booster-card::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  background: var(--bg-around);
  border-radius: 50%;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
}
.booster-card::before {
  left: -8px;
}
.booster-card::after {
  right: -8px;
}

/* === Stub: 上半部分（hook + headline + anchor） === */
.stub {
  padding: 18px 20px 14px;
  background:
    radial-gradient(70% 90% at 50% 0%, hsl(160, 60%, 96%) 0%, transparent 65%), var(--surface, #fff);
  border-radius: 8px 8px 0 0;
}

.stub-eyebrow {
  font-family: var(--serif);
  font-style: italic;
  font-size: 12px;
  color: var(--primary);
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.stub-head {
  font-family: var(--serif);
  font-size: 22px;
  font-weight: 400;
  line-height: 1.25;
  letter-spacing: -0.015em;
  color: var(--text, #1a1d26);
}

.stub-anchor {
  font-family: var(--serif);
  font-style: italic;
  font-size: 12.5px;
  color: var(--text-secondary, #5f6577);
  margin-top: 8px;
}

/* === Perforation: 中间撕口虚线 === */
.perforation {
  height: 1px;
  margin: 0 4px;
  border-top: 1px dashed var(--border, #e2e4ea);
  position: relative;
}

/* === Body: 下半部分（price + stamp + perk + CTA） === */
.body {
  padding: 14px 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-radius: 0 0 8px 8px;
}

.price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.price {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.currency {
  font-family: var(--serif);
  font-size: 16px;
  color: var(--text-secondary, #5f6577);
  line-height: 1;
}

.num {
  font-family: var(--serif);
  font-size: 38px;
  line-height: 1;
  font-variant-numeric: tabular-nums oldstyle-nums;
  color: var(--text, #1a1d26);
  letter-spacing: -0.02em;
}

.unit {
  font-family: var(--serif);
  font-style: italic;
  font-size: 13px;
  color: var(--text-secondary, #5f6577);
  margin-left: 6px;
}

/* 印章：橡皮章感的旋转徽记 */
.stamp {
  font-family: var(--serif);
  font-size: 13px;
  font-weight: 400;
  letter-spacing: 0.06em;
  color: var(--primary);
  border: 1.5px solid var(--primary);
  border-radius: 6px;
  padding: 4px 10px;
  transform: rotate(-3deg);
  background: hsl(160, 60%, 98%);
}

.perk {
  font-size: 12.5px;
  color: var(--text-secondary, #5f6577);
  line-height: 1.5;
  padding-left: 10px;
  border-left: 2px solid hsl(160, 60%, 88%);
}

/* CTA：serif label + 翠绿填充，比传统 sans CTA 更"票券"感 */
.cta {
  appearance: none;
  border: none;
  background: var(--primary);
  color: var(--primary-foreground, #fff);
  border-radius: 6px;
  padding: 11px 16px;
  font-family: var(--serif);
  font-size: 15px;
  font-weight: 400;
  letter-spacing: 0.08em;
  cursor: pointer;
  margin-top: 2px;
  box-shadow:
    0 1px 0 rgba(0, 0, 0, 0.04),
    inset 0 -1px 0 rgba(0, 0, 0, 0.08);
  transition: background 0.15s ease;
}

.cta:hover {
  background: var(--primary-hover);
}

.hint {
  font-size: 12px;
  color: var(--text-muted, #8b90a0);
  text-align: center;
  padding: 8px 0 0;
  font-style: italic;
  font-family: var(--serif);
}

/* Disabled 状态淡化但保留视觉 */
.booster-card.is-disabled .stamp {
  color: var(--text-muted, #8b90a0);
  border-color: var(--text-muted, #8b90a0);
  background: transparent;
}
.booster-card.is-disabled .stub-eyebrow {
  color: var(--text-muted, #8b90a0);
}
</style>
