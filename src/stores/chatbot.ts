import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import type { ChatbotSession, ChatbotMessage, ChatbotConfig, ChatbotEvent } from '@/types/config'
import {
  listVisibleChatbots,
  createChatbotSession,
  listChatbotSessions,
  deleteChatbotSession,
  listChatbotMessages,
  sendChatbotMessageStream,
  renameChatbotSession,
  pinChatbotSession,
  generateChatbotSessionTitle
} from '@/api/chatbot'
import { uploadAttachment } from '@/api/agent'
import { useLLMModelStore } from '@/stores/llmModel'
import { useNotificationsStore } from '@/stores/notifications'

/** A staged image attachment awaiting send (chatbot-image-recognition). */
interface StagedImage {
  id: number
  filename: string
  mimeType: string
  previewUrl: string
}

let nextLocalId = -1

export const useChatbotStore = defineStore('chatbot', () => {
  // ==================== State ====================
  const visibleChatbots = ref<ChatbotConfig[]>([])
  const sessions = ref<ChatbotSession[]>([])
  const sessionsTotal = ref(0)
  // Offset of the next page to load (adaptive-session-titles US5: "加载更多" pagination).
  const sessionsOffset = ref(0)
  // Inflight guard so rapid double-clicks on "加载更多" can't issue two requests at
  // the same offset (which would append a duplicate page → duplicate v-for keys).
  const sessionsLoadingMore = ref(false)
  const currentSession = ref<ChatbotSession | null>(null)
  const currentChatbotId = ref<number | null>(null)
  const messages = ref<ChatbotMessage[]>([])
  const messagesLoading = ref(false)
  const streaming = ref(false)
  // instant-title-ux: draft mode — "新对话" clicked but no message sent yet, so the
  // session is NOT created and NOT shown in the sidebar until the first send.
  const isDraft = ref(false)
  // Guard against a concurrent first-send creating two sessions: streaming.value is
  // still false while createSessionForSend awaits, so the streaming guard can't cover
  // this window (a programmatic double-call would otherwise orphan a session).
  const isCreatingSession = ref(false)
  // instant-title-ux: ids of sessions whose title is being generated at send time —
  // the sidebar renders a pulsing placeholder for these. A separate Set (not a field
  // on the session object) so it survives the full-list fetchSessions refresh (C-1).
  const titlePendingIds = ref<Set<number>>(new Set())

  // Image attachments staged for the next message (chatbot-image-recognition).
  // Uploaded eagerly to /v1/agent-attachments; only their ids ride along the
  // chat request. previewUrl is a local blob for the input-strip thumbnail.
  const imageAttachments = ref<StagedImage[]>([])
  const uploadingImages = ref(0)
  const isUploadingImages = computed(() => uploadingImages.value > 0)

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
      sessionsOffset.value = sessions.value.length
      // adaptive-session-titles: after the first turn the backend renames the session,
      // and the post-stream refetch reloads it here — keep the active session's title in
      // sync so the chat header reflects the new auto-generated title, not just the list.
      if (currentSession.value) {
        const fresh = sessions.value.find((s) => s.id === currentSession.value!.id)
        if (fresh) currentSession.value.title = fresh.title
      }
    } catch (e) {
      console.error('[chatbot] fetchSessions failed:', e)
    }
  }

  // loadMoreSessions appends the next page to the sidebar list (US5: view all history,
  // not just the first 20). Stops when all sessions for the chatbot are loaded.
  async function loadMoreSessions(chatbotId: number, limit = 20) {
    if (sessionsLoadingMore.value || sessions.value.length >= sessionsTotal.value) return
    sessionsLoadingMore.value = true
    try {
      const res = await listChatbotSessions(sessionsOffset.value, limit, chatbotId)
      const data = (res as any)?.data as { list: ChatbotSession[]; total: number } | undefined
      const more = data?.list ?? []
      sessions.value = [...sessions.value, ...more]
      sessionsTotal.value = data?.total ?? sessionsTotal.value
      sessionsOffset.value = sessions.value.length
    } catch (e) {
      console.error('[chatbot] loadMoreSessions failed:', e)
    } finally {
      sessionsLoadingMore.value = false
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

  // startDraft enters draft mode (instant-title-ux): show an empty conversation
  // page WITHOUT creating a session or adding a sidebar item. The real session is
  // created lazily on the first send (createSessionForSend).
  function startDraft(chatbotId: number) {
    currentChatbotId.value = chatbotId
    currentSession.value = null
    messages.value = []
    isDraft.value = true
  }

  // createSessionForSend lazily creates the session on the first message of a draft,
  // optimistically inserts it at the top of the sidebar with a pulsing title
  // placeholder, and kicks off instant title generation from the prompt (parallel —
  // does not block the chat stream). Returns false if creation failed.
  async function createSessionForSend(chatbotId: number, prompt: string): Promise<boolean> {
    isCreatingSession.value = true
    try {
      const res = await createChatbotSession(chatbotId)
      const session = (res as any)?.data as ChatbotSession | undefined
      if (!session) return false
      isDraft.value = false
      currentSession.value = session
      messages.value = []
      // Optimistic insert at the top (newest first); de-dup by id for safety.
      // sessionsTotal is intentionally NOT bumped here — the post-stream fetchSessions
      // syncs the real total from the backend.
      sessions.value = [session, ...sessions.value.filter((s) => s.id !== session.id)]
      const pending = new Set(titlePendingIds.value)
      pending.add(session.id)
      titlePendingIds.value = pending
      // Fire-and-forget: generate the title from the prompt and live-update the item.
      void generateTitleForSession(session.id, prompt)
      return true
    } catch (e) {
      console.error('[chatbot] createSessionForSend failed:', e)
      return false
    } finally {
      isCreatingSession.value = false
    }
  }

  // generateTitleForSession calls the send-time /title endpoint and updates the
  // session's title in place when it returns. Best-effort: on failure the title
  // stays default and the post-response fallback (backend) still covers it. Always
  // clears the pending flag so the pulse stops.
  async function generateTitleForSession(sessionId: number, prompt: string) {
    try {
      const res = await generateChatbotSessionTitle(sessionId, prompt)
      const title = (res as any)?.data?.title as string | undefined
      if (title) {
        const s = sessions.value.find((x) => x.id === sessionId)
        if (s) s.title = title
        if (currentSession.value?.id === sessionId) currentSession.value.title = title
      }
    } catch (e) {
      console.error('[chatbot] generateTitleForSession failed:', e)
    } finally {
      const pending = new Set(titlePendingIds.value)
      pending.delete(sessionId)
      titlePendingIds.value = pending
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
    isDraft.value = false
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

  // ==================== Image attachments ====================

  /** Upload one image to /v1/agent-attachments and stage its id + thumbnail. */
  async function uploadImage(file: File) {
    const previewUrl = URL.createObjectURL(file)
    uploadingImages.value++
    try {
      const res = await uploadAttachment(file)
      imageAttachments.value.push({
        id: res.id,
        filename: res.filename,
        mimeType: res.mime_type,
        previewUrl
      })
    } catch (e) {
      URL.revokeObjectURL(previewUrl)
      console.error('[chatbot] uploadImage failed:', e)
      useNotificationsStore().warning('图片上传失败，请重试')
    } finally {
      uploadingImages.value--
    }
  }

  function removeImage(id: number) {
    const idx = imageAttachments.value.findIndex((i) => i.id === id)
    if (idx >= 0) {
      URL.revokeObjectURL(imageAttachments.value[idx].previewUrl)
      imageAttachments.value.splice(idx, 1)
    }
  }

  /** Revoke blob URLs and clear the staging area (ids already captured by caller). */
  function clearImageAttachments() {
    imageAttachments.value.forEach((i) => URL.revokeObjectURL(i.previewUrl))
    imageAttachments.value = []
  }

  // ==================== Chat Streaming ====================

  async function sendMessage(text: string) {
    if (streaming.value) return
    // instant-title-ux: in draft mode (or with no session yet) lazily create the
    // session on first send — this is where the sidebar item first appears (with a
    // pulsing title placeholder) and instant title generation kicks off.
    if (!currentSession.value) {
      if (isCreatingSession.value) return // concurrent first-send guard
      const chatbotId = currentChatbotId.value
      if (!chatbotId) return
      const ok = await createSessionForSend(chatbotId, text)
      if (!ok || !currentSession.value) return
    }

    const sessionId = currentSession.value.id

    // Capture staged image attachments before clearing.
    const stagedImages = imageAttachments.value
    const attachmentIds = stagedImages.map((i) => i.id)

    // Append optimistic user message (attachments shown as filename chips,
    // matching reload display).
    const userMsg: ChatbotMessage = {
      id: nextLocalId--,
      session_id: sessionId,
      role: 'user',
      content: text,
      thinking: '',
      seq: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      created_at: new Date().toISOString(),
      attachments: stagedImages.length
        ? stagedImages.map((i) => ({ id: i.id, filename: i.filename, mime_type: i.mimeType }))
        : undefined
    }
    messages.value.push(userMsg)
    clearImageAttachments()

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
    const notifications = useNotificationsStore()
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
              // 统一错误呈现：toast warning（橙色 ⚠），与 SOP / 创建 run 失败一致。
              // streamError 状态保留以便 finally 清理逻辑识别异常路径，但不再渲染为
              // 内联红色气泡（用户反馈：像 AI 回复气泡、不统一）。
              streamError.value = String(event.data || '未知错误')
              notifications.warning(streamError.value)
              break
          }
        },
        controller.signal,
        selectedModelKey || undefined,
        thinkingEnabled,
        attachmentIds.length ? attachmentIds : undefined
      )
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        console.error('[chatbot] sendMessage SSE error:', e)
        streamError.value = e.message || '请求失败'
        notifications.warning(streamError.value)
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
      // 用 != null 同时覆盖 null/undefined（避免 !!"" 误判空字符串为未置顶）
      // 与后端 SQL `pinned_at IS NULL` 的语义对齐
      const aPinned = a.pinned_at != null
      const bPinned = b.pinned_at != null
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
    isDraft.value = false
    titlePendingIds.value = new Set()
    // 重置 currentChatbotId 避免跨 chatbot 切换时短暂泄漏上一个 ID
    // (T6 reviewer P1: deleteSession/sendMessage fallback 时拿到旧 ID 的风险)
    currentChatbotId.value = null
    streaming.value = false
    streamContent.value = ''
    streamThinkingContent.value = ''
    streamStatus.value = ''
    streamError.value = ''
    // Release staged image blob URLs + reset the in-flight counter so a route
    // switch with un-sent images doesn't leak blobs or wedge isUploadingImages.
    clearImageAttachments()
    uploadingImages.value = 0
  }

  return {
    // State
    visibleChatbots,
    sessions,
    sessionsTotal,
    sessionsOffset,
    sessionsLoadingMore,
    currentSession,
    currentChatbotId,
    messages,
    messagesLoading,
    streaming,
    streamContent,
    streamThinkingContent,
    streamStatus,
    streamError,
    imageAttachments,
    isUploadingImages,
    isDraft,
    titlePendingIds,

    // Actions
    fetchVisibleChatbots,
    fetchSessions,
    loadMoreSessions,
    createSession,
    startDraft,
    deleteSession,
    switchSession,
    fetchMessages,
    sendMessage,
    uploadImage,
    removeImage,
    renameSession,
    togglePin,
    cancelStream,
    cleanup
  }
})
