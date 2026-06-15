// ==================== Knowledge Base ====================

export interface KnowledgeBase {
  id: number
  user_id: number
  name: string
  description: string
  status: string
  doc_count?: number
  created_at: string
  updated_at: string
}

export interface KBDetail extends KnowledgeBase {
  documents: KnowledgeDocument[]
}

export interface KnowledgeDocument {
  id: number
  name: string
  status: string
  file_size: number
  chunk_count: number
  created_at: string
}

// ==================== Chatbot Config ====================

export type ChatbotStatus = 'draft' | 'published'

export interface ChatbotConfig {
  id: number
  user_id: number
  name: string
  description: string
  system_prompt: string
  status: ChatbotStatus
  greeting_enabled: boolean
  greeting_message: string
  knowledge_base_count?: number
  created_at: string
  updated_at: string
  /**
   * Whether the current user can run this chatbot.
   * Backend sends this on list endpoints used by HomeView for UI gating.
   * Undefined → fallback to `true` (old backend compat; user clicks then
   * checkChatbotPermission will catch it). Click-time gate is still
   * enforced by /check-permission + CreateSession + ChatStream middleware.
   */
  has_permission?: boolean
}

export interface ChatbotDetail extends ChatbotConfig {
  knowledge_bases: KnowledgeBase[]
}

// ==================== SOP Template Config ====================

export interface ConfigSopTemplate {
  id: number
  name: string
  description: string
  creator_user_id: number | null
  publish_status: string
  status: string
  trailing_chat_enabled: boolean
  node_count?: number
  created_at: string
  updated_at: string
}

export interface SopNode {
  id: number
  template_id: number
  name: string
  description: string
  prompt: string
  sort: number
}

// ==================== Chatbot Session & Message (C-end) ====================

export interface ChatbotSession {
  id: number
  user_id: number
  chatbot_id: number
  title: string
  status: string
  message_count: number
  /**
   * 置顶时间（RFC3339 字符串）。三种取值含义：
   * - `undefined` — 字段未返回（旧后端响应，向后兼容）
   * - `null`      — 未置顶
   * - `string`    — 置顶时间戳（用于置顶组内倒序排序）
   *
   * Feature: chatbot-session-rename-pin (S4 Task 5)
   */
  pinned_at?: string | null
  created_at: string
  updated_at: string
}

export interface ChatbotMessageAttachment {
  id: number
  filename: string
  mime_type: string
}

export interface ChatbotMessage {
  id: number
  session_id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking: string
  seq: number
  prompt_tokens: number
  completion_tokens: number
  created_at: string
  /** 用户消息携带的图片附件引用（chatbot-image-recognition）；仅展示文件名 chip。 */
  attachments?: ChatbotMessageAttachment[]
}

// ==================== SSE Event ====================

export type ChatbotEventType = 'status' | 'thinking' | 'token' | 'done' | 'error'

export interface ChatbotEvent {
  type: ChatbotEventType
  data: unknown
}
