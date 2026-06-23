import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { NoteItem, ListNotesParams, ExtTokenResponse } from '@/api/xhs'
import { listNotes, getNote, deleteNote, exportNotes, getExtToken } from '@/api/xhs'

/**
 * xhs store — 小红书选题库（T8）
 *
 * 照 monitor store 的结构：notes/total/loading/error + 一组 action。
 * 列表数据走服务端分页（page/page_size），由 view 负责持有分页状态。
 */
export const useXhsStore = defineStore('xhs', () => {
  // ==================== State ====================
  const notes = ref<NoteItem[]>([])
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')
  const exporting = ref(false)

  // ==================== Getters ====================
  const isEmpty = computed(() => notes.value.length === 0)

  // ==================== Actions ====================
  async function fetchNotes(params?: ListNotesParams) {
    loading.value = true
    error.value = ''
    try {
      const res = await listNotes(params)
      notes.value = res.data?.list ?? []
      total.value = res.data?.total ?? 0
    } catch (e) {
      error.value = (e as Error).message || '加载选题库失败'
      notes.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  /** 拉单条笔记详情（详情抽屉用，不写入列表 state） */
  async function getNoteDetail(id: number): Promise<NoteItem | null> {
    try {
      const res = await getNote(id)
      return res.data ?? null
    } catch (e) {
      error.value = (e as Error).message || '加载笔记详情失败'
      return null
    }
  }

  /** 删除笔记；成功后从本地列表移除并修正 total */
  async function removeNote(id: number): Promise<boolean> {
    await deleteNote(id)
    const idx = notes.value.findIndex((n) => n.id === id)
    if (idx !== -1) {
      notes.value.splice(idx, 1)
      total.value = Math.max(0, total.value - 1)
    }
    return true
  }

  /** 导出选中笔记，返回下载链接（1h 有效）。loading 防重复由 exporting 标记。 */
  async function exportSelected(ids: number[]): Promise<string> {
    exporting.value = true
    try {
      const res = await exportNotes({ ids })
      return res.data?.download_url ?? ''
    } finally {
      exporting.value = false
    }
  }

  /** 获取插件授权 token */
  async function fetchExtToken(): Promise<ExtTokenResponse | null> {
    try {
      const res = await getExtToken()
      return res.data ?? null
    } catch (e) {
      error.value = (e as Error).message || '获取授权令牌失败'
      return null
    }
  }

  return {
    // State
    notes,
    total,
    loading,
    error,
    exporting,

    // Getters
    isEmpty,

    // Actions
    fetchNotes,
    getNoteDetail,
    removeNote,
    exportSelected,
    fetchExtToken
  }
})
