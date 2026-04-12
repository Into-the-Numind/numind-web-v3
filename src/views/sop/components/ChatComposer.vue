<!--
  ChatComposer — trailing chat 悬浮输入框（Gemini 风格）

  职责：
    - 悬浮在 TrailingChat 底部的圆角输入容器
    - 设计复用 ChatbotChat 的 input-floating-container 风格（glass-morphism + 圆角 + toolbar）
    - Enter 发送 / Shift+Enter 换行
    - streaming 时按钮切换为"停止"
    - 不支持附件上传（后端未支持）

  ## Props

  - streaming?: boolean — 是否正在流式生成
  - placeholder?: string — textarea 占位符
  - disabled?: boolean — 是否禁用

  ## Emits

  - send(text) — 用户按 Enter 或点击发送按钮
  - stop() — streaming 时点击停止
-->
<template>
  <div class="composer">
    <div class="composer__container" :class="{ 'composer__container--focus': isFocused }">
      <textarea
        ref="textareaRef"
        v-model="text"
        class="composer__input"
        :placeholder="placeholder"
        :disabled="isInputDisabled"
        @keydown="handleKeydown"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
        @input="autoResize"
        @focus="isFocused = true"
        @blur="isFocused = false"
      />
      <div class="composer__toolbar">
        <div class="composer__toolbar-left" />
        <div class="composer__toolbar-right">
          <button v-if="streaming" class="composer__stop-btn" title="停止" @click="handleStop">
            <Square :size="16" />
          </button>
          <button
            v-else
            class="composer__send-btn"
            :disabled="!canSend"
            title="发送"
            @click="handleSend"
          >
            <ArrowUp :size="20" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, watch } from 'vue'
import { ArrowUp, Square } from 'lucide-vue-next'

interface Props {
  disabled?: boolean
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
const isFocused = ref(false)
const isComposing = ref(false)

const canSend = computed(() => text.value.trim().length > 0 && !props.streaming && !props.disabled)

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}

watch(text, () => nextTick(autoResize))

function handleKeydown(e: KeyboardEvent) {
  if (isComposing.value) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function handleSend() {
  if (!canSend.value) return
  const t = text.value.trim()
  text.value = ''
  nextTick(autoResize)
  emit('send', t)
}

function handleStop() {
  emit('stop')
}

defineExpose({ text, textareaRef })
</script>

<style scoped>
.composer {
  flex-shrink: 0;
  padding: var(--space-lg) var(--space-2xl) var(--space-2xl);
  display: flex;
  justify-content: center;
  position: relative;
  z-index: 20;
  background: linear-gradient(to bottom, transparent 0%, var(--bg, #f8f9fb) 20%);
  padding-top: var(--space-3xl);
}

.composer__container {
  width: 100%;
  max-width: 800px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
  box-shadow: var(--shadow-md);
  border: 1.5px solid var(--border);
  transition:
    box-shadow var(--transition-base),
    border-color var(--transition-base);
  display: flex;
  flex-direction: column;
}

.composer__container--focus {
  box-shadow:
    0 8px 24px hsla(160, 75%, 44%, 0.1),
    0 0 0 2px hsla(160, 75%, 44%, 0.12);
  border-color: var(--accent);
}

.composer__input {
  width: 100%;
  border: none;
  background: transparent;
  padding: var(--space-sm) 0;
  font-size: var(--text-base, 1rem);
  resize: none;
  min-height: 44px;
  max-height: 160px;
  color: var(--text);
  line-height: 1.5;
  overflow-y: auto;
  font-family: inherit;
}

.composer__input:focus {
  outline: none;
}

.composer__input::placeholder {
  color: var(--text-muted);
}

.composer__input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.composer__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: var(--space-md);
  border-top: 1px solid var(--border-light);
}

.composer__toolbar-left,
.composer__toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.composer__send-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-foreground);
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: 0 2px 8px hsla(160, 75%, 44%, 0.3);
}

.composer__send-btn:hover:not(:disabled) {
  transform: scale(1.05);
  box-shadow: 0 4px 12px hsla(160, 75%, 44%, 0.4);
}

.composer__send-btn:disabled {
  background: var(--border);
  box-shadow: none;
  cursor: not-allowed;
  opacity: 0.6;
}

.composer__stop-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ef4444;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.composer__stop-btn:hover {
  background: rgba(239, 68, 68, 0.15);
}
</style>
