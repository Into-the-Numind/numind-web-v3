<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { Download, Eye, FileText, Pencil, X } from 'lucide-vue-next'

import { isEditable, isDocumentSystemEnabled } from '@/utils/editableArtifact'

// document-system：编辑器模态懒加载（含 Milkdown ProseMirror 重依赖），不进 agent 主 bundle。
const DocumentEditorModal = defineAsyncComponent(
  () => import('@/components/document/DocumentEditorModal.vue')
)

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
// Prefer the filename extension; fall back to a coarse mime-derived label.
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
// HTML artifacts are agent-authored and published RAW (un-escaped) by the backend
// create_html tool, so we never open them directly — they render inside a fully
// sandboxed iframe (see the HTML preview modal). startsWith() covers both
// "text/html" and "text/html; charset=utf-8".
const isHtml = computed<boolean>(() => props.artifact.mime.startsWith('text/html'))

// document-system：文本类产物（md/txt/html/docx）显示"打开编辑"入口，
// 受 feature flag（VITE_ENABLE_DOCUMENT_SYSTEM）+ 可编辑性双重控制。
const canEdit = computed<boolean>(
  () => isDocumentSystemEnabled() && isEditable(props.artifact.mime, props.artifact.filename)
)
const showEditor = ref(false)

const openEditor = (): void => {
  showEditor.value = true
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

const handleDownload = (): void => {
  const a = document.createElement('a')
  a.href = props.artifact.url
  a.download = props.artifact.filename
  // The COS URL is cross-origin, so browsers ignore `download` and would otherwise
  // navigate the app tab to the raw file. Open in a new tab with no window.opener
  // handle instead: the app session is preserved and the opened page (which, for
  // HTML, is un-sandboxed at the COS origin) cannot reach back into the app.
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
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="artifact-item" :class="{ 'artifact-item--image': isImage }">
    <!-- B1 image thumbnail card: rounded preview + caption, click → full modal. -->
    <div v-if="isImage" class="image-wrap" @click="openPreview">
      <img :src="artifact.url" :alt="artifact.filename" class="thumb" />
      <p class="filename">{{ artifact.filename }}</p>
    </div>

    <!-- A1 file card (HTML): emerald doc badge + name + type meta, preview + download. -->
    <div v-else-if="isHtml" class="file-row">
      <span class="doc-badge"><FileText :size="20" /></span>
      <span class="file-meta">
        <span class="filename">{{ artifact.filename }}</span>
        <span class="file-type">{{ fileTypeLabel }}</span>
      </span>
      <button
        class="icon-btn preview-btn"
        data-testid="html-preview-btn"
        @click="openHtmlPreview"
        aria-label="预览页面"
      >
        <Eye :size="17" />
      </button>
      <button
        v-if="canEdit"
        class="icon-btn edit-btn"
        data-testid="doc-edit-btn"
        @click="openEditor"
        aria-label="打开编辑"
      >
        <Pencil :size="17" />
      </button>
      <button class="icon-btn download-btn" @click="handleDownload" aria-label="下载文件">
        <Download :size="17" />
      </button>
    </div>

    <!-- A1 file card (downloadable doc): emerald doc badge + name + type meta + download. -->
    <div v-else class="file-row">
      <span class="doc-badge"><FileText :size="20" /></span>
      <span class="file-meta">
        <span class="filename">{{ artifact.filename }}</span>
        <span class="file-type">{{ fileTypeLabel }}</span>
      </span>
      <button
        v-if="canEdit"
        class="icon-btn edit-btn"
        data-testid="doc-edit-btn"
        @click="openEditor"
        aria-label="打开编辑"
      >
        <Pencil :size="17" />
      </button>
      <button class="icon-btn download-btn" @click="handleDownload" aria-label="下载文件">
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
              SECURITY (XSS hardening): agent-authored HTML is published RAW (un-escaped)
              by the backend create_html tool, so a prompt-injected <script> would execute
              if the document were opened directly. We render it ONLY inside this fully
              sandboxed iframe:
                - empty `sandbox` (NO allow-scripts) → injected scripts never run
                - NO allow-same-origin → opaque origin; cannot reach cookies / localStorage
                  / the app DOM / window.opener
                - referrerpolicy="no-referrer" → don't leak the presigned COS URL
              HTML + inline CSS still render visually. DO NOT add allow-scripts or
              allow-same-origin without a security review.
              Backend threat model: numind-server biz/agent/tool_create_html.go (renderHTML).
            -->
            <iframe
              :src="artifact.url"
              :title="artifact.filename"
              class="html-preview-frame"
              sandbox=""
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

    <!-- document-system：对话内打开编辑器（懒加载；仅文本类 + flag 开时可达） -->
    <!-- 注：v1 不传 run_id —— ArtifactRef 不携带 run_id，后端 open 靠 source_url 的
         agent-outputs/{userID}/ 前缀做归属校验已足够；run_id 弱关联留 v2 上传场景再接。 -->
    <DocumentEditorModal
      v-if="canEdit && showEditor"
      :source-url="artifact.url"
      :filename="artifact.filename"
      :mime="artifact.mime"
      @close="showEditor = false"
    />
  </div>
</template>

<style scoped>
/* A1 file card — minimal inline card: emerald doc badge + name/type + icon action. */
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

/* S2 single image (#3) — no outer frame: drop the card border/padding/background
   entirely. The image itself carries the rounded corners + a light shadow so it
   reads as a polished standalone visual, not a thumbnail boxed in a card. */
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

/* The image carries the whole S2 treatment: rounded + soft shadow, click to enlarge.
   max-width/max-height with auto sizing keeps any aspect ratio undistorted and
   un-cropped (no object-fit needed without a fixed box). */
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

/* Emerald document badge (playground A1 .doc-badge): soft emerald tint, rounded. */
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

/* Emerald icon action button (playground A1 .dl): soft tint square, deepens on hover. */
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
