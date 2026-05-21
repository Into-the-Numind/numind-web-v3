// ============================================================
// Agent Mode — TypeScript types
// 1:1 aligned with backend internal/numind/biz/narration/event.go
// and docs/agent-mode/feature-11-spec.md §3
// ============================================================

// ─────────────────────────────────────────
// NarrationState & NarrationEvent
// ─────────────────────────────────────────

export type NarrationState = 'queued' | 'use' | 'progress' | 'result' | 'error' | 'rejected'

export interface NarrationEvent {
  /** uint64 from backend → JS number safe (< 2^53); if backend switches to UUID, change to string */
  run_id: number
  tool_call_id: string
  tool_name: string
  state: NarrationState
  /** omitempty */
  verb?: string
  /** omitempty — progress state e.g. "已处理 45/87" */
  detail?: string
  /** omitempty — backend already maps unicode; frontend fallbacks to STATE_ICON */
  icon?: string
  /** 学员可见中文文案 */
  message: string
  /** omitempty — rejected state 的拒绝原因 */
  reason?: string
  /** ISO 8601 with TZ */
  timestamp: string
  /** Present only for tool_call_yield events (ask_user_question tool) */
  event_type?: 'tool_call_yield' | 'run_resumed'
  /** Present when event_type === 'tool_call_yield' */
  yield_payload?: {
    question: string
    options: Array<{ label: string; description?: string }>
    header?: string
    multi_select: boolean
    run_id: number
  }
}

// ─────────────────────────────────────────
// AgentRunStatus
// 1:1 aligned with spec §4.13 L4245-4252
// ─────────────────────────────────────────

export type AgentRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'timeout'
  | 'failed'
  | 'cancelled'
  | 'budget_exhausted'

// ─────────────────────────────────────────
// AgentSkill
// ─────────────────────────────────────────

export interface AgentSkill {
  id: number
  name: string
  description: string
  emoji?: string
  welcome_message?: string
  conversation_starters?: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AgentSkillListResponse {
  list: AgentSkill[]
  total: number
}

// ─────────────────────────────────────────
// AgentRun
// ─────────────────────────────────────────

export interface AgentRun {
  id: number
  /** UUID string (backend agent_run.session_id is varchar) */
  session_id: string
  user_id: number
  /** Always present — every run belongs to an agent skill */
  agent_skill_id: number
  status: AgentRunStatus
  /** Populated by backend RunSummary enrichment once the run starts/ends.
   *  Undefined while the backend contract addition is not yet deployed;
   *  views fall back to 0 via `?? 0`. */
  credits_used?: number
  /** Maximum credits budget for this run. Populated by RunSummary enrichment.
   *  Undefined until backend ships; views fall back to 0 via `?? 0`. */
  credits_budget?: number
  /** Budget threshold state driven by credits_used / credits_budget ratio.
   *  Undefined until backend ships; store getter defaults to 'under_60'. */
  credits_threshold_state?: 'under_60' | 'warning_60' | 'blocked_100'
  created_at: string
  updated_at: string
  finished_at?: string
  /** terminal reason string e.g. "done","budget_exhausted","cancelled" */
  state_reason?: string
  started_at?: string
  ended_at?: string
  /** Extracted assistant text from the last turn; populated by GetRun once the
   *  run reaches terminal state. Empty while still running or on error. */
  final_output?: string
}

export interface CreateRunRequest {
  agent_skill_id: number
  /** UUID string from prior createRun response */
  session_id?: string
  input_text: string
  attachment_ids?: number[]
  restore_from_session_id?: string
}

export interface CreateRunResponse {
  run_id: number
  /** UUID string */
  session_id: string
  estimated_credits_min: number
  estimated_credits_max: number
}

export interface CancelRunResponse {
  run_id: number
  status: 'cancelling' | 'cancelled'
}

export interface ExtendBudgetRequest {
  extra_credits: number
}

// ─────────────────────────────────────────
// AgentMessage — discriminated union
// ─────────────────────────────────────────

export type AgentMessageType =
  | 'user'
  | 'assistant'
  | 'plan'
  | 'tool_group'
  | 'artifact'
  | 'final_answer'
  | 'system'
  | 'question_prompt'

interface BaseMessage {
  /** client-generated uuid */
  id: string
  timestamp: string
}

export interface UserMessage extends BaseMessage {
  type: 'user'
  text: string
  attachments?: Array<{ id: number; filename: string; url: string }>
}

export interface AssistantMessage extends BaseMessage {
  type: 'assistant'
  markdown: string
}

export interface PlanMessage extends BaseMessage {
  type: 'plan'
  plan_steps: string[]
}

export interface ToolGroupMessage extends BaseMessage {
  type: 'tool_group'
  tool_calls: ToolCallAggregate[]
}

export interface ArtifactMessage extends BaseMessage {
  type: 'artifact'
  artifact: { id: number; filename: string; url: string; mime: string }
}

export interface FinalAnswerMessage extends BaseMessage {
  type: 'final_answer'
  markdown: string
  feedback?: 'positive' | 'negative' | null
  feedback_note?: string
  /** associated run for submitting feedback */
  run_id?: number
}

export interface SystemMessage extends BaseMessage {
  type: 'system'
  system_subtype: 'restored' | 'stuck' | 'cancelled' | 'failed' | 'retry'
  /** optional system prompt text */
  markdown?: string
}

// ─────────────────────────────────────────
// QuestionPromptMessage — ask_user_question yield
// Rendered as an interactive card in the chat stream.
// ─────────────────────────────────────────

export interface QuestionPromptOption {
  label: string
  description?: string
}

export interface QuestionPromptMessage extends BaseMessage {
  type: 'question_prompt'
  run_id: number
  question: string
  options: QuestionPromptOption[]
  header?: string
  multi_select: boolean
  /** 'pending' until user submits; 'answered' after successful POST */
  answer_status: 'pending' | 'answered'
}

export type AgentMessage =
  | UserMessage
  | AssistantMessage
  | PlanMessage
  | ToolGroupMessage
  | ArtifactMessage
  | FinalAnswerMessage
  | SystemMessage
  | QuestionPromptMessage

export interface ToolCallAggregate {
  tool_call_id: string
  tool_name: string
  /** chronological, latest at tail */
  events: NarrationEvent[]
  current_state: NarrationState
}

// ─────────────────────────────────────────
// SessionSnapshot
// ─────────────────────────────────────────

export interface SessionSnapshot {
  /** UUID string */
  session_id: string
  agent_skill_id: number
  messages: AgentMessage[]
  compact_summary?: string
  /** returned by backend; #11 does not render */
  agent_run_ids?: number[]
  last_active_at?: string
  status?: 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout'
}

// ─────────────────────────────────────────
// EstimateRequest / EstimateResponse
// ─────────────────────────────────────────

export interface EstimateRequest {
  agent_skill_id: number
  input_text: string
  attachment_meta?: Array<{ filename: string; size_bytes: number; mime: string }>
}

export interface EstimateResponse {
  min: number
  max: number
  is_large_task: boolean
}

// ─────────────────────────────────────────
// SupportContact
// ─────────────────────────────────────────

export interface SupportContact {
  wechat?: string | null
  phone?: string | null
  qr_code_url?: string | null
}

// ─────────────────────────────────────────
// RecentSession
// ─────────────────────────────────────────

export interface RecentSession {
  /** UUID string */
  session_id: string
  agent_skill_id: number
  /** Display name of the agent skill. Populated by backend enrichment;
   *  views fall back to '会话' via `?? '会话'` until backend ships. */
  agent_name?: string
  /** Emoji icon for the agent skill. Views fall back to '🤖'. */
  agent_emoji?: string
  /** ISO 8601 timestamp of last activity in this session. Optional because
   *  legacy rows may not have it; grouping logic falls back to Date.now(). */
  last_active_at?: string
  status:
    | 'running'
    | 'pending'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'timeout'
    | 'budget_exhausted'
  /** Short preview of the last user message. Populated by backend enrichment;
   *  views render empty string when absent. */
  preview_text?: string
}

// ─────────────────────────────────────────
// FeedbackRequest
// ─────────────────────────────────────────

export interface FeedbackRequest {
  feedback: 'positive' | 'negative'
  note?: string
}

// ─────────────────────────────────────────
// UploadResponse
// ─────────────────────────────────────────

export interface UploadResponse {
  id: number
  filename: string
  url: string
  size_bytes: number
  mime: string
}
