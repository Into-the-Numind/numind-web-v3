// 文档系统 v1 类型（document-system）。

export interface DocumentDTO {
  id: number
  title: string
  content_md: string
  source_mime?: string
  source_object_key: string
  parse_method: string
  created_at: string
  updated_at: string
}

export interface OpenDocReq {
  /** agent 产物的 COS URL（后端据此派生 object_key 并校验 agent-outputs/{userID}/ 前缀）。 */
  source_url: string
  filename: string
  mime?: string
  run_id?: number
}

export interface SaveDocReq {
  content_md: string
  title?: string
}

export type ExportFormat = 'md' | 'pdf' | 'docx'
