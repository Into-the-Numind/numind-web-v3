import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  getModelsApi,
  getPreferenceApi,
  savePreferenceApi,
  type LLMModel,
  type UserPreference
} from '@/api/llm'

type Feature = 'chatbot' | 'sop'

export const useLLMModelStore = defineStore('llmModel', () => {
  // Backend returns different allowed lists per feature, so we cache per-feature.
  const modelsByFeature = ref<Record<string, LLMModel[]>>({})
  const defaultModelKeyByFeature = ref<Record<string, string>>({})
  const loadedByFeature = ref<Record<string, boolean>>({})
  const loadingByFeature = ref<Record<string, boolean>>({})
  const preferences = ref<Record<string, UserPreference>>({})

  async function fetchModels(feature: Feature) {
    if (loadedByFeature.value[feature]) return
    loadingByFeature.value[feature] = true
    try {
      const res = await getModelsApi(feature)
      modelsByFeature.value[feature] = (res as any)?.data?.list ?? []
      defaultModelKeyByFeature.value[feature] = (res as any)?.data?.default_model_key ?? ''
      loadedByFeature.value[feature] = true
    } finally {
      loadingByFeature.value[feature] = false
    }
  }

  function isLoading(feature: string): boolean {
    return loadingByFeature.value[feature] === true
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

  function getModels(feature: string): LLMModel[] {
    return modelsByFeature.value[feature] ?? []
  }

  function getDefaultModelKey(feature: string): string {
    return defaultModelKeyByFeature.value[feature] ?? ''
  }

  function getSelectedModelKey(feature: string): string {
    return preferences.value[feature]?.model_key || getDefaultModelKey(feature)
  }

  function isThinkingEnabled(feature: string): boolean {
    const model = getSelectedModel(feature)
    // thinking_only 模型始终启用思考
    if (model?.thinking_only) return true
    return preferences.value[feature]?.thinking ?? true
  }

  function getSelectedModel(feature: string): LLMModel | undefined {
    const key = getSelectedModelKey(feature)
    return getModels(feature).find((m) => m.model_key === key)
  }

  return {
    modelsByFeature,
    defaultModelKeyByFeature,
    preferences,
    loadingByFeature,
    loadedByFeature,
    fetchModels,
    fetchPreferences,
    savePreference,
    getModels,
    getDefaultModelKey,
    getSelectedModel,
    getSelectedModelKey,
    isThinkingEnabled,
    isLoading
  }
})
