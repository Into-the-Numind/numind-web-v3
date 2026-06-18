<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { Download, FileText, X } from 'lucide-vue-next'

import { isEditable, isDocumentSystemEnabled } from '@/utils/editableArtifact'
import { useDocumentsStore } from '@/stores/documents'

// document-system：编辑器是页面级右侧面板（AgentChatView 第三栏，由 documentsStore.current 驱动）。
// 卡片交互模型（dev 验收 followup2 第三轮）：卡片只显一个【下载】按钮；【预览/编辑】通过点击
// 卡片本身进入 —— HTML→渲染预览，可编辑文档→打开编辑器，其余格式→提示"暂不支持预览"。
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

// HTML artifacts are agent-authored; rendered inside a sandboxed iframe preview.
// startsWith() covers both "text/html" and "text/html; charset=utf-8".
const isHtml = computed<boolean>(() => props.artifact.mime.startsWith('text/html'))

// document-system：文本类产物（md/txt/html/docx）可在右侧编辑器面板打开编辑，
// 受 feature flag（VITE_ENABLE_DOCUMENT_SYSTEM）+ 可编辑性双重控制。
const canEdit = computed<boolean>(
  () => isDocumentSystemEnabled() && isEditable(props.artifact.mime, props.artifact.filename)
)

const openEditor = (): void => {
  void documentsStore.open({
    source_url: props.artifact.url,
    filename: props.artifact.filename,
    mime: props.artifact.mime
  })
}

const showPreview = ref(false)
const showHtmlPreview = ref(false)
// The sandboxed iframe loads a cross-origin COS object whose presigned URL expires
// after 24h; track load/error so we never strand the user on a blank frame.
const iframeLoading = ref(true)
const iframeError = ref(false)

const openPreview = (): void => {
  showPreview.value = true
}
const closePreview = (): void => {
  showPreview.value = false
}
const openHtmlPreview = (): void => {
  iframeLoading.value = true
  iframeError.value = false
  showHtmlPreview.value = true
}
const closeHtmlPreview = (): void => {
  showHtmlPreview.value = false
}
const onIframeLoad = (): void => {
  iframeLoading.value = false
}
const onIframeError = (): void => {
  iframeLoading.value = false
  iframeError.value = true
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

// 点击卡片 → 预览(可渲染) / 编辑(可编辑) / 否则提示不支持。下载走独立按钮（stop 冒泡）。
const onCardClick = (): void => {
  if (isHtml.value) {
    openHtmlPreview()
    return
  }
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
  if (showHtmlPreview.value) closeHtmlPreview()
  else if (showPreview.value) closePreview()
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

    <!-- A1 file card: ONE download button; click the card to preview (HTML rendered) /
         edit (editable docs) / else flash "暂不支持预览". -->
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

    <!-- HTML 沙箱预览 modal -->
    <Teleport to="body">
      <div v-if="showHtmlPreview" class="html-preview-overlay" @click="closeHtmlPreview">
        <div
          class="html-preview-panel"
          role="dialog"
          aria-modal="true"
          :aria-label="artifact.filename"
          @click.stop
        >
          <header class="html-preview-bar">
            <span class="html-preview-title">{{ artifact.filename }}</span>
            <button class="html-preview-action" @click="handleDownload" aria-label="下载文件">
              <Download :size="18" />
            </button>
            <button class="html-preview-close" @click="closeHtmlPreview" aria-label="关闭预览">
              <X :size="20" />
            </button>
          </header>
          <div class="html-preview-body">
            <!--
              SECURITY: agent-authored HTML is published RAW (un-escaped) by the backend
              create_html tool. We render it inside a sandboxed iframe with allow-scripts
              but WITHOUT allow-same-origin (product-owner approved, dev followup2):
                - allow-scripts → the report's own JS (Tailwind CDN, charts) runs so the
                  page renders with its real styling (sandbox="" showed unstyled text).
                - NO allow-same-origin → OPAQUE origin: the script CANNOT read the app's
                  cookies / localStorage / DOM / window.opener — it cannot touch the user
                  session (CodePen-tier isolation). Worst case is confined to the iframe.
                - NO allow-top-navigation → cannot hijack the app tab.
                - NO allow-popups → a prompt-injected script cannot spam pop-up tabs.
                - referrerpolicy="no-referrer" → don't leak the presigned COS URL.
              The ONLY token is allow-scripts. DO NOT add allow-same-origin /
              allow-top-navigation / allow-popups without a security review.
              Backend threat model: numind-server biz/agent/tool_create_html.go (renderHTML).
            -->
            <iframe
              :src="artifact.url"
              :title="artifact.filename"
              class="html-preview-frame"
              sandbox="allow-scripts"
              referrerpolicy="no-referrer"
              loading="lazy"
              @load="onIframeLoad"
              @error="onIframeError"
            ></iframe>
            <div v-if="iframeLoading || iframeError" class="html-preview-status">
              <template v-if="iframeError">
                <span>页面无法显示，链接可能已过期。</span>
                <button class="html-preview-link" @click="handleDownload">下载查看</button>
              </template>
              <span v-else>加载中…</span>
            </div>
          </div>
        </div>
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

/* HTML sandbox preview modal */
.html-preview-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.html-preview-panel {
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  width: min(1000px, 92vw);
  height: min(86vh, 900px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
}

.html-preview-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.html-preview-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.html-preview-action,
.html-preview-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted, #6b7280);
  padding: 4px;
  border-radius: 4px;
  display: inline-flex;
  flex-shrink: 0;
}

.html-preview-action:hover,
.html-preview-close:hover {
  background: #f3f4f6;
  color: var(--color-text, #1f2937);
}

.html-preview-body {
  position: relative;
  flex: 1;
  min-height: 0;
}

.html-preview-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  background: #fff;
}

.html-preview-status {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  background: #fff;
  color: var(--color-text-muted, #6b7280);
  font-size: 13px;
}

.html-preview-link {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-primary, #2563eb);
  text-decoration: underline;
  font-size: 13px;
  padding: 0;
}
</style>
