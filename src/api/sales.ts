import request from './request'
import { getToken, clearAuth } from './request'

// ==================== Types ====================

export interface SalesSession {
  id: number
  title: string
  salesStage: string
  updatedAt: string
  isPinned: boolean
  pinnedAt: string | null
  messageCount: number
}

export interface SalesSessionDetail {
  id: number
  title: string
  salesStage: string
  deepThinking: boolean
  customerProfile: string
  productDocIds: number[]
  caseDocIds: number[]
  faqDocIds: number[]
  opinionDocIds: number[]
  opinionTrackIds: number[]
  documentIds: number[]
  updatedAt: string
}

export interface SalesMessage {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  verdict?: VerdictData
  images?: string[]
  thinking?: string
}

export interface VerdictData {
  evidence?: Citation[]
}

export interface Citation {
  document_name: string
  content: string
  score: number
}

export interface SalesSopTemplate {
  id: number
  name: string
  description: string
}

export interface KbSelection {
  product: number[]
  cases: number[]
  faq: number[]
  opinion: number[]
}

export interface OpinionTrack {
  id: number
  name: string
  description: string
}

export interface KnowledgeDocumentBrief {
  id: number
  name: string
  description: string
  status: string
  chunkCount: number
  fileSize: number
  isEnabled: boolean
  createdAt: string
}

export interface OcrResult {
  text: string
  url?: string
}

export interface ImageUploadItem {
  file: File
  previewUrl: string
  ocrResult: string
  status: 'pending' | 'processing' | 'success' | 'error'
}

export type ChatMode = 'sales' | 'free'

export interface SalesStage {
  id: string
  label: string
  color: string
}

export const SALES_STAGES: SalesStage[] = [
  { id: '', label: '未设置阶段', color: '#94a3b8' },
  { id: '破冰诊断', label: '破冰诊断', color: '#64748b' },
  { id: '价值塑造', label: '价值塑造', color: '#3b82f6' },
  { id: '异议处理', label: '异议处理', color: '#8b5cf6' },
  { id: '关单追销', label: '关单追销', color: '#f59e0b' }
]

export interface CreateSalesSessionPayload {
  title: string
  sales_stage?: string
  document_ids?: number[]
  product_doc_ids?: number[]
  case_doc_ids?: number[]
  faq_doc_ids?: number[]
  opinion_doc_ids?: number[]
  opinion_track_ids?: number[]
  deep_thinking?: boolean
  customer_profile?: string
}

export interface UpdateSessionPayload {
  sales_stage?: string
  document_ids?: number[]
  product_doc_ids?: number[]
  case_doc_ids?: number[]
  faq_doc_ids?: number[]
  opinion_doc_ids?: number[]
  opinion_track_ids?: number[]
  deep_thinking?: boolean
}

export interface SendSalesMessagePayload {
  query: string
  ocr_texts?: string[] // OCR识别文字，仅用于知识库检索，不进AI prompt
  images?: string[]
  sales_stage?: string
  document_ids?: number[]
  deep_thinking?: boolean
  chat_mode?: ChatMode
}

export type SalesChatEventType = 'status' | 'thinking' | 'token' | 'verdict' | 'citations' | 'done' | 'error'

export interface SalesChatEvent {
  type: SalesChatEventType
  data: unknown
}

// ==================== Helpers ====================

const asNumber = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const asString = (value: unknown): string => {
  return typeof value === 'string' ? value : ''
}

const parseJsonArray = (raw: unknown): number[] => {
  if (!raw) return []
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(arr) ? arr.map((id: unknown) => parseInt(String(id), 10)).filter(Number.isFinite) : []
  } catch {
    return []
  }
}

export function normalizeVerdictData(raw: unknown): Citation[] {
  if (!raw || typeof raw !== 'object') return []
  const obj = raw as Record<string, unknown>
  if (!obj.evidence || !Array.isArray(obj.evidence)) return []
  return obj.evidence
    .map((chunk: unknown) => {
      if (!chunk || typeof chunk !== 'object') return null
      const c = chunk as Record<string, unknown>
      return {
        document_name: asString(c.document_name ?? c.DocumentName) || '未知文档',
        content: asString(c.content ?? c.Content),
        score: asNumber(c.score ?? c.Score)
      }
    })
    .filter(Boolean) as Citation[]
}

const normalizeSession = (raw: unknown): SalesSession | null => {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = asNumber(obj.ID ?? obj.id)
  if (id <= 0) return null

  return {
    id,
    title: asString(obj.title) || '新对话',
    salesStage: asString(obj.sales_stage),
    updatedAt: asString(obj.UpdatedAt ?? obj.updated_at),
    isPinned: Boolean(obj.is_pinned),
    pinnedAt: (obj.pinned_at as string) || null,
    messageCount: asNumber(obj.message_count)
  }
}

const normalizeSessionDetail = (raw: unknown): SalesSessionDetail | null => {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = asNumber(obj.ID ?? obj.id)
  if (id <= 0) return null

  const productDocIds = parseJsonArray(obj.product_doc_ids)
  const caseDocIds = parseJsonArray(obj.case_doc_ids)
  const faqDocIds = parseJsonArray(obj.faq_doc_ids)
  const opinionDocIds = parseJsonArray(obj.opinion_doc_ids)
  const opinionTrackIds = parseJsonArray(obj.opinion_track_ids)
  const legacyDocIds = parseJsonArray(obj.document_ids)

  // Backward compat: if new fields empty but old document_ids exists, treat as product
  const effectiveProductDocIds =
    productDocIds.length === 0 && caseDocIds.length === 0 && faqDocIds.length === 0 && opinionDocIds.length === 0
      ? legacyDocIds
      : productDocIds

  return {
    id,
    title: asString(obj.title) || '新对话',
    salesStage: asString(obj.sales_stage),
    deepThinking: Boolean(obj.deep_thinking),
    customerProfile: asString(obj.customer_profile),
    productDocIds: effectiveProductDocIds,
    caseDocIds,
    faqDocIds,
    opinionDocIds,
    opinionTrackIds,
    documentIds: [...effectiveProductDocIds, ...caseDocIds, ...faqDocIds, ...opinionDocIds],
    updatedAt: asString(obj.UpdatedAt ?? obj.updated_at)
  }
}

const normalizeMessage = (raw: unknown): SalesMessage | null => {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = asNumber(obj.ID ?? obj.id)
  const role = asString(obj.role)
  if (!id || (role !== 'user' && role !== 'assistant' && role !== 'system')) return null

  let verdict: VerdictData | undefined
  if (obj.verdict && role === 'assistant') {
    try {
      const verdictData = typeof obj.verdict === 'string' ? JSON.parse(obj.verdict) : obj.verdict
      const evidence = normalizeVerdictData(verdictData)
      if (evidence.length > 0) {
        verdict = { evidence }
      }
    } catch {
      // ignore parse error
    }
  }

  let images: string[] | undefined
  if (obj.images) {
    try {
      const parsed = typeof obj.images === 'string' ? JSON.parse(obj.images) : obj.images
      images = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : undefined
    } catch {
      images = undefined
    }
  }

  const thinking = asString(obj.thinking) || undefined

  return {
    id,
    role,
    content: asString(obj.content),
    createdAt: asString(obj.CreatedAt ?? obj.created_at),
    verdict,
    images,
    thinking
  }
}

const normalizeKbDocument = (raw: unknown): KnowledgeDocumentBrief | null => {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = asNumber(obj.ID ?? obj.id)
  if (id <= 0) return null

  return {
    id,
    name: asString(obj.name) || '未命名文档',
    description: asString(obj.description),
    status: asString(obj.status),
    chunkCount: asNumber(obj.chunk_count),
    fileSize: asNumber(obj.file_size),
    isEnabled: obj.is_enabled !== false,
    createdAt: asString(obj.CreatedAt ?? obj.created_at)
  }
}

const normalizeOpinionTrack = (raw: unknown): OpinionTrack | null => {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const id = asNumber(obj.ID ?? obj.id)
  if (id <= 0) return null

  return {
    id,
    name: asString(obj.name) || '未命名赛道',
    description: asString(obj.description)
  }
}

// ==================== URL & SSE Helpers ====================

export const buildApiUrl = (path: string): string => {
  const base = (request.defaults.baseURL || '/api').replace(/\/$/, '')
  return `${base}${path}`
}

const parseChatText = (payload: unknown): string | null => {
  if (!payload) return null

  if (typeof payload === 'string') {
    const trimmed = payload.trim()
    if (!trimmed) return null
    if (!trimmed.includes('data:')) return trimmed

    let tokenText = ''
    const chunks = trimmed.split('\n\n')
    for (const chunk of chunks) {
      const line = chunk.split('\n').map((entry) => entry.trim()).find((entry) => entry.startsWith('data:'))
      if (!line) continue
      const jsonText = line.slice(5).trim()
      if (!jsonText) continue
      try {
        const event = JSON.parse(jsonText)
        if (event?.type === 'token' && typeof event?.data === 'string') tokenText += event.data
      } catch { /* ignore */ }
    }
    return tokenText.trim() || null
  }

  if (typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    const candidate = obj.answer || obj.reply || obj.content
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
  }

  return null
}

export const parseSseChunk = (chunk: string): SalesChatEvent | null => {
  const line = chunk.split('\n').map((item) => item.trim()).find((item) => item.startsWith('data:'))
  if (!line) return null
  const raw = line.slice(5).trim()
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    const type = typeof parsed?.type === 'string' ? parsed.type : 'token'
    return { type: type as SalesChatEventType, data: parsed?.data }
  } catch {
    return { type: 'token', data: raw }
  }
}

/**
 * Generic SSE stream reader. Used by chat, profile analysis, and chat style analysis.
 */
export const readSSEStream = async (
  response: Response,
  onEvent: (event: SalesChatEvent) => void
): Promise<void> => {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase()

  // Fallback: JSON response instead of SSE
  if (contentType.includes('application/json')) {
    const payloadData = await response.json().catch(() => null)
    const obj = payloadData as Record<string, unknown> | null
    const text = parseChatText(payloadData) || parseChatText(obj?.data) || '服务端返回空响应'
    onEvent({ type: 'token', data: text })
    onEvent({ type: 'done', data: null })
    return
  }

  if (!response.body) {
    throw new Error('服务端未返回可读取的数据流')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let isDone = false

  while (!isDone) {
    const { done, value } = await reader.read()
    isDone = done
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''

    for (const chunk of chunks) {
      const event = parseSseChunk(chunk)
      if (event) onEvent(event)
    }
  }

  const finalChunk = buffer.trim()
  if (finalChunk) {
    const event = parseSseChunk(finalChunk)
    if (event) onEvent(event)
  }

  onEvent({ type: 'done', data: null })
}

/**
 * Make an authenticated SSE request (POST with fetch, not axios).
 */
export const fetchSSE = async (
  path: string,
  options: {
    method?: string
    body?: BodyInit
    headers?: Record<string, string>
    signal?: AbortSignal
  }
): Promise<Response> => {
  const token = getToken()
  if (!token) {
    clearAuth()
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login'
    }
    throw new Error('未登录，请重新登录')
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...options.headers
  }

  // Don't set Content-Type for FormData (browser sets multipart boundary)
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const response = await fetch(buildApiUrl(path), {
    method: options.method || 'POST',
    headers,
    body: options.body,
    signal: options.signal
  })

  if (!response.ok) {
    // Handle 401/403 like axios interceptor does
    if (response.status === 401 || response.status === 403) {
      clearAuth()
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login'
      }
      throw new Error('登录已过期，请重新登录')
    }

    let message = `请求失败 (${response.status})`
    try {
      const body = await response.json()
      message = body?.message || body?.msg || message
    } catch {
      try { const text = await response.text(); if (text) message = text } catch { /* ignore */ }
    }
    throw new Error(message)
  }

  return response
}

// ==================== Session APIs ====================

export const fetchSalesSessions = async (): Promise<SalesSession[]> => {
  const res = await request.get('/v1/sales-rag/sessions')
  const sessions = (res as any)?.data?.sessions
  if (!Array.isArray(sessions)) return []
  return sessions.map(normalizeSession).filter(Boolean) as SalesSession[]
}

export const fetchSessionDetail = async (sessionId: number): Promise<SalesSessionDetail | null> => {
  const res = await request.get(`/v1/sales-rag/sessions/${sessionId}`)
  return normalizeSessionDetail((res as any)?.data)
}

export const createSalesSession = async (
  payload: CreateSalesSessionPayload
): Promise<SalesSession | null> => {
  const res = await request.post('/v1/sales-rag/sessions', payload)
  return normalizeSession((res as any)?.data)
}

export const updateSession = async (
  sessionId: number,
  payload: UpdateSessionPayload
): Promise<void> => {
  await request.put(`/v1/sales-rag/sessions/${sessionId}`, payload)
}

export const deleteSession = async (sessionId: number): Promise<void> => {
  await request.delete(`/v1/sales-rag/sessions/${sessionId}`)
}

export const renameSession = async (sessionId: number, title: string): Promise<void> => {
  await request.put(`/v1/sales-rag/sessions/${sessionId}/rename`, { title })
}

export const pinSession = async (sessionId: number): Promise<void> => {
  await request.put(`/v1/sales-rag/sessions/${sessionId}/pin`)
}

export const unpinSession = async (sessionId: number): Promise<void> => {
  await request.delete(`/v1/sales-rag/sessions/${sessionId}/pin`)
}

// ==================== Message APIs ====================

export const fetchSalesMessages = async (sessionId: number): Promise<SalesMessage[]> => {
  const res = await request.get(`/v1/sales-rag/sessions/${sessionId}/messages`)
  const messages = (res as any)?.data?.messages
  if (!Array.isArray(messages)) return []
  return messages.map(normalizeMessage).filter(Boolean) as SalesMessage[]
}

export const sendSalesMessage = async (
  sessionId: number,
  payload: SendSalesMessagePayload
): Promise<string | null> => {
  const res = await request.post(`/v1/sales-rag/sessions/${sessionId}/chat`, payload)
  return parseChatText((res as any)?.data)
}

export const sendSalesMessageStream = async (
  sessionId: number,
  payload: SendSalesMessagePayload,
  onEvent: (event: SalesChatEvent) => void,
  signal?: AbortSignal
): Promise<void> => {
  const response = await fetchSSE(`/v1/sales-rag/sessions/${sessionId}/chat`, {
    body: JSON.stringify(payload),
    signal
  })
  await readSSEStream(response, onEvent)
}

// ==================== Customer Profile APIs ====================

export const saveCustomerProfile = async (
  sessionId: number,
  profile: string
): Promise<void> => {
  await request.put(`/v1/sales-rag/sessions/${sessionId}/customer-profile`, { profile })
}

export const analyzeProfileStream = async (
  files: File[],
  onEvent: (event: SalesChatEvent) => void,
  signal?: AbortSignal
): Promise<void> => {
  // 不在前端压缩图片，后端有更完善的压缩逻辑（支持 10MB/36MP/150:1 宽高比）
  // 前端 compressImage 会将最长边限制到 2048px，导致微信长截图宽度被压缩到几十像素，文字无法辨认
  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))
  const response = await fetchSSE('/v1/sales-rag/analyze-profile', {
    body: formData,
    signal
  })
  await readSSEStream(response, onEvent)
}

export const analyzeProfileTextStream = async (
  text: string,
  onEvent: (event: SalesChatEvent) => void,
  signal?: AbortSignal
): Promise<void> => {
  const response = await fetchSSE('/v1/sales-rag/analyze-profile-text', {
    body: JSON.stringify({ text }),
    signal
  })
  await readSSEStream(response, onEvent)
}

// ==================== Chat Style APIs ====================

export const fetchChatStyle = async (): Promise<string> => {
  const res = await request.get('/v1/sales-rag/analyze-chat-style')
  return asString((res as any)?.data?.style)
}

export const analyzeChatStyleStream = async (
  payload: FormData,
  onEvent: (event: SalesChatEvent) => void,
  signal?: AbortSignal
): Promise<void> => {
  const response = await fetchSSE('/v1/sales-rag/analyze-chat-style', {
    body: payload,
    signal
  })
  await readSSEStream(response, onEvent)
}

export const saveChatStyle = async (style: string): Promise<void> => {
  await request.put('/v1/sales-rag/analyze-chat-style', { style })
}

// ==================== OCR API ====================

export const ocrImage = async (file: File): Promise<OcrResult> => {
  const formData = new FormData()
  formData.append('file', file)
  const res = await request.post('/v1/sales-rag/ocr', formData, { timeout: 300000 })
  const data = (res as any)?.data
  return {
    text: asString(data?.text),
    url: asString(data?.url) || undefined
  }
}

// ==================== Knowledge Base APIs ====================

export const fetchSalesDocuments = async (): Promise<KnowledgeDocumentBrief[]> => {
  const res = await request.get('/v1/sales-rag/documents')
  const docs = (res as any)?.data?.documents || (res as any)?.data
  if (!Array.isArray(docs)) return []
  return docs.map(normalizeKbDocument).filter(Boolean) as KnowledgeDocumentBrief[]
}

export const fetchOpinionTracks = async (): Promise<OpinionTrack[]> => {
  const res = await request.get('/v1/sales-rag/opinion-tracks')
  const tracks = (res as any)?.data?.tracks || (res as any)?.data
  if (!Array.isArray(tracks)) return []
  return tracks.map(normalizeOpinionTrack).filter(Boolean) as OpinionTrack[]
}

// ==================== SOP Templates ====================

// ==================== Permission APIs ====================

export const checkSalesPermission = async (): Promise<boolean> => {
  try {
    const res = await request.get('/v1/sales-rag/check-permission')
    return (res as any)?.data?.has_permission === true
  } catch {
    return true // 接口异常时默认允许，避免误拦截
  }
}

export const fetchSalesSopTemplates = async (): Promise<SalesSopTemplate[]> => {
  const res = await request.get('/v1/sop/templates')
  const rawTemplates = (res as any)?.data?.templates
  if (!Array.isArray(rawTemplates)) return []

  return rawTemplates
    .map((template: unknown) => {
      if (!template || typeof template !== 'object') return null
      const obj = template as Record<string, unknown>
      const id = asNumber(obj.ID ?? obj.id ?? obj.Id)
      if (id <= 0) return null
      return {
        id,
        name: asString(obj.name) || '未命名 SOP',
        description: asString(obj.description)
      }
    })
    .filter(Boolean) as SalesSopTemplate[]
}
