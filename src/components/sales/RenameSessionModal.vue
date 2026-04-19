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
          <span class="modal-title">重命名会话</span>
        </div>
        <div class="modal-body-simple">
          <input
            ref="inputRef"
            v-model="newTitle"
            type="text"
            class="form-input"
            placeholder="请输入新的会话名称"
            @keydown.enter="handleConfirm"
          />
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="emit('close')">取消</button>
          <button class="btn-primary" @click="handleConfirm"><span>确认</span></button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  open: boolean
  sessionId: number | null
  currentTitle: string
}>()

const emit = defineEmits<{
  close: []
  confirm: [id: number, newTitle: string]
}>()

const newTitle = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      newTitle.value = props.currentTitle
      nextTick(() => {
        inputRef.value?.focus()
        inputRef.value?.select()
      })
    }
  }
)

function handleConfirm() {
  const title = newTitle.value.trim()
  if (!title || props.sessionId === null) return
  emit('confirm', props.sessionId, title)
}
</script>

<style scoped>
@import '@/assets/styles/sales-modal.css';
</style>
