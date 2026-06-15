<script setup lang="ts">
import { computed, ref } from 'vue'
import { renderMarkdown } from '@/utils/markdown'
import { extractArtifacts } from '@/utils/agentArtifacts'
import { useImagePreview } from '@/composables/useImagePreview'
import AgentFeedbackBar from './AgentFeedbackBar.vue'
import AgentArtifactItem from './AgentArtifactItem.vue'
import AgentImagePreview from './AgentImagePreview.vue'
import { Copy, Check } from 'lucide-vue-next'

interface Props {
  markdown: string
  runId?: number
  initialFeedback?: 'positive' | 'negative' | null
  initialNote?: string
}

const props = withDefaults(defineProps<Props>(), {
  runId: undefined,
  initialFeedback: null,
  initialNote: ''
})

// Lift COS-generated artifacts (images, downloadable docs) out of the markdown
// into prominent cards; the remaining prose renders as markdown. Derived from the
// persisted markdown so the cards survive reload (agent-output-polish #2a).
const extracted = computed(() => extractArtifacts(props.markdown))
const html = computed<string>(() => renderMarkdown(extracted.value.prose))
const artifacts = computed(() => extracted.value.artifacts)

const { previewImageUrl, handleImageClick, closePreview } = useImagePreview()

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
    <!-- eslint-disable-next-line vue/no-v-html (markdown 已 DOMPurify sanitize) -->
    <div class="markdown-body" v-html="html" @click="handleImageClick"></div>

    <!-- COS-generated artifacts (images / downloadable docs) lifted out of the
         prose and rendered as prominent cards (#2a). -->
    <div v-if="artifacts.length" class="final-answer__artifacts">
      <AgentArtifactItem
        v-for="(a, i) in artifacts"
        :key="i"
        :artifact="{ id: i, filename: a.filename, url: a.url, mime: a.mime }"
      />
    </div>

    <div class="feedback-section">
      <div class="feedback-left">
        <AgentFeedbackBar
          :run-id="runId"
          :initial-feedback="initialFeedback"
          :initial-note="initialNote"
        />
      </div>
      <div class="feedback-right">
        <button
          class="ai-action-btn"
          :class="{ copied: copied }"
          @click="copyText"
          title="复制回答"
        >
          <Check v-if="copied" :size="14" />
          <Copy v-else :size="14" />
          <span>{{ copied ? '已复制' : '复制' }}</span>
        </button>
      </div>
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

/* Artifact cards lifted out of the prose (#2a) */
.final-answer__artifacts {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

/* Markdown 分割线：AI/用户输出的横向分割线在前端完全隐藏 */
.markdown-body :deep(hr) {
  display: none !important;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin: 16px 0 8px;
  color: var(--color-text, #1f2937);
}

.markdown-body :deep(p) {
  margin: 8px 0;
}

.markdown-body :deep(code) {
  background: #f3f4f6;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: #b91c1c;
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
  border: 1px solid #e5e7eb;
  padding: 6px 12px;
  text-align: left;
}

.markdown-body :deep(th) {
  background: #f9fafb;
}

.feedback-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.feedback-left {
  display: flex;
  align-items: center;
}

.feedback-right {
  display: flex;
  align-items: center;
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

.ai-action-btn:hover {
  color: var(--primary, #2563eb);
  border-color: var(--primary, #2563eb);
  background: rgba(37, 167, 105, 0.04);
}

.ai-action-btn.copied {
  color: var(--primary, #2563eb);
  border-color: var(--primary, #2563eb);
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
