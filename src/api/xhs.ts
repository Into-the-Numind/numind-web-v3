import request from './request'
import type { ApiResponse } from './request'

// ==================== Types ====================

/** 笔记类型：图文 / 视频 */
export type NoteType = 'normal' | 'video'

/**
 * enrich_status — AI 富化状态。
 *   pending             待分析
 *   enriching           分析中（行级转圈）
 *   done                完成
 *   partial             部分完成（视频已过期 or 部分字段失败）
 *   failed              失败
 *   insufficient_credits 积分不足（角标 + 点击弹 InsufficientCreditsDialog）
 */
export type EnrichStatus =
  | 'pending'
  | 'enriching'
  | 'done'
  | 'partial'
  | 'failed'
  | 'insufficient_credits'

/** 评论项 */
export interface NoteComment {
  author: string
  text: string
  likes: number
  /** 嵌套回复（评论回复评论），仅一层 */
  replies?: NoteComment[]
}

/** 选题库笔记项（列表 + 详情共用，详情字段更全） */
export interface NoteItem {
  id: number
  xhs_note_id: string
  note_type: NoteType
  title: string
  content: string
  tags: string[]
  cover_url: string
  note_url: string
  published_at: string
  // 视频专属
  video_url: string
  video_transcript: string
  // 互动数据
  like_count: number
  collect_count: number
  comment_count: number
  share_count: number
  comments: NoteComment[]
  // 作者
  author_name: string
  author_link: string
  author_followers: number
  // AI 分析（6 字段）
  ai_topic_angle: string
  ai_viral_reason: string
  ai_borrowable: string
  ai_target_audience: string
  ai_title_formula: string
  ai_one_line: string
  // 元数据
  enrich_status: EnrichStatus
  collected_at: string
  crawled_at: string
}

// ==================== Request/Response Types ====================

/** 排序选项（与后端约定的字符串枚举） */
export type NoteSort =
  | 'collected_at_desc'
  | 'collected_at_asc'
  | 'published_at_desc'
  | 'published_at_asc'
  | 'like_count_desc'
  | 'collect_count_desc'

export interface ListNotesParams {
  page?: number
  page_size?: number
  note_type?: NoteType | ''
  keyword?: string
  enrich_status?: EnrichStatus | ''
  sort?: NoteSort
}

export interface ListNotesResponse {
  list: NoteItem[]
  total: number
}

export interface ExportNotesParams {
  /** 勾选的笔记 id（≤200） */
  ids: number[]
}

export interface ExportNotesResponse {
  /** 导出文件下载链接（1 小时有效） */
  download_url: string
}

export interface ExtTokenResponse {
  token: string
  expires_at: string
}

// ==================== API Functions ====================

/** 选题库列表（服务端分页） */
export const listNotes = (params?: ListNotesParams): Promise<ApiResponse<ListNotesResponse>> => {
  return request.get('/v1/xhs/notes', { params })
}

/** 笔记详情 */
export const getNote = (id: number): Promise<ApiResponse<NoteItem>> => {
  return request.get(`/v1/xhs/notes/${id}`)
}

/** 删除笔记 */
export const deleteNote = (id: number): Promise<ApiResponse<null>> => {
  return request.delete(`/v1/xhs/notes/${id}`)
}

/** 导出选中笔记 → 返回下载链接（1h 有效） */
export const exportNotes = (
  params: ExportNotesParams
): Promise<ApiResponse<ExportNotesResponse>> => {
  return request.post('/v1/xhs/notes/export', params)
}

/** 获取插件授权 token（交给浏览器插件采集时携带） */
export const getExtToken = (): Promise<ApiResponse<ExtTokenResponse>> => {
  return request.get('/v1/xhs/ext-token')
}
