<!--
  StepOutput — SOP 步骤输出区组件

  职责：
    - 流式显示 AI 生成的主内容（content）+ 思维链（thinking）
    - 思维链默认折叠，可点击展开；流式输出期间自动展开以便用户看到推理
    - Markdown 渲染通过 `@/utils/markdown` 的 renderMarkdown（含 DOMPurify 清洗）
    - 内部滚动容器，通过 useScrollFollow 管理自动跟随
    - 流式内容更新时调用 checkAndScroll 自动滚到底部

  ## Props

  - `thinking: string | null` — 思维链文本（null/空字符串时不显示面板）
  - `content: string | null` — 主输出文本
  - `streaming: boolean` — 是否正在流式输出中（影响默认折叠状态和视觉提示）
  - `emptyHint: string` — 无内容时的占位文案

  ## ScrollFollow 集成

  StepOutput 内部创建 useScrollFollow 实例并安装到滚动容器，通过 watch
  content/thinking 变化自动触发 checkAndScroll。

  通过 defineExpose 暴露 `scrollFollow` 实例，ScrollFollowButton (task 18)
  可以通过父组件传递的 ref 访问 isInterrupted 状态并调用 resume()。

  详见 spec §4.5 + §5.2
-->
<template>
  <div class="step-output">
    <!-- 空状态占位 -->
    <div v-if="!hasThinking && !hasContent && !streaming" class="step-output-empty">
      {{ emptyHint }}
    </div>

    <!-- 思维链折叠面板（仅当 thinking 非空时显示） -->
    <div
      v-if="hasThinking"
      class="step-output-thinking"
      :class="{ 'is-collapsed': thinkingCollapsed }"
    >
      <button
        type="button"
        class="step-output-thinking-header"
        :aria-expanded="!thinkingCollapsed"
        @click="thinkingCollapsed = !thinkingCollapsed"
      >
        <span class="step-output-thinking-icon" aria-hidden="true">
          <component :is="thinkingCollapsed ? ChevronRight : ChevronDown" :size="14" />
        </span>
        <span class="step-output-thinking-title">
          {{ streaming ? '思考中…' : '思考过程' }}
        </span>
      </button>
      <div
        v-show="!thinkingCollapsed"
        class="step-output-thinking-content prose"
        v-html="thinkingHtml"
      />
    </div>

    <!-- 主内容滚动容器 -->
    <div ref="scrollContainerRef" class="step-output-scroll">
      <div v-if="hasContent" class="step-output-content prose" v-html="contentHtml" />
      <!-- 流式占位符：streaming 且无内容时显示光标闪烁 -->
      <div
        v-else-if="streaming"
        class="step-output-streaming-placeholder"
        aria-label="AI 正在生成中"
      >
        <span class="step-output-cursor" />
        <span>AI 正在分析中…</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { ChevronRight, ChevronDown } from 'lucide-vue-next'
import { renderMarkdown } from '@/utils/markdown'
import { useScrollFollow } from '@/views/sop/composables/useScrollFollow'

interface Props {
  thinking?: string | null
  content?: string | null
  streaming?: boolean
  emptyHint?: string
}

const props = withDefaults(defineProps<Props>(), {
  thinking: '',
  content: '',
  streaming: false,
  emptyHint: '等待执行…'
})

const scrollContainerRef = ref<HTMLDivElement | null>(null)
const scrollFollow = useScrollFollow()

/**
 * 思维链默认折叠状态：
 *   - 非流式时（回看历史）：默认折叠，节省空间
 *   - 流式时：默认展开，让用户看到实时推理
 *
 * 用户手动切换后保留用户选择，直到 streaming 状态变化才重置。
 */
const thinkingCollapsed = ref(!props.streaming)

const hasThinking = computed(() => !!props.thinking && props.thinking.length > 0)
const hasContent = computed(() => !!props.content && props.content.length > 0)

const thinkingHtml = computed(() => renderMarkdown(props.thinking ?? ''))
const contentHtml = computed(() => renderMarkdown(props.content ?? ''))

/**
 * streaming 状态变化时重置折叠默认值。
 * true → false（流式结束）：自动折叠思维链
 * false → true（新一轮开始）：自动展开
 */
watch(
  () => props.streaming,
  (newVal) => {
    thinkingCollapsed.value = !newVal
  }
)

/**
 * content/thinking 变化时触发滚动跟随。
 *
 * 使用 nextTick 确保 DOM 已更新（v-html 渲染完成）再检查滚动位置，
 * 否则 scrollHeight 拿到的是旧值。
 */
watch([() => props.content, () => props.thinking], async () => {
  if (!scrollContainerRef.value) return
  await nextTick()
  if (scrollContainerRef.value) {
    scrollFollow.checkAndScroll(scrollContainerRef.value)
  }
})

onMounted(() => {
  if (scrollContainerRef.value) {
    scrollFollow.install(scrollContainerRef.value)
  }
})

onBeforeUnmount(() => {
  scrollFollow.uninstall()
})

/**
 * 暴露 scrollFollow 实例和滚动容器 ref，供父组件（SOPRunView）
 * 和 ScrollFollowButton 协调：
 *   - 读 isInterrupted 决定是否显示跳回底部按钮
 *   - 调 resume(containerEl) 让用户点击跳回时立即滚到底
 */
defineExpose({
  scrollFollow,
  scrollContainerRef
})
</script>

<style scoped>
.step-output {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  width: 100%;
  min-height: 80px;
}

/* ==================== 空状态 ==================== */

.step-output-empty {
  padding: var(--space-xl);
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-style: italic;
}

/* ==================== 思维链折叠面板 ==================== */

.step-output-thinking {
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-tint);
  overflow: hidden;
  transition: border-color var(--transition-fast);
}

.step-output-thinking:hover {
  border-color: var(--primary);
}

.step-output-thinking-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  text-align: left;
  transition: background var(--transition-fast);
}

.step-output-thinking-header:hover {
  background: var(--color-surface-hover);
}

.step-output-thinking-icon {
  flex-shrink: 0;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
}

.step-output-thinking-title {
  font-weight: 500;
}

.step-output-thinking-content {
  padding: 0 var(--space-md) var(--space-md);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  line-height: var(--line-height-relaxed);
  max-height: 240px;
  overflow-y: auto;
}

/* ==================== 主内容滚动容器 ==================== */

/*
 * F6: card wrapper 外壳（背景 / 边框 / 圆角 / 外层 padding）由 OutputCard 提供。
 * StepOutput 仅负责内部 markdown + thinking 逻辑 + 滚动跟随，不再自带 card chrome。
 */
.step-output-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.step-output-scroll::-webkit-scrollbar {
  width: 6px;
}

.step-output-scroll::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: var(--radius-pill);
}

.step-output-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}

.step-output-content {
  font-size: var(--text-base);
  line-height: var(--line-height-relaxed);
  color: var(--color-text);
  word-wrap: break-word;
}

/* ==================== 流式占位 ==================== */

.step-output-streaming-placeholder {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-style: italic;
}

.step-output-cursor {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: var(--primary);
  animation: cursor-blink 1s infinite;
}

@keyframes cursor-blink {
  0%,
  50% {
    opacity: 1;
  }
  51%,
  100% {
    opacity: 0;
  }
}
</style>
