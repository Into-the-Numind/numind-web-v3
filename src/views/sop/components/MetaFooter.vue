<!--
  MetaFooter — mono 小字 meta 行（F6）

  显示顺序（严格对齐 mockup `.output__foot`）：
    [clock 耗时 X.Xs] · [cpu 模型] · [coin tokens] · [时间戳 完成]

  缺字段防御（spec R7）：
    - modelName === '' / undefined 或 latencyMs === 0 / undefined → 整段不渲染
    - totalTokens === 0 / undefined → tokens segment 单独隐藏，其他照常

  用途：
    - OutputCard foot（state E/B）
    - ChatBubble AI 气泡下方（F10）
-->
<template>
  <div v-if="shouldRender" class="meta-footer">
    <span class="meta-footer__seg">
      <Clock :size="11" aria-hidden="true" />
      <span>耗时 {{ latencySeconds }}s</span>
    </span>
    <span class="meta-footer__sep">·</span>
    <span class="meta-footer__seg">
      <Cpu :size="11" aria-hidden="true" />
      <span>{{ modelName }}</span>
    </span>
    <template v-if="hasTokens">
      <span class="meta-footer__sep">·</span>
      <span class="meta-footer__seg">
        <Coins :size="11" aria-hidden="true" />
        <span>{{ totalTokens }} tokens</span>
      </span>
    </template>
    <template v-if="completedAt">
      <span class="meta-footer__sep">·</span>
      <span class="meta-footer__seg">
        <span>{{ completedAt }} 完成</span>
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Clock, Cpu, Coins } from 'lucide-vue-next'

interface Props {
  /** 耗时（毫秒）。0 或 undefined 视为缺失 → 整行不渲染 */
  latencyMs?: number
  /** 模型名。空字符串或 undefined 视为缺失 → 整行不渲染 */
  modelName?: string
  /** token 总量。0 或 undefined 视为缺失 → 仅 tokens 段不渲染 */
  totalTokens?: number
  /** 完成时间字符串（已格式化，如 "14:33:12"）。缺失时不渲染时间段 */
  completedAt?: string
}

const props = withDefaults(defineProps<Props>(), {
  latencyMs: 0,
  modelName: '',
  totalTokens: 0,
  completedAt: ''
})

const shouldRender = computed(
  () =>
    props.latencyMs !== undefined &&
    props.latencyMs > 0 &&
    props.modelName !== undefined &&
    props.modelName !== ''
)

const latencySeconds = computed(() => (props.latencyMs / 1000).toFixed(1))

const hasTokens = computed(() => props.totalTokens !== undefined && props.totalTokens > 0)
</script>

<style scoped>
.meta-footer {
  padding: var(--space-md) var(--space-lg);
  border-top: 1px solid var(--border-light);
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-md);
}

.meta-footer__seg {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

.meta-footer__sep {
  color: var(--border);
}
</style>
