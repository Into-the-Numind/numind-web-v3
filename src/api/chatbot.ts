import request from './request'
import { fetchSSE, readSSEStream } from './sales'
import type { ChatbotSession, ChatbotMessage, ChatbotConfig, ChatbotEvent } from '@/types/config'

// ==================== Chatbot Discovery (C-end) ====================

export const listVisibleChatbots = () => {
  return request.get<{ data: { list: ChatbotConfig[] } }>('/v1/chatbot/list')
}

// ==================== Session APIs ====================

export const createChatbotSession = (chatbotId: number) => {
  return request.post<{ data: ChatbotSession }>('/v1/chatbot/sessions', {
    chatbot_id: chatbotId
  })
}

export const listChatbotSessions = (offset = 0, limit = 20) => {
  return request.get<{ data: { list: ChatbotSession[]; total: number } }>('/v1/chatbot/sessions', {
    params: { offset, limit }
  })
}

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
  signal?: AbortSignal
): Promise<void> => {
  const response = await fetchSSE(`/v1/chatbot/sessions/${sessionId}/chat`, {
    body: JSON.stringify({ message: query }),
    signal
  })
  await readSSEStream(response, (event) => {
    onEvent(event as ChatbotEvent)
  })
}
