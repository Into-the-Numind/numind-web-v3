<!--
  ReplayInputCard — 历史回看：单步「你的输入」+「上传的素材」只读展示卡

  回看历史 SOP 运行时（SopStepView 的 done-history / done-current 只读态），在 AI 输出
  （OutputCard）之上呈现当时这一步的输入上下文，方便用户回溯：
    - 你的输入：用户当时写的文字（已剥离合并进来的文件提取文本，见 utils/replayInput）
    - 上传的素材：图片缩略图（点击放大，复用 AgentImagePreview）+ 文档卡片（点击新标签打开/下载）
      每个文档可展开「查看提取文本」（系统当时喂给 AI 的内容）

  设计：安静、退后的中性色调（它是上下文，不是主角），与 OutputCard 的 accent 主角形成层次。
  纯只读 —— 无输入框、无上传/执行按钮。视觉 token 全部取 .sop-run-view-v2 scope。

  详见 spec §4。Props 仅 input + files，无对外 emit（图片放大为内部状态）。
-->
<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  PenLine,
  Paperclip,
  FileText,
  FileSpreadsheet,
  FileImage,
  File as FileIcon,
  ChevronDown
} from 'lucide-vue-next'
import type { SopReplayFile } from '@/views/sop/types'
import { stripMergedFileBlocks, formatFileSize, isImageFile } from '@/views/sop/utils/replayInput'
import AgentImagePreview from '@/components/agent/AgentImagePreview.vue'

const props = defineProps<{
  input: string
  files?: SopReplayFile[]
}>()

const files = computed(() => props.files ?? [])
const hasFiles = computed(() => files.value.length > 0)

/** 剥离合并进 input 的文件块，只留用户文本 */
const cleanInput = computed(() => stripMergedFileBlocks(props.input ?? '', hasFiles.value).trim())
const hasText = computed(() => cleanInput.value.length > 0)

const imageFiles = computed(() => files.value.filter((f) => isImageFile(f)))
const docFiles = computed(() => files.value.filter((f) => !isImageFile(f)))

/** 无文本且无文件的步骤整卡不渲染（AC6） */
const shouldRender = computed(() => hasText.value || hasFiles.value)

// 长文本展开/收起
const TEXT_COLLAPSE_THRESHOLD = 360
const textExpanded = ref(false)
const isLongText = computed(() => cleanInput.value.length > TEXT_COLLAPSE_THRESHOLD)

// 图片放大（复用 AgentImagePreview）
const previewUrl = ref<string | null>(null)

// 图片加载失败兜底
const failedImages = ref<Set<number>>(new Set())
function markImageFailed(id: number): void {
  const next = new Set(failedImages.value)
  next.add(id)
  failedImages.value = next
}

// 文档「查看提取文本」逐个展开
const expandedDocs = ref<Set<number>>(new Set())
function toggleDoc(id: number): void {
  const next = new Set(expandedDocs.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedDocs.value = next
}

function docIcon(f: SopReplayFile) {
  const hint = `${f.file_ext ?? ''} ${f.file_name ?? ''}`.toLowerCase()
  if (/\.(xlsx?|csv)\b/.test(hint) || /\b(xlsx?|csv)\b/.test(hint)) return FileSpreadsheet
  if (/\.(txt|md|pdf|docx?|rtf)\b/.test(hint)) return FileText
  return FileIcon
}

/** 文件副标题：「PDF · 240 KB」 */
function fileMeta(f: SopReplayFile): string {
  const ext = (f.file_ext ?? '').replace(/^\./, '').toUpperCase()
  const size = formatFileSize(f.file_size)
  return [ext, size].filter(Boolean).join(' · ')
}

function openFile(f: SopReplayFile): void {
  if (f.file_url) window.open(f.file_url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <section v-if="shouldRender" class="replay-input" data-testid="replay-input-card">
    <div class="replay-input__head">
      <span class="replay-input__head-icon" aria-hidden="true">
        <PenLine :size="13" />
      </span>
      <span>你的输入</span>
    </div>

    <!-- 用户文本 -->
    <div v-if="hasText" class="replay-input__text-wrap">
      <div class="replay-input__text" :class="{ 'is-clamped': isLongText && !textExpanded }">
        {{ cleanInput }}
      </div>
      <button
        v-if="isLongText"
        type="button"
        class="replay-input__toggle"
        @click="textExpanded = !textExpanded"
      >
        {{ textExpanded ? '收起' : '展开全部' }}
      </button>
    </div>
    <p v-else-if="hasFiles" class="replay-input__hint">（本步仅上传了文件，无文本输入）</p>

    <!-- 上传的素材 -->
    <div v-if="hasFiles" class="replay-input__uploads">
      <div class="replay-input__uploads-label">
        <Paperclip :size="13" aria-hidden="true" />
        <span>上传的素材 · {{ files.length }}</span>
      </div>

      <!-- 图片缩略图网格 -->
      <div v-if="imageFiles.length" class="replay-input__images">
        <template v-for="f in imageFiles" :key="f.id">
          <button
            v-if="!failedImages.has(f.id)"
            type="button"
            class="replay-input__thumb"
            :title="f.file_name"
            @click="previewUrl = f.file_url"
          >
            <img
              :src="f.file_url"
              :alt="f.file_name"
              loading="lazy"
              decoding="async"
              @error="markImageFailed(f.id)"
            />
          </button>
          <div v-else class="replay-input__thumb replay-input__thumb--failed" :title="f.file_name">
            <FileImage :size="20" aria-hidden="true" />
            <span class="replay-input__thumb-name">{{ f.file_name }}</span>
          </div>
        </template>
      </div>

      <!-- 文档/其它文件卡 -->
      <ul v-if="docFiles.length" class="replay-input__docs">
        <li v-for="f in docFiles" :key="f.id" class="replay-input__doc">
          <div class="replay-input__doc-row">
            <button
              type="button"
              class="replay-input__doc-main"
              :title="`打开 ${f.file_name}`"
              @click="openFile(f)"
            >
              <span class="replay-input__doc-icon" aria-hidden="true">
                <component :is="docIcon(f)" :size="16" />
              </span>
              <span class="replay-input__doc-info">
                <span class="replay-input__doc-name">{{ f.file_name }}</span>
                <span v-if="fileMeta(f)" class="replay-input__doc-meta">{{ fileMeta(f) }}</span>
              </span>
            </button>
            <button
              v-if="f.content"
              type="button"
              class="replay-input__doc-expand"
              :class="{ 'is-open': expandedDocs.has(f.id) }"
              :aria-expanded="expandedDocs.has(f.id)"
              :aria-label="expandedDocs.has(f.id) ? '收起提取文本' : '查看提取文本'"
              @click="toggleDoc(f.id)"
            >
              <ChevronDown :size="16" />
            </button>
          </div>
          <pre v-if="f.content && expandedDocs.has(f.id)" class="replay-input__doc-content">{{
            f.content
          }}</pre>
        </li>
      </ul>
    </div>

    <AgentImagePreview :url="previewUrl" @close="previewUrl = null" />
  </section>
</template>

<style scoped>
/* 安静、退后的输入回看卡。对齐 OutputCard 的宽度与入场动画，但用中性色调以让
 * 下方的 AI 输出（accent 主角）保持视觉主导。token 取 .sop-run-view-v2 scope。 */
.replay-input {
  max-width: 980px;
  font-family: var(--font-sans);
  color: var(--text);
  animation: replayFadeIn 0.4s ease;
}

@keyframes replayFadeIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ---------- head（中性，区别于 OutputCard 的 accent AI 图标）---------- */
.replay-input__head {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 12px 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.replay-input__head-icon {
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

/* ---------- 用户文本 ---------- */
.replay-input__text-wrap {
  position: relative;
}

.replay-input__text {
  background: var(--surface-tint);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: var(--space-lg);
  font-size: 15px;
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.replay-input__text.is-clamped {
  max-height: 14em;
  overflow: hidden;
  position: relative;
}

/* 折叠时底部渐隐，提示「还有更多」 */
.replay-input__text.is-clamped::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3.2em;
  background: linear-gradient(to bottom, transparent, var(--surface-tint));
  pointer-events: none;
}

.replay-input__toggle {
  margin-top: var(--space-xs);
  padding: 0;
  background: none;
  border: none;
  font-family: inherit;
  font-size: 13px;
  color: var(--accent-link);
  cursor: pointer;
}

.replay-input__toggle:hover {
  text-decoration: underline;
}

.replay-input__hint {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
  font-style: italic;
}

/* ---------- 上传素材 ---------- */
.replay-input__uploads {
  margin-top: var(--space-lg);
}

.replay-input__uploads-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  margin-bottom: var(--space-sm);
  font-size: 13px;
  color: var(--text-secondary);
}

/* 图片网格 */
.replay-input__images {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.replay-input__thumb {
  width: 88px;
  height: 88px;
  padding: 0;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--surface);
  cursor: pointer;
  transition:
    transform var(--transition-fast, 0.15s ease),
    border-color var(--transition-fast, 0.15s ease);
}

.replay-input__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.replay-input__thumb:hover {
  border-color: var(--accent-soft);
  transform: scale(1.02);
}

/* 图片加载失败占位 */
.replay-input__thumb--failed {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: default;
  color: var(--text-muted);
  padding: var(--space-xs);
}

.replay-input__thumb--failed:hover {
  border-color: var(--border-light);
  transform: none;
}

.replay-input__thumb-name {
  font-size: 10px;
  line-height: 1.2;
  text-align: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 文档列表 */
.replay-input__docs {
  list-style: none;
  margin: var(--space-sm) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.replay-input__doc {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--surface);
  overflow: hidden;
}

.replay-input__doc-row {
  display: flex;
  align-items: center;
}

.replay-input__doc-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: none;
  border: none;
  font-family: inherit;
  text-align: left;
  color: var(--text);
  cursor: pointer;
  transition: background var(--transition-fast, 0.15s ease);
}

.replay-input__doc-main:hover {
  background: var(--surface-hover);
}

.replay-input__doc-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--accent-ultra-soft);
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.replay-input__doc-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.replay-input__doc-name {
  font-size: 14px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.replay-input__doc-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.replay-input__doc-expand {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  align-self: stretch;
  background: none;
  border: none;
  border-left: 1px solid var(--border-light);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background var(--transition-fast, 0.15s ease),
    color var(--transition-fast, 0.15s ease);
}

.replay-input__doc-expand:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.replay-input__doc-expand :deep(svg) {
  transition: transform var(--transition-fast, 0.15s ease);
}

.replay-input__doc-expand.is-open :deep(svg) {
  transform: rotate(180deg);
}

.replay-input__doc-content {
  margin: 0;
  padding: var(--space-md);
  border-top: 1px solid var(--border-light);
  background: var(--surface-tint);
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-secondary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 280px;
  overflow: auto;
}

/* ---------- 移动端 ≤768px ---------- */
@media (max-width: 768px) {
  .replay-input__text {
    padding: var(--space-md);
    font-size: 14px;
  }

  .replay-input__thumb {
    width: 64px;
    height: 64px;
  }
}
</style>
