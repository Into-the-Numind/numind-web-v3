import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { ChatbotSession, ChatbotMessage, ChatbotConfig, ChatbotEvent } from '@/types/config'
import {
  listVisibleChatbots,
  createChatbotSession,
  listChatbotSessions,
  deleteChatbotSession,
  listChatbotMessages,
  sendChatbotMessageStream,
  renameChatbotSession,
  pinChatbotSession
} from '@/api/chatbot'
import { useLLMModelStore } from '@/stores/llmModel'

let nextLocalId = -1

export const useChatbotStore = defineStore('chatbot', () => {
  // ==================== State ====================
  const visibleChatbots = ref<ChatbotConfig[]>([])
  const sessions = ref<ChatbotSession[]>([])
  const sessionsTotal = ref(0)
  const currentSession = ref<ChatbotSession | null>(null)
  const currentChatbotId = ref<number | null>(null)
  const messages = ref<ChatbotMessage[]>([])
  const messagesLoading = ref(false)
  const streaming = ref(false)

  // Stream state
  const streamContent = ref('')
  const streamThinkingContent = ref('')
  const streamStatus = ref('')
  const streamError = ref('')
  const sseAbortController = shallowRef<AbortController | null>(null)

  // ==================== Chatbot Discovery ====================

  async function fetchVisibleChatbots() {
    try {
      const res = await listVisibleChatbots()
      const data = (res as any)?.data as { list: ChatbotConfig[] } | undefined
      visibleChatbots.value = data?.list ?? []
    } catch (e) {
      console.error('[chatbot] fetchVisibleChatbots failed:', e)
    }
  }

  // ==================== Session Actions ====================

  async function fetchSessions(chatbotId: number, offset = 0, limit = 20) {
    try {
      const res = await listChatbotSessions(offset, limit, chatbotId)
      const data = (res as any)?.data as { list: ChatbotSession[]; total: number } | undefined
      sessions.value = data?.list ?? []
      sessionsTotal.value = data?.total ?? 0
    } catch (e) {
      console.error('[chatbot] fetchSessions failed:', e)
    }
  }

  async function createSession(chatbotId: number): Promise<ChatbotSession | null> {
    try {
      const res = await createChatbotSession(chatbotId)
      const session = (res as any)?.data as ChatbotSession | undefined
      if (session) {
        await fetchSessions(chatbotId)
        currentSession.value = session
        await fetchMessages(session.id)
        return session
      }
      return null
    } catch (e) {
      console.error('[chatbot] createSession failed:', e)
      return null
    }
  }

  async function deleteSession(id: number) {
    try {
      await deleteChatbotSession(id)
      if (currentSession.value?.id === id) {
        currentSession.value = null
        messages.value = []
      }
      // currentChatbotId.value ?? 0: fallback to 0 should not happen in normal
      // flow (currentChatbotId is set before any session is created/deleted)
      await fetchSessions(currentChatbotId.value ?? 0)
      return true
    } catch (e) {
      console.error('[chatbot] deleteSession failed:', e)
      return false
    }
  }

  async function switchSession(session: ChatbotSession) {
    currentSession.value = session
    messagesLoading.value = true
    try {
      await fetchMessages(session.id)
    } finally {
      messagesLoading.value = false
    }
  }

  // ==================== Message Actions ====================

  async function fetchMessages(sessionId: number, offset = 0, limit = 50) {
    try {
      const res = await listChatbotMessages(sessionId, offset, limit)
      const data = (res as any)?.data as { list: ChatbotMessage[]; total: number } | undefined
      messages.value = data?.list ?? []
    } catch (e) {
      console.error('[chatbot] fetchMessages failed:', e)
    }
  }

  // ==================== Chat Streaming ====================

  async function sendMessage(text: string) {
    if (streaming.value) return
    if (!currentSession.value) return

    const sessionId = currentSession.value.id

    // Append optimistic user message
    const userMsg: ChatbotMessage = {
      id: nextLocalId--,
      session_id: sessionId,
      role: 'user',
      content: text,
      thinking: '',
      seq: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      created_at: new Date().toISOString()
    }
    messages.value.push(userMsg)

    // Prepare streaming state
    streaming.value = true
    streamContent.value = ''
    streamThinkingContent.value = ''
    streamStatus.value = ''
    streamError.value = ''

    const controller = new AbortController()
    sseAbortController.value = controller

    let content = ''
    let thinking = ''

    const llmStore = useLLMModelStore()
    const selectedModelKey = llmStore.getSelectedModelKey('chatbot')
    const thinkingEnabled = llmStore.isThinkingEnabled('chatbot')

    try {
      await sendChatbotMessageStream(
        sessionId,
        text,
        (event: ChatbotEvent) => {
          switch (event.type) {
            case 'status':
              streamStatus.value = String(event.data || '')
              break
            case 'thinking':
              thinking += String(event.data || '')
              streamThinkingContent.value = thinking
              break
            case 'token':
              content += String(event.data || '')
              streamContent.value = content
              streamStatus.value = ''
              break
            case 'done':
              break
            case 'error':
              streamError.value = String(event.data || '未知错误')
              break
          }
        },
        controller.signal,
        selectedModelKey || undefined,
        thinkingEnabled
      )
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        console.error('[chatbot] sendMessage SSE error:', e)
        streamError.value = e.message || '请求失败'
      }
    } finally {
      // Append AI message from accumulated stream
      if (content || thinking) {
        const aiMsg: ChatbotMessage = {
          id: nextLocalId--,
          session_id: sessionId,
          role: 'assistant',
          content,
          thinking,
          seq: 0,
          prompt_tokens: 0,
          completion_tokens: 0,
          created_at: new Date().toISOString()
        }
        messages.value.push(aiMsg)
      }

      streaming.value = false
      streamContent.value = ''
      streamThinkingContent.value = ''
      streamStatus.value = ''
      sseAbortController.value = null

      // Refresh sessions to update sidebar
      // currentChatbotId.value ?? 0: fallback to 0 should not happen in normal
      // flow (currentChatbotId is set before sendMessage is ever called)
      await fetchSessions(currentChatbotId.value ?? 0)
    }
  }

  // ==================== Rename / Pin ====================

  async function renameSession(id: number, title: string): Promise<boolean> {
    try {
      await renameChatbotSession(id, title)
      // pessimistic UI: API 成功后才更新本地 title
      const s = sessions.value.find((x) => x.id === id)
      if (s) s.title = title
      return true
    } catch (e) {
      console.error('[chatbot] renameSession failed:', e)
      return false
    }
  }

  async function togglePin(
    id: number,
    currentPinnedAt: string | null | undefined
  ): Promise<boolean> {
    const newPinned = !currentPinnedAt
    try {
      const res = await pinChatbotSession(id, newPinned)
      const newPinnedAt = (res as any)?.data?.pinned_at as string | null
      // pessimistic UI: API 成功后才更新本地 + 重排
      const s = sessions.value.find((x) => x.id === id)
      if (s) s.pinned_at = newPinnedAt
      sortSessionsLocally()
      return true
    } catch (e) {
      console.error('[chatbot] togglePin failed:', e)
      return false
    }
  }

  function sortSessionsLocally() {
    sessions.value.sort((a, b) => {
      const aPinned = !!a.pinned_at
      const bPinned = !!b.pinned_at
      if (aPinned !== bPinned) return aPinned ? -1 : 1
      if (aPinned) {
        return new Date(b.pinned_at!).getTime() - new Date(a.pinned_at!).getTime()
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  }

  function cancelStream() {
    if (sseAbortController.value) {
      sseAbortController.value.abort()
      sseAbortController.value = null
    }
  }

  // ==================== Cleanup ====================

  function cleanup() {
    cancelStream()
    currentSession.value = null
    sessions.value = []
    messages.value = []
    visibleChatbots.value = []
    streaming.value = false
    streamContent.value = ''
    streamThinkingContent.value = ''
    streamStatus.value = ''
    streamError.value = ''
  }

  return {
    // State
    visibleChatbots,
    sessions,
    sessionsTotal,
    currentSession,
    currentChatbotId,
    messages,
    messagesLoading,
    streaming,
    streamContent,
    streamThinkingContent,
    streamStatus,
    streamError,

    // Actions
    fetchVisibleChatbots,
    fetchSessions,
    createSession,
    deleteSession,
    switchSession,
    fetchMessages,
    sendMessage,
    renameSession,
    togglePin,
    cancelStream,
    cleanup
  }
})
