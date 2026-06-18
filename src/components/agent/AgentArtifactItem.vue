<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { Download, FileText, X } from 'lucide-vue-next'

import { isEditable, isDocumentSystemEnabled } from '@/utils/editableArtifact'
import { useDocumentsStore } from '@/stores/documents'

// document-system：编辑器是页面级右侧面板（AgentChatView 第三栏，由 documentsStore.current 驱动）。
// 卡片交互模型（followup3）：卡片只显一个【下载】按钮；点击卡片本身 —— 可编辑文档
// (docx/md/txt)→打开右侧编辑器（方案 B），图片→放大 modal，其余格式（含 HTML）→提示
// "暂不支持预览"。HTML 不再 iframe 预览（followup3 从源头切断，安全 + 体验一致）。
const documentsStore = useDocumentsStore()

interface Props {
  artifact: {
    id: number
    filename: string
    url: string
    mime: string
  }
}

const props = defineProps<Props>()

const isImage = computed<boolean>(() => props.artifact.mime.startsWith('image/'))

// Short uppercase type label for the file card meta (DOCX / PDF / XLSX …). The
// ArtifactRef carries no byte size, so the meta shows the format, not "KB".
const MIME_TYPE_LABEL: Record<string, string> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/pdf': 'PDF',
  'text/csv': 'CSV'
}

const fileTypeLabel = computed<string>(() => {
  const name = props.artifact.filename
  const dot = name.lastIndexOf('.')
  if (dot >= 0 && dot < name.length - 1) {
    return name.slice(dot + 1).toUpperCase()
  }
  return MIME_TYPE_LABEL[props.artifact.mime] ?? '文件'
})

// HTML 产物从源头只下载（followup3 FE-2）：不预览、不进编辑器。startsWith() 覆盖
// "text/html" 与 "text/html; charset=utf-8"。注意 isEditable() 仍把 html 算可编（与
// 后端 IsEditableMime 对齐），所以这里显式把 html 排除在卡片可编辑路径之外。
const isHtml = computed<boolean>(() => props.artifact.mime.startsWith('text/html'))

// document-system：文本类产物（md/txt/docx）可在右侧编辑器面板打开编辑，
// 受 feature flag（VITE_ENABLE_DOCUMENT_SYSTEM）+ 可编辑性双重控制。HTML 虽 isEditable
// 为 true 但在 agent 卡片场景只下载，故排除。
const canEdit = computed<boolean>(
  () =>
    !isHtml.value &&
    isDocumentSystemEnabled() &&
    isEditable(props.artifact.mime, props.artifact.filename)
)

const openEditor = (): void => {
  void documentsStore.open({
    source_url: props.artifact.url,
    filename: props.artifact.filename,
    mime: props.artifact.mime
  })
}

const showPreview = ref(false)

const openPreview = (): void => {
  showPreview.value = true
}
const closePreview = (): void => {
  showPreview.value = false
}

// Transient hint shown when the user clicks a card whose format we cannot preview/edit.
const hintText = ref('')
let hintTimer: ReturnType<typeof setTimeout> | null = null
const flashHint = (msg: string): void => {
  hintText.value = msg
  if (hintTimer) clearTimeout(hintTimer)
  hintTimer = setTimeout(() => {
    hintText.value = ''
  }, 2200)
}

// 点击卡片 → 编辑(可编辑 docx/md/txt) / 否则提示不支持。HTML 走"不支持预览"分支
// （followup3：HTML 从源头只下载，不再 iframe 预览）。下载走独立按钮（stop 冒泡）。
const onCardClick = (): void => {
  if (canEdit.value) {
    openEditor()
    return
  }
  flashHint('此格式暂不支持预览')
}

const handleDownload = (): void => {
  const a = document.createElement('a')
  a.href = props.artifact.url
  a.download = props.artifact.filename
  // The COS URL is cross-origin, so browsers ignore `download` and would otherwise
  // navigate the app tab to the raw file. Open in a new tab with no window.opener
  // handle instead: the app session is preserved.
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const onKeydown = (e: KeyboardEvent): void => {
  if (e.key !== 'Escape') return
  if (showPreview.value) closePreview()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
  if (hintTimer) clearTimeout(hintTimer)
})
</script>

<template>
  <div class="artifact-item" :class="{ 'artifact-item--image': isImage }">
    <!-- B1 image thumbnail card: rounded preview + caption, click → full modal. -->
    <div v-if="isImage" class="image-wrap" @click="openPreview">
      <img :src="artifact.url" :alt="artifact.filename" class="thumb" />
      <p class="filename">{{ artifact.filename }}</p>
    </div>

    <!-- A1 file card: ONE download button; click the card to edit (editable docs:
         docx/md/txt) or flash "暂不支持预览" for all other formats (incl. HTML —
         followup3 cut HTML iframe preview, HTML is download-only now). -->
    <div
      v-else
      class="file-row file-row--clickable"
      data-testid="artifact-card"
      role="button"
      tabindex="0"
      @click="onCardClick"
      @keydown.enter="onCardClick"
    >
      <span class="doc-badge"><FileText :size="20" /></span>
      <span class="file-meta">
        <span class="filename">{{ artifact.filename }}</span>
        <span class="file-type">{{ fileTypeLabel }}</span>
      </span>
      <span v-if="hintText" class="card-hint" aria-live="polite">{{ hintText }}</span>
      <button
        class="icon-btn download-btn"
        data-testid="artifact-download"
        @click.stop="handleDownload"
        aria-label="下载文件"
        title="下载"
      >
        <Download :size="17" />
      </button>
    </div>

    <!-- 图片预览 modal -->
    <Teleport to="body">
      <div v-if="showPreview" class="preview-overlay" @click="closePreview">
        <button class="preview-close" @click.stop="closePreview" aria-label="关闭预览">
          <X :size="20" />
        </button>
        <img :src="artifact.url" :alt="artifact.filename" class="preview-img" @click.stop />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* A1 file card — minimal inline card: emerald doc badge + name/type + download icon. */
.artifact-item {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: 440px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e4ea);
  border-radius: var(--radius-md, 12px);
  padding: 10px 12px;
}

/* S2 single image (#3) — no outer frame. */
.artifact-item--image {
  display: inline-block;
  width: auto;
  max-width: none;
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

.image-wrap {
  cursor: pointer;
}

.thumb {
  display: block;
  max-width: 360px;
  max-height: 320px;
  width: auto;
  height: auto;
  border-radius: var(--radius-md, 12px);
  box-shadow: var(--shadow-md, 0 2px 8px rgba(0, 0, 0, 0.06));
}

.image-wrap .filename {
  margin: 8px 2px 1px;
  font-size: 12px;
  color: var(--color-text-muted, #8b90a0);
}

.file-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}
/* 整卡可点击（预览/编辑/提示） */
.file-row--clickable {
  cursor: pointer;
}

/* Emerald document badge: soft emerald tint, rounded. */
.doc-badge {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--color-accent-ultra-soft, hsl(160, 60%, 95%));
  color: var(--color-primary, hsl(160, 72%, 40%));
  border: 1px solid var(--color-accent-soft, hsl(160, 60%, 93%));
}

.file-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.file-row .filename {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1a1d26);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-type {
  margin-top: 1px;
  font-size: 12px;
  color: var(--color-text-muted, #8b90a0);
  letter-spacing: 0.02em;
}

/* Transient "unsupported" hint shown after clicking a non-previewable/editable card. */
.card-hint {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--color-text-muted, #8b90a0);
  white-space: nowrap;
}

/* Emerald icon action button: soft tint square, deepens on hover. */
.icon-btn {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: none;
  background: var(--color-accent-ultra-soft, hsl(160, 60%, 95%));
  color: var(--color-primary, hsl(160, 72%, 40%));
  display: grid;
  place-items: center;
  cursor: pointer;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.icon-btn:hover {
  background: var(--color-accent-soft, hsl(160, 60%, 93%));
  color: var(--color-primary-hover, hsl(160, 72%, 34%));
}

.preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-close {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: #fff;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.preview-img {
  max-width: 90vw;
  max-height: 90vh;
  border-radius: 8px;
}
</style>
