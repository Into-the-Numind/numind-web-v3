<script setup lang="ts">
// DocumentEditorPanel —— 对话页右侧内联的 WYSIWYG 文档编辑列（document-system v1）。
// 与 Modal 版的区别：不再是全屏弹窗，而是页面第三列（会话列表→正文→文档编辑器）。
// 完全由 documentsStore 驱动：卡片点击时已调用 store.open()，本面板只读 store 渲染。
// 关闭 = store.reset() → 父级 v-if 变 false → 本面板卸载。
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import { Download, X } from 'lucide-vue-next'

import { useDocumentsStore } from '@/stores/documents'
import type { ExportFormat } from '@/types/document'

// 懒加载 Milkdown（ProseMirror 重，避免进 agent 主 bundle）。
const MilkdownEditor = defineAsyncComponent(() => import('./MilkdownEditor.vue'))

const store = useDocumentsStore()
const showDownloadMenu = ref(false)

// 标题：优先用解析后的真实文档名，加载期回退到请求文件名（pendingTitle）。
const title = computed<string>(() => store.current?.title || store.pendingTitle || '文档')

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
  // 安全网：若上一步因有保存在飞行中而 no-op，用 keepalive 兜底发送最新未存内容。
  store.flushOnUnload()
  store.reset() // current/loading/error 清空 → 父级 v-if 变 false → 本面板卸载
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    void handleClose()
  }
}

// 点击下载菜单之外的任意处关闭它（菜单容器自身 @click.stop，不会冒泡到这里）。
function onDocClick(): void {
  if (showDownloadMenu.value) {
    showDownloadMenu.value = false
  }
}

// 浏览器关闭/刷新前用 keepalive 提交未存改动。
function onBeforeUnload(): void {
  store.flushOnUnload()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.addEventListener('click', onDocClick)
  window.addEventListener('beforeunload', onBeforeUnload)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('beforeunload', onBeforeUnload)
  // 兜底：任何路径卸载本列（如离开页面）都提交未存改动。
  store.flushOnUnload()
})
</script>

<template>
  <section class="doc-panel" role="region" :aria-label="title">
    <header class="doc-panel-bar">
      <span class="doc-panel-title" :title="title">{{ title }}</span>
      <span class="doc-panel-savestate" :class="`is-${store.saveState}`">{{ saveLabel }}</span>
      <div class="doc-panel-actions">
        <div class="doc-download" @click.stop>
          <button
            class="doc-icon-btn"
            data-testid="doc-download-btn"
            :disabled="!store.current"
            aria-label="下载"
            title="下载"
            @click="showDownloadMenu = !showDownloadMenu"
          >
            <Download :size="18" />
          </button>
          <ul v-if="showDownloadMenu" class="doc-download-menu">
            <li @click="onExport('md')">Markdown (.md)</li>
            <li @click="onExport('pdf')">PDF (.pdf)</li>
            <li @click="onExport('docx')">Word (.docx)</li>
          </ul>
        </div>
        <button
          class="doc-icon-btn"
          @click="() => void handleClose()"
          aria-label="关闭"
          title="关闭"
        >
          <X :size="18" />
        </button>
      </div>
    </header>

    <div class="doc-panel-body">
      <!-- loading -->
      <div v-if="store.loading" class="doc-state">正在打开文档…</div>
      <!-- error -->
      <div v-else-if="store.error && !store.current" class="doc-state doc-state--error">
        <p>{{ store.error }}</p>
        <button class="doc-btn" @click="store.retry()">重试</button>
      </div>
      <!-- success -->
      <MilkdownEditor v-else-if="store.current" v-model="content" class="doc-panel-canvas" />
      <!-- empty -->
      <div v-else class="doc-state">暂无内容</div>
    </div>
  </section>
</template>

<style scoped>
.doc-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--color-bg, #fff);
  border-left: 1px solid var(--color-border, #ececec);
}
.doc-panel-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border, #ececec);
  flex-shrink: 0;
}
.doc-panel-title {
  font-weight: 600;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-panel-savestate {
  font-size: 12px;
  color: var(--color-text-secondary, #999);
}
.doc-panel-savestate.is-saving {
  color: #d97706;
}
.doc-panel-savestate.is-saved {
  color: #16a34a;
}
.doc-panel-savestate.is-error {
  color: #dc2626;
}
.doc-panel-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.doc-download {
  position: relative;
}
.doc-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
  color: var(--color-text, #333);
}
.doc-icon-btn:hover {
  background: var(--color-bg-hover, #f5f5f5);
}
.doc-icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  z-index: 5;
}
.doc-download-menu li {
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
}
.doc-download-menu li:hover {
  background: var(--color-bg-hover, #f5f5f5);
}
.doc-panel-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
  background: var(--color-bg, #fff);
}
.doc-panel-canvas {
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
