<script setup lang="ts">
import { computed } from 'vue'
import AppButton from '@/components/common/AppButton.vue'

interface Props {
  open: boolean
  usedCredits: number
  currentBalance: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'continue', extra: number): void
  (e: 'stop'): void
  (e: 'low-balance'): void
}>()

const continueAmount = computed<number>(() => {
  if (props.currentBalance >= 200) return 200
  return props.currentBalance // < 200 时使用剩余余额
})

const continueLabel = computed<string>(() => {
  if (props.currentBalance >= 200) return '继续（+200 积分）'
  if (props.currentBalance > 0) return `继续（最多 +${props.currentBalance} 积分）`
  return '继续'
})

const continueDisabled = computed<boolean>(() => props.currentBalance === 0)

const handleContinue = (): void => {
  if (continueDisabled.value) {
    emit('low-balance')
    return
  }
  emit('continue', continueAmount.value)
}

const handleStop = (): void => {
  emit('stop')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" role="dialog" aria-modal="true">
      <div class="modal-content">
        <div class="modal-icon">⚠️</div>
        <h2 class="modal-title">本次任务已用完 {{ usedCredits }} 积分</h2>
        <p class="modal-body">当前任务还未全部完成，你可以选择：</p>

        <div class="modal-actions">
          <AppButton :disabled="continueDisabled" @click="handleContinue">{{
            continueLabel
          }}</AppButton>
          <AppButton variant="secondary" @click="handleStop">停止并下载已完成的内容</AppButton>
        </div>

        <p class="modal-meta">当前余额：{{ currentBalance }} 积分</p>
        <p class="modal-disclaimer">*所有 Agent 任务消耗的都是学员个人积分，不涉及父账户</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-content {
  background: var(--color-surface, #fff);
  border-radius: 12px;
  padding: 28px 24px;
  max-width: 480px;
  width: 100%;
  text-align: center;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}

.modal-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0 0 8px;
}

.modal-body {
  font-size: 14px;
  color: var(--color-text-muted, #6b7280);
  margin: 0 0 20px;
}

.modal-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.modal-meta {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  margin: 8px 0 4px;
}

.modal-disclaimer {
  font-size: 11px;
  color: #9ca3af;
  margin: 0;
  font-style: italic;
}
</style>
