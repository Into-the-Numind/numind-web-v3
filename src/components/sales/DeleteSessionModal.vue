<template>
  <Teleport to="body">
    <div class="modal-overlay" :class="{ open }">
      <div
        class="modal-card modal-card-simple"
        role="dialog"
        aria-modal="true"
        @keydown.escape="emit('close')"
      >
        <div class="modal-header">
          <span class="modal-title">删除会话</span>
        </div>
        <div class="modal-body-simple">
          <p>确认删除记录吗?此操作不可恢复</p>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="emit('close')">取消</button>
          <button class="btn-danger" @click="handleConfirm"><span>确认删除</span></button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
const props = defineProps<{
  open: boolean
  sessionId: number | null
}>()

const emit = defineEmits<{
  close: []
  confirm: [id: number]
}>()

function handleConfirm() {
  if (props.sessionId === null) return
  emit('confirm', props.sessionId)
}
</script>

<style scoped>
@import '@/assets/styles/sales-modal.css';
</style>
