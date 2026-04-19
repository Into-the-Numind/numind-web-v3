import request from './request'
import type { ApiResponse } from './request'

// ==================== Types ====================

export interface MonitorBlogger {
  id: number
  user_id: number
  xhs_user_id: string
  nickname: string
  avatar_url: string
  bio: string
  followers: number
  category: string
  is_active: boolean
  check_error: string
  consecutive_failures: number
  last_check_at: string
  last_note_at: string
  next_check_at: string
  created_at: string
  updated_at: string
}

export interface MonitorNote {
  id: number
  user_id: number
  blogger_id: number
  xhs_note_id: string
  title: string
  content: string
  note_type: string
  tags: string[]
  likes: number
  comments: number
  collects: number
  shares: number
  images: string[]
  video_url: string
  transcript: string
  ai_summary: string
  ai_topics: string[]
  ai_category: string
  published_at: string
  created_at: string
  updated_at: string
}

export interface MonitorBriefing {
  id: number
  user_id: number
  type: string
  title: string
  content: string
  note_count: number
  highlights: string[]
  trends: string[]
  period_start: string
  period_end: string
  feishu_sent: boolean
  created_at: string
}

export interface FeishuBitableConfig {
  app_token: string
  table_id: string
}

export interface MonitorConfig {
  id: number
  user_id: number
  crawl_cron: string
  briefing_cron: string
  briefing_type: string
  feishu_webhook: string
  feishu_bitable_config: FeishuBitableConfig
  notify_on_update: boolean
}

export interface MonitorStats {
  total_bloggers: number
  active_bloggers: number
  total_notes: number
  notes_this_week: number
  total_briefings: number
  latest_briefing: MonitorBriefing | null
}

// ==================== Request/Response Types ====================

export interface AddBloggerParams {
  xhs_user_id: string
  nickname?: string
  category?: string
}

export interface UpdateBloggerParams {
  nickname?: string
  category?: string
  is_active?: boolean
}

export interface ListBloggersParams {
  offset?: number
  limit?: number
  is_active?: boolean
  category?: string
}

export interface ListBloggersResponse {
  list: MonitorBlogger[]
  total: number
}

export interface ListNotesParams {
  offset?: number
  limit?: number
  blogger_id?: number
  note_type?: string
  keyword?: string
}

export interface ListNotesResponse {
  list: MonitorNote[]
  total: number
}

export interface ListBriefingsParams {
  offset?: number
  limit?: number
  type?: string
}

export interface ListBriefingsResponse {
  list: MonitorBriefing[]
  total: number
}

export interface GenerateBriefingParams {
  type: string
  period_start?: string
  period_end?: string
}

export interface UpdateMonitorConfigParams {
  crawl_cron?: string
  briefing_cron?: string
  briefing_type?: string
  feishu_webhook?: string
  feishu_bitable_config?: FeishuBitableConfig
  notify_on_update?: boolean
}

export interface CheckBatchParams {
  blogger_ids: number[]
}

export interface PermissionResponse {
  allowed: boolean
}

// ==================== API Functions ====================

// 权限检查
export const checkMonitorPermission = (): Promise<ApiResponse<PermissionResponse>> => {
  return request.get('/v1/monitor/check-permission')
}

// 博主管理
export const addBlogger = (params: AddBloggerParams): Promise<ApiResponse<MonitorBlogger>> => {
  return request.post('/v1/monitor/bloggers', params)
}

export const listBloggers = (
  params?: ListBloggersParams
): Promise<ApiResponse<ListBloggersResponse>> => {
  return request.get('/v1/monitor/bloggers', { params })
}

export const getBlogger = (id: number): Promise<ApiResponse<MonitorBlogger>> => {
  return request.get(`/v1/monitor/bloggers/${id}`)
}

export const updateBlogger = (
  id: number,
  params: UpdateBloggerParams
): Promise<ApiResponse<MonitorBlogger>> => {
  return request.put(`/v1/monitor/bloggers/${id}`, params)
}

export const deleteBlogger = (id: number): Promise<ApiResponse<null>> => {
  return request.delete(`/v1/monitor/bloggers/${id}`)
}

// 博主检查
export const checkBlogger = (id: number): Promise<ApiResponse<null>> => {
  return request.post(`/v1/monitor/bloggers/${id}/check`)
}

export const checkBatch = (params: CheckBatchParams): Promise<ApiResponse<null>> => {
  return request.post('/v1/monitor/check-batch', params)
}

// 笔记管理
export const listNotes = (params?: ListNotesParams): Promise<ApiResponse<ListNotesResponse>> => {
  return request.get('/v1/monitor/notes', { params })
}

export const getNote = (id: number): Promise<ApiResponse<MonitorNote>> => {
  return request.get(`/v1/monitor/notes/${id}`)
}

export const analyzeNote = (id: number): Promise<ApiResponse<MonitorNote>> => {
  return request.post(`/v1/monitor/notes/${id}/analyze`)
}

// 简报管理
export const listBriefings = (
  params?: ListBriefingsParams
): Promise<ApiResponse<ListBriefingsResponse>> => {
  return request.get('/v1/monitor/briefings', { params })
}

export const getBriefing = (id: number): Promise<ApiResponse<MonitorBriefing>> => {
  return request.get(`/v1/monitor/briefings/${id}`)
}

export const generateBriefing = (
  params: GenerateBriefingParams
): Promise<ApiResponse<MonitorBriefing>> => {
  return request.post('/v1/monitor/briefings/generate', params)
}

// 配置管理
export const getMonitorConfig = (): Promise<ApiResponse<MonitorConfig>> => {
  return request.get('/v1/monitor/config')
}

export const updateMonitorConfig = (
  params: UpdateMonitorConfigParams
): Promise<ApiResponse<MonitorConfig>> => {
  return request.put('/v1/monitor/config', params)
}

// 统计数据
export const getMonitorStats = (): Promise<ApiResponse<MonitorStats>> => {
  return request.get('/v1/monitor/stats')
}

// XHS 账号绑定
export interface XhsQRCreateResponse {
  qr_id: string
  code: string
  qr_url: string
}

export interface XhsQRStatusResponse {
  status: number // 0=waiting, 1=scanned, 2=confirmed
  message: string
}

export interface XhsBindStatusResponse {
  bound: boolean
  nickname: string
  xhs_user_id: string
}

export const createXhsQR = (): Promise<ApiResponse<XhsQRCreateResponse>> => {
  return request.post('/v1/monitor/xhs/qr/create')
}

export const checkXhsQRStatus = (qrId: string): Promise<ApiResponse<XhsQRStatusResponse>> => {
  return request.get(`/v1/monitor/xhs/qr/status/${qrId}`)
}

export const completeXhsQR = (qrId: string): Promise<ApiResponse<{ message: string }>> => {
  return request.post(`/v1/monitor/xhs/qr/complete/${qrId}`)
}

export const getXhsBindStatus = (): Promise<ApiResponse<XhsBindStatusResponse>> => {
  return request.get('/v1/monitor/xhs/bind-status')
}

export const unbindXhs = (): Promise<ApiResponse<{ message: string }>> => {
  return request.post('/v1/monitor/xhs/unbind')
}
