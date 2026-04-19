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
  // 后端 BatchDeleteRuns 要求 ids 为 []uint，前端列表里的 runId 统一存成 string，
  // 这里转成 number 避免 `json: cannot unmarshal string into Go struct field .ids of type uint`
  const numericIds = ids.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0)
  await request.post('/v1/sop/runs/batch/delete', { ids: numericIds })
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
  // F2：默认 auto_apply_bookmarks=true；body 后置允许 caller 显式覆盖
  const payload = { auto_apply_bookmarks: true, ...body }
  const res = await request.post('/v1/sop/runs', payload)
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

/**
 * POST /v1/sop/bookmarks 保存节点为书签（F2 新增，spec §3.4）
 *
 * 后端 controller: `numind-server/internal/numind/controller/v1/sop/bookmark.go`
 *   - request  : SaveBookmarkRequest   (run_id + node_id 必填)
 *   - response : SaveBookmarkResponse  (完整 bookmark DTO)
 *
 * 业务：后端根据 (run_id, node_id) 查 node_run → copy input/output/thinking
 * → 创建一条 sop_node_bookmark 记录。
 */
export interface SaveBookmarkRequest {
  run_id: number
  node_id: number
  bookmark_name?: string
  description?: string
}

export interface SaveBookmarkResponse {
  id: number
  user_id: number
  template_id: number
  node_id: number
  node_sort: number
  node_name?: string
  input: string
  output: string
  thinking: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  bookmark_name: string
  description: string
  created_at: string
  updated_at: string
}

export const saveBookmark = async (body: SaveBookmarkRequest): Promise<SaveBookmarkResponse> => {
  const res = await request.post('/v1/sop/bookmarks', body)
  return (res as unknown as { data: SaveBookmarkResponse }).data
}

/**
 * DELETE /v1/sop/bookmarks/:id 删除书签（F2 新增，spec §3.4）
 *
 * 后端 controller: DeleteBookmark
 * 返回 `{ message: "删除成功" }`，前端不关心 body，统一 void。
 */
export const removeBookmark = async (bookmarkId: number): Promise<void> => {
  await request.delete(`/v1/sop/bookmarks/${bookmarkId}`)
}

/**
 * GET /v1/sop/runs/:id/chat-messages 获取某 run 的聊天历史
 *
 * 后端返回 RunChatMessagesResponse（v1/sop.go:332-337）：
 *   { run_id, conversation_id, messages: RunChatMessageItem[] }
 *
 * 字段来源于 biz 层 ListChatMessages，包含 token 用量等元数据。
 */
export interface RunChatMessageItem {
  id: number
  role: 'user' | 'assistant'
  content: string
  thinking: string
  created_at: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  reasoning_tokens: number
  estimated_prompt_tokens: number
  /**
   * 执行使用的模型名（F2 新增，对应后端 SopChatMessage.ModelName）。
   * 后端 B5 字段补齐 + dev 部署前此字段可能为 undefined，消费方需做 nullish 处理。
   */
  model_name?: string
  /**
   * 本条 assistant 消息生成耗时 ms（F2 新增，对应后端 SopChatMessage.DurationMs）。
   * 同上，gate 前可能为 undefined。
   */
  duration_ms?: number
}

export interface RunChatMessagesResponse {
  run_id: number
  conversation_id: string
  messages: RunChatMessageItem[]
}

export const listRunChatMessages = async (runId: number): Promise<RunChatMessagesResponse> => {
  const res = await request.get(`/v1/sop/runs/${runId}/chat-messages`)
  const data = (res as unknown as { data: RunChatMessagesResponse }).data
  // 防御：后端可能返回 null messages
  return {
    run_id: data?.run_id ?? runId,
    conversation_id: data?.conversation_id ?? '',
    messages: data?.messages ?? []
  }
}

// ============================================================
// SOP 运行页 Vue 重写（task 21）新增：template / run / status
// ============================================================

/**
 * GET /v1/sop/templates/:id/nodes 获取 template + nodes 列表
 *
 * 后端返回结构（task 3 改造后）：
 *   { template: SopTemplatePublicDTO, nodes: SopNodePublicDTO[], total: number }
 * 敏感字段已在后端 DTO 层隐藏。
 */
export interface TemplateNodesResponse {
  template: {
    id: number
    name: string
    description: string
    status: string
    publish_status: string
    trailing_chat_enabled: boolean
    created_at: string
    updated_at: string
  }
  nodes: Array<{
    id: number
    template_id: number
    name: string
    description: string
    sort: number
    status: string
    created_at: string
    updated_at: string
  }>
  total: number
}

export const fetchTemplateNodes = async (templateId: number): Promise<TemplateNodesResponse> => {
  const res = await request.get(`/v1/sop/templates/${templateId}/nodes`)
  return (res as unknown as { data: TemplateNodesResponse }).data
}

/**
 * GET /v1/sop/runs/:id 获取单个 run 的基本信息
 * 后端直接序列化 model.SopRun（controller/v1/sop/sop.go:228）
 */
export interface SopRunResponse {
  ID: number
  template_id: number
  user_id: number
  status: string
  conversation_id: string
  counted: boolean
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
  error_message?: string
}

export const fetchRun = async (runId: number): Promise<SopRunResponse> => {
  const res = await request.get(`/v1/sop/runs/${runId}`)
  return (res as unknown as { data: SopRunResponse }).data
}

/**
 * GET /v1/sop/runs/:id/status 获取 run 完整状态 + 已完成节点 + 下一节点
 *
 * 后端返回 RunStatusResponse（pkg/api/numind/v1/sop.go:179-189）
 */
export interface StatusCompletedNodeInfo {
  node_run_id: number
  node_id: number
  node_name: string
  sort: number
  input: string
  output: string
  thinking?: string
  from_bookmark: boolean
  bookmark_id?: number
  is_accessible: boolean
  /**
   * 节点执行使用的模型名（F1 新增，对应后端 DTO 新增字段）。
   * 后端 B5 task 负责透出；在 gate 通过前前端可能收到 undefined。
   */
  model_name?: string
  /**
   * 节点执行耗时 ms（F1 新增，对应后端 DTO 新增字段）。
   */
  latency_ms?: number
  /**
   * 节点执行总 token 数（F1 新增，对应后端 DTO 新增字段）。
   * 后端 SopNodeRun.TotalTokens 带 json:"-"，必须经 controller DTO mapping 透出。
   */
  total_tokens?: number
}

export interface StatusNextNodeInfo {
  node_id: number
  node_name: string
  sort: number
  is_first: boolean
  has_next: boolean
}

export interface RunStatusResponse {
  status: string
  current_node_sort: number
  completed_nodes: StatusCompletedNodeInfo[]
  next_node: StatusNextNodeInfo | null
  total_nodes: number
  completed_count: number
  auto_applied_count: number
}

export const fetchRunStatusDetail = async (runId: number): Promise<RunStatusResponse> => {
  const res = await request.get(`/v1/sop/runs/${runId}/status`)
  return (res as unknown as { data: RunStatusResponse }).data
}
