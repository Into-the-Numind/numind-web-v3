<template>
  <Teleport to="body">
    <Transition name="overlay-fade">
      <div v-if="visible" class="modal-overlay" @click.self="close">
        <div class="modal-dialog">
          <div class="modal-icon">✦</div>
          <div class="modal-title">积分不足</div>
          <div class="modal-message">{{ message }}</div>
          <button class="modal-btn" @click="close">我知道了</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const visible = ref(false)
const message = ref('积分不足，请联系管理员充值')

function show(msg?: string) {
  if (msg) message.value = msg
  visible.value = true
}

function close() {
  visible.value = false
}

defineExpose({ show })
</script>

<style scoped>
.modal-overlay {
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

.modal-dialog {
  background: #ffffff;
  border: 1px solid #e8e9ee;
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-2xl, 32px);
  width: 360px;
  box-shadow: var(--shadow-lg, 0 25px 50px -12px rgba(0, 0, 0, 0.15));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
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

.modal-icon {
  font-size: 32px;
  color: var(--primary, #10b981);
  line-height: 1;
  margin-bottom: 4px;
}

.modal-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text, #1a1d26);
  letter-spacing: -0.01em;
}

.modal-message {
  font-size: 14px;
  color: var(--text-secondary, #6b7085);
  text-align: center;
  line-height: 1.6;
  margin-bottom: 8px;
}

.modal-btn {
  padding: 10px 32px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: var(--primary, #10b981);
  color: #fff;
  border: none;
  transition: opacity 0.15s;
  width: 100%;
}

.modal-btn:hover {
  opacity: 0.88;
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
