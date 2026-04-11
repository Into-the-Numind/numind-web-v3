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
