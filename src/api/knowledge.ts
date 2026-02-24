import request from './request'
import type { ApiResponse } from './request'

export interface KnowledgeDocument {
  id: number
  name: string
  description: string
  status: 'PENDING' | 'PARSING' | 'SPLITTING' | 'TAGGING' | 'EMBEDDING' | 'COMPLETED' | 'FAILED'
  chunk_count: number
  file_size: number
  is_enabled: boolean
  created_at: string
  updated_at: string
}

export interface DocumentChunk {
  id: string
  content: string
  summary?: string
  tags?: string[]
}

// 获取文档列表
export const fetchDocuments = (): Promise<ApiResponse<KnowledgeDocument[]>> => {
  return request.get('/v1/sales-rag/documents')
}

// 上传文档
export const uploadDocument = (formData: FormData): Promise<ApiResponse<any>> => {
  return request.post('/v1/sales-rag/ingest', formData, {
    timeout: 120000
  })
}

// 获取文档详情/状态
export const getDocument = (id: number): Promise<ApiResponse<KnowledgeDocument>> => {
  return request.get(`/v1/sales-rag/documents/${id}`)
}

// 更新文档（启用/禁用）
export const updateDocument = (id: number, data: Partial<KnowledgeDocument>): Promise<ApiResponse<any>> => {
  return request.put(`/v1/sales-rag/documents/${id}`, data)
}

// 删除文档
export const deleteDocument = (id: number): Promise<ApiResponse<any>> => {
  return request.delete(`/v1/sales-rag/documents/${id}`)
}

// 获取文档切片
export const fetchChunks = (id: number): Promise<ApiResponse<DocumentChunk[]>> => {
  return request.get(`/v1/sales-rag/documents/${id}/chunks`, {
    params: { limit: 10000 }
  })
}
