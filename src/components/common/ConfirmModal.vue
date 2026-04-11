<!--
  ConfirmModal — 通用确认对话框

  使用场景：
    - 用户点"重新生成"时确认"将删除该书签，确认？"
    - 删除历史记录前的确认
    - 其他需要用户二次确认的破坏性操作

  使用方式：

  ```vue
  <script setup>
  import ConfirmModal from '@/components/common/ConfirmModal.vue'
  const showConfirm = ref(false)
  async function handleDelete() {
    showConfirm.value = true
  }
  </script>

  <template>
    <ConfirmModal
      v-model="showConfirm"
      title="确认删除"
      message="此操作无法撤销，确定删除？"
      variant="danger"
      confirm-text="删除"
      @confirm="doDelete"
    />
  </template>
  ```

  设计决策：
    - v-model 双向绑定 visible 状态（与 Vue 3 官方 pattern 对齐）
    - 使用 Teleport 避免 z-index 冲突
    - click overlay 关闭（.self 修饰符避免内部点击冒泡触发）
    - Esc 键关闭（keydown.esc 全局监听）
    - danger variant 让确认按钮变红色
    - 样式使用 DESIGN.md token（var(--color-xxx)），fallback 兜底
-->
<template>
  <Teleport to="body">
    <Transition name="overlay-fade">
      <div
        v-if="modelValue"
        class="confirm-overlay"
        @click.self="handleCancel"
        @keydown.esc="handleCancel"
      >
        <div class="confirm-dialog" role="dialog" aria-modal="true">
          <div v-if="title" class="confirm-title">{{ title }}</div>
          <div class="confirm-message">{{ message }}</div>
          <div class="confirm-actions">
            <button type="button" class="confirm-btn confirm-btn--cancel" @click="handleCancel">
              {{ cancelText }}
            </button>
            <button
              type="button"
              class="confirm-btn"
              :class="variant === 'danger' ? 'confirm-btn--danger' : 'confirm-btn--primary'"
              @click="handleConfirm"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

interface Props {
  /** v-model 绑定的显示状态 */
  modelValue: boolean
  /** 标题（可选，不提供则不显示） */
  title?: string
  /** 消息内容（必需） */
  message: string
  /** 确认按钮文案（默认"确认"） */
  confirmText?: string
  /** 取消按钮文案（默认"取消"） */
  cancelText?: string
  /** 样式变体 */
  variant?: 'default' | 'danger'
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  confirmText: '确认',
  cancelText: '取消',
  variant: 'default'
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
}>()

function handleConfirm() {
  emit('confirm')
  emit('update:modelValue', false)
}

function handleCancel() {
  emit('cancel')
  emit('update:modelValue', false)
}

// Esc 键关闭 —— 挂载到 document 上以确保即使 dialog 内部没有 focus 也能响应
function onDocumentKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) {
    handleCancel()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeyDown)
})
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.confirm-dialog {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e8e9ee);
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-2xl, 32px);
  width: 380px;
  max-width: calc(100vw - var(--space-4, 24px) * 2);
  box-shadow: var(--shadow-lg, 0 25px 50px -12px rgba(0, 0, 0, 0.15));
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 16px);
  animation: dialog-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dialog-pop {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.confirm-title {
  font-size: var(--text-lg, 18px);
  font-weight: 700;
  color: var(--color-text, #1a1d26);
  letter-spacing: -0.01em;
}

.confirm-message {
  font-size: var(--text-sm, 14px);
  color: var(--color-text-secondary, #6b7085);
  line-height: 1.6;
  /* 支持多行消息 */
  white-space: pre-wrap;
}

.confirm-actions {
  display: flex;
  gap: var(--space-3, 12px);
  justify-content: flex-end;
  margin-top: var(--space-2, 8px);
}

.confirm-btn {
  padding: 10px 20px;
  border-radius: var(--radius-md, 10px);
  font-size: var(--text-sm, 14px);
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all var(--transition-fast, 0.15s);
  font-family: inherit;
  min-width: 88px;
}

.confirm-btn--cancel {
  background: var(--color-surface, #ffffff);
  color: var(--color-text, #1a1d26);
  border-color: var(--color-border, #e8e9ee);
}

.confirm-btn--cancel:hover {
  background: var(--color-surface-hover, #f6f7fb);
}

.confirm-btn--primary {
  background: var(--color-primary, #10b981);
  color: var(--color-primary-foreground, #ffffff);
}

.confirm-btn--primary:hover {
  background: var(--color-primary-hover, #0ea371);
}

.confirm-btn--danger {
  background: var(--color-danger, #ef4444);
  color: #ffffff;
}

.confirm-btn--danger:hover {
  background: var(--color-danger-hover, #dc2626);
}

/* Transition */
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
