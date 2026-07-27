<script setup lang="ts">
import { X } from 'lucide-vue-next'
import AppButton from '@/components/common/AppButton.vue'

interface Props {
  open: boolean
  balance: number
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'purchase'): void
  (e: 'close'): void
}>()

const handlePurchase = (): void => {
  emit('purchase')
}

const handleClose = (): void => {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="low-balance-title"
      @click.self="handleClose"
    >
      <div class="modal-content">
        <button class="close-button" type="button" aria-label="关闭" @click="handleClose">
          <X aria-hidden="true" :size="18" />
        </button>

        <div class="modal-header">
          <h2 id="low-balance-title" class="modal-title">积分不足</h2>
        </div>

        <p class="modal-body">
          当前余额：<strong>{{ balance }}</strong> 积分。
        </p>

        <div class="modal-footer">
          <AppButton @click="handlePurchase">购买加量包</AppButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(17, 24, 39, 0.48);
  z-index: var(--z-modal-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-content {
  position: relative;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light, #eeeff3);
  border-radius: var(--agent-radius-card, 10px);
  padding: 24px;
  max-width: 372px;
  width: 100%;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.modal-title {
  font-size: 18px;
  line-height: 26px;
  font-weight: 650;
  color: var(--color-text, #1f2937);
  margin: 0;
  padding-right: 42px;
}

.modal-body {
  font-size: 14px;
  line-height: 22px;
  color: var(--color-text-muted, #4b5563);
  margin: 0 0 22px;
}

.modal-body strong {
  color: var(--color-text, #1f2937);
  font-weight: 650;
}

.close-button {
  position: absolute;
  top: 16px;
  right: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--agent-radius-control, 8px);
  background: transparent;
  color: var(--color-text-muted, #6b7280);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.close-button:hover {
  background: var(--color-surface-tint, #f9fafb);
  border-color: var(--color-border-light, #eeeff3);
  color: var(--color-text, #1f2937);
}

.close-button:focus-visible {
  outline: 3px solid rgba(24, 183, 122, 0.22);
  outline-offset: 2px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
}

.modal-footer :deep(.app-button) {
  min-width: 112px;
  border-radius: var(--agent-radius-control, 8px);
  color: var(--color-primary-foreground, #fff);
  font-weight: 600;
}

@media (max-width: 420px) {
  .modal-content {
    padding: 22px 20px 20px;
  }

  .modal-footer {
    justify-content: stretch;
  }

  .modal-footer :deep(.app-button) {
    width: 100%;
  }
}
</style>
