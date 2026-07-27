<script setup lang="ts">
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
        <div class="modal-header">
          <h2 id="low-balance-title" class="modal-title">积分余额不足</h2>
        </div>

        <p class="modal-body">
          当前余额：<strong>{{ balance }}</strong> 积分。购买加量包后可继续完成本次任务。
        </p>

        <div class="option">
          <p class="option-title">购买加量包</p>
          <p class="option-desc">+600 积分 · ¥29.9 · 90 天有效</p>
        </div>

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
  background: rgba(0, 0, 0, 0.5);
  z-index: var(--z-modal-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-content {
  background: var(--color-surface, #fff);
  border-radius: var(--agent-radius-card, 10px);
  padding: 24px;
  max-width: 420px;
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
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0;
}

.modal-body {
  font-size: 14px;
  color: var(--color-text-muted, #4b5563);
  margin: 0 0 16px;
}

.modal-body strong {
  color: var(--color-text, #1f2937);
}

.option {
  background: var(--color-surface-tint, #f9fafb);
  border: 1px solid var(--color-border-light, #eeeff3);
  border-radius: var(--agent-radius-inner, 8px);
  padding: 14px 16px;
}

.option-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0 0 4px;
}

.option-desc {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  margin: 0 0 8px;
}

.modal-footer {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
