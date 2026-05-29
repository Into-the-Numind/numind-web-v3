<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { Download, Eye, FileText, X } from 'lucide-vue-next'

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
// HTML artifacts are agent-authored and published RAW (un-escaped) by the backend
// create_html tool, so we never open them directly — they render inside a fully
// sandboxed iframe (see the HTML preview modal). startsWith() covers both
// "text/html" and "text/html; charset=utf-8".
const isHtml = computed<boolean>(() => props.artifact.mime.startsWith('text/html'))

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
  <div class="artifact-item">
    <div v-if="isImage" class="image-wrap">
      <img :src="artifact.url" :alt="artifact.filename" class="thumb" @click="openPreview" />
      <p class="filename">{{ artifact.filename }}</p>
    </div>

    <div v-else-if="isHtml" class="file-row">
      <FileText :size="20" class="file-icon" />
      <span class="filename">{{ artifact.filename }}</span>
      <button
        class="preview-btn"
        data-testid="html-preview-btn"
        @click="openHtmlPreview"
        aria-label="预览页面"
      >
        <Eye :size="16" />
      </button>
      <button class="download-btn" @click="handleDownload" aria-label="下载文件">
        <Download :size="16" />
      </button>
    </div>

    <div v-else class="file-row">
      <FileText :size="20" class="file-icon" />
      <span class="filename">{{ artifact.filename }}</span>
      <button class="download-btn" @click="handleDownload" aria-label="下载文件">
        <Download :size="16" />
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
  </div>
</template>

<style scoped>
.artifact-item {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  padding: 8px 12px;
  margin: 4px 0;
}

.image-wrap {
  cursor: pointer;
}

.thumb {
  max-width: 240px;
  max-height: 160px;
  border-radius: 6px;
  object-fit: cover;
  display: block;
}

.filename {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}

.file-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-icon {
  color: var(--color-primary, #2563eb);
  flex-shrink: 0;
}

.file-row .filename {
  flex: 1;
  margin: 0;
  font-size: 13px;
  color: var(--color-text, #1f2937);
}

.preview-btn,
.download-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted, #6b7280);
  padding: 4px;
  border-radius: 4px;
}

.preview-btn:hover,
.download-btn:hover {
  background: #f3f4f6;
  color: var(--color-primary, #2563eb);
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
