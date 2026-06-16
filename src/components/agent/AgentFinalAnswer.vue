<script setup lang="ts">
import { computed, ref } from 'vue'
import { splitIntoSegments, groupAdjacentImages } from '@/utils/agentArtifacts'
import { useImagePreview } from '@/composables/useImagePreview'
import AgentArtifactItem from './AgentArtifactItem.vue'
import AgentImagePreview from './AgentImagePreview.vue'
import { Copy, Check } from 'lucide-vue-next'

interface Props {
  markdown: string
  runId?: number
}

const props = withDefaults(defineProps<Props>(), {
  runId: undefined
})

// Split the answer into ordered prose / artifact segments so COS-generated files
// (images, downloadable docs) render as cards exactly where they were written,
// with the surrounding prose flowing above and below. Derived from the persisted
// markdown so the cards survive reload (agent-output-polish #1/#4).
// Consecutive images are coalesced into an image-group so multiple images lay out
// as a responsive grid (#3 M1); a lone image stays a single S2 card.
const renderSegments = computed(() => groupAdjacentImages(splitIntoSegments(props.markdown)))

const { previewImageUrl, handleImageClick, closePreview } = useImagePreview()

// COS presigned URLs expire (~24h). When a grid thumbnail fails to load, dim it
// and mark it so a broken-image glyph doesn't sit opaque in the grid; the title
// (filename) lets the user tell which image expired.
const onImageError = (e: Event): void => {
  const img = e.target as HTMLImageElement
  img.style.opacity = '0.25'
}

const copied = ref(false)

const copyText = async (): Promise<void> => {
  try {
    await navigator.clipboard.writeText(props.markdown)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = props.markdown
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      copied.value = true
      setTimeout(() => {
        copied.value = false
      }, 2000)
    } catch {
      // silently ignore
    }
  }
}
</script>

<template>
  <div class="final-answer">
    <!-- Ordered segments: prose renders as markdown in place; each COS artifact
         renders as a card sitting exactly where its link was written (#1/#4). -->
    <template v-for="(s, i) in renderSegments" :key="i">
      <!-- eslint-disable-next-line vue/no-v-html (markdown 已 DOMPurify sanitize) -->
      <div
        v-if="s.type === 'prose'"
        class="markdown-body"
        v-html="s.html"
        @click="handleImageClick"
      ></div>
      <!-- 多张图 → 自适应网格 (M1)，点任意张放大（复用 useImagePreview 的事件代理）。 -->
      <div v-else-if="s.type === 'image-group'" class="image-grid" @click="handleImageClick">
        <figure v-for="ref in s.refs" :key="ref.url" class="image-grid__cell">
          <img
            :src="ref.url"
            :alt="ref.filename"
            :title="ref.filename"
            class="image-grid__img"
            @error="onImageError"
          />
          <figcaption class="image-grid__cap">{{ ref.filename }}</figcaption>
        </figure>
      </div>
      <AgentArtifactItem
        v-else
        class="final-answer__artifact"
        :artifact="{ id: i, filename: s.ref.filename, url: s.ref.url, mime: s.ref.mime }"
      />
    </template>

    <div class="answer-actions">
      <button class="ai-action-btn" :class="{ copied: copied }" @click="copyText" title="复制回答">
        <Check v-if="copied" :size="14" />
        <Copy v-else :size="14" />
        <span>{{ copied ? '已复制' : '复制' }}</span>
      </button>
    </div>

    <!-- 全屏图片大图预览 + 下载（共享组件） -->
    <AgentImagePreview :url="previewImageUrl" @close="closePreview" />
  </div>
</template>

<style scoped>
.final-answer {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  width: 100%;
}

.markdown-body {
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text, #1f2937);
}

/* Artifact card rendered in place between prose segments (#1/#4). Vertical
   margins give it breathing room from the prose above/below without a wrapper. */
.final-answer__artifact {
  display: block;
  margin: 12px 0;
}

/* 多图自适应网格 (#3 M1)：整齐、密度高，张数多也不乱；点任意张放大。 */
.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
  max-width: 560px;
  margin: 12px 0;
}

.image-grid__cell {
  margin: 0;
}

.image-grid__img {
  width: 100%;
  height: 120px;
  object-fit: cover;
  border-radius: var(--radius-sm, 6px);
  box-shadow: var(--shadow-card, 0 1px 4px rgba(0, 0, 0, 0.04));
  cursor: pointer;
  display: block;
  background: var(--color-surface-tint, #f9fafb);
}

.image-grid__cap {
  margin-top: 4px;
  font-size: 11px;
  color: var(--color-text-muted, #8b90a0);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Markdown 分隔线 (#3, P1-B)：以前是 display:none 完全隐藏，现在用作章节之间的
   精致分隔（替代被禁用的 emoji 装饰带来的结构感）。 */
.markdown-body :deep(hr) {
  border: 0;
  border-top: 1px solid var(--color-border, #e5e7eb);
  margin: 20px 0;
}

/* 标题分级 (#4)：用「格式」区分而非夸张字号——h1/h2 走品牌衬线，与正文 sans
   形成清晰层次；h3/h4 sans 加粗。字阶微妙（21/17.5/15/13.5），上间距随级别递减，
   段间距也分级。第一个块元素不带顶部外边距，避免回答开头多一道空白。 */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  color: var(--color-text, #1f2937);
  font-weight: 600;
  line-height: 1.35;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2) {
  font-family: var(--font-heading, Georgia, 'Songti SC', serif);
}

.markdown-body :deep(h1) {
  font-size: 21px;
  margin: 24px 0 10px;
}

.markdown-body :deep(h2) {
  font-size: 17.5px;
  margin: 20px 0 8px;
}

.markdown-body :deep(h3) {
  font-size: 15px;
  margin: 16px 0 6px;
}

.markdown-body :deep(h4) {
  font-size: 13.5px;
  margin: 14px 0 4px;
  color: var(--color-text-secondary, #5f6577);
  letter-spacing: 0.01em;
}

.markdown-body :deep(:first-child) {
  margin-top: 0;
}

.markdown-body :deep(p) {
  margin: 8px 0;
  line-height: 1.75;
}

/* 加粗：颜色加重 + 600 字重，让强调点更跳出正文。 */
.markdown-body :deep(strong) {
  font-weight: 600;
  color: var(--color-text, #111827);
}

/* 列表：缩进 + 项间距，避免列表项挤成一团。 */
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 8px 0;
  padding-left: 22px;
}

.markdown-body :deep(li) {
  margin: 4px 0;
  line-height: 1.7;
}

.markdown-body :deep(li > ul),
.markdown-body :deep(li > ol) {
  margin: 4px 0;
}

/* 引用块 (#5)：柔和翠绿左条 + 极淡翠绿底，绿色系但不刺眼。 */
.markdown-body :deep(blockquote) {
  margin: 12px 0;
  padding: 6px 14px;
  border-left: 3px solid var(--color-accent-light, hsl(160, 70%, 68%));
  background: var(--color-accent-ultra-soft, hsl(160, 60%, 95%));
  color: var(--color-text-secondary, #4b5563);
  border-radius: 0 6px 6px 0;
}

.markdown-body :deep(blockquote p) {
  margin: 4px 0;
}

/* 内联代码 (#5)：原本刺眼的红改成柔和翠绿（深翠字 + 极淡翠绿底），与品牌一致。 */
.markdown-body :deep(code) {
  background: var(--color-accent-ultra-soft, hsl(160, 60%, 95%));
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--color-primary-hover, hsl(160, 72%, 34%));
}

/* 链接 (#5)：翠绿 + 下划线，区别于正文又不抢戏。 */
.markdown-body :deep(a) {
  color: var(--color-accent-link, hsl(160, 75%, 38%));
  text-decoration: underline;
  text-underline-offset: 2px;
}

.markdown-body :deep(pre) {
  background: #1f2937;
  color: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 12px;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

.markdown-body :deep(table) {
  border-collapse: collapse;
  margin: 12px 0;
  font-size: 13px;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--color-border, #e5e7eb);
  padding: 6px 12px;
  text-align: left;
}

/* 表头 (#5)：极淡翠绿底 + 深翠字 + 翠绿淡分隔线，绿色系但克制不刺眼。 */
.markdown-body :deep(th) {
  background: var(--color-accent-ultra-soft, hsl(160, 60%, 95%));
  color: var(--color-primary-hover, hsl(160, 72%, 34%));
  font-weight: 600;
  border-bottom: 1px solid hsl(160, 40%, 86%);
}

.answer-actions {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.ai-action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  color: var(--text-muted, #6b7280);
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  border: 1px solid rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: all 0.2s ease;
}

/* hover/copied (#5)：fallback 从 stale 蓝 #2563eb 改为品牌翠绿，保持色系统一。 */
.ai-action-btn:hover {
  color: var(--primary, hsl(160, 72%, 40%));
  border-color: var(--primary, hsl(160, 72%, 40%));
  background: rgba(37, 167, 105, 0.04);
}

.ai-action-btn.copied {
  color: var(--primary, hsl(160, 72%, 40%));
  border-color: var(--primary, hsl(160, 72%, 40%));
  background: rgba(37, 167, 105, 0.08);
}

/* 缩略图展现样式 */
.markdown-body :deep(img) {
  max-width: 240px;
  max-height: 180px;
  border-radius: 8px;
  cursor: zoom-in;
  border: 1px solid #e5e7eb;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  display: block;
  margin: 8px 0;
  /* contain（非 cover）— AI 生成图比例任意，cover 会裁掉主体；缩略图也要完整展示 */
  object-fit: contain;
  background: var(--surface-low, #f9fafb);
}

.markdown-body :deep(img:hover) {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
</style>
