<!--
  OutputCard — AI 输出卡外壳（F6）

  3 态：
    - streaming: head 显示 LIVE 标签 + 停止按钮，body 流式 markdown，无 footer
    - read-only: head 显示 ⭐ + 复制按钮，body markdown，foot MetaFooter
    - empty-skip: 外层不渲染（由父组件决定不挂载）

  封装 StepOutput（F6 改造后 StepOutput 只负责 markdown + thinking 内部逻辑，
  外层 card chrome 由本组件提供）。

  视觉契约对齐：
    - 01-active-and-history.html `.output` / `.output__head` / `.output__body` / `.output__foot`
    - 02-additional-states.html `.output--streaming` + `.live-dot` / `.live-label`

  ## Props
    - nodeRun: 完成后的节点执行记录（null 时仅 streaming 可用；否则 fallback OutputEmpty）
    - state: 'streaming' | 'read-only'
    - streamingContent / streamingThinking: streaming 状态下的流式内容
    - isBookmarked: ⭐ 是否填充态
    - canBookmark: ⭐ 按钮是否显示（read-only 有 output 时为 true）

  ## Emits
    - stop: 点击"停止生成"
    - copy: 点击"复制"
    - toggle-bookmark: 点击 ⭐
-->
<template>
  <div class="output" :class="{ 'output--streaming': isStreaming }">
    <div class="output__head">
      <div class="output__head-left">
        <span class="output__sparkle" aria-hidden="true">
          <Sparkles :size="14" />
        </span>
        <span>AI 输出</span>
        <template v-if="isStreaming">
          <span class="output__live-dot" aria-hidden="true" />
          <span class="output__live-label">live</span>
        </template>
      </div>
      <div class="output__head-right">
        <template v-if="isStreaming">
          <button
            type="button"
            class="output__btn output__btn--ghost"
            data-testid="output-stop"
            @click="handleStop"
          >
            <Square :size="12" aria-hidden="true" />
            <span>停止生成</span>
          </button>
        </template>
        <template v-else>
          <button
            v-if="canBookmark"
            type="button"
            class="tiny-btn tiny-btn--star"
            :class="{ 'is-active': isBookmarked }"
            :title="isBookmarked ? '已收藏 · 点击移除书签' : '保存为书签'"
            data-testid="bookmark-toggle"
            @click="handleToggleBookmark"
          >
            <Star v-if="!isBookmarked" :size="13" aria-hidden="true" />
            <Star v-else :size="13" fill="currentColor" aria-hidden="true" />
            <span>{{ isBookmarked ? '已收藏' : '收藏' }}</span>
          </button>
          <button type="button" class="tiny-btn" data-testid="output-copy" @click="handleCopy">
            <Copy :size="12" aria-hidden="true" />
            <span>复制</span>
          </button>
        </template>
      </div>
    </div>

    <div class="output__body">
      <StepOutput
        :thinking="displayThinking"
        :content="displayContent"
        :streaming="isStreaming"
        :empty-hint="emptyHint"
      />
    </div>

    <MetaFooter
      v-if="!isStreaming && nodeRun"
      :latency-ms="nodeRun.latency_ms"
      :model-name="nodeRun.model_name"
      :total-tokens="nodeRun.total_tokens"
      :completed-at="formattedCompletedAt"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Sparkles, Square, Star, Copy } from 'lucide-vue-next'
import StepOutput from './StepOutput.vue'
import MetaFooter from './MetaFooter.vue'
import type { SopNodeRun } from '@/views/sop/types'

interface Props {
  nodeRun: SopNodeRun | null
  state: 'streaming' | 'read-only'
  streamingContent?: string
  streamingThinking?: string
  isBookmarked?: boolean
  canBookmark?: boolean
  emptyHint?: string
}

const props = withDefaults(defineProps<Props>(), {
  streamingContent: '',
  streamingThinking: '',
  isBookmarked: false,
  canBookmark: false,
  emptyHint: '等待执行…'
})

const emit = defineEmits<{
  stop: []
  copy: []
  'toggle-bookmark': []
}>()

const isStreaming = computed(() => props.state === 'streaming')

const displayContent = computed(() => {
  if (isStreaming.value) return props.streamingContent
  return props.nodeRun?.output ?? ''
})

const displayThinking = computed(() => {
  if (isStreaming.value) return props.streamingThinking
  return props.nodeRun?.thinking ?? ''
})

/**
 * 从 nodeRun.finished_at ISO 字符串提取 HH:MM:SS 部分。
 * 解析失败时回退为空字符串（MetaFooter 会跳过该段）。
 */
const formattedCompletedAt = computed(() => {
  const raw = props.nodeRun?.finished_at
  if (!raw) return ''
  try {
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return ''
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  } catch {
    return ''
  }
})

function handleStop() {
  emit('stop')
}

function handleCopy() {
  emit('copy')
}

function handleToggleBookmark() {
  emit('toggle-bookmark')
}
</script>

<style scoped>
.output {
  max-width: 980px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
  margin-bottom: var(--space-lg);
}

.output--streaming {
  border-color: var(--accent-soft);
}

/* ---------- head ---------- */

.output__head {
  padding: var(--space-md) var(--space-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface);
  border-bottom: 1px solid var(--border-light);
}

.output__head-left {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  font-weight: 600;
  letter-spacing: 0.01em;
}

.output__sparkle {
  color: var(--primary);
  display: inline-flex;
}

.output__live-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-pill);
  background: var(--primary);
  animation: live-pulse 1.4s ease-in-out infinite;
  margin-left: var(--space-xs);
}

.output__live-label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--primary);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

@keyframes live-pulse {
  0%,
  100% {
    opacity: 0.4;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

.output__head-right {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

/* ---------- tiny buttons (read-only head) ---------- */

.tiny-btn {
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  transition: all var(--transition-fast);
  font-family: inherit;
}

.tiny-btn:hover {
  background: var(--surface);
  border-color: var(--border);
  color: var(--text);
}

.tiny-btn--star.is-active {
  color: var(--primary);
}

.tiny-btn--star.is-active:hover {
  color: var(--primary-hover);
  background: var(--accent-ultra-soft);
  border-color: var(--accent-soft);
}

/* ---------- stop button (streaming head) ---------- */

.output__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 600;
  border: 1px solid var(--border);
  cursor: pointer;
  font-family: inherit;
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}

.output__btn--ghost {
  background: var(--surface);
  color: var(--text-secondary);
}

.output__btn--ghost:hover {
  color: var(--text);
  background: var(--surface-hover);
}

/* ---------- body ---------- */

.output__body {
  padding: var(--space-xl) var(--space-2xl);
  max-height: 620px;
  overflow-y: auto;
}
</style>
