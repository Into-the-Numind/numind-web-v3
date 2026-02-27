<template>
  <Teleport to="body">
    <div class="modal-overlay" :class="{ open }">
      <div class="modal-card modal-card-compact">
        <div class="modal-header-compact">
          <span class="modal-title">新建客户对话</span>
        </div>
        <form class="customer-profile-form-compact" @submit.prevent="handleSubmit">
          <div class="form-group-compact">
            <label class="form-label">客户姓名 <span class="required-star">*</span></label>
            <input
              ref="inputRef"
              v-model="customerName"
              type="text"
              class="form-input"
              placeholder="请输入客户姓名"
              required
            />
          </div>
        </form>
        <div class="modal-footer-compact">
          <button type="button" class="btn-secondary" @click="emit('close')">取消</button>
          <button type="submit" class="btn-primary" @click="handleSubmit">
            <span>创建</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: [name: string]
}>()

const customerName = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      nextTick(() => inputRef.value?.focus())
    } else {
      customerName.value = ''
    }
  }
)

function handleSubmit() {
  const name = customerName.value.trim()
  if (!name) return
  emit('submit', name)
}
</script>

<style>
@import '@/assets/styles/sales-modal.css';
</style>
