import request from './request'

// ==================== Types ====================
// 形状严格对齐后端 spec §3.1（用户端 API 契约）。

/** 列表项 / 详情公共字段 */
export interface AnnouncementBrief {
  id: number
  type: string // 'plain' | 'survey'
  title: string
  content: string
  is_important: boolean
  published_at: string | null
  expires_at: string | null
  is_read: boolean
  is_survey_submitted: boolean
}

/** 问卷题目 */
export interface Question {
  id: number
  order_index: number
  question_type: string // 'single' | 'multi' | 'rating' | 'text'
  title: string
  required: boolean
  options?: string[] | null
  rating_max?: number | null
  rating_style?: string | null
}

/** 公告详情 = brief + questions（非 survey 时 questions 为 []） */
export interface AnnouncementDetail extends AnnouncementBrief {
  questions: Question[]
}

/** GET /v1/announcements 响应 */
export interface AnnouncementListResp {
  list: AnnouncementBrief[]
  total: number
  unread_count: number
}

/** GET /v1/announcements/unread-count 响应 */
export interface UnreadCountResp {
  unread_count: number
}

/** 单题答案提交载荷 */
export interface SubmitAnswer {
  question_id: number
  options?: string[]
  rating?: number | null
  text?: string | null
}

/** POST /v1/announcements/:id/survey/submit 响应 */
export interface SubmitResp {
  submitted: boolean
}

// ==================== API Functions ====================
// request 响应拦截器在 code 0/200 时直接返回 envelope 对象本身（{code,message,data}），
// 不是 AxiosResponse；业务载荷在该 envelope 的 `.data` 字段下。
// 故各 wrapper 取 (res as any)?.data —— 用可选链兜底拦截器 HTML-fallback 路径返回 undefined 的情况（对齐 sales.ts）。

/** GET /v1/announcements?page&page_size — 公告列表（含未读计数） */
export const fetchAnnouncements = async (params: {
  page: number
  page_size: number
}): Promise<AnnouncementListResp> => {
  const res = await request.get('/v1/announcements', { params })
  return (res as any)?.data as AnnouncementListResp
}

/** GET /v1/announcements/unread-count — 轻量未读计数（铃铛轮询用） */
export const fetchUnreadCount = async (): Promise<UnreadCountResp> => {
  const res = await request.get('/v1/announcements/unread-count')
  return (res as any)?.data as UnreadCountResp
}

/** GET /v1/announcements/:id — 公告详情（不改已读状态） */
export const fetchAnnouncementDetail = async (id: number): Promise<AnnouncementDetail> => {
  const res = await request.get(`/v1/announcements/${id}`)
  return (res as any)?.data as AnnouncementDetail
}

/** POST /v1/announcements/:id/read — 标记已读（幂等），返回最新未读计数 */
export const markAnnouncementRead = async (id: number): Promise<UnreadCountResp> => {
  const res = await request.post(`/v1/announcements/${id}/read`)
  return (res as any)?.data as UnreadCountResp
}

/** POST /v1/announcements/:id/survey/submit — 提交问卷答卷 */
export const submitSurvey = async (id: number, answers: SubmitAnswer[]): Promise<SubmitResp> => {
  const res = await request.post(`/v1/announcements/${id}/survey/submit`, { answers })
  return (res as any)?.data as SubmitResp
}
