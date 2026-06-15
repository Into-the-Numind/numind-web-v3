/**
 * announcements store — 公告中心 / 问卷（用户端）
 *
 * ⚠️ 注意：本 store 与 `notifications.ts`（toast 通知事件总线）是两个独立东西。
 * 本 store 管理后端公告/问卷数据；notifications.ts 管理前端临时 toast。勿混淆。
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AnnouncementBrief, AnnouncementDetail, SubmitAnswer } from '@/api/announcements'
import {
  fetchAnnouncements,
  fetchUnreadCount,
  fetchAnnouncementDetail,
  markAnnouncementRead,
  submitSurvey as apiSubmitSurvey
} from '@/api/announcements'

export const useAnnouncementsStore = defineStore('announcements', () => {
  // ==================== State ====================
  const list = ref<AnnouncementBrief[]>([])
  const total = ref(0)
  const unreadCount = ref(0)
  const loading = ref(false)
  const error = ref('')

  const current = ref<AnnouncementDetail | null>(null)
  const currentLoading = ref(false)
  const submitting = ref(false)

  // ==================== Getters ====================
  const hasUnread = computed(() => unreadCount.value > 0)

  // ==================== Actions ====================

  /** 加载公告列表（含未读计数 + 总数） */
  async function loadAnnouncements(params: { page: number; page_size: number }) {
    loading.value = true
    error.value = ''
    try {
      const resp = await fetchAnnouncements(params)
      list.value = resp.list
      total.value = resp.total
      unreadCount.value = resp.unread_count
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载公告失败'
      console.error('[announcements] loadAnnouncements failed:', e)
    } finally {
      loading.value = false
    }
  }

  /** 刷新未读计数 —— 走轻量 unread-count 端点（铃铛轮询用，不拉整张列表） */
  async function refreshUnread() {
    try {
      const resp = await fetchUnreadCount()
      unreadCount.value = resp.unread_count
    } catch (e) {
      console.error('[announcements] refreshUnread failed:', e)
    }
  }

  /** 加载公告详情 */
  async function loadDetail(id: number) {
    currentLoading.value = true
    error.value = ''
    try {
      current.value = await fetchAnnouncementDetail(id)
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载详情失败'
      console.error('[announcements] loadDetail failed:', e)
    } finally {
      currentLoading.value = false
    }
  }

  /** 标记已读 —— 用响应的未读计数更新红点，并乐观更新列表项 is_read */
  async function markRead(id: number) {
    try {
      const resp = await markAnnouncementRead(id)
      unreadCount.value = resp.unread_count
      // 乐观更新列表中对应项的已读态
      const item = list.value.find((a) => a.id === id)
      if (item) item.is_read = true
      // 同步当前详情（若正打开同一条）
      if (current.value && current.value.id === id) current.value.is_read = true
    } catch (e) {
      console.error('[announcements] markRead failed:', e)
    }
  }

  /** 提交问卷答卷 —— 成功后将当前详情标记为已提交 */
  async function submitSurvey(id: number, answers: SubmitAnswer[]): Promise<boolean> {
    submitting.value = true
    try {
      const resp = await apiSubmitSurvey(id, answers)
      if (resp.submitted) {
        if (current.value && current.value.id === id) {
          current.value.is_survey_submitted = true
        }
        const item = list.value.find((a) => a.id === id)
        if (item) item.is_survey_submitted = true
      }
      return resp.submitted
    } catch (e) {
      console.error('[announcements] submitSurvey failed:', e)
      throw e
    } finally {
      submitting.value = false
    }
  }

  return {
    // State
    list,
    total,
    unreadCount,
    loading,
    error,
    current,
    currentLoading,
    submitting,

    // Getters
    hasUnread,

    // Actions
    loadAnnouncements,
    refreshUnread,
    loadDetail,
    markRead,
    submitSurvey
  }
})
