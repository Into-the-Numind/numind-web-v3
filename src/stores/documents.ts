import { defineStore } from 'pinia'
import { ref } from 'vue'

import { openDocument, saveDocument, exportDocument } from '@/api/documents'
import { getToken } from '@/api/request'
import type { DocumentDTO, OpenDocReq, ExportFormat } from '@/types/document'

const AUTOSAVE_DEBOUNCE_MS = 1500

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// useDocumentsStore 管理"在对话内打开的当前文档"的打开/自动保存/导出（document-system v1）。
export const useDocumentsStore = defineStore('documents', () => {
  // state（4 状态由 loading/error/current 组合表达）
  const current = ref<DocumentDTO | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const saveState = ref<SaveState>('idle')
  // pendingTitle：open 解析完成前先用请求文件名（去扩展名）做面板标题，避免加载期标题空白。
  const pendingTitle = ref<string>('')

  // 自动保存内部状态（非响应式）
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let pendingContent: string | null = null
  let inflight = false
  let lastReq: OpenDocReq | null = null
  // openSeq：快速连点不同卡片时，多个 open() 并发；只让最后一次的结果落地，
  // 防止先发后到的旧请求覆盖出错误的文档（last-write-wins 竞态）。
  let openSeq = 0

  // open 打开/懒建档一个 agent 产物。
  async function open(req: OpenDocReq): Promise<DocumentDTO> {
    // 切换文档前先落库上一篇未存编辑（flush + keepalive 兜底），避免点开另一篇时丢失。
    // 首次打开时 current 为 null，两者均自动 no-op。
    await flush()
    flushOnUnload()
    const seq = ++openSeq
    lastReq = req
    pendingTitle.value = req.filename.replace(/\.[^./\\]+$/, '').trim() || '文档'
    loading.value = true
    error.value = null
    saveState.value = 'idle'
    pendingContent = null
    try {
      const resp = await openDocument(req)
      // 被更晚的 open 取代 → 丢弃本次结果，不写 current（否则会闪回旧文档）。
      if (seq === openSeq) {
        current.value = resp.data
      }
      return resp.data
    } catch (e) {
      if (seq === openSeq) {
        error.value = (e as Error)?.message || '打开文档失败'
      }
      throw e
    } finally {
      if (seq === openSeq) {
        loading.value = false
      }
    }
  }

  // scheduleSave 编辑时调用：debounce 1.5s 后落库。
  function scheduleSave(contentMd: string): void {
    if (!current.value) {
      return
    }
    pendingContent = contentMd
    saveState.value = 'saving'
    if (saveTimer) {
      clearTimeout(saveTimer)
    }
    saveTimer = setTimeout(() => {
      void flush()
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  // flush 立即提交挂起的改动（debounce 到期 / 关闭前主动调用）。inflight 守卫防并发。
  async function flush(): Promise<void> {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (!current.value || pendingContent === null || inflight) {
      return
    }
    const id = current.value.id
    const body = pendingContent
    inflight = true
    try {
      await saveDocument(id, { content_md: body })
      // 身份守卫：飞行期间可能已切换到别的文档（current 变了）。仅当仍是同一篇才回写
      // content_md / 清 pending / 标 saved，否则会把 A 的正文写进 B、错标 B 已保存。
      if (current.value?.id === id) {
        current.value.content_md = body
        // 仅当飞行期间无更新的编辑到达时才清空 + 标记 saved；否则保留新编辑（防丢失更新）。
        if (pendingContent === body) {
          pendingContent = null
          saveState.value = 'saved'
        }
      }
    } catch (e) {
      // 同身份守卫：A 的保存失败不应把已切换到的 B 错误地标成 error 态。
      if (current.value?.id === id) {
        saveState.value = 'error'
        error.value = (e as Error)?.message || '保存失败'
      }
    } finally {
      inflight = false
      // 飞行期间到达了更新的编辑（pendingContent 仍非空且非错误态）→ 立即再排一次保存，
      // 否则慢保存期间的编辑会被永久丢弃（lost-update race）。
      if (pendingContent !== null && saveState.value !== 'error') {
        if (saveTimer) {
          clearTimeout(saveTimer)
        }
        saveTimer = setTimeout(() => {
          void flush()
        }, AUTOSAVE_DEBOUNCE_MS)
      }
    }
  }

  // flushOnUnload 关闭/卸载前用 fetch keepalive 提交未存改动（sendBeacon 无法带 auth header）。
  function flushOnUnload(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (!current.value || pendingContent === null) {
      return
    }
    const id = current.value.id
    const token = getToken() || ''
    const base = String(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
    void fetch(`${base}/v1/documents/${id}`, {
      method: 'PUT',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ content_md: pendingContent })
    })
    pendingContent = null
  }

  // exportAs 导出并触发浏览器下载。
  async function exportAs(format: ExportFormat): Promise<void> {
    if (!current.value) {
      return
    }
    const id = current.value.id
    const title = current.value.title || 'document'
    const blob = await exportDocument(id, format)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title}.${format}`
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // retry 错误态重试：重新打开上次请求的文档。
  async function retry(): Promise<void> {
    if (!lastReq) {
      return
    }
    try {
      await open(lastReq)
    } catch {
      // 错误已由 open 记录到 error.value
    }
  }

  // reset 清空当前文档（关闭编辑器时调用）。
  function reset(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    current.value = null
    loading.value = false
    error.value = null
    saveState.value = 'idle'
    pendingTitle.value = ''
    pendingContent = null
    inflight = false
    lastReq = null
  }

  return {
    current,
    loading,
    error,
    saveState,
    pendingTitle,
    open,
    retry,
    scheduleSave,
    flush,
    flushOnUnload,
    exportAs,
    reset
  }
})
