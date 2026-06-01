import { defineStore } from 'pinia'
import { ref } from 'vue'

import { getConsumptionLog, type ConsumptionLogItem, type ConsumptionLogResp } from '@/api/credits'
import { useNotificationsStore } from '@/stores/notifications'

export const useConsumptionLogStore = defineStore('consumptionLog', () => {
  const records = ref<ConsumptionLogItem[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(20)
  const loading = ref(false)
  const error = ref(false)

  async function fetchPage(targetPage = 1): Promise<void> {
    loading.value = true
    error.value = false
    try {
      const res = await getConsumptionLog(targetPage, pageSize.value)
      const payload = (res as unknown as { data: ConsumptionLogResp }).data
      records.value = payload?.list ?? []
      total.value = payload?.total ?? 0
      page.value = targetPage
    } catch {
      error.value = true
      records.value = []
      useNotificationsStore().error('加载积分消耗记录失败，请重试')
    } finally {
      loading.value = false
    }
  }

  function reset(): void {
    records.value = []
    total.value = 0
    page.value = 1
    error.value = false
    loading.value = false
  }

  return { records, total, page, pageSize, loading, error, fetchPage, reset }
})
