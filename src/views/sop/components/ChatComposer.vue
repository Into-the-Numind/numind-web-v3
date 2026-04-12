<!--
  ChatComposer — trailing chat 底部输入条（F10）

  职责：
    - 固定在 TrailingChat 底部的 textarea + 发送按钮
    - Enter 发送 / Shift+Enter 换行
    - streaming 时按钮切换为"停止" ghost 样式
    - 不支持附件上传（后端未支持）

  DOM class 对齐 mockup state F：`.chat__composer`（见 02-additional-states.html）。

  ## Props

  - streaming?: boolean — 是否正在流式生成（控制按钮形态 + 禁用 textarea）
  - placeholder?: string — textarea 占位符（默认 mockup 文案）

  ## Emits

  - send(text) — 用户按 Enter 或点击发送按钮（text 已 trim 且非空）
  - stop() — streaming 时点击"停止"按钮

  详见 spec §5.2 + §3.2 state F + plan Task F10
-->
<template>
  <div class="chat__composer">
    <textarea
      ref="textareaRef"
      v-model="text"
      class="chat__composer-input"
      :placeholder="placeholder"
      :disabled="isInputDisabled"
      rows="2"
      @keydown.enter.exact.prevent="handleSend"
    />
    <button
      v-if="!streaming"
      type="button"
      class="btn btn--primary chat__composer-btn"
      :disabled="!canSend"
      @click="handleSend"
    >
      <span>发送</span>
      <Send :size="13" aria-hidden="true" />
    </button>
    <button v-else type="button" class="btn btn--ghost chat__composer-btn" @click="handleStop">
      <Square :size="13" aria-hidden="true" />
      <span>停止</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Send, Square } from 'lucide-vue-next'

interface Props {
  /** 是否禁用 textarea (independent of streaming, e.g. while loading) */
  disabled?: boolean
  /** 是否正在流式生成（控制按钮形态：发送 → 停止） */
  streaming?: boolean
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  streaming: false,
  placeholder: '输入你的问题，Enter 发送，Shift+Enter 换行'
})

const isInputDisabled = computed(() => props.disabled || props.streaming)

const emit = defineEmits<{
  send: [text: string]
  stop: []
}>()

const text = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const canSend = computed(() => text.value.trim().length > 0 && !props.streaming && !props.disabled)

function handleSend() {
  if (!canSend.value) return
  const t = text.value.trim()
  text.value = ''
  emit('send', t)
}

function handleStop() {
  emit('stop')
}

// 测试暴露
defineExpose({ text, textareaRef })
</script>

<style scoped>
.chat__composer {
  border-top: 1px solid var(--color-border-light);
  background: var(--color-surface);
  padding: var(--space-md) var(--space-lg);
  display: flex;
  gap: var(--space-md);
  align-items: flex-end;
  flex-shrink: 0;
}

.chat__composer-input {
  flex: 1;
  min-height: 52px;
  max-height: 140px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-sm) var(--space-md);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text);
  line-height: var(--line-height-relaxed);
  resize: none;
  transition:
    border-color var(--transition-base),
    box-shadow var(--transition-base);
}

.chat__composer-input::placeholder {
  color: var(--color-text-muted);
}

.chat__composer-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
}

.chat__composer-input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chat__composer-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-lg);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--transition-fast),
    color var(--transition-fast),
    border-color var(--transition-fast);
}

.btn--primary {
  background: var(--primary);
  color: var(--primary-foreground);
}

.btn--primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--ghost {
  background: var(--color-surface);
  color: var(--color-text-secondary);
  border-color: var(--color-border);
}

.btn--ghost:hover {
  color: var(--color-text);
  background: var(--color-surface-hover);
}
</style>
