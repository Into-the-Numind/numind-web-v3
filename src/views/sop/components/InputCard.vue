<!--
  InputCard — state A/C 输入卡外壳（F5）

  职责：
    - 提供 mockup 02 的 .card 视觉外壳（label + 输入区 + toolbar）
    - 嵌入 StepInput 复用其 textarea + 文件上传 + compose 逻辑
    - toolbar：字数统计（"N / max"）+ 主按钮（执行 / 停止）
    - isExecuting 时切换按钮为"停止生成"（ghost 变体）并禁用 textarea

  ## 封装策略

  InputCard 不重写 StepInput —— 直接把 StepInput 作为内部子组件渲染，
  card 外壳 / label / toolbar 由 InputCard 自己提供。这样 draft lazy
  create 链路（ensureRun 回调）完全不受影响，StepInput 的 useFileUpload
  / chips / 拖拽逻辑全部复用。

  与 mockup 的差异：mockup 把 upload 按钮放在 toolbar__left，本实现
  保留 StepInput 自带的 upload 按钮（在 textarea 下方），toolbar__left
  仅放字数统计；视觉接近且实现代价最低。

  ## Props

  - nodeId: number — 当前节点 ID（上传必需）
  - runId: number | null — 当前 run ID（draft 模式为 null）
  - ensureRun?: () => Promise<number | null> — draft 模式 lazy 创建
  - placeholder?: string — textarea placeholder
  - maxChars?: number — 字数上限（用于 toolbar 的 "N / max" 显示）
  - label?: string — card__label 主文本
  - hint?: string — card__label 右侧辅助文本
  - isExecuting?: boolean — 切换按钮为停止 + 禁用 textarea
  - isLoading?: boolean — 禁用按钮（未 streaming 的 loading 态）

  ## Emits

  - execute — 点击主按钮。参数为 compose 后的完整文本（含上传结果）
  - stop — 点击停止生成按钮（isExecuting=true 时）
-->
<template>
  <div class="input-card" data-testid="input-card">
    <div class="input-card__label">
      <span>{{ label }}</span>
      <span v-if="hint" class="input-card__hint">{{ hint }}</span>
    </div>

    <StepInput
      ref="stepInputRef"
      v-model="innerText"
      :run-id="runId"
      :node-id="nodeId"
      :placeholder="placeholder"
      :disabled="isExecuting"
      :ensure-run="ensureRun"
      @error="(msg) => emit('error', msg)"
    />

    <div class="input-card__toolbar">
      <div class="input-card__toolbar-left">
        <span class="input-card__count" :class="{ 'is-over': charCount > maxChars }">
          {{ charCount }} / {{ maxChars }}
        </span>
      </div>
      <div class="input-card__toolbar-right">
        <button
          v-if="!isExecuting"
          type="button"
          class="input-card__btn input-card__btn--primary"
          :disabled="isLoading || !canExecute"
          data-testid="input-execute"
          @click="handleExecute"
        >
          <Sparkles :size="14" aria-hidden="true" />
          <span>生成</span>
        </button>
        <button
          v-else
          type="button"
          class="input-card__btn input-card__btn--ghost"
          data-testid="input-stop"
          @click="handleStop"
        >
          <Square :size="14" aria-hidden="true" />
          <span>停止</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Sparkles, Square } from 'lucide-vue-next'
import StepInput from './StepInput.vue'

interface Props {
  nodeId: number
  runId: number | null
  ensureRun?: () => Promise<number | null>
  placeholder?: string
  maxChars?: number
  label?: string
  hint?: string
  isExecuting?: boolean
  isLoading?: boolean
  modelValue?: string
}

const props = withDefaults(defineProps<Props>(), {
  ensureRun: undefined,
  placeholder: '在此输入内容，或拖拽文件到此区域…',
  maxChars: 2000,
  label: '你的输入',
  hint: '必填 · 直接粘贴草稿即可',
  isExecuting: false,
  isLoading: false,
  modelValue: ''
})

const emit = defineEmits<{
  execute: [text: string]
  stop: []
  error: [message: string]
  'update:modelValue': [value: string]
}>()

const stepInputRef = ref<InstanceType<typeof StepInput> | null>(null)

// 内部文本：v-model 到 StepInput。若父组件传 modelValue 则同步。
const innerText = computed({
  get: () => props.modelValue,
  set: (v: string) => emit('update:modelValue', v)
})

const charCount = computed(() => innerText.value.length)

const canExecute = computed(() => innerText.value.trim().length > 0)

function handleExecute() {
  if (!canExecute.value) return
  // compose() 返回合并了上传文件识别结果的完整文本
  const composed = stepInputRef.value?.compose() ?? innerText.value
  emit('execute', composed)
}

function handleStop() {
  emit('stop')
}

defineExpose({
  focus: () => stepInputRef.value?.focus(),
  clearUploads: () => stepInputRef.value?.clearUploads()
})
</script>

<style scoped>
/* ==================== Card shell ==================== */

.input-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-xl) var(--space-xl);
  max-width: 980px;
  margin-bottom: var(--space-lg);
}

.input-card__label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
  margin: 0 0 var(--space-md);
}

.input-card__hint {
  font-weight: 400;
  color: var(--text-muted);
  font-size: var(--text-xs);
}

/* ==================== Toolbar ==================== */

.input-card__toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-md);
  margin-top: var(--space-md);
}

.input-card__toolbar-left,
.input-card__toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.input-card__count {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.input-card__count.is-over {
  color: var(--accent);
}

/* ==================== Buttons ==================== */

.input-card__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  font-family: inherit;
  transition:
    background-color var(--transition-base),
    border-color var(--transition-base),
    color var(--transition-base),
    opacity var(--transition-base);
}

.input-card__btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.input-card__btn--primary {
  background: var(--primary);
  color: var(--primary-foreground);
}

.input-card__btn--primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.input-card__btn--ghost {
  background: var(--surface);
  color: var(--text-secondary);
  border-color: var(--border);
}

.input-card__btn--ghost:hover {
  color: var(--text);
  background: var(--surface-hover);
}
</style>
