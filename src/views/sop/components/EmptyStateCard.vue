<!--
  EmptyStateCard — 通用空状态 / 错误状态卡片

  职责：在页面内容区展示"无数据"或"错误"情况的友好提示。
  可选的 CTA 按钮让用户可以快速重试或跳转。

  ## 使用场景

  - template.nodes 为空："该 SOP 暂未配置步骤"
  - GetTemplateNodes 失败："加载失败" + retry 按钮
  - 历史记录为空："暂无运行记录，开始你的第一次 SOP 运行吧"
  - 404: "SOP 不存在或已被删除"

  ## Props

  - variant: 'empty' | 'error' — 语义变体（影响 icon 和色调）
  - icon?: string — 自定义图标（覆盖 variant 默认图标）
  - title: string — 主标题
  - message?: string — 次级描述
  - actionLabel?: string — CTA 按钮文案（无则不显示）
  - actionDisabled?: boolean — CTA 按钮禁用

  ## Emits

  - action — 点击 CTA 按钮
-->
<template>
  <div class="empty-state-card" :class="`empty-state-card--${variant}`">
    <div class="empty-state-icon" aria-hidden="true">
      <span v-if="icon">{{ icon }}</span>
      <component v-else :is="defaultIconComponent" :size="32" :stroke-width="1.5" />
    </div>
    <h3 class="empty-state-title">{{ title }}</h3>
    <p v-if="message" class="empty-state-message">{{ message }}</p>
    <button
      v-if="actionLabel"
      type="button"
      class="empty-state-action"
      :disabled="actionDisabled"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Inbox, AlertTriangle } from 'lucide-vue-next'

interface Props {
  variant?: 'empty' | 'error'
  icon?: string
  title: string
  message?: string
  actionLabel?: string
  actionDisabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'empty',
  icon: '',
  message: '',
  actionLabel: '',
  actionDisabled: false
})

const emit = defineEmits<{
  action: []
}>()

const defaultIconComponent = computed(() => (props.variant === 'error' ? AlertTriangle : Inbox))
</script>

<style scoped>
.empty-state-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-3xl) var(--space-xl);
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  text-align: center;
  /* min() 确保小屏幕不超出容器，保持 padding 合理 */
  max-width: min(480px, 100%);
  margin: var(--space-xl) auto;
}

.empty-state-card--error {
  border-color: var(--color-danger-border, #fecaca);
  background: var(--color-danger-soft, #fef2f2);
}

.empty-state-icon {
  font-size: 40px;
  line-height: 1;
  color: var(--color-text-muted);
}

.empty-state-card--error .empty-state-icon {
  color: var(--color-danger, #dc2626);
}

.empty-state-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text);
}

.empty-state-message {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: var(--line-height-relaxed);
  max-width: 360px;
}

.empty-state-action {
  margin-top: var(--space-sm);
  padding: var(--space-sm) var(--space-lg);
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.empty-state-action:hover:not(:disabled) {
  background: var(--primary-hover);
}

.empty-state-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
