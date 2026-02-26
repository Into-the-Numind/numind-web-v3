import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type {
  SalesSession,
  SalesMessage,
  KbSelection,
  CustomerProfile,
  ChatMode,
  ImageUploadItem,
  Citation,
  KnowledgeDocumentBrief,
  OpinionTrack,
  SalesChatEvent,
  SendSalesMessagePayload,
  CreateSalesSessionPayload,
  UpdateSessionPayload
} from '@/api/sales'
import {
  fetchSalesSessions,
  fetchSessionDetail,
  createSalesSession,
  updateSession,
  deleteSession as apiDeleteSession,
  renameSession as apiRenameSession,
  pinSession,
  unpinSession,
  fetchSalesMessages,
  sendSalesMessageStream,
  saveCustomerProfile,
  ocrImage,
  fetchSalesDocuments,
  fetchOpinionTracks
} from '@/api/sales'

export const useSalesStore = defineStore('sales', () => {
  // ==================== Session State ====================
  const sessions = ref<SalesSession[]>([])
  const currentSessionId = ref<number | null>(null)
  const sessionLoadCounter = ref(0)

  // ==================== Messages ====================
  const messages = ref<SalesMessage[]>([])
  const messagesLoading = ref(false)

  // ==================== Chat Config ====================
  const isLoading = ref(false)
  const isDeepThinking = ref(true)
  const chatMode = ref<ChatMode>('sales')
  const salesStage = ref('')

  // ==================== Knowledge Base ====================
  const kbSelection = ref<KbSelection>({ product: [], cases: [], faq: [], opinion: [] })
  const opinionTrackSelection = ref<number[]>([])
  const availableDocuments = ref<KnowledgeDocumentBrief[]>([])
  const availableOpinionTracks = ref<OpinionTrack[]>([])

  // ==================== Customer Profile ====================
  const customerProfile = ref<CustomerProfile>({ name: '', stage: '', notes: '' })

  // ==================== Scroll ====================
  const autoScrollEnabled = ref(true)

  // ==================== Image OCR ====================
  const images = ref<ImageUploadItem[]>([])

  // ==================== Streaming State ====================
  const streamContent = ref('')
  const streamThinkingContent = ref('')
  const streamCitations = ref<Citation[]>([])
  const streamStatus = ref('')
  const streamFinished = ref(true)
  const sseAbortController = shallowRef<AbortController | null>(null)

  // ==================== Getters ====================
  const sortedSessions = computed(() => {
    return [...sessions.value].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    })
  })

  const currentSession = computed(() =>
    sessions.value.find((s) => s.id === currentSessionId.value) || null
  )

  const hasCurrentSession = computed(() => currentSessionId.value !== null)

  const allSelectedDocIds = computed(() => [
    ...kbSelection.value.product,
    ...kbSelection.value.cases,
    ...kbSelection.value.faq,
    ...kbSelection.value.opinion
  ])

  const canSend = computed(() => {
    const hasText = false // Determined by component
    const hasImages = images.value.length > 0
    const allImagesReady = images.value.every((img) => img.status === 'success')
    return !isLoading.value && (hasText || (hasImages && allImagesReady))
  })

  // ==================== Session Actions ====================
  async function loadSessions() {
    try {
      const result = await fetchSalesSessions()
      sessions.value = result
    } catch (e) {
      console.error('[sales] loadSessions failed:', e)
    }
  }

  async function switchSession(id: number | null, forceWelcome = false) {
    if (!id) {
      currentSessionId.value = null
      messages.value = []
      kbSelection.value = { product: [], cases: [], faq: [], opinion: [] }
      opinionTrackSelection.value = []
      customerProfile.value = { name: '', stage: '', notes: '' }
      salesStage.value = ''
      updateUrl(null)
      return
    }

    updateUrl(id)
    if (currentSessionId.value === id && !forceWelcome) return

    sessionLoadCounter.value++
    const currentLoadId = sessionLoadCounter.value

    autoScrollEnabled.value = true
    currentSessionId.value = id
    messages.value = []
    messagesLoading.value = true

    // Load session details
    try {
      const detail = await fetchSessionDetail(id)
      if (currentLoadId !== sessionLoadCounter.value || currentSessionId.value !== id) return

      if (detail) {
        salesStage.value = detail.salesStage
        isDeepThinking.value = detail.deepThinking
        kbSelection.value = {
          product: detail.productDocIds,
          cases: detail.caseDocIds,
          faq: detail.faqDocIds,
          opinion: detail.opinionDocIds
        }
        opinionTrackSelection.value = detail.opinionTrackIds
        customerProfile.value = {
          name: '',
          stage: detail.salesStage,
          notes: detail.customerProfile
        }
      }
    } catch (e) {
      console.error('[sales] fetchSessionDetail failed:', e)
    }

    if (forceWelcome) {
      messagesLoading.value = false
      return
    }

    // Load messages
    try {
      const msgs = await fetchSalesMessages(id)
      if (currentLoadId !== sessionLoadCounter.value || currentSessionId.value !== id) return
      messages.value = msgs
    } catch (e) {
      console.error('[sales] fetchSalesMessages failed:', e)
    } finally {
      messagesLoading.value = false
    }
  }

  async function createSession(title: string): Promise<number | null> {
    try {
      const payload: CreateSalesSessionPayload = {
        title: title.substring(0, 50),
        sales_stage: salesStage.value,
        document_ids: allSelectedDocIds.value,
        product_doc_ids: kbSelection.value.product,
        case_doc_ids: kbSelection.value.cases,
        faq_doc_ids: kbSelection.value.faq,
        opinion_doc_ids: kbSelection.value.opinion,
        opinion_track_ids: opinionTrackSelection.value,
        deep_thinking: isDeepThinking.value,
        customer_profile: JSON.stringify(customerProfile.value)
      }
      const session = await createSalesSession(payload)
      if (session) {
        currentSessionId.value = session.id
        updateUrl(session.id)
        await loadSessions()
        return session.id
      }
    } catch (e) {
      console.error('[sales] createSession failed:', e)
    }
    return null
  }

  async function deleteSessionAction(id: number) {
    try {
      await apiDeleteSession(id)
      const wasCurrent = id === currentSessionId.value
      await loadSessions()

      if (wasCurrent) {
        if (sortedSessions.value.length > 0) {
          await switchSession(sortedSessions.value[0].id)
        } else {
          await switchSession(null)
          customerProfile.value = { name: '', stage: '', notes: '' }
        }
      }
      return true
    } catch (e) {
      console.error('[sales] deleteSession failed:', e)
      return false
    }
  }

  async function renameSessionAction(id: number, newTitle: string) {
    try {
      await apiRenameSession(id, newTitle)
      await loadSessions()
      return true
    } catch (e) {
      console.error('[sales] renameSession failed:', e)
      return false
    }
  }

  async function togglePinSession(id: number, isPinned: boolean) {
    try {
      if (isPinned) {
        await unpinSession(id)
      } else {
        await pinSession(id)
      }
      await loadSessions()
    } catch (e) {
      console.error('[sales] togglePin failed:', e)
    }
  }

  // ==================== Chat Actions ====================
  async function sendMessage(text: string) {
    if (isLoading.value) return
    if (!currentSessionId.value) return

    // Combine OCR results
    let fullQuery = text
    const ocrTexts = images.value
      .filter((img) => img.status === 'success' && img.ocrResult)
      .map((img) => img.ocrResult)
    if (ocrTexts.length > 0) {
      fullQuery = ocrTexts.map((t) => `[图片内容]: ${t}`).join('\n') + '\n' + text
    }

    const imageUrls = images.value
      .filter((img) => img.status === 'success')
      .map((img) => img.previewUrl)
      .filter((url) => !url.startsWith('blob:'))

    // Append user message immediately
    const userMsg: SalesMessage = {
      id: Date.now(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
      images: imageUrls.length > 0 ? imageUrls : undefined
    }
    messages.value.push(userMsg)

    // Clear images after sending
    images.value.forEach((img) => {
      if (img.previewUrl.startsWith('blob:')) URL.revokeObjectURL(img.previewUrl)
    })
    images.value = []

    // Prepare SSE
    isLoading.value = true
    streamContent.value = ''
    streamThinkingContent.value = ''
    streamCitations.value = []
    streamStatus.value = ''
    streamFinished.value = false
    autoScrollEnabled.value = true

    const controller = new AbortController()
    sseAbortController.value = controller

    const payload: SendSalesMessagePayload = {
      query: fullQuery,
      images: imageUrls.length > 0 ? imageUrls : undefined,
      sales_stage: salesStage.value,
      document_ids: allSelectedDocIds.value,
      deep_thinking: isDeepThinking.value,
      chat_mode: chatMode.value
    }

    try {
      await sendSalesMessageStream(
        currentSessionId.value,
        payload,
        (event: SalesChatEvent) => {
          switch (event.type) {
            case 'status':
              streamStatus.value = String(event.data || '')
              break
            case 'thinking':
              streamThinkingContent.value += String(event.data || '')
              break
            case 'token':
              streamStatus.value = ''
              streamContent.value += String(event.data || '')
              break
            case 'verdict': {
              const verdict = event.data as any
              if (verdict?.evidence && Array.isArray(verdict.evidence)) {
                streamCitations.value = verdict.evidence.map((chunk: any) => ({
                  document_name: chunk.document_name || chunk.DocumentName || '未知文档',
                  content: chunk.content || chunk.Content || '',
                  score: chunk.score || chunk.Score || 0
                }))
              }
              break
            }
            case 'citations':
              if (Array.isArray(event.data)) {
                streamCitations.value = event.data as Citation[]
              }
              break
            case 'done':
              streamFinished.value = true
              break
            case 'error':
              streamContent.value += `\n\n**错误**: ${event.data || '未知错误'}`
              streamFinished.value = true
              break
          }
        },
        controller.signal
      )
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('[sales] sendMessage SSE error:', e)
        streamContent.value += `\n\n**错误**: ${e.message || '请求失败'}`
      }
      streamFinished.value = true
    } finally {
      // Append AI message from stream
      if (streamContent.value || streamThinkingContent.value) {
        const aiMsg: SalesMessage = {
          id: Date.now() + 1,
          role: 'assistant',
          content: streamContent.value,
          createdAt: new Date().toISOString(),
          verdict: streamCitations.value.length > 0 ? { evidence: streamCitations.value } : undefined
        }
        messages.value.push(aiMsg)
      }

      isLoading.value = false
      sseAbortController.value = null

      // Refresh sessions to update sidebar summary
      loadSessions()
    }
  }

  function regenerateMessage() {
    const lastUserMsg = [...messages.value].reverse().find((m) => m.role === 'user')
    if (!lastUserMsg) return

    // Remove last AI message
    const lastIdx = messages.value.length - 1
    if (lastIdx >= 0 && messages.value[lastIdx].role === 'assistant') {
      messages.value.pop()
    }

    sendMessage(lastUserMsg.content)
  }

  // ==================== Sales Stage ====================
  async function setSalesStage(stageId: string) {
    salesStage.value = stageId
    if (customerProfile.value) {
      customerProfile.value.stage = stageId
    }

    if (currentSessionId.value) {
      try {
        await updateSession(currentSessionId.value, { sales_stage: stageId })
      } catch (e) {
        console.error('[sales] saveSalesStage failed:', e)
      }
    }
  }

  // ==================== Knowledge Base Actions ====================
  async function loadKnowledgeDocuments() {
    try {
      const [docs, tracks] = await Promise.all([fetchSalesDocuments(), fetchOpinionTracks()])
      availableDocuments.value = docs
      availableOpinionTracks.value = tracks
    } catch (e) {
      console.error('[sales] loadKnowledgeDocuments failed:', e)
    }
  }

  function toggleKbDocument(docId: number, category: keyof KbSelection) {
    const currentCategory = kbSelection.value[category]
    const idx = currentCategory.indexOf(docId)

    if (idx >= 0) {
      currentCategory.splice(idx, 1)
      return
    }

    // Remove from other categories first
    for (const key of ['product', 'cases', 'faq', 'opinion'] as (keyof KbSelection)[]) {
      if (key !== category) {
        const otherIdx = kbSelection.value[key].indexOf(docId)
        if (otherIdx >= 0) kbSelection.value[key].splice(otherIdx, 1)
      }
    }

    // Check limit
    const limit = category === 'opinion' ? 2 : 3
    if (currentCategory.length >= limit) return

    currentCategory.push(docId)
  }

  function toggleOpinionTrack(trackId: number) {
    const idx = opinionTrackSelection.value.indexOf(trackId)
    if (idx >= 0) {
      opinionTrackSelection.value.splice(idx, 1)
    } else {
      const totalOpinion = kbSelection.value.opinion.length + opinionTrackSelection.value.length
      if (totalOpinion >= 2) return
      opinionTrackSelection.value.push(trackId)
    }
  }

  async function saveKbSelection(): Promise<boolean> {
    if (!currentSessionId.value) return false

    const payload: UpdateSessionPayload = {
      document_ids: allSelectedDocIds.value,
      product_doc_ids: kbSelection.value.product,
      case_doc_ids: kbSelection.value.cases,
      faq_doc_ids: kbSelection.value.faq,
      opinion_doc_ids: kbSelection.value.opinion,
      opinion_track_ids: opinionTrackSelection.value
    }

    try {
      await updateSession(currentSessionId.value, payload)
      return true
    } catch (e) {
      console.error('[sales] saveKbSelection failed:', e)
      return false
    }
  }

  function removeSelectedKb(docId: number) {
    for (const key of ['product', 'cases', 'faq', 'opinion'] as (keyof KbSelection)[]) {
      const idx = kbSelection.value[key].indexOf(docId)
      if (idx >= 0) {
        kbSelection.value[key].splice(idx, 1)
        if (currentSessionId.value) saveKbSelection()
        return
      }
    }
  }

  function removeSelectedTrack(trackId: number) {
    const idx = opinionTrackSelection.value.indexOf(trackId)
    if (idx >= 0) {
      opinionTrackSelection.value.splice(idx, 1)
      if (currentSessionId.value) saveKbSelection()
    }
  }

  // ==================== Customer Profile Actions ====================
  async function loadCustomerProfile() {
    if (!currentSessionId.value) return
    try {
      const detail = await fetchSessionDetail(currentSessionId.value)
      if (detail) {
        customerProfile.value = {
          name: '',
          stage: detail.salesStage,
          notes: detail.customerProfile
        }
      }
    } catch (e) {
      console.error('[sales] loadCustomerProfile failed:', e)
    }
  }

  async function persistProfile(): Promise<boolean> {
    if (!currentSessionId.value) return false
    try {
      await saveCustomerProfile(currentSessionId.value, customerProfile.value.notes)
      return true
    } catch (e) {
      console.error('[sales] persistProfile failed:', e)
      return false
    }
  }

  // ==================== Image OCR Actions ====================
  async function addImage(file: File) {
    if (images.value.length >= 6) return

    const item: ImageUploadItem = {
      file,
      previewUrl: URL.createObjectURL(file),
      ocrResult: '',
      status: 'processing'
    }
    images.value.push(item)

    try {
      const result = await ocrImage(file)
      item.ocrResult = result.text
      if (result.url) item.previewUrl = result.url
      item.status = 'success'
    } catch (e) {
      console.error('[sales] OCR failed:', e)
      item.status = 'error'
    }
  }

  function removeImage(index: number) {
    const item = images.value[index]
    if (item?.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(item.previewUrl)
    }
    images.value.splice(index, 1)
  }

  function clearAllImages() {
    images.value.forEach((img) => {
      if (img.previewUrl.startsWith('blob:')) URL.revokeObjectURL(img.previewUrl)
    })
    images.value = []
  }

  // ==================== URL Sync ====================
  function updateUrl(sessionId: number | null) {
    const url = new URL(window.location.href)
    if (sessionId) {
      url.searchParams.set('session_id', String(sessionId))
    } else {
      url.searchParams.delete('session_id')
    }
    window.history.replaceState({ sessionId }, '', url.toString())
  }

  // ==================== Cleanup ====================
  function cleanup() {
    if (sseAbortController.value) {
      sseAbortController.value.abort()
      sseAbortController.value = null
    }
    currentSessionId.value = null
    sessions.value = []
    messages.value = []
    isLoading.value = false
    streamContent.value = ''
    streamThinkingContent.value = ''
    streamCitations.value = []
    streamStatus.value = ''
    streamFinished.value = true
    images.value.forEach((img) => {
      if (img.previewUrl.startsWith('blob:')) URL.revokeObjectURL(img.previewUrl)
    })
    images.value = []
  }

  return {
    // State
    sessions,
    currentSessionId,
    messages,
    messagesLoading,
    isLoading,
    isDeepThinking,
    chatMode,
    salesStage,
    kbSelection,
    opinionTrackSelection,
    availableDocuments,
    availableOpinionTracks,
    customerProfile,
    autoScrollEnabled,
    images,
    streamContent,
    streamThinkingContent,
    streamCitations,
    streamStatus,
    streamFinished,
    sseAbortController,

    // Getters
    sortedSessions,
    currentSession,
    hasCurrentSession,
    allSelectedDocIds,
    canSend,

    // Actions
    loadSessions,
    switchSession,
    createSession,
    deleteSession: deleteSessionAction,
    renameSession: renameSessionAction,
    togglePinSession,
    sendMessage,
    regenerateMessage,
    setSalesStage,
    loadKnowledgeDocuments,
    toggleKbDocument,
    toggleOpinionTrack,
    saveKbSelection,
    removeSelectedKb,
    removeSelectedTrack,
    loadCustomerProfile,
    persistProfile,
    addImage,
    removeImage,
    clearAllImages,
    updateUrl,
    cleanup
  }
})
