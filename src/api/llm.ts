import request from './request'

export interface LLMModel {
  model_key: string
  display_name: string
  supports_thinking: boolean
  thinking_only: boolean
  icon: string
  sort_order: number
}

export interface UserPreference {
  model_key: string
  thinking: boolean
}

export interface ModelsResponse {
  list: LLMModel[]
  default_model_key: string
}

export function getModelsApi() {
  return request.get<{ data: ModelsResponse }>('/v1/llm/models')
}

export function getPreferenceApi() {
  return request.get<{ data: Record<string, UserPreference> }>('/v1/llm/preference')
}

export function savePreferenceApi(feature: string, modelKey: string, thinking: boolean) {
  return request.put('/v1/llm/preference', { feature, model_key: modelKey, thinking })
}
