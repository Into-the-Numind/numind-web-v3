import request from './request'

export interface SalesSession {
  id: number
  title: string
  salesStage: string
  updatedAt: string
}

export interface SalesMessage {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
}

export interface SalesSopTemplate {
  id: number
  name: string
  description: string
}

export interface CreateSalesSessionPayload {
  title: string
  salesStage?: string
  customerProfile?: string
}

export interface SendSalesMessagePayload {
  query: string
  sales_stage?: string
  deep_thinking?: boolean
  chat_mode?: 'sales' | 'free'
}

export interface SalesChatEvent {
  type: string
  data: unknown
}

const asNumber = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const asString = (value: unknown): string => {
  return typeof value === 'string' ? value : ''
}

const normalizeSession = (raw: any): SalesSession | null => {
  const id = asNumber(raw?.ID ?? raw?.id)
  if (id <= 0) {
    return null
  }

  return {
    id,
    title: asString(raw?.title) || '新对话',
    salesStage: asString(raw?.sales_stage),
    updatedAt: asString(raw?.UpdatedAt ?? raw?.updated_at)
  }
}

const normalizeMessage = (raw: any): SalesMessage | null => {
  const id = asNumber(raw?.ID ?? raw?.id)
  const role = asString(raw?.role)
  if (!id || (role !== 'user' && role !== 'assistant' && role !== 'system')) {
    return null
  }

  return {
    id,
    role,
    content: asString(raw?.content),
    createdAt: asString(raw?.CreatedAt ?? raw?.created_at)
  }
}

const parseChatText = (payload: unknown): string | null => {
  if (!payload) {
    return null
  }

  if (typeof payload === 'string') {
    const trimmed = payload.trim()
    if (!trimmed) {
      return null
    }

    if (!trimmed.includes('data:')) {
      return trimmed
    }

    let tokenText = ''
    const chunks = trimmed.split('\n\n')

    for (const chunk of chunks) {
      const line = chunk
        .split('\n')
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith('data:'))

      if (!line) {
        continue
      }

      const jsonText = line.slice(5).trim()
      if (!jsonText) {
        continue
      }

      try {
        const event = JSON.parse(jsonText)
        if (event?.type === 'token' && typeof event?.data === 'string') {
          tokenText += event.data
        }
      } catch {
        // ignore single broken stream chunk
      }
    }

    return tokenText.trim() || null
  }

  if (typeof payload === 'object') {
    const candidate = (payload as any).answer || (payload as any).reply || (payload as any).content
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
  }

  return null
}

const normalizeBaseURL = (raw: string | undefined): string => {
  const value = (raw || '').trim()
  if (!value) {
    return '/api'
  }
  if (/\/dev\/?$/i.test(value) || /youshu\.asia\/dev\/?$/i.test(value)) {
    return '/api'
  }
  return value.replace(/\/$/, '')
}

const buildApiUrl = (path: string): string => {
  const base = normalizeBaseURL(import.meta.env.VITE_API_BASE_URL)
  return `${base}${path}`
}

export const fetchSalesSessions = async (): Promise<SalesSession[]> => {
  const res = await request.get('/v1/sales-rag/sessions')
  const sessions = (res as any)?.data?.sessions
  if (!Array.isArray(sessions)) {
    return []
  }

  return sessions.map(normalizeSession).filter(Boolean) as SalesSession[]
}

export const createSalesSession = async (
  payload: CreateSalesSessionPayload
): Promise<SalesSession | null> => {
  const res = await request.post('/v1/sales-rag/sessions', {
    title: payload.title,
    sales_stage: payload.salesStage || '',
    customer_profile: payload.customerProfile || ''
  })

  return normalizeSession((res as any)?.data)
}

export const fetchSalesMessages = async (sessionId: number): Promise<SalesMessage[]> => {
  const res = await request.get(`/v1/sales-rag/sessions/${sessionId}/messages`)
  const messages = (res as any)?.data?.messages
  if (!Array.isArray(messages)) {
    return []
  }

  return messages.map(normalizeMessage).filter(Boolean) as SalesMessage[]
}

export const fetchSalesSopTemplates = async (): Promise<SalesSopTemplate[]> => {
  const res = await request.get('/v1/sop/templates')
  const rawTemplates = (res as any)?.data?.templates

  if (!Array.isArray(rawTemplates)) {
    return []
  }

  return rawTemplates
    .map((template: any) => {
      const id = asNumber(template?.ID ?? template?.id ?? template?.Id)
      if (id <= 0) {
        return null
      }
      return {
        id,
        name: asString(template?.name) || '未命名 SOP',
        description: asString(template?.description)
      }
    })
    .filter(Boolean) as SalesSopTemplate[]
}

export const sendSalesMessage = async (
  sessionId: number,
  payload: SendSalesMessagePayload
): Promise<string | null> => {
  const res = await request.post(`/v1/sales-rag/sessions/${sessionId}/chat`, payload)
  return parseChatText((res as any)?.data)
}

const parseSseChunk = (chunk: string): SalesChatEvent | null => {
  const line = chunk
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith('data:'))

  if (!line) {
    return null
  }

  const raw = line.slice(5).trim()
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw)
    const type = typeof parsed?.type === 'string' ? parsed.type : 'token'
    return { type, data: parsed?.data }
  } catch {
    return { type: 'token', data: raw }
  }
}

export const sendSalesMessageStream = async (
  sessionId: number,
  payload: SendSalesMessagePayload,
  onEvent: (event: SalesChatEvent) => void
): Promise<void> => {
  const token = localStorage.getItem('token')
  if (!token) {
    throw new Error('未登录，请重新登录')
  }

  const response = await fetch(buildApiUrl(`/v1/sales-rag/sessions/${sessionId}/chat`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    let text = ''
    try {
      text = await response.text()
    } catch {
      // ignore read error
    }
    throw new Error(text || `聊天请求失败 (${response.status})`)
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase()
  if (contentType.includes('application/json')) {
    const payloadData = await response.json().catch(() => null)
    const text =
      parseChatText(payloadData) || parseChatText((payloadData as any)?.data) || '服务端返回空响应'
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
      if (event) {
        onEvent(event)
      }
    }
  }

  const finalChunk = buffer.trim()
  if (finalChunk) {
    const event = parseSseChunk(finalChunk)
    if (event) {
      onEvent(event)
    }
  }

  onEvent({ type: 'done', data: null })
}
