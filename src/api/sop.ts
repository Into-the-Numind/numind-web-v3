import request from './request'

export interface SopRunRecord {
  runId: string
  templateId: string
  templateName: string
  status: string
  executedAt: string
  completedCount: number
  totalNodes: number
}

interface ExecutedRunRaw {
  run_id?: string | number
  template_id?: string | number
  template_name?: string
  run_status?: string
  executed_at?: string
  completed_count?: number
  total_nodes?: number
}

interface RunStatusRaw {
  completed_nodes?: unknown[]
  completed_count?: number
  total_nodes?: number
}

export const fetchExecutedRuns = async (): Promise<SopRunRecord[]> => {
  const res = await request.get('/v1/sop/templates/executed')
  const templates = (res as any)?.data?.templates
  if (!Array.isArray(templates)) {
    return []
  }

  return templates
    .map((r: ExecutedRunRaw) => {
      const runId = String(r.run_id ?? '')
      if (!runId) return null
      return {
        runId,
        templateId: String(r.template_id ?? ''),
        templateName: r.template_name || '未命名模板',
        status: r.run_status || '',
        executedAt: r.executed_at || '',
        completedCount: r.completed_count || 0,
        totalNodes: r.total_nodes || 4
      }
    })
    .filter(Boolean) as SopRunRecord[]
}

export const fetchRunStatus = async (
  runId: string
): Promise<{ completedCount: number; totalNodes: number } | null> => {
  try {
    const res = await request.get(`/v1/sop/runs/${runId}/status`)
    const data = (res as any)?.data as RunStatusRaw | undefined
    if (!data) return null

    let completedCount = 0
    if (Array.isArray(data.completed_nodes)) {
      completedCount = data.completed_nodes.length
    } else if (typeof data.completed_count === 'number') {
      completedCount = data.completed_count
    }

    return {
      completedCount,
      totalNodes: data.total_nodes || 4
    }
  } catch {
    return null
  }
}

export const deleteRun = async (runId: string): Promise<void> => {
  await request.delete(`/v1/sop/runs/${runId}`)
}

export const batchDeleteRuns = async (ids: string[]): Promise<void> => {
  await request.post('/v1/sop/runs/batch/delete', { ids })
}

// ============================================================
// SOP 运行页 Vue 重写（task 5+）新增的 API 函数
// ============================================================

/**
 * POST /v1/sop/runs 创建一个 SOP run（初始 status = 'draft'）
 *
 * 前端在首次执行节点前 lazy 调用此接口（useDraftLifecycle.lazyCreateRun）。
 * 后端会创建 status='draft' 的记录，counted=false，不立即扣减配额。
 *
 * 返回的 run.id 用于后续 execute / chat / beacon cleanup 调用。
 */
export interface CreateRunRequest {
  template_id: number
  text?: string
  auto_apply_bookmarks?: boolean
}

export interface CreateRunResponse {
  id: number
  template_id: number
  status: string
  conversation_id: string
  counted: boolean
  auto_applied_count?: number
}

export const createRun = async (body: CreateRunRequest): Promise<CreateRunResponse> => {
  const res = await request.post('/v1/sop/runs', body)
  const data = (res as unknown as { data: CreateRunResponse }).data
  return data
}

/**
 * POST /v1/ali/vision/analyze 图片 OCR（阿里 qwen3-vl）
 *
 * 后端要求 multipart/form-data：
 * - file: 图片文件（<= 7MB，阿里百炼限制）
 * - run_id: 必需（uint）
 * - node_id: 必需（uint）
 *
 * Response: { content: string, file_id?: number }
 */
export interface VisionAnalyzeResponse {
  content: string
  file_id?: number
}

export const uploadImageForOCR = async (
  file: File,
  runId: number,
  nodeId: number
): Promise<VisionAnalyzeResponse> => {
  const form = new FormData()
  form.append('file', file)
  form.append('run_id', String(runId))
  form.append('node_id', String(nodeId))
  const res = await request.post('/v1/ali/vision/analyze', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return (res as unknown as { data: VisionAnalyzeResponse }).data
}

/**
 * POST /v1/pdf/convert-to-text 文档转文字
 *
 * 支持扩展名：.pdf, .txt, .md, .docx, .doc, .rtf
 * 大小限制：10MB（后端 MaxFileSize 常量）
 *
 * 后端 form-data 字段：file, run_id, node_id
 * Response: string（直接的纯文本，不在 data 对象内）
 */
export const uploadFileForText = async (
  file: File,
  runId: number,
  nodeId: number
): Promise<string> => {
  const form = new FormData()
  form.append('file', file)
  form.append('run_id', String(runId))
  form.append('node_id', String(nodeId))
  const res = await request.post('/v1/pdf/convert-to-text', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  // 后端 core.WriteResponse(c, nil, text) 把 text 放在 data 字段
  const data = (res as unknown as { data: string }).data
  return typeof data === 'string' ? data : ''
}

/**
 * GET /v1/sop/templates/:id/bookmarks 列出某模板的所有书签
 *
 * Response: { bookmarks: BookmarkListItem[] }
 */
export interface BookmarkListItem {
  id: number
  node_id: number
  node_sort: number
  node_name?: string
  bookmark_name: string
  output_preview: string
  has_thinking: boolean
  total_tokens: number
  created_at: string
}

export const listBookmarksByTemplate = async (templateId: number): Promise<BookmarkListItem[]> => {
  const res = await request.get(`/v1/sop/templates/${templateId}/bookmarks`)
  const data = (res as unknown as { data: { bookmarks?: BookmarkListItem[] } }).data
  return data?.bookmarks ?? []
}

/**
 * POST /v1/sop/runs/:id/nodes/:node_id/apply-bookmark 应用书签到当前 run 的某节点
 *
 * body: { bookmark_id?: number } — 不传则后端自动查找该节点的书签
 * Response: { node_run_id, from_bookmark, bookmark_id, output, thinking }
 */
export interface ApplyBookmarkResponse {
  node_run_id: number
  from_bookmark: boolean
  bookmark_id: number
  output: string
  thinking: string
}

export const applyBookmark = async (
  runId: number,
  nodeId: number,
  bookmarkId?: number
): Promise<ApplyBookmarkResponse> => {
  const body = bookmarkId !== undefined ? { bookmark_id: bookmarkId } : {}
  const res = await request.post(`/v1/sop/runs/${runId}/nodes/${nodeId}/apply-bookmark`, body)
  return (res as unknown as { data: ApplyBookmarkResponse }).data
}
