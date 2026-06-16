<!--
  OutputCard — AI 输出卡外壳（F6）

  3 态：
    - streaming: head 显示 AI 标识，body 流式 markdown，无 footer
    - read-only: head + body markdown + 页脚行（左 复制/保存生成记录，右 耗时/模型/tokens）
    - empty-skip: 外层不渲染（由父组件决定不挂载）

  封装 StepOutput（F6 改造后 StepOutput 只负责 markdown + thinking 内部逻辑，
  外层 card chrome 由本组件提供）。

  视觉契约对齐：
    - 01-active-and-history.html `.output` / `.output__head` / `.output__body` / `.output__footer`
    - 02-additional-states.html `.output--streaming` + `.live-dot` / `.live-label`

  ## Props（spec §5.2）
    - nodeRun: 完成后的节点执行记录（null 时仅 streaming 可用；否则 fallback OutputEmpty）
    - state: 'streaming' | 'read-only'
    - streamingContent / streamingThinking: streaming 状态下的流式内容
    - hasOutput: 是否有输出内容（控制 ⭐ 按钮是否显示）
    - hasBookmark: ⭐ 是否已收藏（控制 filled vs outline）

  ## Emits（spec §5.2）
    - stop: 点击"停止"
    - copy: 点击"复制"
    - regenerate: 重新生成（由外层 ActionRow/F11 主容器触发，本组件预留接口）
    - toggle-bookmark: 点击 ⭐
-->
<template>
  <div class="output" :class="{ 'output--streaming': isStreaming }" data-testid="output-card">
    <div class="output__head">
      <div class="output__head-left">
        <span class="output__ai-icon" aria-hidden="true">
          <Sparkles :size="13" />
        </span>
        <span>AI 输出</span>
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

    <!-- 正文结束后的页脚行：左=复制·保存生成记录，右=耗时·模型·tokens（同一行、同款样式） -->
    <div v-if="!isStreaming && (hasOutput || hasMeta)" class="output__footer">
      <div v-if="hasOutput" class="output__footer-actions">
        <button type="button" class="tiny-btn" data-testid="output-copy" @click="handleCopy">
          <Copy :size="12" aria-hidden="true" />
          <span>复制</span>
        </button>
        <button
          type="button"
          class="tiny-btn tiny-btn--star"
          :class="{ 'is-active': hasBookmark }"
          :title="hasBookmark ? '已保存 · 点击移除' : '保存生成记录'"
          data-testid="bookmark-toggle"
          @click="handleToggleBookmark"
        >
          <Star v-if="!hasBookmark" :size="13" aria-hidden="true" />
          <Star v-else :size="13" fill="currentColor" aria-hidden="true" />
          <span>{{ hasBookmark ? '已保存' : '保存生成记录' }}</span>
        </button>
      </div>

      <div v-if="hasMeta" class="output__footer-meta" data-testid="output-meta">
        <span class="output__meta-item">
          <Clock :size="12" aria-hidden="true" />
          <span>耗时 {{ latencySeconds }}s</span>
        </span>
        <span class="output__meta-item">
          <Cpu :size="12" aria-hidden="true" />
          <span>{{ modelDisplayName }}</span>
        </span>
        <span v-if="hasTokens" class="output__meta-item">
          <Coins :size="12" aria-hidden="true" />
          <span>{{ nodeRun?.total_tokens }} tokens</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Star, Copy, Sparkles, Clock, Cpu, Coins } from 'lucide-vue-next'
import StepOutput from './StepOutput.vue'
import { useLLMModelStore } from '@/stores/llmModel'
import type { SopNodeRun } from '@/views/sop/types'

interface Props {
  nodeRun: SopNodeRun | null
  state: 'streaming' | 'read-only'
  streamingContent?: string
  streamingThinking?: string
  /** 是否已收藏（filled vs outline ⭐） */
  hasBookmark?: boolean
  /** 是否有输出内容（控制 ⭐ 按钮是否显示） */
  hasOutput?: boolean
  emptyHint?: string
}

const props = withDefaults(defineProps<Props>(), {
  streamingContent: '',
  streamingThinking: '',
  hasBookmark: false,
  hasOutput: false,
  emptyHint: '等待执行…'
})

const emit = defineEmits<{
  copy: []
  regenerate: []
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

// ===== 页脚 meta（耗时 / 模型 / tokens）=====
const llmModelStore = useLLMModelStore()
// 解析模型展示名所需的 SOP 模型列表（幂等，已加载则直接返回）
onMounted(() => {
  llmModelStore.fetchModels('sop')
})

/**
 * 归一化 model key 以便容错匹配：注册表用 thinking 变体（如 deepseek-v3.2-thinking），
 * 而执行时存的 model_name 可能是基础名（deepseek-v3.2 / deepseek-v3.2-think）或带日期后缀的
 * provider id（gpt-5.4-2026-03-05 / xxx-251201）。剥掉 thinking 后缀与日期尾段后再比。
 */
function normalizeModelKey(k: string): string {
  return k
    .toLowerCase()
    .replace(/-think(ing)?$/, '')
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')
    .replace(/-\d{6,8}$/, '')
}

/** 把存储的 model_key 映射为 display_name；先精确、后归一化容错；都不中则回退原值 */
const modelDisplayName = computed(() => {
  const key = props.nodeRun?.model_name ?? ''
  if (!key) return ''
  const models = llmModelStore.getModels('sop')
  const exact = models.find((x) => x.model_key === key)
  if (exact) return exact.display_name
  const norm = normalizeModelKey(key)
  const fuzzy = models.find((x) => normalizeModelKey(x.model_key) === norm)
  return fuzzy?.display_name || key
})

const latencySeconds = computed(() => ((props.nodeRun?.latency_ms ?? 0) / 1000).toFixed(1))
const hasTokens = computed(() => (props.nodeRun?.total_tokens ?? 0) > 0)
/** 与原 MetaFooter 同一渲染门槛：有耗时且有模型名才显示 meta */
const hasMeta = computed(
  () => (props.nodeRun?.latency_ms ?? 0) > 0 && modelDisplayName.value !== ''
)

function handleCopy() {
  emit('copy')
}

function handleToggleBookmark() {
  emit('toggle-bookmark')
}
</script>

<style scoped>
/* 去掉外壳容器：markdown 内容直接占据宽度，head/foot 的薄分隔线承担分组职责。
 * 避免 impeccable "DO NOT wrap everything in cards"。*/
.output {
  max-width: 980px;
  animation: slideUp 0.5s;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* streaming 态不再给 body 整块绿色底 — 深度思考的容器（.thinking-container）
 * 自己会在 thinking 数据到达时以绿底呈现；body 本身保持透明，避免"点击生成
 * 就出现一个固定高度绿框"的视觉误导 */

/* ---------- head ---------- */

.output__head {
  padding: 12px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
}

.output__head-left {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

/* 中性圆 —— 与 ReplayInputCard 的「用户输入 / 上传文件」头图标统一（同款容器+Lucide 图标） */
.output__ai-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* 正文下方页脚行：左=复制/保存生成记录，右=耗时/模型/tokens。同一行两端对齐 */
.output__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-sm) var(--space-md);
  padding: var(--space-sm) 0;
}

.output__footer-actions {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.output__footer-meta {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-left: auto; /* 右对齐：仅有 meta（无 actions）时也靠右 */
}

/* meta 三项与按钮同款字号/颜色（13px / --text-secondary / sans），区别于旧 mono 小灰字 */
.output__meta-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 13px;
  color: var(--text-secondary);
  font-family: inherit;
  white-space: nowrap;
}

/* ---------- tiny buttons (read-only head) ---------- */

.tiny-btn {
  padding: var(--space-xs) var(--space-sm);
  font-size: 13px;
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

/* ---------- body ---------- */

.output__body {
  padding: var(--space-lg) 0;
}
</style>
