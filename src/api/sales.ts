import request from './request'

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

export interface CustomerProfile {
  name: string
  stage: string
  notes: string
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
  images?: string[]
  sales_stage?: string
  document_ids?: number[]
  deep_thinking?: boolean
  chat_mode?: ChatMode
}

export interface SalesChatEvent {
  type: string
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

const normalizeSession = (raw: any): SalesSession | null => {
  const id = asNumber(raw?.ID ?? raw?.id)
  if (id <= 0) return null

  return {
    id,
    title: asString(raw?.title) || '新对话',
    salesStage: asString(raw?.sales_stage),
    updatedAt: asString(raw?.UpdatedAt ?? raw?.updated_at),
    isPinned: Boolean(raw?.is_pinned),
    pinnedAt: raw?.pinned_at || null,
    messageCount: asNumber(raw?.message_count)
  }
}

const normalizeSessionDetail = (raw: any): SalesSessionDetail | null => {
  const id = asNumber(raw?.ID ?? raw?.id)
  if (id <= 0) return null

  const productDocIds = parseJsonArray(raw?.product_doc_ids)
  const caseDocIds = parseJsonArray(raw?.case_doc_ids)
  const faqDocIds = parseJsonArray(raw?.faq_doc_ids)
  const opinionDocIds = parseJsonArray(raw?.opinion_doc_ids)
  const opinionTrackIds = parseJsonArray(raw?.opinion_track_ids)
  const legacyDocIds = parseJsonArray(raw?.document_ids)

  // Backward compat: if new fields empty but old document_ids exists, treat as product
  const effectiveProductDocIds =
    productDocIds.length === 0 && caseDocIds.length === 0 && faqDocIds.length === 0 && opinionDocIds.length === 0
      ? legacyDocIds
      : productDocIds

  return {
    id,
    title: asString(raw?.title) || '新对话',
    salesStage: asString(raw?.sales_stage),
    deepThinking: Boolean(raw?.deep_thinking),
    customerProfile: asString(raw?.customer_profile),
    productDocIds: effectiveProductDocIds,
    caseDocIds,
    faqDocIds,
    opinionDocIds,
    opinionTrackIds,
    documentIds: [...effectiveProductDocIds, ...caseDocIds, ...faqDocIds, ...opinionDocIds],
    updatedAt: asString(raw?.UpdatedAt ?? raw?.updated_at)
  }
}

const normalizeMessage = (raw: any): SalesMessage | null => {
  const id = asNumber(raw?.ID ?? raw?.id)
  const role = asString(raw?.role)
  if (!id || (role !== 'user' && role !== 'assistant' && role !== 'system')) return null

  let verdict: VerdictData | undefined
  if (raw?.verdict && role === 'assistant') {
    try {
      const verdictData = typeof raw.verdict === 'string' ? JSON.parse(raw.verdict) : raw.verdict
      if (verdictData?.evidence && Array.isArray(verdictData.evidence) && verdictData.evidence.length > 0) {
        verdict = {
          evidence: verdictData.evidence.map((chunk: any) => ({
            document_name: chunk.document_name || chunk.DocumentName || '未知文档',
            content: chunk.content || chunk.Content || '',
            score: chunk.score || chunk.Score || 0
          }))
        }
      }
    } catch {
      // ignore parse error
    }
  }

  let images: string[] | undefined
  if (raw?.images) {
    try {
      images = typeof raw.images === 'string' ? JSON.parse(raw.images) : raw.images
    } catch {
      images = undefined
    }
  }

  return {
    id,
    role,
    content: asString(raw?.content),
    createdAt: asString(raw?.CreatedAt ?? raw?.created_at),
    verdict,
    images
  }
}

const normalizeKbDocument = (raw: any): KnowledgeDocumentBrief | null => {
  const id = asNumber(raw?.ID ?? raw?.id)
  if (id <= 0) return null

  return {
    id,
    name: asString(raw?.name) || '未命名文档',
    description: asString(raw?.description),
    status: asString(raw?.status),
    chunkCount: asNumber(raw?.chunk_count),
    fileSize: asNumber(raw?.file_size),
    isEnabled: raw?.is_enabled !== false,
    createdAt: asString(raw?.CreatedAt ?? raw?.created_at)
  }
}

const normalizeOpinionTrack = (raw: any): OpinionTrack | null => {
  const id = asNumber(raw?.ID ?? raw?.id)
  if (id <= 0) return null

  return {
    id,
    name: asString(raw?.name) || '未命名赛道',
    description: asString(raw?.description)
  }
}

// ==================== URL & SSE Helpers ====================

const normalizeBaseURL = (raw: string | undefined): string => {
  const value = (raw || '').trim()
  if (!value) return '/api'
  if (/\/dev\/?$/i.test(value) || /youshu\.asia\/dev\/?$/i.test(value)) return '/api'
  return value.replace(/\/$/, '')
}

export const buildApiUrl = (path: string): string => {
  const base = normalizeBaseURL(import.meta.env.VITE_API_BASE_URL)
  return `${base}${path}`
}

const getAuthToken = (): string => {
  return localStorage.getItem('token') || localStorage.getItem('auth_token') || ''
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
    const candidate = (payload as any).answer || (payload as any).reply || (payload as any).content
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
    return { type, data: parsed?.data }
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
    const text = parseChatText(payloadData) || parseChatText((payloadData as any)?.data) || '服务端返回空响应'
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
  const token = getAuthToken()
  if (!token) throw new Error('未登录，请重新登录')

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
    let text = ''
    try { text = await response.text() } catch { /* ignore */ }
    throw new Error(text || `请求失败 (${response.status})`)
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
  const res = await request.post('/v1/sales-rag/ocr', formData, { timeout: 60000 })
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

export const fetchSalesSopTemplates = async (): Promise<SalesSopTemplate[]> => {
  const res = await request.get('/v1/sop/templates')
  const rawTemplates = (res as any)?.data?.templates
  if (!Array.isArray(rawTemplates)) return []

  return rawTemplates
    .map((template: any) => {
      const id = asNumber(template?.ID ?? template?.id ?? template?.Id)
      if (id <= 0) return null
      return {
        id,
        name: asString(template?.name) || '未命名 SOP',
        description: asString(template?.description)
      }
    })
    .filter(Boolean) as SalesSopTemplate[]
}
