import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  MonitorBlogger,
  MonitorNote,
  MonitorBriefing,
  MonitorConfig,
  MonitorStats,
  ListBloggersParams,
  ListNotesParams,
  ListBriefingsParams
} from '@/api/monitor'
import {
  checkMonitorPermission,
  listBloggers,
  listNotes,
  listBriefings,
  getMonitorConfig,
  getMonitorStats
} from '@/api/monitor'

export const useMonitorStore = defineStore('monitor', () => {
  // ==================== State ====================
  const bloggers = ref<MonitorBlogger[]>([])
  const bloggersTotal = ref(0)
  const notes = ref<MonitorNote[]>([])
  const notesTotal = ref(0)
  const briefings = ref<MonitorBriefing[]>([])
  const briefingsTotal = ref(0)
  const config = ref<MonitorConfig | null>(null)
  const stats = ref<MonitorStats | null>(null)
  const loading = ref(false)
  const hasPermission = ref(false)

  // ==================== Getters ====================
  const activeBloggers = computed(() => bloggers.value.filter((b) => b.is_active))

  // ==================== Actions ====================
  async function checkPermission() {
    try {
      const res = await checkMonitorPermission()
      hasPermission.value = res.data?.allowed ?? false
    } catch (e) {
      console.error('[monitor] checkPermission failed:', e)
      hasPermission.value = false
    }
  }

  async function fetchBloggers(params?: ListBloggersParams) {
    loading.value = true
    try {
      const res = await listBloggers(params)
      bloggers.value = res.data?.list ?? []
      bloggersTotal.value = res.data?.total ?? 0
    } catch (e) {
      console.error('[monitor] fetchBloggers failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function fetchNotes(params?: ListNotesParams) {
    loading.value = true
    try {
      const res = await listNotes(params)
      notes.value = res.data?.list ?? []
      notesTotal.value = res.data?.total ?? 0
    } catch (e) {
      console.error('[monitor] fetchNotes failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function fetchBriefings(params?: ListBriefingsParams) {
    loading.value = true
    try {
      const res = await listBriefings(params)
      briefings.value = res.data?.list ?? []
      briefingsTotal.value = res.data?.total ?? 0
    } catch (e) {
      console.error('[monitor] fetchBriefings failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function fetchConfig() {
    try {
      const res = await getMonitorConfig()
      config.value = res.data ?? null
    } catch (e) {
      console.error('[monitor] fetchConfig failed:', e)
    }
  }

  async function fetchStats() {
    try {
      const res = await getMonitorStats()
      stats.value = res.data ?? null
    } catch (e) {
      console.error('[monitor] fetchStats failed:', e)
    }
  }

  return {
    // State
    bloggers,
    bloggersTotal,
    notes,
    notesTotal,
    briefings,
    briefingsTotal,
    config,
    stats,
    loading,
    hasPermission,

    // Getters
    activeBloggers,

    // Actions
    checkPermission,
    fetchBloggers,
    fetchNotes,
    fetchBriefings,
    fetchConfig,
    fetchStats
  }
})
