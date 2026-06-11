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
      class="thinking-container"
      :class="{ collapsed: thinkingCollapsed, finished: !streaming }"
    >
      <div
        class="thinking-header"
        role="button"
        tabindex="0"
        :aria-expanded="!thinkingCollapsed"
        @click="thinkingCollapsed = !thinkingCollapsed"
        @keydown.enter.prevent="thinkingCollapsed = !thinkingCollapsed"
      >
        <span class="thinking-title">
          <ChevronDown :size="14" class="thinking-icon" aria-hidden="true" />
          <span>{{ streaming ? '思考中…' : '思考过程' }}</span>
        </span>
      </div>
      <div class="thinking-content prose" v-html="thinkingHtml" />
    </div>

    <!-- 主内容滚动容器 -->
    <div ref="scrollContainerRef" class="step-output-scroll">
      <div v-if="hasContent" class="step-output-content prose" v-html="contentHtml" />
      <!-- streaming 且无内容时显示加载动效 -->
      <div v-else-if="streaming && !hasThinking" class="streaming-placeholder">
        <span class="streaming-dot" />
        <span class="streaming-dot" />
        <span class="streaming-dot" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { renderMarkdown } from '@/utils/markdown'
import { useScrollFollow } from '@/composables/useScrollFollow'

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
 * streaming 状态变化时的折叠默认值处理：
 *   - false → true（新一轮流式开始）：自动展开，让用户看到实时推理
 *   - true → false（流式结束）：自动折叠，让用户聚焦最终正文
 *
 * 用户仍可手动点击 .thinking-header 任意切换展开/折叠。
 */
watch(
  () => props.streaming,
  (newVal) => {
    thinkingCollapsed.value = !newVal
  }
)

/**
 * 流式期间 content 首次出现 → 深度思考结束，自动折叠思考面板让出正文位置。
 * （对齐 ChatBubble；避免等到整轮 streaming 结束才折叠）
 */
watch(
  () => props.content,
  (newContent, oldContent) => {
    if (props.streaming && !oldContent && newContent) {
      thinkingCollapsed.value = true
    }
  }
)

/**
 * content/thinking 变化时触发滚动跟随。
 *
 * 使用 nextTick 确保 DOM 已更新（v-html 渲染完成）再检查滚动位置，
 * 否则 scrollHeight 拿到的是旧值。
 */
watch([() => props.content, () => props.thinking], async () => {
  await nextTick()
  // body-level 滚动接管：对 window 做 checkAndScroll
  scrollFollow.checkAndScroll(window)
})

onMounted(() => {
  // 安装到 window：SOP 执行页整体走 body 滚动上下文，
  // 上层容器 .sop-run-view-v2 min-height:100vh 不再自己 overflow，
  // scrollContainerRef 永远 clientHeight === scrollHeight 无法触发 wheel。
  scrollFollow.install(window)
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
  /* 高度随内容生长（页面 body 级滚动接管），避免固定 520px 造成
   * "点击生成立刻出现大空框"的错觉 */
}

/* ==================== 空状态 ==================== */

.step-output-empty {
  padding: var(--space-xl);
  text-align: center;
  color: var(--color-text-muted);
  font-size: var(--text-sm);
  font-style: italic;
}

/* ==================== 流式加载占位 ==================== */

.streaming-placeholder {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: var(--space-lg) var(--space-xl);
}

.streaming-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: hsl(158, 50%, 65%);
  animation: dot-pulse 1.4s ease-in-out infinite;
}

.streaming-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.streaming-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dot-pulse {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

/* ==================== 思维链折叠面板（移植自 production） ==================== */

.thinking-container {
  margin-bottom: 16px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid hsl(155, 20%, 92%);
  background-color: hsl(150, 25%, 96%);
}

.thinking-header {
  padding: 8px 16px;
  background-color: hsl(150, 25%, 94%);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-secondary);
  user-select: none;
}

.thinking-header:hover {
  background-color: hsl(150, 25%, 92%);
}

.thinking-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.thinking-icon {
  width: 14px;
  height: 14px;
  transition: transform 0.3s;
  transform: rotate(0deg);
}

.thinking-container:not(.collapsed) .thinking-icon {
  transform: rotate(180deg);
}

.thinking-content {
  padding: 12px 16px;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  /* 移除 white-space: pre-wrap —— markdown 已渲染为 HTML，pre-wrap 会把
   * block 之间的换行空白也显示出来，造成段与段之间过大的空隙 */
  border-top: 1px solid var(--divider, var(--border-light));
  transition:
    max-height 0.3s ease-out,
    padding 0.3s ease-out,
    border-top-color 0.3s ease-out;
  max-height: 4000px;
  overflow-y: auto;
}

.thinking-container.collapsed .thinking-content {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  border-top-color: transparent;
}

/* ==================== 主内容滚动容器 ==================== */

/* body 级滚动接管，step-output-scroll 不再作独立滚动容器 */
.step-output-scroll {
  /* 保持结构存在以兼容 useScrollFollow 的 install 调用（它会 no-op，
   * 因为 clientHeight === scrollHeight 时永远判定"在底部"）*/
}

.step-output-content {
  font-size: var(--text-base);
  line-height: var(--line-height-relaxed);
  color: var(--color-text);
  word-wrap: break-word;
}

/* ==================== 流式占位 ==================== */
</style>

<!-- Prose markdown 样式（移植自 production ui.css）— 不可 scoped，v-html 内容需要穿透 -->
<style>
.step-output .prose {
  font-size: 14px;
  color: var(--text);
  line-height: var(--line-height-relaxed, 1.75);
}

.step-output .prose h1,
.step-output .prose h2,
.step-output .prose h3,
.step-output .prose h4,
.step-output .prose h5,
.step-output .prose h6 {
  font-family: var(--font-sans);
  margin-top: var(--space-xl);
  margin-bottom: var(--space-md);
  font-weight: 600;
  color: var(--text);
  line-height: var(--line-height-tight, 1.25);
}

.step-output .prose h1 {
  font-size: 28px;
}

.step-output .prose h2 {
  font-size: 22px;
}

.step-output .prose h3 {
  font-size: 18px;
}

.step-output .prose h4 {
  font-size: 16px;
}

.step-output .prose p {
  margin: var(--space-md) 0;
}

.step-output .prose ul,
.step-output .prose ol {
  margin: var(--space-md) 0;
  padding-left: 28px;
}

.step-output .prose li {
  margin: var(--space-xs) 0;
}

/* 思考内容是次要信息层 —— 段与段间距需比正文更紧凑，避免视觉拖沓
 * 覆盖 .prose 的默认 margin，仅在 .thinking-content 作用域内生效 */
.step-output .thinking-content.prose p {
  margin: 4px 0;
}
.step-output .thinking-content.prose h1,
.step-output .thinking-content.prose h2,
.step-output .thinking-content.prose h3,
.step-output .thinking-content.prose h4,
.step-output .thinking-content.prose h5,
.step-output .thinking-content.prose h6 {
  margin-top: 10px;
  margin-bottom: 4px;
}
.step-output .thinking-content.prose ul,
.step-output .thinking-content.prose ol {
  margin: 4px 0;
}
.step-output .thinking-content.prose li {
  margin: 2px 0;
}

.step-output .prose strong {
  font-weight: 600;
  color: var(--text);
}

.step-output .prose em {
  font-style: italic;
}

.step-output .prose code {
  background-color: hsl(150, 10%, 92%);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 13px;
  color: hsl(158, 64%, 40%);
  border: 1px solid hsl(150, 15%, 90%);
}

.step-output .prose pre {
  background-color: hsl(150, 10%, 92%);
  padding: var(--space-lg);
  border-radius: var(--radius-md);
  overflow-x: auto;
  margin: var(--space-lg) 0;
  border: 1px solid hsl(150, 15%, 90%);
}

.step-output .prose pre code {
  background-color: transparent;
  padding: 0;
  color: inherit;
  border: none;
}

.step-output .prose blockquote {
  border-left: 4px solid hsl(158, 64%, 40%);
  padding-left: var(--space-lg);
  margin: var(--space-lg) 0;
  color: hsl(150, 10%, 40%);
  font-style: italic;
}

.step-output .prose hr {
  border: none;
  border-top: 1px solid var(--divider, var(--border-light));
  margin: var(--space-xl) 0;
}

.step-output .prose table {
  border-collapse: collapse;
  width: 100%;
  margin: var(--space-lg) 0;
}

.step-output .prose table th,
.step-output .prose table td {
  border: 1px solid var(--border);
  padding: var(--space-sm) var(--space-md);
  text-align: left;
}

.step-output .prose table th {
  background-color: var(--surface-tint, var(--surface-hover));
  font-weight: 600;
}
</style>
