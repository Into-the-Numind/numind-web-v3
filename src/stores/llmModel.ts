import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  getModelsApi,
  getPreferenceApi,
  savePreferenceApi,
  type LLMModel,
  type UserPreference
} from '@/api/llm'

export const useLLMModelStore = defineStore('llmModel', () => {
  const models = ref<LLMModel[]>([])
  const defaultModelKey = ref('')
  const preferences = ref<Record<string, UserPreference>>({})
  const loading = ref(false)
  const loaded = ref(false)

  async function fetchModels() {
    if (loaded.value) return // only fetch once
    loading.value = true
    try {
      const res = await getModelsApi()
      models.value = (res as any)?.data?.list ?? []
      defaultModelKey.value = (res as any)?.data?.default_model_key ?? ''
      loaded.value = true
    } finally {
      loading.value = false
    }
  }

  async function fetchPreferences() {
    try {
      const res = await getPreferenceApi()
      preferences.value = (res as any)?.data ?? {}
    } catch {
      // silent fail, use defaults
    }
  }

  async function savePreference(feature: string, modelKey: string, thinking: boolean) {
    // 乐观更新：先改本地状态，再异步持久化，避免 UI 延迟
    preferences.value[feature] = { model_key: modelKey, thinking }
    try {
      await savePreferenceApi(feature, modelKey, thinking)
    } catch {
      // 持久化失败不回滚，下次刷新会从后端重新拉取
    }
  }

  function getSelectedModelKey(feature: string): string {
    return preferences.value[feature]?.model_key || defaultModelKey.value
  }

  function isThinkingEnabled(feature: string): boolean {
    return preferences.value[feature]?.thinking ?? true
  }

  function getSelectedModel(feature: string): LLMModel | undefined {
    const key = getSelectedModelKey(feature)
    return models.value.find((m) => m.model_key === key)
  }

  return {
    models,
    defaultModelKey,
    preferences,
    loading,
    loaded,
    fetchModels,
    fetchPreferences,
    savePreference,
    getSelectedModel,
    getSelectedModelKey,
    isThinkingEnabled
  }
})
