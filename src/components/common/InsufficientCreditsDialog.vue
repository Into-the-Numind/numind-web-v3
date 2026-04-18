<template>
  <Teleport to="body">
    <Transition name="overlay-fade">
      <div v-if="visible" class="modal-overlay" @click.self="close">
        <div class="modal-dialog">
          <div class="modal-icon">✦</div>
          <div class="modal-title">额度不足</div>
          <div class="modal-message">{{ message }}</div>
          <div v-if="reason" class="modal-reason" data-testid="reason">{{ reason }}</div>
          <button class="modal-btn" @click="close">我知道了</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * InsufficientCreditsDialog — 全局 dialog（credits-system Track E.6 扩展）
 *
 * show() API：
 *   - 兼容原签名 show(msg: string) — 仅设置主消息文案
 *   - 新支持 show({ message, reason }) — 结构化 payload（spec §4.2.2 对应 402 拦截器）
 *   - show() 无参数 — 保留当前 message，仅打开 dialog
 *
 * reason 以次要文案形式单独呈现在主消息下方，用于展示后端给出的补充说明
 * （如"本月次数已用尽"、"booster_empty"）。无 reason 时不渲染对应 DOM。
 */
import { ref } from 'vue'

export interface InsufficientCreditsPayload {
  message?: string
  reason?: string
}

const visible = ref(false)
const message = ref('额度不足，请联系管理员充值')
const reason = ref<string>('')

function show(payload?: string | InsufficientCreditsPayload) {
  if (typeof payload === 'string') {
    if (payload) message.value = payload
    reason.value = ''
  } else if (payload && typeof payload === 'object') {
    if (payload.message) message.value = payload.message
    reason.value = payload.reason ?? ''
  }
  // 完全不传参：保留当前 message 和 reason
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

.modal-reason {
  font-size: 12px;
  color: var(--text-tertiary, #9ea1b1);
  text-align: center;
  line-height: 1.5;
  margin-bottom: 8px;
  padding: 6px 12px;
  background: var(--bg-muted, #f6f7f9);
  border-radius: 8px;
  max-width: 100%;
  word-break: break-word;
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
