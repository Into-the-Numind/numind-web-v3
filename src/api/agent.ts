import request from './request'
import * as mock from './agent.mock'
import type {
  AgentSkillListResponse,
  AgentRun,
  CreateRunRequest,
  CreateRunResponse,
  CancelRunResponse,
  NarrationEvent,
  SessionSnapshot,
  EstimateRequest,
  EstimateResponse,
  RecentSession,
  SupportContact,
  ExtendBudgetRequest,
  FeedbackRequest,
  UploadResponse
} from '@/types/agent'

export interface AnswerPayload {
  selected: string[]
  free_text?: string
}

export interface AnswerResponse {
  run_id: number
  status: 'resumed'
}

const useMock = (): boolean => import.meta.env.VITE_AGENT_MOCK === 'true'

// 1. 学员侧可用 agent 列表
export const listAvailableAgents = async (): Promise<AgentSkillListResponse> => {
  if (useMock()) return mock.listAvailableAgents()
  const { data } = await request.get<{ data: AgentSkillListResponse }>('/v1/agent-skills/available')
  return data
}

// 2. 最近 7 天会话
export const listRecentSessions = async (limit = 5): Promise<RecentSession[]> => {
  if (useMock()) return mock.listRecentSessions(limit)
  const { data } = await request.get<{ data: RecentSession[] }>('/v1/agent-sessions/recent', {
    params: { limit }
  })
  return data
}

// 3. 历史分组会话
export const listAllHistorySessions = async (): Promise<RecentSession[]> => {
  if (useMock()) return mock.listAllHistorySessions()
  const { data } = await request.get<{ data: RecentSession[] }>('/v1/agent-sessions/history')
  return data
}

// 4. 会话快照（历史恢复）
// sessionId is the UUID string from agent_run.session_id (backend varchar).
export const getSessionSnapshot = async (sessionId: string): Promise<SessionSnapshot> => {
  if (useMock()) return mock.getSessionSnapshot(sessionId)
  const { data } = await request.get<{ data: SessionSnapshot }>(
    `/v1/sessions/${encodeURIComponent(sessionId)}/snapshot`
  )
  return data
}

// 5. 预估消耗
export const estimateRun = async (req: EstimateRequest): Promise<EstimateResponse> => {
  if (useMock()) return mock.estimateRun(req)
  const { data } = await request.post<{ data: EstimateResponse }>('/v1/agent-runs/estimate', req)
  return data
}

// 6. 创建 run
export const createRun = async (req: CreateRunRequest): Promise<CreateRunResponse> => {
  if (useMock()) return mock.createRun(req)
  const { data } = await request.post<{ data: CreateRunResponse }>('/v1/agent-runs', req)
  return data
}

// 7. 查 run 状态
export const getRun = async (runId: number): Promise<AgentRun> => {
  if (useMock()) return mock.getRun(runId)
  const { data } = await request.get<{ data: AgentRun }>(`/v1/agent-runs/${runId}`)
  return data
}

// 8. 拉 narration 事件
export const fetchNarrationEvents = async (
  runId: number,
  sinceTs: string
): Promise<NarrationEvent[]> => {
  if (useMock()) return mock.fetchNarrationEvents(runId, sinceTs)
  const { data } = await request.get<{ data: NarrationEvent[] }>(
    `/v1/agent-runs/${runId}/narration`,
    { params: { since: sinceTs } }
  )
  return data
}

// 9. 取消 run
export const cancelRun = async (runId: number): Promise<CancelRunResponse> => {
  if (useMock()) return mock.cancelRun(runId)
  const { data } = await request.post<{ data: CancelRunResponse }>(`/v1/agent-runs/${runId}/cancel`)
  return data
}

// 10. 续费
export const extendBudget = async (runId: number, req: ExtendBudgetRequest): Promise<AgentRun> => {
  if (useMock()) return mock.extendBudget(runId, req)
  const { data } = await request.post<{ data: AgentRun }>(
    `/v1/agent-runs/${runId}/extend-budget`,
    req
  )
  return data
}

// 11. 提交反馈
export const submitFeedback = async (runId: number, req: FeedbackRequest): Promise<void> => {
  if (useMock()) return mock.submitFeedback(runId, req)
  await request.post(`/v1/agent-runs/${runId}/feedback`, req)
}

// 12. 父账户客服联系方式
export const getSupportContact = async (): Promise<SupportContact> => {
  if (useMock()) return mock.getSupportContact()
  const { data } = await request.get<{ data: SupportContact }>(
    '/v1/tenant-settings/support-contact'
  )
  return data
}

// 13. 文件上传
export const uploadAttachment = async (file: File): Promise<UploadResponse> => {
  if (useMock()) return mock.uploadAttachment(file)
  const form = new FormData()
  form.append('file', file)
  const { data } = await request.post<{ data: UploadResponse }>('/v1/agent-attachments', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  })
  return data
}

// 14. 提交 ask_user_question 答案（T6）
export const postAgentAnswer = async (
  runId: number,
  payload: AnswerPayload
): Promise<AnswerResponse> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = (await request.post(`/v1/agent-runs/${runId}/answer`, payload)) as any
  return res.data as AnswerResponse
}
