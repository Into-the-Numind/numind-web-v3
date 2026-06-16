<script setup lang="ts">
// DocumentEditorModal —— 对话内打开 agent 产物的全屏 WYSIWYG 编辑器（document-system v1）。
// 自包含：挂载即打开（懒建档）、编辑自动保存、导出下载、关闭前 flush。
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { Download, X } from 'lucide-vue-next'

import { useDocumentsStore } from '@/stores/documents'
import type { ExportFormat } from '@/types/document'

// 懒加载 Milkdown（ProseMirror 重，避免进 agent 主 bundle）。
const MilkdownEditor = defineAsyncComponent(() => import('./MilkdownEditor.vue'))

const props = defineProps<{
  sourceUrl: string
  filename: string
  mime?: string
  runId?: number
}>()

const emit = defineEmits<{ close: [] }>()

const store = useDocumentsStore()
const showDownloadMenu = ref(false)

// content v-model：get 取当前文档正文（仅初值喂给编辑器），set 走 debounce 自动保存。
const content = computed<string>({
  get: () => store.current?.content_md ?? '',
  set: (v: string) => store.scheduleSave(v)
})

const saveLabel = computed<string>(() => {
  switch (store.saveState) {
    case 'saving':
      return '保存中…'
    case 'saved':
      return '已保存'
    case 'error':
      return '保存失败'
    default:
      return ''
  }
})

async function doOpen(): Promise<void> {
  store.reset()
  try {
    await store.open({
      source_url: props.sourceUrl,
      filename: props.filename,
      mime: props.mime,
      run_id: props.runId
    })
  } catch {
    // 错误经 store.error 在 UI 呈现（error 状态 + 重试）
  }
}

async function onExport(fmt: ExportFormat): Promise<void> {
  showDownloadMenu.value = false
  try {
    await store.exportAs(fmt)
  } catch {
    // 导出失败经 store.error 呈现
  }
}

async function handleClose(): Promise<void> {
  await store.flush() // 关闭前提交挂起的编辑（无飞行中保存时直接落库）
  // 安全网：若上一步因有保存在飞行中而 no-op，用 keepalive 兜底发送最新未存内容，
  // 避免"飞行中保存 + 新编辑 + 立即关闭"窗口里新编辑被 reset 丢弃。clean 情况下 pendingContent
  // 已为 null，flushOnUnload 自动 no-op。
  store.flushOnUnload()
  emit('close')
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    void handleClose()
  }
}

// 浏览器关闭/刷新前用 keepalive 提交未存改动。
function onBeforeUnload(): void {
  store.flushOnUnload()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)
  void doOpen()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
  store.reset()
})
</script>

<template>
  <Teleport to="body">
    <div class="doc-editor-overlay" @click.self="handleClose">
      <div class="doc-editor-panel" role="dialog" aria-modal="true" :aria-label="filename">
        <header class="doc-editor-bar">
          <span class="doc-editor-title">{{ store.current?.title || filename }}</span>
          <span class="doc-editor-savestate" :class="`is-${store.saveState}`">{{ saveLabel }}</span>
          <div class="doc-editor-actions">
            <div class="doc-download" @click.stop>
              <button
                class="doc-btn"
                data-testid="doc-download-btn"
                :disabled="!store.current"
                @click="showDownloadMenu = !showDownloadMenu"
              >
                <Download :size="16" /> 下载
              </button>
              <ul v-if="showDownloadMenu" class="doc-download-menu">
                <li @click="onExport('md')">Markdown (.md)</li>
                <li @click="onExport('pdf')">PDF (.pdf)</li>
                <li @click="onExport('docx')">Word (.docx)</li>
              </ul>
            </div>
            <button class="doc-close" @click="handleClose" aria-label="关闭">
              <X :size="18" />
            </button>
          </div>
        </header>

        <div class="doc-editor-body">
          <!-- loading -->
          <div v-if="store.loading" class="doc-state">正在打开文档…</div>
          <!-- error -->
          <div v-else-if="store.error && !store.current" class="doc-state doc-state--error">
            <p>{{ store.error }}</p>
            <button class="doc-btn" @click="doOpen">重试</button>
          </div>
          <!-- success -->
          <MilkdownEditor v-else-if="store.current" v-model="content" class="doc-editor-canvas" />
          <!-- empty -->
          <div v-else class="doc-state">暂无内容</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.doc-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}
.doc-editor-panel {
  width: min(960px, 94vw);
  height: min(88vh, 920px);
  display: flex;
  flex-direction: column;
  background: var(--color-bg, #fff);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.24);
}
.doc-editor-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border, #ececec);
}
.doc-editor-title {
  font-weight: 600;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-editor-savestate {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
}
.doc-editor-savestate.is-saving {
  color: #d97706;
}
.doc-editor-savestate.is-saved {
  color: #16a34a;
}
.doc-editor-savestate.is-error {
  color: #dc2626;
}
.doc-editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.doc-download {
  position: relative;
}
.doc-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
}
.doc-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.doc-download-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  margin: 0;
  padding: 4px 0;
  list-style: none;
  background: var(--color-bg, #fff);
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  min-width: 160px;
  z-index: 1;
}
.doc-download-menu li {
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
}
.doc-download-menu li:hover {
  background: var(--color-bg-hover, #f5f5f5);
}
.doc-close {
  display: inline-flex;
  padding: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
}
.doc-editor-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
.doc-editor-canvas {
  height: 100%;
}
.doc-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  color: var(--color-text-secondary, #999);
}
.doc-state--error p {
  color: #dc2626;
}
</style>
