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

export type ChatbotStatus = 'draft' | 'published' | 'offline'

export interface ChatbotConfig {
  id: number
  user_id: number
  name: string
  description: string
  avatar: string
  system_prompt: string
  status: ChatbotStatus
  knowledge_base_count?: number
  created_at: string
  updated_at: string
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
  created_at: string
  updated_at: string
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
}

// ==================== SSE Event ====================

export type ChatbotEventType = 'status' | 'thinking' | 'token' | 'done' | 'error'

export interface ChatbotEvent {
  type: ChatbotEventType
  data: unknown
}
