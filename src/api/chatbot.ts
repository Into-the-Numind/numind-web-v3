import request from './request'
import { fetchSSE, readSSEStream } from './sales'
import type { ChatbotSession, ChatbotMessage, ChatbotConfig, ChatbotEvent } from '@/types/config'

// ==================== Chatbot Discovery (C-end) ====================

export const listVisibleChatbots = () => {
  return request.get<{ data: { list: ChatbotConfig[] } }>('/v1/chatbot/list')
}

// 检查当前用户是否有运行指定 chatbot 的权限（用于首页点击前预检）
// mirror SOP 的 /v1/sop/templates/:id/check-permission
export const checkChatbotPermission = async (chatbotId: number): Promise<boolean> => {
  try {
    const res = await request.get(`/v1/chatbot/${chatbotId}/check-permission`)
    const permission = (res as { data?: { has_permission?: boolean } })?.data?.has_permission
    return permission === true
  } catch (error) {
    console.error(`检查智能体 ${chatbotId} 权限失败:`, error)
    return false
  }
}

// ==================== Session APIs ====================

export const createChatbotSession = (chatbotId: number) => {
  return request.post<{ data: ChatbotSession }>('/v1/chatbot/sessions', {
    chatbot_id: chatbotId
  })
}

export const listChatbotSessions = (offset = 0, limit = 20, chatbotId?: number) => {
  const params: Record<string, number> = { offset, limit }
  if (chatbotId) params.chatbot_id = chatbotId
  return request.get<{ data: { list: ChatbotSession[]; total: number } }>('/v1/chatbot/sessions', {
    params
  })
}

export const renameChatbotSession = (id: number, title: string) =>
  request.put<{ data: ChatbotSession }>(`/v1/chatbot/sessions/${id}/rename`, { title })

export const pinChatbotSession = (id: number, pinned: boolean) =>
  request.put<{ data: ChatbotSession }>(`/v1/chatbot/sessions/${id}/pin`, { pinned })

export const deleteChatbotSession = (id: number) => {
  return request.delete(`/v1/chatbot/sessions/${id}`)
}

// ==================== Message APIs ====================

export const listChatbotMessages = (sessionId: number, offset = 0, limit = 50) => {
  return request.get<{ data: { list: ChatbotMessage[]; total: number } }>(
    `/v1/chatbot/sessions/${sessionId}/messages`,
    { params: { offset, limit } }
  )
}

// ==================== SSE Chat ====================

/**
 * Send a chat message via POST SSE stream.
 * Uses fetch (not axios) because EventSource only supports GET.
 * Parses `data: {"type":"token","content":"..."}` lines.
 */
export const sendChatbotMessageStream = async (
  sessionId: number,
  query: string,
  onEvent: (event: ChatbotEvent) => void,
  signal?: AbortSignal,
  modelKey?: string,
  thinking?: boolean,
  attachmentIds?: number[]
): Promise<void> => {
  const body: Record<string, unknown> = { message: query }
  if (modelKey) body.model_key = modelKey
  if (thinking !== undefined) body.thinking = thinking
  if (attachmentIds && attachmentIds.length > 0) body.attachment_ids = attachmentIds
  const response = await fetchSSE(`/v1/chatbot/sessions/${sessionId}/chat`, {
    body: JSON.stringify(body),
    signal
  })
  await readSSEStream(response, (event) => {
    onEvent(event as ChatbotEvent)
  })
}
