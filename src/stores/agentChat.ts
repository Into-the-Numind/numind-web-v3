/**
 * agentChat store — 学员端 Agent 模式状态机
 *
 * 职责：
 * - currentAgent / currentRun / messages 的中心化
 * - narration 事件累积 + stuck 检测
 * - run lifecycle actions（create / poll / cancel / extend）
 * - 历史会话恢复（loadSessionSnapshot）
 * - 流式事件处理（applyStreamEvent / applyError）— T10
 * - reset() 完整清理 16 个 ref 字段
 *
 * Refs: docs/agent-mode/feature-11-spec.md §6
 * Spec: docs/superpowers/specs/2026-05-27-agent-react-streaming-design.md §5.3
 */
import { defineStore } from 'pinia'
import { ref, computed, onScopeDispose } from 'vue'
import * as api from '@/api/agent'
import {
  resumeFeishuOperation as resumeFeishuLifecycleOperation,
  type FeishuActionPhase,
  type FeishuAuthorizationNoticeCode,
  type FeishuExternalAction,
  type FeishuOperationResult,
  type FeishuRefreshTerminal,
  type FeishuResumeAction
} from '@/api/feishu'
import type {
  AgentSkill,
  AgentRun,
  AgentRunStatus,
  AgentMessage,
  AssistantMessage,
  CreateRunRequest,
  NarrationEvent,
  NarrationState,
  EstimateResponse,
  RecentSession,
  ToolCallAggregate,
  ToolGroupMessage,
  UploadResponse,
  QuestionPromptMessage,
  ExternalActionMessage,
  ExternalActionStatus
} from '@/types/agent'
import type { AgentStreamEvent } from '@/types/agent-stream'
import type {
  TokenDeltaPayload,
  ReasoningDeltaPayload,
  AssistantMessagePayload,
  ToolCallStartPayload,
  ToolCallArgsDeltaPayload,
  ToolCallProgressPayload,
  ToolCallResultPayload,
  ToolCallErrorPayload,
  QuestionPromptPayload,
  ExternalActionPayload,
  StreamStartPayload,
  ErrorPayload
} from '@/types/agent-stream'
import { isOfficialFeishuActionURL } from '@/utils/feishuActionUrl'

// 简易 uuid（避免新增依赖；够用于客户端 message id）
const uuid = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

/** Build the rolling-safe attachment portion shared by stream and non-stream
 * Agent requests. Persisted uploads use IDs; only id=0 falls back to URL. */
export const buildAttachmentRequestFields = (
  uploaded: UploadResponse[]
): Pick<CreateRunRequest, 'attachment_ids' | 'attachment_urls'> => {
  const hasPersistedID = (item: UploadResponse): boolean =>
    Number.isSafeInteger(item.id) && item.id > 0
  const attachmentIds = uploaded.filter(hasPersistedID).map((item) => item.id)
  // Defensive rolling compatibility: a pre-ID/malformed response must retain
  // its URL instead of being silently omitted from both arrays.
  const attachmentURLs = uploaded.filter((item) => !hasPersistedID(item)).map((item) => item.url)
  return {
    ...(attachmentIds.length > 0 ? { attachment_ids: attachmentIds } : {}),
    ...(attachmentURLs.length > 0 ? { attachment_urls: attachmentURLs } : {})
  }
}

const FEISHU_ACTION_PHASES: FeishuActionPhase[] = [
  'create_app',
  'app_scope',
  'user_auth',
  'confirmation'
]

function isFeishuActionPhase(value: string): value is FeishuActionPhase {
  return FEISHU_ACTION_PHASES.includes(value as FeishuActionPhase)
}

function safeActionString(record: Record<string, unknown>, field: string): string | null {
  const value = record[field]
  return typeof value === 'string' && value.trim() ? value : null
}

// The server currently creates RFC 4122 UUID session ids. Keep the browser
// parser compatible with its stable legacy/session test ids too, while refusing
// route placeholders, whitespace, paths, and any structurally unsafe value.
const STABLE_SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

/**
 * stream_start is the one event allowed to bind the browser's provisional
 * `new` route to its server-owned session. Treat it as untrusted transport
 * data: it must carry exactly the server's two identifiers and its run id must
 * agree with the envelope before it can alter route ownership.
 */
function parseStreamStartPayload(
  payload: unknown,
  envelopeRunID: number
): StreamStartPayload | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const record = payload as Record<string, unknown>
  const keys = Object.keys(record)
  if (
    keys.length !== 2 ||
    !keys.includes('session_id') ||
    !keys.includes('run_id') ||
    !Number.isSafeInteger(envelopeRunID) ||
    envelopeRunID <= 0
  ) {
    return null
  }
  const sessionID = record.session_id
  const runID = record.run_id
  if (
    typeof sessionID !== 'string' ||
    sessionID === 'new' ||
    !STABLE_SESSION_ID_PATTERN.test(sessionID) ||
    !Number.isSafeInteger(runID) ||
    runID !== envelopeRunID
  ) {
    return null
  }
  return { session_id: sessionID, run_id: runID }
}

/**
 * Returns a browser-wall-clock deadline only for a parseable
 * timestamp. The backend owns this value; an absent or malformed value must
 * fail closed instead of leaving a previously received authorization URL live.
 */
function actionExpiryTimestamp(expiresAt: string): number | null {
  const timestamp = Date.parse(expiresAt)
  return Number.isFinite(timestamp) ? timestamp : null
}

function actionHasExpired(expiresAt: string, now = Date.now()): boolean {
  const timestamp = actionExpiryTimestamp(expiresAt)
  return timestamp === null || timestamp <= now
}

/**
 * Convert one untrusted live/snapshot payload to the browser allowlist. The
 * backend uses provider/tool-call metadata to route the operation, but this
 * card neither needs nor retains it. URLs remain in memory only.
 */
function toFeishuExternalAction(payload: unknown): FeishuExternalAction | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const record = payload as Record<string, unknown>
  const provider = record.provider
  if (provider !== 'feishu' && provider !== 'lark') return null

  const operationID = safeActionString(record, 'operation_id')
  const sessionID = safeActionString(record, 'session_id')
  const phase = safeActionString(record, 'phase')
  const expiresAt = safeActionString(record, 'expires_at')
  if (
    !operationID ||
    !sessionID ||
    !phase ||
    !isFeishuActionPhase(phase) ||
    !expiresAt ||
    actionExpiryTimestamp(expiresAt) === null
  ) {
    return null
  }

  const url = record.url
  return {
    operation_id: operationID,
    session_id: sessionID,
    phase,
    expires_at: expiresAt,
    ...(isOfficialFeishuActionURL(url, phase) ? { url } : {})
  }
}

/**
 * Preserve just enough identity to revoke a formerly-valid action if a later
 * live SSE update for that same operation is malformed. The provider check
 * prevents an unrelated event from settling a Feishu card.
 */
function externalActionOperationID(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const record = payload as Record<string, unknown>
  if (record.provider !== 'feishu' && record.provider !== 'lark') return null
  return safeActionString(record, 'operation_id')
}

function externalActionMessage(
  payload: unknown,
  runID: number,
  timestamp: string,
  id = uuid(),
  allowLiveURL = true
): ExternalActionMessage | null {
  const action = toFeishuExternalAction(payload)
  if (!action || !Number.isSafeInteger(runID) || runID <= 0) return null
  return {
    id,
    type: 'external_action',
    run_id: runID,
    operation_id: action.operation_id,
    session_id: action.session_id,
    phase: action.phase,
    expires_at: action.expires_at,
    ...(allowLiveURL && action.url ? { url: action.url } : {}),
    action_status: 'pending',
    timestamp
  }
}

/**
 * statusFromTerminalReason — map a backend TerminalReason (SSE terminal payload
 * `reason`) to the frontend AgentRunStatus for the OPTIMISTIC local update.
 * Mirrors backend frontendStatus (student_query.go). reconcileFromDB(getRun) is
 * authoritative immediately after, so this only governs the brief window before
 * that resolves — but it must be correct, because with currentRun now live
 * during streaming (stream_start bootstrap), a wrong map would flash the header
 * status for every run. 'done' is accepted as a legacy alias for 'completed'.
 * 'waiting_for_user_choice' → 'running' keeps an ask_user_question-paused run
 * active (the question card carries the interaction; isWaitingForUser drives the
 * input-disable) rather than flashing 'failed'.
 */
// 工具完成态的友好文案 — 学员可见。SSE tool_call_result 只带 payload.preview
// （工具的原始截断输出，常是 JSON/代码），绝不能直接当作展示文案。这里给每个
// 工具一个简洁的完成提示，与后端 narration 模板 (configs/tool-display.yaml 的
// result_template) 保持一致，未知工具回退「已完成」。
// NOTE(tech-debt): 与后端 yaml + tool_call_start 的 actionLabels 一样，前端这份
// 标签是重复来源。理想是后端在 SSE 事件里直接下发友好文案做单一真源；当前沿用
// 既有的「前端拥有 live 标签」模式，原始输出保留在 tc.preview 供未来「查看详情」。
// NOTE: use_skill/load_skill 的后端 result_template 含动态技能名（如
// '📚 已调用技能：{{.input.name}}'），此处前端静态文案有意省略名字——SSE
// tool_call_result 不携带 input 字段；轮询路径的 narration 事件才带完整渲染串。
// 仅收录确有 FullTool 实现的工具；未实现/未登记的（曾经的 file_write）走「已完成」兜底。
const TOOL_RESULT_LABELS: Record<string, string> = {
  web_search: '已获取搜索结果',
  web_fetch: '已读取网页',
  kb_search: '已查到相关内容',
  file_read: '已读取文件',
  memory_read: '已读取记忆',
  memory_write: '已写入记忆',
  load_skill: '已加载技能',
  use_skill: '已调用技能',
  read_skill: '已查阅技能指南',
  run_python: '文件已生成',
  invoke_skill: '文件已生成',
  create_html: '网页已生成',
  create_csv: 'CSV 表格已生成',
  create_json: 'JSON 文件已生成',
  create_text: '文本文件已生成',
  create_png_chart: '图表已生成',
  image_gen: '图片已生成',
  analyze_image: '图片分析完成',
  annotate_image: '图片标注完成',
  document_generate: '文档已生成',
  get_current_date: '已获取当前日期',
  bash_exec: '命令执行完成'
}

/** 返回工具完成态的学员友好文案，未知工具回退「已完成」。 */
function toolResultLabel(toolName: string): string {
  return TOOL_RESULT_LABELS[toolName] ?? '已完成'
}

/** Clip a display string to n code points + ellipsis. Spreading to an array of
 *  code points (not .slice on UTF-16 units) keeps emoji / surrogate pairs in a
 *  search query from being cut in half. Mirrors the backend yaml truncate so the
 *  streamed label reads identically to the polled one. */
function clip(s: string, n: number): string {
  const cp = [...s]
  return cp.length > n ? cp.slice(0, n).join('') + '…' : s
}

// Streaming tool_call_start owns its own "what is it doing" label (the SSE event
// carries input_preview, not the backend's rendered narration message — see the
// TOOL_RESULT_LABELS note). For search/fetch tools, surface the concrete query /
// url from input_preview so a run of searches no longer reads as N identical
// "正在搜索网络...". Mirrors configs/tool-display.yaml use_template; falls back to
// the generic action label when the field is absent.
function streamingToolUseLabel(
  toolName: string,
  inputPreview: Record<string, unknown> | undefined,
  fallback: string
): string {
  const field = (k: string): string =>
    typeof inputPreview?.[k] === 'string' ? (inputPreview[k] as string).trim() : ''
  switch (toolName) {
    case 'web_search': {
      const q = field('query')
      return q ? `正在搜索：${clip(q, 40)}` : fallback
    }
    case 'kb_search': {
      const q = field('query')
      return q ? `正在搜索知识库：${clip(q, 30)}` : fallback
    }
    case 'web_fetch': {
      const u = field('url')
      return u ? `正在抓取：${clip(u, 50)}` : fallback
    }
    case 'load_skill': {
      // 问题一: show the skill name being loaded ("加载技能：docx-author") instead of
      // the generic "正在调用工具 load_skill...". The name lives in input_preview.name
      // (load_skill's required input param — tool_load_skill.go InputSchema).
      const n = field('name')
      return n ? `加载技能：${n}` : fallback
    }
    default:
      return fallback
  }
}

/** A run status that means the run has truly ended (no more work). 'running' and
 *  'pending' are the only non-terminal statuses. Used to guard against a stale DB
 *  read downgrading an already-terminal run back to "still working" (问题5a). */
const TERMINAL_STATUSES: AgentRunStatus[] = [
  'completed',
  'timeout',
  'failed',
  'cancelled',
  'budget_exhausted'
]
function isTerminalStatus(status?: AgentRunStatus): boolean {
  return status != null && TERMINAL_STATUSES.includes(status)
}

function statusFromTerminalReason(reason?: string): AgentRunStatus {
  switch (reason) {
    case 'completed':
    case 'done':
      return 'completed'
    case 'waiting_for_user_choice':
      return 'running'
    case 'error_max_budget':
      return 'budget_exhausted'
    case 'max_turns':
      return 'timeout'
    case 'cancelled':
    case 'aborted_streaming':
    case 'aborted_tools':
      return 'cancelled'
    default:
      return 'failed'
  }
}

/**
 * Terminal SSE data crosses a network boundary. Only a string reason is safe
 * to use for local lifecycle changes; malformed or unknown data deliberately
 * maps to a non-success terminal state below.
 */
function terminalReason(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const reason = (payload as Record<string, unknown>).reason
  return typeof reason === 'string' ? reason : undefined
}

/**
 * An external action is completed only by an explicit successful terminal
 * reason. A question pause is still live, while every other/malformed reason
 * must revoke the one-time authorization URL as a terminal outcome.
 */
function externalActionStatusFromTerminal(payload: unknown): ExternalActionStatus | null {
  const status = statusFromTerminalReason(terminalReason(payload))
  if (status === 'running') return null
  return status === 'completed' ? 'completed' : 'terminal'
}

const EXTERNAL_RESUME_READY_STATE = 'external_resume_ready'
const EXTERNAL_RESUME_STARTING_PREFIX = 'ext_resume:'

/**
 * Task 11's durable continuation has two non-terminal server states after the
 * user finishes Feishu authorization: `external_resume_ready` waits for the
 * reclaimer and `ext_resume:<lease>` has been claimed by a worker. Neither is
 * a final Agent answer, but both irrevocably release the one-time auth URL.
 *
 * Keep this contract deliberately narrow: only the documented exact ready
 * value or a non-empty `ext_resume:` lease qualifies. In particular, do not
 * treat a broad `ext_` namespace or malformed `ext_resume` values as released.
 */
function isQueuedExternalContinuation(stateReason?: string): boolean {
  if (stateReason === EXTERNAL_RESUME_READY_STATE) return true
  return (
    typeof stateReason === 'string' &&
    stateReason.startsWith(EXTERNAL_RESUME_STARTING_PREFIX) &&
    stateReason.length > EXTERNAL_RESUME_STARTING_PREFIX.length
  )
}

/**
 * A final_output is authoritative only after the Agent run has genuinely
 * ended. During an authorization pause (and while its detached continuation
 * is queued/claimed), the backend deliberately exposes the last assistant
 * turn as final_output for recovery. That text is progress, not the answer.
 */
function isAuthoritativeFinalRun(run: Pick<AgentRun, 'status' | 'state_reason'>): boolean {
  return (
    isTerminalStatus(run.status) &&
    run.state_reason !== 'waiting_for_user_choice' &&
    run.state_reason !== 'running' &&
    !isQueuedExternalContinuation(run.state_reason)
  )
}

/**
 * StreamingAssistantMessage — AssistantMessage carrying SSE bookkeeping fields.
 * `_stream_id`: backend-provided message_id used to deduplicate token_delta
 * accumulation; `_run_id`: agent_run.id this bubble belongs to (used by
 * reconcileFromDB to scope finalization to a specific run).
 *
 * Exported so tests can assert on the internal fields without duplicating
 * the intersection.
 */
export type StreamingAssistantMessage = AssistantMessage & {
  _stream_id?: string
  _run_id?: number
}

export const useAgentChatStore = defineStore('agentChat', () => {
  // ── State (16 refs) ─────────────────────────────────────────────────
  const availableAgents = ref<AgentSkill[]>([])
  const recentSessions = ref<RecentSession[]>([])
  // instant-title-ux: session_ids whose title is being generated at send time —
  // the sidebar renders a pulsing placeholder for these. Separate Set so it
  // survives a full recentSessions refresh.
  const titlePendingIds = ref<Set<string>>(new Set())
  const currentAgent = ref<AgentSkill | null>(null)
  const currentRun = ref<AgentRun | null>(null)
  const messages = ref<AgentMessage[]>([])
  // Runs that already surfaced an 'error' event — so the following 'terminal'
  // event's user_message is not shown as a duplicate failure bubble.
  const erroredRuns = new Set<number>()
  const narrationEvents = ref<NarrationEvent[]>([])
  const lastNarrationTs = ref<string>('')
  const stuckSince = ref<number | null>(null)
  // 问题三: wall-clock (Date.now) of the last token/reasoning delta during a stream.
  // Drives the streaming bubble's stall detection — when the assistant is still
  // streaming but this stops advancing (LLM composing tool args), the caret is
  // upgraded to an explicit "正在生成…" indicator. Reset on each new turn.
  const lastStreamDeltaAt = ref<number | null>(null)
  // Tracks the in-flight tool_group message that mirrors toolGroups computed.
  // Without this bridge, narrationEvents pile up in the store and the existing
  // `toolGroups` computed has no consumer — AgentMessageItem only renders
  // AgentToolCallList when `msg.type === 'tool_group'`, but nothing was
  // injecting such a message into `messages`. Hotfix narration-tool-group-message-wire.
  const currentToolGroupId = ref<string | null>(null)

  // Tracks the streaming tool_group message id during SSE streaming (T10).
  // Separate from currentToolGroupId so polling and streaming paths don't interfere.
  // Keyed by step index (string) so multi-step runs each get their own group.
  const streamingToolGroupIds = ref<Map<number, string>>(new Map())

  // followup3 FE-3 fix: live "writing code" buffer, keyed by tool_call_id and
  // DECOUPLED from the tool_call aggregate. The tool_call_args_delta SSE arrives
  // BEFORE tool_call_start creates the aggregate (the model streams the function
  // arguments while composing; the assembled tool call + tool_call_start fire
  // afterwards — confirmed via dev SSE capture run 180). Writing into the not-yet-
  // existing aggregate was a silent no-op, so the box never showed. Buffer here
  // regardless of aggregate state; activeCodeStream reads the latest; the buffer is
  // cleared at each step boundary (step_done) so the box collapses when the model
  // finishes the step, and on reset.
  const liveCodeStreams = ref<Record<string, string>>({})
  const liveCodeStreamOrder = ref<string[]>([])

  const inputText = ref('')
  const attachments = ref<UploadResponse[]>([])
  const estimate = ref<EstimateResponse | null>(null)

  const isReadOnly = ref(false)

  const loadingAgents = ref(false)
  const loadingSnapshot = ref(false)
  const sendingMessage = ref(false)
  const cancelling = ref(false)

  const agentsError = ref<string | null>(null)
  const sessionError = ref<string | null>(null)

  // An external authorization may finish without another SSE frame. Poll the
  // original run only until the server-owned action expiry, never while the
  // page is hidden and never after its card has settled. This is deliberately
  // independent from normal question-answer polling: external waits must not
  // call /answer.
  const EXTERNAL_ACTION_POLL_INTERVAL_MS = 5_000
  let externalActionPollTimer: ReturnType<typeof setTimeout> | null = null
  let externalActionPollDeadline = 0
  // Live action mutations and snapshot ordering are separate clocks. A live
  // SSE/resume/refresh result always fences older URL-less snapshots, while
  // overlapping snapshots use latest-request-wins ordering among themselves.
  let externalActionLiveRevision = 0
  let externalActionSnapshotRequestSeq = 0
  // Status polling can be triggered by both the view observer and the external
  // action timer. Only the latest-started request may mutate the run/UI; without
  // this fence, a slower old `running` response can undo a newer `completed` one.
  let runStatusRequestSeq = 0
  // A polling timer belongs to the session that created its authorization
  // action.  Keep that ownership explicit so a late timer continuation cannot
  // observe whichever run happens to be selected after a route switch.
  let externalActionPollEpoch: number | null = null
  let removeExternalActionVisibilityListener: (() => void) | null = null
  const feishuResumeRequests = new Map<string, Promise<FeishuOperationResult>>()
  const replayedDetachedAssistantKeys = new Set<string>()

  // Every route/session replacement advances this generation. Async work and
  // SSE callbacks capture it before crossing an await boundary; a result may
  // mutate state only while it still names the active session. `null` means the
  // store has been reset/unmounted and intentionally owns no session.
  let activeSessionEpoch = 0
  let activeSessionID: string | null = null

  // ── Getters ─────────────────────────────────────────────────────────
  const isRunning = computed(
    () => currentRun.value?.status === 'running' || currentRun.value?.status === 'pending'
  )

  /** True when agent is paused waiting for user to answer an ask_user_question.
   * Gated on a non-terminal status: a genuinely-waiting run is mapped to
   * status='running' by the backend, so a TERMINAL run carrying a stale
   * 'waiting_for_user_choice' state_reason (which a poll-based resume could leave
   * behind if it never refreshed cleanly to the final terminal) must NOT read as
   * waiting — otherwise the input stays disabled and live indicators keep
   * spinning after the task is done (issue3). */
  const isWaitingForUser = computed(
    () =>
      currentRun.value?.state_reason === 'waiting_for_user_choice' &&
      (currentRun.value?.status === 'running' || currentRun.value?.status === 'pending')
  )

  /** feishu-integration (T13): True when the current run is paused on a
   *  third-party authorization (pause_type === 'auth'), i.e. there is a pending
   *  auth question_prompt card for it. Unlike an ask_user_question pause — which
   *  the user resolves IN-APP via the answer card → startResume — an auth pause
   *  resumes EXTERNALLY (the user authorizes in their browser; the OAuth callback
   *  calls biz.Answer server-side). The view watches this to keep status polling
   *  alive so the resumed leg auto-continues without any in-app submit. */
  const isWaitingForAuth = computed(
    () =>
      isWaitingForUser.value &&
      messages.value.some(
        (m) =>
          m.type === 'question_prompt' &&
          (m as QuestionPromptMessage).run_id === currentRun.value?.id &&
          (m as QuestionPromptMessage).answer_status === 'pending' &&
          (m as QuestionPromptMessage).pause_type === 'auth'
      )
  )

  /**
   * A reloaded Task 11 continuation is still active even though its external
   * action card is already settled. The view owns normal narration/status
   * observation; expose only the two exact durable states so unrelated replay
   * states do not start a background observer.
   */
  const isQueuedExternalContinuationActive = computed(
    () =>
      isQueuedExternalContinuation(currentRun.value?.state_reason) &&
      (currentRun.value?.status === 'running' || currentRun.value?.status === 'pending')
  )

  const toolGroups = computed<ToolCallAggregate[]>(() => {
    const map = new Map<string, ToolCallAggregate>()
    for (const ev of narrationEvents.value) {
      if (!map.has(ev.tool_call_id)) {
        map.set(ev.tool_call_id, {
          tool_call_id: ev.tool_call_id,
          tool_name: ev.tool_name,
          events: [],
          current_state: ev.state
        })
      }
      const agg = map.get(ev.tool_call_id)!
      agg.events.push(ev)
      agg.current_state = ev.state
    }
    return Array.from(map.values())
  })

  // 问题三: is any tool call currently mid-flight? While a tool runs, its timeline
  // line (AgentToolCallItem spinner) owns the liveness signal, so the streaming
  // bubble must NOT also show a "正在生成…" indicator. Covers both surfaces: the
  // polling-path aggregates (toolGroups) and the streaming-path tool_group
  // messages. ACTIVE = queued/use/progress (mirrors AgentToolCallItem.ACTIVE_STATES).
  const hasActiveToolCall = computed<boolean>(() => {
    const ACTIVE: NarrationState[] = ['queued', 'use', 'progress']
    if (toolGroups.value.some((g) => ACTIVE.includes(g.current_state))) return true
    return messages.value.some(
      (m) =>
        m.type === 'tool_group' &&
        (m as ToolGroupMessage).tool_calls.some((t) => ACTIVE.includes(t.current_state))
    )
  })

  // followup3 FE-3: the accumulated argument text (code/document content) of the
  // tool call CURRENTLY being composed — drives the live "writing code" box in the
  // streaming bubble. Reads the liveCodeStreams buffer (decoupled from the aggregate,
  // since args-delta arrives before tool_call_start), returning the LATEST buffered
  // tool_call_id's content. The buffer is cleared at each step boundary (step_done),
  // so the box collapses the instant the model finishes writing this step's args —
  // we do NOT key the collapse on tool_call_result, because the args-delta carries the
  // PROVIDER tool-call id (call_00_…) while result carries a different backend UUID,
  // so a result-based done-match never fires (dev bug: box hung through the answer).
  const activeCodeStream = computed<string>(() => {
    const order = liveCodeStreamOrder.value
    if (order.length === 0) return ''
    return liveCodeStreams.value[order[order.length - 1]] ?? ''
  })

  const isWaitingForExternalAction = computed(() =>
    messages.value.some(
      (message) => message.type === 'external_action' && message.action_status === 'pending'
    )
  )

  const hasPendingExternalAction = (): boolean =>
    messages.value.some(
      (message) => message.type === 'external_action' && message.action_status === 'pending'
    )

  const nextPendingExternalActionDeadline = (): number | null => {
    let deadline: number | null = null
    let observesLegacyConfirmation = false
    for (const message of messages.value) {
      if (message.type !== 'external_action' || message.action_status !== 'pending') continue
      // A historical confirmation is no longer an authorization grant and its
      // old expiry cannot end observation of the already-bound Agent operation.
      // Keep polling the run until its durable continuation becomes terminal.
      if (message.phase === 'confirmation') {
        observesLegacyConfirmation = true
        continue
      }
      const expiresAt = actionExpiryTimestamp(message.expires_at)
      // A malformed timestamp is never allowed to become an unbounded wait.
      if (expiresAt === null) return null
      deadline = deadline === null ? expiresAt : Math.min(deadline, expiresAt)
    }
    return deadline ?? (observesLegacyConfirmation ? Number.MAX_SAFE_INTEGER : null)
  }

  const stopExternalActionPolling = (removeVisibilityListener = true): void => {
    if (externalActionPollTimer !== null) {
      clearTimeout(externalActionPollTimer)
      externalActionPollTimer = null
    }
    if (removeVisibilityListener && removeExternalActionVisibilityListener) {
      removeExternalActionVisibilityListener()
      removeExternalActionVisibilityListener = null
      externalActionPollDeadline = 0
    }
    externalActionPollEpoch = null
  }

  const currentSessionEpoch = (): number => activeSessionEpoch

  const isCurrentSessionEpoch = (epoch: number): boolean => epoch === activeSessionEpoch

  /**
   * Claim the store for a route session. This is deliberately a tiny, sync
   * boundary: callers can invalidate old async/SSE work before starting their
   * replacement snapshot or observer.
   */
  const beginSession = (sessionID: string): number => {
    activeSessionEpoch += 1
    runStatusRequestSeq += 1
    activeSessionID = sessionID
    externalActionLiveRevision = 0
    externalActionSnapshotRequestSeq = 0
    replayedDetachedAssistantKeys.clear()
    stopExternalActionPolling()
    sendingMessage.value = false
    cancelling.value = false
    return activeSessionEpoch
  }

  const invalidateSession = (): void => {
    activeSessionEpoch += 1
    runStatusRequestSeq += 1
    activeSessionID = null
    externalActionLiveRevision = 0
    externalActionSnapshotRequestSeq = 0
    replayedDetachedAssistantKeys.clear()
    stopExternalActionPolling()
  }

  const settleExternalAction = (
    operationID: string,
    status: ExternalActionStatus,
    runID?: number,
    eligibleStatuses: readonly ExternalActionStatus[] = ['pending'],
    terminalState?: FeishuRefreshTerminal['state']
  ): void => {
    let changed = false
    for (let index = 0; index < messages.value.length; index += 1) {
      const message = messages.value[index]
      if (
        message.type !== 'external_action' ||
        message.operation_id !== operationID ||
        (runID !== undefined && message.run_id !== runID) ||
        !eligibleStatuses.includes(message.action_status)
      ) {
        continue
      }
      // There is no reason to retain a transient authorization URL after the
      // wait has ended. The resumed original tool call is the source of truth.
      const settled: ExternalActionMessage = { ...message, action_status: status }
      delete settled.url
      delete settled.notice_code
      if (terminalState) settled.terminal_state = terminalState
      else delete settled.terminal_state
      messages.value[index] = settled
      changed = true
    }
    if (changed) externalActionLiveRevision += 1
    if (!hasPendingExternalAction()) stopExternalActionPolling()
  }

  const settleFeishuTerminalOperation = (
    operationID: string,
    state: FeishuRefreshTerminal['state'],
    runID?: number
  ): void => {
    if (state === 'succeeded') {
      // A concurrent status poll may have already settled the browser card just
      // before this lifecycle response arrives. The exact operation/session
      // response is still authoritative: success means the durable continuation
      // was queued, so re-arm run observation even if that poll briefly painted
      // the run terminal. Otherwise the next permission card is never fetched.
      settleExternalAction(
        operationID,
        'completed',
        runID,
        ['pending', 'expired', 'completed'],
        state
      )
      if (runID !== undefined && currentRun.value?.id === runID) {
        runStatusRequestSeq += 1
        currentRun.value = {
          ...currentRun.value,
          status: 'running',
          state_reason: EXTERNAL_RESUME_READY_STATE
        }
        stuckSince.value = null
      }
      return
    }

    settleExternalAction(operationID, 'terminal', runID, ['pending', 'expired'], state)
    if (
      runID !== undefined &&
      currentRun.value?.id === runID &&
      !isTerminalStatus(currentRun.value.status)
    ) {
      runStatusRequestSeq += 1
      currentRun.value = {
        ...currentRun.value,
        status: statusFromTerminalReason('aborted_tools'),
        state_reason: 'aborted_tools'
      }
      stuckSince.value = null
      finalizeToolGroups()
    }
  }

  const settlePendingExternalActionsForRun = (
    runID: number,
    status: ExternalActionStatus
  ): void => {
    const pendingOperationIDs = messages.value
      .filter(
        (message): message is ExternalActionMessage =>
          message.type === 'external_action' &&
          message.run_id === runID &&
          message.action_status === 'pending'
      )
      .map((message) => message.operation_id)
    for (const operationID of pendingOperationIDs) {
      settleExternalAction(operationID, status, runID)
    }
  }

  /**
   * Client clocks can be ahead of the server. That is intentionally treated as
   * an expired action: a stale authorization URL is more harmful than showing a
   * refresh path a little early. This also closes malformed timestamps should a
   * runtime response bypass the TypeScript API contract.
   */
  const expirePendingExternalActions = (now = Date.now()): void => {
    const operationIDs = messages.value
      .filter(
        (message): message is ExternalActionMessage =>
          message.type === 'external_action' &&
          message.action_status === 'pending' &&
          message.phase !== 'confirmation' &&
          actionHasExpired(message.expires_at, now)
      )
      .map((message) => message.operation_id)
    for (const operationID of operationIDs) {
      settleExternalAction(operationID, 'expired')
    }
  }

  const updatePendingExternalAction = (
    operationID: string,
    currentSessionID: string,
    runID: number,
    action: FeishuExternalAction,
    noticeCode?: FeishuAuthorizationNoticeCode
  ): void => {
    if (actionHasExpired(action.expires_at)) {
      let changed = false
      for (let index = 0; index < messages.value.length; index += 1) {
        const message = messages.value[index]
        if (
          message.type !== 'external_action' ||
          message.operation_id !== operationID ||
          message.session_id !== currentSessionID ||
          message.run_id !== runID ||
          message.action_status !== 'pending'
        ) {
          continue
        }
        const expiredAction: ExternalActionMessage = { ...message, action_status: 'expired' }
        delete expiredAction.url
        delete expiredAction.notice_code
        messages.value[index] = expiredAction
        changed = true
      }
      if (changed) externalActionLiveRevision += 1
      if (!hasPendingExternalAction()) stopExternalActionPolling()
      return
    }
    let changed = false
    for (let index = 0; index < messages.value.length; index += 1) {
      const message = messages.value[index]
      if (
        message.type !== 'external_action' ||
        message.operation_id !== operationID ||
        message.session_id !== currentSessionID ||
        message.run_id !== runID ||
        message.action_status !== 'pending'
      ) {
        continue
      }
      const replacement: ExternalActionMessage = {
        ...message,
        session_id: action.session_id,
        phase: action.phase,
        expires_at: action.expires_at
      }
      // Never carry a superseded one-time authorization URL or notice into a
      // replacement. The runtime API validator has already allowlisted a live
      // official URL; keep its opaque bytes unchanged.
      delete replacement.url
      delete replacement.notice_code
      if (action.url && isOfficialFeishuActionURL(action.url, action.phase)) {
        replacement.url = action.url
      }
      if (noticeCode) replacement.notice_code = noticeCode
      messages.value[index] = replacement
      changed = true
    }
    if (changed) externalActionLiveRevision += 1
  }

  const updateExternalActionNotice = (
    operationID: string,
    currentSessionID: string,
    runID: number,
    noticeCode: FeishuAuthorizationNoticeCode
  ): void => {
    let changed = false
    for (let index = 0; index < messages.value.length; index += 1) {
      const message = messages.value[index]
      if (
        message.type !== 'external_action' ||
        message.operation_id !== operationID ||
        message.session_id !== currentSessionID ||
        message.run_id !== runID ||
        message.action_status !== 'pending'
      ) {
        continue
      }
      messages.value[index] = { ...message, notice_code: noticeCode }
      changed = true
    }
    if (changed) externalActionLiveRevision += 1
  }

  const scheduleExternalActionPoll = (): void => {
    if (externalActionPollTimer !== null) return
    const pollEpoch = activeSessionEpoch
    if (externalActionPollEpoch !== pollEpoch) return
    expirePendingExternalActions()
    if (!hasPendingExternalAction()) return

    const deadline = nextPendingExternalActionDeadline()
    const now = Date.now()
    if (deadline === null || deadline <= now) {
      expirePendingExternalActions(now)
      return
    }
    externalActionPollDeadline = deadline
    if (typeof document !== 'undefined' && document.hidden) return

    externalActionPollTimer = setTimeout(
      () => {
        externalActionPollTimer = null
        if (!isCurrentSessionEpoch(pollEpoch) || externalActionPollEpoch !== pollEpoch) return
        expirePendingExternalActions()
        if (!hasPendingExternalAction()) return
        if (typeof document !== 'undefined' && document.hidden) return
        void (async () => {
          await refreshRunStatus()
          if (
            isCurrentSessionEpoch(pollEpoch) &&
            externalActionPollEpoch === pollEpoch &&
            hasPendingExternalAction()
          ) {
            startExternalActionPolling()
          }
        })()
      },
      Math.min(EXTERNAL_ACTION_POLL_INTERVAL_MS, deadline - now)
    )
  }

  const startExternalActionPolling = (): void => {
    externalActionPollEpoch = activeSessionEpoch
    expirePendingExternalActions()
    if (!hasPendingExternalAction()) return

    const deadline = nextPendingExternalActionDeadline()
    if (deadline === null || deadline <= Date.now()) {
      expirePendingExternalActions()
      return
    }
    // A recovery may replace a session with a shorter or longer actual expiry.
    // Re-arm the timer so the browser never waits for a stale global deadline.
    if (externalActionPollDeadline !== deadline) {
      externalActionPollDeadline = deadline
      if (externalActionPollTimer !== null) {
        clearTimeout(externalActionPollTimer)
        externalActionPollTimer = null
      }
    }
    if (typeof document !== 'undefined' && !removeExternalActionVisibilityListener) {
      const onVisibilityChange = (): void => {
        if (document.hidden) {
          stopExternalActionPolling(false)
          return
        }
        // Hiding deliberately clears the epoch to fence an old timeout. A
        // visible page must claim the current epoch again before scheduling,
        // otherwise scheduleExternalActionPoll correctly rejects it forever.
        startExternalActionPolling()
      }
      document.addEventListener('visibilitychange', onVisibilityChange)
      removeExternalActionVisibilityListener = () =>
        document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    scheduleExternalActionPoll()
  }

  // ── Actions ──────────────────────────────────────────────────────────
  const fetchAvailableAgents = async (): Promise<void> => {
    loadingAgents.value = true
    agentsError.value = null
    try {
      const res = await api.listAvailableAgents()
      availableAgents.value = res.list
    } catch (err) {
      agentsError.value = (err as Error).message ?? '加载失败'
    } finally {
      loadingAgents.value = false
    }
  }

  // Loads the sidebar session list. adaptive-session-titles US4: show ALL of the
  // user's history sessions (not just the most recent 5), newest first. We reuse
  // listAllHistorySessions (no time window, capped 500, ordered is_pinned DESC,
  // started_at DESC). The `recentSessions` name is kept to avoid a wide rename
  // across the store + views; it now holds the full history list.
  const fetchRecentSessions = async (): Promise<void> => {
    try {
      recentSessions.value = await api.listAllHistorySessions()
    } catch {
      recentSessions.value = []
    }
  }

  // prepareNewSession (instant-title-ux): on the first send of a NEW session, the
  // frontend pre-generates the session_id and RETURNS it (the caller passes it to
  // createRun via startStream). It immediately prepends a sidebar item with a pulsing
  // title placeholder and kicks off instant title generation from the prompt.
  function prepareNewSession(agent: AgentSkill | null, prompt: string): string {
    const sessionId = uuid()
    const optimistic: RecentSession = {
      session_id: sessionId,
      agent_skill_id: agent?.id ?? 0,
      agent_name: agent?.name,
      agent_emoji: agent?.emoji,
      last_active_at: new Date().toISOString(),
      status: 'running',
      session_name: '',
      preview_text: prompt.slice(0, 40),
      is_pinned: false
    } as RecentSession
    recentSessions.value = [optimistic, ...recentSessions.value]
    const pending = new Set(titlePendingIds.value)
    pending.add(sessionId)
    titlePendingIds.value = pending
    void generateAgentTitle(sessionId, prompt)
    return sessionId
  }

  // generateAgentTitle calls the send-time /title endpoint and live-updates the
  // session_name. Best-effort. Retries once on ErrAgentRunNotFound because createRun
  // persists the run slightly after the stream starts (design review B-2). Always
  // clears the pending flag so the pulse stops.
  async function generateAgentTitle(sessionId: string, prompt: string, attempt = 0): Promise<void> {
    try {
      const res = await api.generateAgentSessionTitle(sessionId, prompt)
      if (res?.title) {
        const s = recentSessions.value.find((x) => x.session_id === sessionId)
        if (s) s.session_name = res.title
      }
    } catch (e) {
      // Run row may not be persisted yet on the first attempt — retry once after a
      // short delay (this outer finally runs only after the awaited retry returns,
      // so the pending pulse stays on during the retry).
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1200))
        return generateAgentTitle(sessionId, prompt, 1)
      }
      console.error('[agentChat] generateAgentTitle failed:', e)
    } finally {
      const pending = new Set(titlePendingIds.value)
      pending.delete(sessionId)
      titlePendingIds.value = pending
    }
  }

  const estimateInput = async (agentId: number, text: string): Promise<void> => {
    if (!text.trim()) {
      estimate.value = null
      return
    }
    const epoch = activeSessionEpoch
    try {
      const nextEstimate = await api.estimateRun({
        agent_skill_id: agentId,
        input_text: text,
        attachment_meta: attachments.value.map((a) => ({
          filename: a.filename,
          size: a.size,
          mime_type: a.mime_type
        }))
      })
      if (isCurrentSessionEpoch(epoch)) estimate.value = nextEstimate
    } catch {
      if (isCurrentSessionEpoch(epoch)) estimate.value = null
    }
  }

  const startNewRun = async (agentId: number, text: string, sessionId?: string): Promise<void> => {
    const epoch = activeSessionEpoch
    sendingMessage.value = true
    try {
      const res = await api.createRun({
        agent_skill_id: agentId,
        input_text: text,
        session_id: sessionId && sessionId !== 'new' ? sessionId : undefined,
        ...buildAttachmentRequestFields(attachments.value)
      })
      if (!isCurrentSessionEpoch(epoch)) return
      const userMsg: AgentMessage = {
        id: uuid(),
        type: 'user',
        text,
        attachments: attachments.value.map((a) => ({ url: a.url, filename: a.filename })),
        timestamp: new Date().toISOString()
      }
      messages.value.push(userMsg)
      narrationEvents.value = []
      lastNarrationTs.value = ''
      stuckSince.value = null
      currentToolGroupId.value = null
      const run = await api.getRun(res.run_id)
      if (!isCurrentSessionEpoch(epoch)) return
      currentRun.value = run
      // 边界：罕见情况 run 创建后立即非 running（队列时已 fail）
      const s = currentRun.value.status
      if (s !== 'running' && s !== 'pending') {
        messages.value.push({
          id: uuid(),
          type: 'system',
          system_subtype: 'failed',
          timestamp: new Date().toISOString()
        })
      }
      attachments.value = []
      inputText.value = ''
      estimate.value = null
      // 持久化到 sessionStorage 支持刷新恢复
      sessionStorage.setItem('agentChat:currentRunId', String(res.run_id))
      sessionStorage.setItem('agentChat:currentSessionId', String(res.session_id))
    } finally {
      if (isCurrentSessionEpoch(epoch)) sendingMessage.value = false
    }
  }

  const pollNarration = async (): Promise<void> => {
    if (!currentRun.value || !isRunning.value) return
    const epoch = activeSessionEpoch
    const runID = currentRun.value.id
    // While paused for an ask_user_question answer the run legitimately produces
    // no narration. Since waiting_for_user_choice now maps to a 'running' status
    // (so the header/cancel stay live — T1/T2), pollNarration would otherwise
    // tick every cycle, see 0 events, accumulate stuckSince, and fire a false
    // "任务卡住" bubble (+ force-enable cancel at 60s). Bail and clear any stale
    // stuck marker; refreshRunStatus flips isWaitingForUser off once the answered
    // run resumes, after which narration polling continues normally.
    if (isWaitingForUser.value) {
      stuckSince.value = null
      return
    }
    try {
      const events = await api.fetchNarrationEvents(runID, lastNarrationTs.value)
      if (!isCurrentSessionEpoch(epoch) || currentRun.value?.id !== runID) return
      if (events.length > 0) {
        for (const ev of events) {
          if (ev.event_type === 'tool_call_yield' && ev.yield_payload) {
            // ask_user_question yield — inject a question_prompt message into the
            // chat. NOTE: the backend currently delivers the pending question via
            // the question_prompt stream event and the session snapshot, not this
            // poll field; kept for shape parity / forward-compat.
            const qp = ev.yield_payload
            const promptMsg: QuestionPromptMessage = {
              id: uuid(),
              type: 'question_prompt',
              run_id: qp.run_id,
              questions: qp.questions ?? [],
              answer_status: 'pending',
              timestamp: ev.timestamp
            }
            messages.value.push(promptMsg)
          } else if (ev.event_type === 'run_resumed') {
            // Mark any pending question_prompt for this run as answered
            for (const msg of messages.value) {
              if (
                msg.type === 'question_prompt' &&
                msg.run_id === ev.run_id &&
                msg.answer_status === 'pending'
              ) {
                ;(msg as QuestionPromptMessage).answer_status = 'answered'
              }
            }
          } else {
            // Regular narration event
            narrationEvents.value.push(ev)
          }
        }
        lastNarrationTs.value = events[events.length - 1].timestamp
        stuckSince.value = null

        // agent-wait-ux 5a: the run resumed progress — retract any earlier
        // "still processing" hint so a transient lull never leaves a stale
        // notice once tool events flow again (self-healing, dev run 150).
        const stuckIdx = messages.value.findIndex(
          (m) => m.type === 'system' && m.system_subtype === 'stuck'
        )
        if (stuckIdx !== -1) {
          messages.value.splice(stuckIdx, 1)
        }

        // Bridge: surface narration into the chat stream so AgentMessageItem
        // actually renders AgentToolCallList. Without this, narrationEvents
        // pile up in the store and the user sees no tool-call narration.
        syncToolGroupMessage()
      } else if (stuckSince.value === null) {
        stuckSince.value = performance.now()
      }
    } catch {
      // 网络抖动忽略；下次 tick 重试
    }
  }

  // When the run reaches a terminal state, flip any tool_call still showing a
  // non-terminal state to 'result'. The polling poll stops the instant the run is
  // no longer running, so the last tool's result narration may never be fetched —
  // leaving AgentToolCallItem's active spinner visible forever (customer-reported
  // "task done but the card keeps running"). This guarantees nothing
  // reads as "executing" once the run is done. Idempotent; only rewrites groups
  // that actually had a lingering in-flight tool.
  const IN_FLIGHT_STATES: NarrationState[] = ['queued', 'use', 'progress']
  // statusOverride lets the replay path (loadSessionSnapshot) pass the snapshot's
  // run status directly — currentRun is usually unset on replay, so without it the
  // live-state fallback would mis-paint a completed run's stuck tool as 'error'.
  const finalizeToolGroups = (statusOverride?: string): void => {
    // A normally-completed run's lingering tools really did finish → 'result'. An
    // interrupted run (cancelled / failed / timeout / budget_exhausted) → 'error',
    // so we never paint an interrupted tool as a green "已完成".
    const status = statusOverride ?? currentRun.value?.status
    const terminalState: NarrationState = status === 'completed' ? 'result' : 'error'
    for (let i = 0; i < messages.value.length; i++) {
      const m = messages.value[i]
      if (m.type !== 'tool_group') continue
      const tg = m as ToolGroupMessage
      const hasUnsettledCall = tg.tool_calls.some((tc) =>
        IN_FLIGHT_STATES.includes(tc.current_state)
      )
      if (!hasUnsettledCall) continue
      const tool_calls = tg.tool_calls.map((tc) => {
        if (IN_FLIGHT_STATES.includes(tc.current_state)) {
          return { ...tc, current_state: terminalState }
        }
        return tc
      })
      messages.value[i] = { ...tg, tool_calls }
    }
  }

  /**
   * Reconcile one server-synthesized Feishu action into the live conversation.
   * Snapshot URLs are never trusted or restored. A different operation is a
   * new card with a fresh local Vue key; a replacement session for the same
   * operation reuses the old card position while revoking its transient URL.
   */
  const reconcileSnapshotExternalAction = (
    payload: unknown,
    runID: number,
    timestamp: string,
    expectedLiveRevision: number,
    snapshotRequestSeq: number
  ): boolean => {
    const candidate = externalActionMessage(payload, runID, timestamp, uuid(), false)
    if (!candidate) return false

    const pendingInteraction = messages.value.find(
      (message) =>
        (message.type === 'question_prompt' &&
          (message as QuestionPromptMessage).run_id === runID &&
          (message as QuestionPromptMessage).answer_status === 'pending') ||
        (message.type === 'external_action' &&
          message.run_id === runID &&
          message.action_status === 'pending')
    )
    if (
      pendingInteraction &&
      (pendingInteraction.type !== 'external_action' ||
        pendingInteraction.operation_id !== candidate.operation_id)
    ) {
      return false
    }

    const existingIndex = messages.value.findIndex(
      (message) =>
        message.type === 'external_action' &&
        message.run_id === runID &&
        message.operation_id === candidate.operation_id
    )
    if (externalActionLiveRevision !== expectedLiveRevision) {
      // A live action for this exact operation arrived after the snapshot
      // request began. It is authoritative regardless of session mismatch;
      // keep it and let a later stable poll observe any subsequent server move.
      return (
        existingIndex >= 0 &&
        (messages.value[existingIndex] as ExternalActionMessage).action_status === 'pending'
      )
    }
    if (snapshotRequestSeq !== externalActionSnapshotRequestSeq) return false
    if (existingIndex < 0) {
      messages.value.push(candidate)
      return true
    }

    const existing = messages.value[existingIndex] as ExternalActionMessage
    // A stale snapshot cannot reopen the same authorization attempt after it
    // reached a browser-visible terminal state. A different session is the
    // server's explicit replacement attempt and may reuse the card position.
    if (existing.action_status !== 'pending') {
      if (existing.session_id === candidate.session_id) return false
      messages.value[existingIndex] = { ...candidate, id: existing.id }
      return true
    }
    if (existing.session_id === candidate.session_id) {
      const sameSession: ExternalActionMessage = { ...candidate, id: existing.id }
      // A live SSE response may win the race while the URL-less snapshot is in
      // flight. Keep that allowlisted URL and its current notice in memory.
      if (existing.url) sameSession.url = existing.url
      if (existing.notice_code) sameSession.notice_code = existing.notice_code
      messages.value[existingIndex] = sameSession
      return true
    }

    // The backend moved the exact operation to a new authorization attempt.
    // Replace in place, but deliberately carry neither the old URL nor notice.
    messages.value[existingIndex] = { ...candidate, id: existing.id }
    return true
  }

  const streamingAssistantBubblesForRun = (runID: number): StreamingAssistantMessage[] =>
    messages.value.filter(
      (message): message is StreamingAssistantMessage =>
        message.type === 'assistant' &&
        (message as StreamingAssistantMessage)._stream_id !== undefined &&
        (message as StreamingAssistantMessage)._run_id === runID
    )

  /** Keep progress text visible when an SSE leg pauses, but remove its cursor. */
  const settleProvisionalAssistantBubbles = (runID: number): void => {
    for (const bubble of streamingAssistantBubblesForRun(runID)) {
      bubble.isStreaming = false
    }
  }

  /**
   * Reconcile one genuine terminal answer in place. This deliberately updates
   * an existing same-run final bubble: older clients could incorrectly promote
   * authorization progress to final_answer, and the authoritative completed
   * response must be able to repair that state without a page reload.
   */
  const upsertAuthoritativeFinalAnswer = (
    runID: number,
    finalOut: string,
    replaceExisting = false
  ): void => {
    // Even a legitimate terminal run may have no assistant text. Its cursor
    // must still stop, while the accumulated bubble remains visible as-is.
    settleProvisionalAssistantBubbles(runID)
    if (!finalOut) return

    const appendFinalAnswer = (reasoning?: string): void => {
      messages.value.push({
        id: uuid(),
        type: 'final_answer',
        markdown: finalOut,
        reasoning,
        run_id: runID,
        timestamp: new Date().toISOString()
      })
    }

    const existingFinalIndex = messages.value.findIndex(
      (message) => message.type === 'final_answer' && message.run_id === runID
    )
    if (existingFinalIndex >= 0) {
      const existing = messages.value[existingFinalIndex]
      // Only the first active → terminal status transition may repair an old
      // provisional final. Repeated/late terminal reconciliation must be a
      // no-op, otherwise stale DB reads could overwrite the correct answer.
      if (replaceExisting && existing.type === 'final_answer') {
        if (existingFinalIndex === messages.value.length - 1) {
          messages.value[existingFinalIndex] = { ...existing, markdown: finalOut }
        } else {
          // An authorization pause may have promoted progress text before the
          // detached continuation appended its cards/tool steps. Keep that
          // progress where it happened, but restore it to a settled assistant
          // message and append the authoritative answer at the real timeline
          // tail. The append intentionally changes length so MessageList resumes
          // follow-scroll without moving or duplicating any prior event.
          messages.value[existingFinalIndex] = {
            id: existing.id,
            type: 'assistant',
            markdown: existing.markdown,
            reasoning: existing.reasoning,
            isStreaming: false,
            seq: existing.seq,
            timestamp: existing.timestamp
          }
          appendFinalAnswer(existing.reasoning)
        }
      }
      return
    }

    const runBubbles = streamingAssistantBubblesForRun(runID)
    for (const bubble of runBubbles) bubble.isStreaming = false
    const last = runBubbles[runBubbles.length - 1]
    if (last) {
      const index = messages.value.findIndex(
        (message) =>
          message.type === 'assistant' &&
          (message as StreamingAssistantMessage)._stream_id === last._stream_id &&
          (message as StreamingAssistantMessage)._run_id === runID
      )
      if (index === messages.value.length - 1) {
        messages.value[index] = {
          id: last.id,
          type: 'final_answer',
          markdown: finalOut,
          reasoning: last.reasoning,
          run_id: runID,
          seq: last.seq,
          timestamp: last.timestamp
        }
        return
      }
      if (index >= 0) {
        appendFinalAnswer(last.reasoning)
        return
      }
    }

    appendFinalAnswer()
  }

  /**
   * Detached external-action continuations have no browser SSE response. The
   * backend still runs them through RunStream and persists every completed
   * assistant/reasoning step; merge those run-owned snapshot messages into the
   * live timeline. The transcript ordinal makes repeated identical steps
   * distinct, while the per-session key set keeps status polling idempotent.
   */
  const reconcileDetachedAssistantSnapshot = (
    snapshotMessages: AgentMessage[],
    runID: number
  ): void => {
    let runAssistantOrdinal = 0
    for (const message of snapshotMessages) {
      if (
        (message.type !== 'assistant' && message.type !== 'final_answer') ||
        message.run_id !== runID
      ) {
        continue
      }
      const ordinal = runAssistantOrdinal++
      const markdown = message.markdown ?? ''
      const reasoning = message.reasoning ?? ''
      if (!markdown && !reasoning) continue
      const key = `${runID}:${message.type}:${ordinal}:${markdown}:${reasoning}`
      if (replayedDetachedAssistantKeys.has(key)) continue
      replayedDetachedAssistantKeys.add(key)

      const alreadyVisible = messages.value.some(
        (existing) =>
          (existing.type === 'assistant' || existing.type === 'final_answer') &&
          existing.markdown === markdown &&
          (existing.reasoning ?? '') === reasoning &&
          (existing.type === 'final_answer'
            ? existing.run_id === runID
            : existing.run_id === runID ||
              (existing as StreamingAssistantMessage)._run_id === runID)
      )
      if (alreadyVisible) continue
      messages.value.push({
        ...message,
        id: uuid(),
        run_id: runID,
        ...(message.type === 'assistant' ? { isStreaming: false } : {})
      })
    }
  }

  const refreshRunStatus = async (): Promise<void> => {
    if (!currentRun.value) return
    const epoch = activeSessionEpoch
    const runID = currentRun.value.id
    const requestSeq = ++runStatusRequestSeq
    try {
      const prevStatus = currentRun.value.status
      const next = await api.getRun(runID)
      // A session may have changed while the request was in flight. Never let
      // session A's status/final answer/authorization card alter session B.
      if (
        requestSeq !== runStatusRequestSeq ||
        !isCurrentSessionEpoch(epoch) ||
        currentRun.value?.id !== runID
      ) {
        return
      }
      if (
        activeSessionID !== null &&
        activeSessionID !== 'new' &&
        next.session_id !== activeSessionID
      ) {
        return
      }
      const queuedExternalContinuation = isQueuedExternalContinuation(next.state_reason)
      // answer-resume-lifecycle F3: state_reason==='running' is the resume
      // signature (only AnswerAndClear / the takeover correction write it; real
      // completions carry 'completed' etc.). Task 11's two durable external
      // continuation states are also non-terminal: they mean the original tool
      // call is queued/claimed after the auth URL has been consumed. An old
      // backend may still advertise status='terminated' during either path, so
      // keep the run active locally until a real terminal answer arrives.
      const isResuming =
        (next.state_reason === 'running' || queuedExternalContinuation) &&
        next.status !== 'running' &&
        next.status !== 'pending'
      currentRun.value = isResuming ? { ...next, status: 'running' } : next
      // An external wait is over as soon as the original run resumes, its
      // durable continuation queues/claims, or it reaches a terminal result.
      // Queued continuation is not a final textual response; it only completes
      // the authorization card and revokes its transient URL.
      const externalWaitReleased =
        next.state_reason === 'running' || isResuming || queuedExternalContinuation
      const externallyTerminal = next.status !== 'running' && next.status !== 'pending'
      if (externalWaitReleased || externallyTerminal) {
        const actionStatus: ExternalActionStatus =
          externalWaitReleased || next.status === 'completed' ? 'completed' : 'terminal'
        settlePendingExternalActionsForRun(next.id, actionStatus)
      }
      // When the run transitions from active → terminal and the backend
      // surfaced a final_output (extracted from agent_run.messages), push it
      // as a FinalAnswerMessage so the chat UI renders the AI's reply.
      const wasActive = prevStatus === 'running' || prevStatus === 'pending'
      const isTerminal = next.status !== 'running' && next.status !== 'pending'
      const finalOut = next.final_output ?? ''
      // A run paused for ask_user_question is NOT done (its final_output is the
      // pre-question prose). Today the backend maps waiting_for_user_choice →
      // status 'running' so isTerminal is already false, but guard explicitly so
      // this stays symmetric with reconcileFromDB if that mapping ever changes.
      const isWaiting = next.state_reason === 'waiting_for_user_choice'
      const hasSettledExternalAction = messages.value.some(
        (message) =>
          message.type === 'external_action' &&
          message.run_id === next.id &&
          message.action_status !== 'pending'
      )
      // The external-card leg is detached from the browser SSE connection.
      // Re-read its persisted streaming transcript on each 5s status tick so
      // completed reasoning/text steps appear while it runs and the final tick
      // retains the final answer's reasoning. Session/run/request fences prevent
      // a late snapshot from mutating another chat.
      if (!isWaiting && hasSettledExternalAction && next.session_id) {
        try {
          const requestedSessionID = String(next.session_id)
          const snap = await api.getSessionSnapshot(requestedSessionID)
          const snapshotSessionID = snap.session_id ?? snap.run?.session_id
          const snapshotIsStale =
            requestSeq !== runStatusRequestSeq ||
            !isCurrentSessionEpoch(epoch) ||
            currentRun.value?.id !== runID ||
            snapshotSessionID !== requestedSessionID ||
            (activeSessionID !== null &&
              activeSessionID !== 'new' &&
              snapshotSessionID !== activeSessionID)
          if (!snapshotIsStale) {
            reconcileDetachedAssistantSnapshot(snap.messages ?? [], next.id)
          }
        } catch {
          // Best-effort replay; the next status tick retries and final_output is
          // still reconciled authoritatively below.
        }
      }
      // answer-resume-lifecycle F4: a waiting resumed run must show its latest
      // interactive card. Live SSE covers the streaming first leg only; later
      // question_prompt and external_action yields are recovered from the
      // session snapshot. Idempotent: a current pending interaction suppresses
      // another fetch, while post-await fences reject stale session/run work.
      if (isWaiting) {
        const hasPendingCard = messages.value.some(
          (m) =>
            (m.type === 'question_prompt' &&
              (m as QuestionPromptMessage).run_id === next.id &&
              (m as QuestionPromptMessage).answer_status === 'pending') ||
            (m.type === 'external_action' && m.run_id === next.id && m.action_status === 'pending')
        )
        if (!hasPendingCard && next.session_id) {
          try {
            const snapshotActionLiveRevision = externalActionLiveRevision
            const snapshotRequestSeq = ++externalActionSnapshotRequestSeq
            const requestedSessionID = String(next.session_id)
            const snap = await api.getSessionSnapshot(requestedSessionID)
            // New backends return an explicit top-level identity. During a
            // backend-first rolling deployment, fall back to the same identity
            // already present in the nested run summary. Both are still fenced
            // against the requested route and current session.
            const snapshotSessionID = snap.session_id ?? snap.run?.session_id
            if (
              !isCurrentSessionEpoch(epoch) ||
              currentRun.value?.id !== runID ||
              currentRun.value.state_reason !== 'waiting_for_user_choice' ||
              (currentRun.value.status !== 'running' && currentRun.value.status !== 'pending') ||
              snapshotSessionID !== requestedSessionID ||
              (activeSessionID !== null &&
                activeSessionID !== 'new' &&
                snapshotSessionID !== activeSessionID)
            ) {
              return
            }
            reconcileDetachedAssistantSnapshot(snap.messages ?? [], next.id)
            const interaction = [...(snap.messages ?? [])]
              .reverse()
              .find(
                (message) =>
                  (message.type === 'question_prompt' || message.type === 'external_action') &&
                  (message as QuestionPromptMessage | ExternalActionMessage).run_id === next.id
              )
            if (interaction?.type === 'external_action') {
              const reconciled = reconcileSnapshotExternalAction(
                interaction,
                next.id,
                interaction.timestamp ?? new Date().toISOString(),
                snapshotActionLiveRevision,
                snapshotRequestSeq
              )
              if (reconciled) {
                // The previous execution leg is paused at a server-owned user
                // action, so it must not keep advertising an active spinner.
                finalizeToolGroups('completed')
                startExternalActionPolling()
              }
            } else if (interaction?.type === 'question_prompt') {
              const pendingInteractionAppeared = messages.value.some(
                (message) =>
                  (message.type === 'question_prompt' &&
                    (message as QuestionPromptMessage).run_id === next.id &&
                    (message as QuestionPromptMessage).answer_status === 'pending') ||
                  (message.type === 'external_action' &&
                    message.run_id === next.id &&
                    message.action_status === 'pending')
              )
              if (pendingInteractionAppeared) return
              const qp = interaction as QuestionPromptMessage
              messages.value.push({
                id: qp.id || uuid(),
                type: 'question_prompt',
                run_id: next.id,
                questions: qp.questions ?? [],
                answer_status: 'pending',
                timestamp: qp.timestamp ?? new Date().toISOString(),
                // feishu-integration (T13): carry the pause classification from the
                // synthesized snapshot card so a polled/reloaded auth pause renders
                // the authorization card, not a plain question card (design §10).
                pause_type: qp.pause_type,
                auth_url: qp.auth_url
              })
            }
          } catch {
            // 注入失败静默；下一轮 poll 重试
          }
        }
      }
      if (isAuthoritativeFinalRun(next)) {
        upsertAuthoritativeFinalAnswer(next.id, finalOut, wasActive)
      }
      // Run reached terminal (done / failed / cancelled, but not a waiting pause
      // or a resume re-entry) → stop any lingering tool-call timers.
      if (wasActive && isTerminal && !isWaiting && !isResuming && !queuedExternalContinuation) {
        finalizeToolGroups()
      }
    } catch {
      // 忽略；下次重试
    }
  }

  /**
   * Continue a server-owned Feishu operation. This intentionally does not use
   * the Agent answer endpoint or `startResume`: the original tool call is
   * resumed by the backend's durable external-action dispatcher.
   */
  const resumeFeishuOperation = async (
    operationID: string,
    sessionID: string,
    action: FeishuResumeAction = 'user_completed',
    runID?: number
  ): Promise<FeishuOperationResult> => {
    const requestedSessionID = sessionID.trim()
    if (!requestedSessionID) throw new Error('飞书授权步骤已更新，请使用最新链接')
    const existing = messages.value.find(
      (message): message is ExternalActionMessage =>
        message.type === 'external_action' &&
        message.operation_id === operationID &&
        message.session_id === requestedSessionID &&
        (runID === undefined || message.run_id === runID)
    )
    const legacyConfirmation = existing?.phase === 'confirmation'
    if (
      !legacyConfirmation &&
      (existing?.action_status === 'expired' ||
        (existing?.action_status === 'pending' && actionHasExpired(existing.expires_at)))
    ) {
      settleExternalAction(operationID, 'expired')
      throw new Error('飞书授权已过期，请刷新链接后重试')
    }
    if (
      !existing ||
      (existing.action_status !== 'pending' &&
        !(legacyConfirmation && existing.action_status === 'expired'))
    ) {
      throw new Error('飞书授权步骤已更新，请使用最新链接')
    }
    const requestKey = `${operationID}:${existing.session_id}`
    const pendingRequest = feishuResumeRequests.get(requestKey)
    if (pendingRequest) return pendingRequest

    const epoch = activeSessionEpoch
    const request = (async (): Promise<FeishuOperationResult> => {
      const result = await resumeFeishuLifecycleOperation(operationID, existing.session_id, action)
      if (!isCurrentSessionEpoch(epoch)) return result
      const currentAction = messages.value.find(
        (message): message is ExternalActionMessage =>
          message.type === 'external_action' &&
          message.operation_id === operationID &&
          message.session_id === existing.session_id &&
          message.run_id === existing.run_id
      )
      if (!currentAction) return result
      if (
        result.operation_id !== operationID ||
        (result.action !== undefined && result.action.operation_id !== operationID)
      ) {
        throw new Error('飞书授权步骤已更新，请使用最新链接')
      }
      switch (result.state) {
        case 'succeeded':
          settleFeishuTerminalOperation(operationID, result.state, existing.run_id)
          break
        case 'failed':
        case 'unknown':
        case 'cancelled':
          settleFeishuTerminalOperation(operationID, result.state, existing.run_id)
          break
        default: {
          // Non-terminal lifecycle updates can only mutate the still-current
          // pending attempt. A poll-settled card is accepted above solely for an
          // exact terminal response, never for an old notice or replacement URL.
          const observesExpiredLegacyConfirmation =
            legacyConfirmation && currentAction.action_status === 'expired'
          if (!observesExpiredLegacyConfirmation && currentAction.action_status !== 'pending') {
            return result
          }
          if (observesExpiredLegacyConfirmation) {
            settleExternalAction(operationID, 'pending', existing.run_id, ['expired'])
          }
          if (result.action) {
            updatePendingExternalAction(
              operationID,
              existing.session_id,
              existing.run_id,
              result.action,
              result.notice_code
            )
          } else if (result.notice_code) {
            updateExternalActionNotice(
              operationID,
              existing.session_id,
              existing.run_id,
              result.notice_code
            )
          }
          if (hasPendingExternalAction()) startExternalActionPolling()
          break
        }
      }
      return result
    })()
    feishuResumeRequests.set(requestKey, request)
    try {
      return await request
    } finally {
      if (feishuResumeRequests.get(requestKey) === request) {
        feishuResumeRequests.delete(requestKey)
      }
    }
  }

  const cancelCurrent = async (): Promise<void> => {
    if (!currentRun.value) return
    const epoch = activeSessionEpoch
    const runID = currentRun.value.id
    cancelling.value = true
    try {
      await api.cancelRun(runID)
      if (!isCurrentSessionEpoch(epoch) || currentRun.value?.id !== runID) return
      currentRun.value = { ...currentRun.value, status: 'cancelled' }
      messages.value.push({
        id: uuid(),
        type: 'system',
        system_subtype: 'cancelled',
        timestamp: new Date().toISOString()
      })
    } finally {
      if (isCurrentSessionEpoch(epoch)) cancelling.value = false
    }
  }

  const uploadAttachment = async (file: File): Promise<void> => {
    const epoch = activeSessionEpoch
    const res = await api.uploadAttachment(file)
    if (isCurrentSessionEpoch(epoch)) attachments.value.push(res)
  }

  const removeAttachment = (url: string): void => {
    attachments.value = attachments.value.filter((a) => a.url !== url)
  }

  /**
   * Ensure messages[] contains one tool_group message that mirrors the
   * current toolGroups aggregate. Called whenever pollNarration receives
   * new events.
   *
   * AgentMessageItem only renders <AgentToolCallList> when
   * msg.type === 'tool_group' AND msg.tool_calls is non-empty; without
   * this bridge nothing in the chat stream consumes narrationEvents and
   * the learner UI shows no tool-call narration. The message is created
   * on first event and updated in place on subsequent events (assigning
   * a fresh array reference so Vue's reactivity sees the change).
   */
  const syncToolGroupMessage = (): void => {
    const groups = toolGroups.value
    if (groups.length === 0) return

    if (currentToolGroupId.value === null) {
      const tgId = uuid()
      currentToolGroupId.value = tgId
      const tgMsg: ToolGroupMessage = {
        id: tgId,
        type: 'tool_group',
        tool_calls: groups,
        timestamp: new Date().toISOString()
      }
      messages.value.push(tgMsg)
      return
    }

    const idx = messages.value.findIndex((m) => m.id === currentToolGroupId.value)
    if (idx === -1) {
      // Defensive: tool_group message was removed (compact / reset race) —
      // create a fresh one so subsequent events still surface.
      const tgId = uuid()
      currentToolGroupId.value = tgId
      messages.value.push({
        id: tgId,
        type: 'tool_group',
        tool_calls: groups,
        timestamp: new Date().toISOString()
      })
      return
    }

    // Update in place — fresh array reference so Vue picks up the change.
    const existing = messages.value[idx] as ToolGroupMessage
    messages.value[idx] = { ...existing, tool_calls: groups }
  }

  const loadSessionSnapshot = async (sessionId: string, readOnly: boolean): Promise<void> => {
    const epoch = beginSession(sessionId)
    loadingSnapshot.value = true
    sessionError.value = null
    // Snapshot loads are also the session-switch boundary for historical routes.
    // Without clearing this first, a queued continuation from the previous
    // session keeps its normal observer alive while the new snapshot has no run.
    // A waiting/queued run in the requested snapshot is restored below.
    currentRun.value = null
    try {
      const snap = await api.getSessionSnapshot(sessionId)
      if (!isCurrentSessionEpoch(epoch)) return
      // Defensive: backend may omit timestamp on restored messages; fill with
      // a stable fallback so BaseMessage.timestamp is always a valid string.
      const now = new Date().toISOString()
      const localUserMsgs = messages.value.filter((m) => m.type === 'user')
      const snapMsgs: AgentMessage[] = []
      for (const message of snap.messages ?? []) {
        const timestamp = message.timestamp ?? now
        if (message.type === 'external_action') {
          // Rebuild rather than spread the server object. Snapshot payloads are
          // flat and include provider routing metadata at runtime; only the card
          // allowlist may enter browser state, and snapshots never restore URLs.
          const externalAction = externalActionMessage(
            message,
            message.run_id,
            timestamp,
            message.id,
            false
          )
          if (externalAction) snapMsgs.push(externalAction)
          continue
        }
        snapMsgs.push({ ...message, timestamp })
      }
      // 边界防御：如果后端传回的快照里还没有任何用户消息，而我们本地正好有刚发的用户消息
      if (snapMsgs.filter((m) => m.type === 'user').length === 0 && localUserMsgs.length > 0) {
        snapMsgs.unshift(...localUserMsgs)
      }
      messages.value = snapMsgs
      isReadOnly.value = readOnly
      // yield-session-reload: a session paused at ask_user_question restores
      // with a synthesized question_prompt card. Set currentRun from the
      // snapshot so answer submission can poll the run to completion — without
      // it, refreshRunStatus's null guard silently stalls the resume.
      const restoredQueuedExternalContinuation = Boolean(
        snap.run && isQueuedExternalContinuation(snap.run.state_reason)
      )
      if (
        snap.run &&
        (snap.run.state_reason === 'waiting_for_user_choice' || restoredQueuedExternalContinuation)
      ) {
        // Task 11 can retain a legacy terminal DB status while the durable
        // continuation is queued/claimed. Treat only its two exact states as
        // active locally until normal polling reads the real terminal result.
        currentRun.value =
          restoredQueuedExternalContinuation &&
          snap.run.status !== 'running' &&
          snap.run.status !== 'pending'
            ? { ...snap.run, status: 'running' }
            : snap.run
        // The snapshot already rebuilt the pre-answer tool cards from
        // agent_run.messages. Seed the narration cursor to the run's last update
        // (the pause point) so that when the user answers, the resume poll fetches
        // only post-answer narration instead of re-fetching every pre-answer event
        // (which the in-memory buffer may still hold) into a duplicate giant card.
        if (snap.run.updated_at) lastNarrationTs.value = snap.run.updated_at
      }
      // The snapshot deliberately re-synthesizes durable external actions so a
      // reload preserves their history. Once Task 11 has queued or claimed the
      // original continuation, that history must be settled immediately: the
      // authorization URL is already consumed and the server (not /answer or a
      // browser-side CLI) owns the next step.
      if (snap.run && restoredQueuedExternalContinuation) {
        settlePendingExternalActionsForRun(snap.run.id, 'completed')
      }
      if (snap.compact_summary) {
        messages.value.unshift({
          id: uuid(),
          type: 'system',
          system_subtype: 'restored',
          markdown: snap.compact_summary,
          timestamp: new Date().toISOString()
        })
      }
      // Replay hygiene: a terminal (completed/failed/...) run can't still be
      // executing a tool, but legacy runs persisted before the shared-tool_call_id
      // backend fix (2026-06-14) carry a lingering in-flight 'use' aggregate → a
      // spinner stuck forever on the timeline (customer-reported). Finalize them to
      // the run's terminal state. Skip running/paused runs (a waiting
      // ask_user_question must keep its live state).
      // Only finalize TERMINAL runs — never 'running'/'pending' (a still-live or
      // not-yet-started run, e.g. a paused ask_user_question, must keep its state).
      const replayStatus = snap.status ?? snap.run?.status
      if (replayStatus && replayStatus !== 'running' && replayStatus !== 'pending') {
        finalizeToolGroups(replayStatus)
      }
      if (hasPendingExternalAction()) {
        startExternalActionPolling()
      } else {
        stopExternalActionPolling()
      }
    } catch (err) {
      if (isCurrentSessionEpoch(epoch)) {
        sessionError.value = (err as Error).message ?? '会话加载失败'
      }
    } finally {
      if (isCurrentSessionEpoch(epoch)) loadingSnapshot.value = false
    }
  }

  const pinSession = async (sessionId: string, isPinned: boolean): Promise<void> => {
    await api.pinSession(sessionId, isPinned)
    const sess = recentSessions.value.find((s) => s.session_id === sessionId)
    if (sess) {
      sess.is_pinned = isPinned
      recentSessions.value.sort((a, b) => {
        const pinA = a.is_pinned ? 1 : 0
        const pinB = b.is_pinned ? 1 : 0
        if (pinA !== pinB) return pinB - pinA
        const timeA = new Date(a.last_active_at || 0).getTime()
        const timeB = new Date(b.last_active_at || 0).getTime()
        return timeB - timeA
      })
    }
  }

  const renameSession = async (sessionId: string, name: string): Promise<void> => {
    await api.renameSession(sessionId, name)
    const sess = recentSessions.value.find((s) => s.session_id === sessionId)
    if (sess) {
      sess.session_name = name
    }
  }

  const deleteSession = async (sessionId: string): Promise<void> => {
    await api.deleteSession(sessionId)
    recentSessions.value = recentSessions.value.filter((s) => s.session_id !== sessionId)
  }

  // ── Streaming helpers (T10) ─────────────────────────────────────────

  /**
   * Find an assistant message by its streaming message_id, or create a new one
   * tagged with both _stream_id and _run_id. Returns the found/created message
   * (mutable ref).
   *
   * _run_id is required so reconcileFromDB can finalize only bubbles belonging
   * to a specific run — guards against multi-run concurrency / session-restore
   * bleeding into the wrong run's terminal handler.
   */
  const ensureStreamingAssistantMessage = (messageId: string, runId: number): AssistantMessage => {
    const existing = messages.value.find(
      (m): m is AssistantMessage =>
        m.type === 'assistant' && (m as StreamingAssistantMessage)._stream_id === messageId
    )
    if (existing) return existing

    const msg: AssistantMessage & { _stream_id: string; _run_id: number } = {
      id: uuid(),
      _stream_id: messageId,
      _run_id: runId,
      type: 'assistant',
      markdown: '',
      isStreaming: true,
      timestamp: new Date().toISOString()
    }
    messages.value.push(msg)
    // Return the reactive proxy element from messages.value (not the raw `msg`
    // local) so callers' mutations consistently route through Vue's reactivity
    // graph. In practice the raw object IS the proxy target so both work, but
    // returning the array element removes ambiguity.
    return messages.value[messages.value.length - 1] as AssistantMessage
  }

  /**
   * Find the streaming tool_group message for a given step, or create + push one.
   * Returns the ToolGroupMessage.
   */
  const ensureStreamingToolGroupForStep = (step: number): ToolGroupMessage => {
    const existingId = streamingToolGroupIds.value.get(step)
    if (existingId) {
      const existing = messages.value.find(
        (m): m is ToolGroupMessage => m.id === existingId && m.type === 'tool_group'
      )
      if (existing) return existing
    }

    const tgId = uuid()
    streamingToolGroupIds.value.set(step, tgId)
    const tgMsg: ToolGroupMessage = {
      id: tgId,
      type: 'tool_group',
      tool_calls: [],
      timestamp: new Date().toISOString()
    }
    messages.value.push(tgMsg)
    return tgMsg
  }

  // ── T3: in-run seq ordering ────────────────────────────────────────────────
  // The backend emits a single monotonic seq per run (one atomic counter shared by
  // every emitter). seqBlockStart marks where the CURRENT run's streamed items
  // begin in messages.value; reorderStreamTailBySeq keeps that tail sorted by seq.
  // Normal single-channel arrival is already in seq order → the fast-path bails
  // (no-op); the sort only repairs a rare out-of-order arrival. seqBlockRunId
  // resets the block on stream_start AND on a run_id change (resume safety), so
  // user/historical messages and prior runs (seq resets per run) are never
  // reordered. seq itself is never shown to the user.
  let seqBlockStart = 0
  let seqBlockRunId = -1

  const tagStreamSeq = (msg: { seq?: number }, e: AgentStreamEvent): void => {
    if (typeof e.seq !== 'number' || e.seq <= 0) return
    if (e.run_id !== seqBlockRunId) {
      // New run reached via resume (no stream_start): the just-pushed item starts
      // the block. stream_start sets the boundary explicitly for the normal path.
      seqBlockRunId = e.run_id
      seqBlockStart = Math.max(0, messages.value.length - 1)
    }
    if (msg.seq === undefined) msg.seq = e.seq
  }

  const reorderStreamTailBySeq = (): void => {
    const arr = messages.value
    const start = seqBlockStart
    if (start < 0 || start >= arr.length - 1) return
    // Fast path: bail if the tail is already non-decreasing by seq.
    let ordered = true
    for (let i = start + 1; i < arr.length; i++) {
      const a = arr[i - 1].seq
      const b = arr[i].seq
      if (typeof a === 'number' && typeof b === 'number' && a > b) {
        ordered = false
        break
      }
    }
    if (ordered) return
    const sorted = arr
      .slice(start)
      .map((m, i) => ({ m, i }))
      .sort((x, y) => {
        const sx = typeof x.m.seq === 'number' ? x.m.seq : Number.MAX_SAFE_INTEGER
        const sy = typeof y.m.seq === 'number' ? y.m.seq : Number.MAX_SAFE_INTEGER
        return sx - sy || x.i - y.i
      })
      .map((x) => x.m)
    for (let i = 0; i < sorted.length; i++) {
      if (arr[start + i] !== sorted[i]) arr[start + i] = sorted[i]
    }
  }

  /**
   * Locate a ToolCallAggregate by tool_call_id across all streaming tool_group
   * messages and apply a mutator. No-ops gracefully if not found.
   */
  const updateStreamingToolCall = (
    toolCallId: string,
    mutator: (tc: ToolCallAggregate) => void
  ): void => {
    for (let i = 0; i < messages.value.length; i++) {
      const msg = messages.value[i]
      if (msg.type !== 'tool_group') continue
      const tgMsg = msg as ToolGroupMessage
      const tc = tgMsg.tool_calls.find((t) => t.tool_call_id === toolCallId)
      if (tc) {
        mutator(tc)
        // Trigger Vue reactivity — replace the array reference
        messages.value[i] = { ...tgMsg, tool_calls: [...tgMsg.tool_calls] }
        return
      }
    }
  }

  // ensureCurrentRun guarantees currentRun is populated for runId before a
  // resume poll. Normally loadSessionSnapshot already set it; this is the
  // defensive fallback for a restored waiting session whose run object was
  // absent (yield-session-reload).
  const ensureCurrentRun = async (runId: number): Promise<void> => {
    if (currentRun.value && currentRun.value.id === runId) return
    const epoch = activeSessionEpoch
    try {
      const run = await api.getRun(runId)
      if (!isCurrentSessionEpoch(epoch)) return
      if (
        activeSessionID !== null &&
        activeSessionID !== 'new' &&
        run.session_id !== activeSessionID
      ) {
        return
      }
      currentRun.value = run
    } catch {
      // Non-fatal: polling will no-op via its null guard; the card stays
      // answerable on a subsequent attempt.
    }
  }

  /**
   * After receiving a terminal event, fetch the authoritative run state from DB
   * and reconcile with the streaming UI (R5 reconciliation).
   *
   * Backend `GetRun.RunDetail.FinalOutput` is synthesized from
   * agent_run.messages last assistant turn — i.e. NON-empty for any completed
   * run that wrote messages. If we naively push a `final_answer` message
   * here, the user sees TWO identical bubbles: the streaming AssistantMessage
   * (accumulated via token_delta, never finalized) AND the new final_answer
   * (dev 2026-05-28 agent_run 46/47).
   *
   * Resolution:
   *   1. Filter messages[] for streaming AssistantMessages whose _run_id matches
   *      runId. Earlier hotfix used reverse().find() which (a) ignored run_id
   *      so a concurrent run / restored session bubble in messages[] would be
   *      wrong-finalized, and (b) caught only the last bubble so multi-step
   *      ReAct left earlier-step bubbles stuck in isStreaming=true if their
   *      assistant_message event was dropped.
   *   2. For every matched bubble: set isStreaming=false (cursor disappears).
   *   3. For the LAST matched bubble: overwrite markdown with DB final_output
   *      (authoritative answer). Earlier steps keep their accumulated text —
   *      they were intermediate ReAct thoughts, not the final answer.
   *   4. If no matched bubble exists (token_delta never fired for this run,
   *      e.g. tool-only steps), fall back to pushing a stand-alone
   *      final_answer, deduped against re-entrant calls.
   */
  const reconcileFromDB = async (
    runId: number,
    expectedEpoch = activeSessionEpoch
  ): Promise<void> => {
    const requestSeq = ++runStatusRequestSeq
    // 问题5a: the terminal SSE handler already set currentRun to a terminal status
    // synchronously (before this async getRun resolves). The authoritative DB read
    // can lag the in-memory terminal (the row may not be flushed yet) and return a
    // stale 'running'/'pending' — assigning it back would flip isRunning true again
    // and leave the bottom "处理中…" pulse spinning forever after the task ended.
    // So: once a run is locally terminal, never let a non-terminal DB read downgrade
    // it. (A genuine answer-resume keeps status='running' via refreshRunStatus, not
    // this path, so this guard does not strand a real resumed leg.)
    const wasTerminal = currentRun.value?.id === runId && isTerminalStatus(currentRun.value?.status)
    const lockedStatus = currentRun.value?.status
    const lockedReason = currentRun.value?.state_reason
    try {
      const run = await api.getRun(runId)
      if (
        requestSeq !== runStatusRequestSeq ||
        !isCurrentSessionEpoch(expectedEpoch) ||
        currentRun.value?.id !== runId
      ) {
        return
      }
      if (
        activeSessionID !== null &&
        activeSessionID !== 'new' &&
        run.session_id !== activeSessionID
      ) {
        return
      }
      const reconciledRun =
        wasTerminal && !isTerminalStatus(run.status)
          ? { ...run, status: lockedStatus!, state_reason: lockedReason ?? run.state_reason }
          : run
      currentRun.value = reconciledRun
      const finalOut = run.final_output ?? ''

      // A waiting/queued authorization leg is not a completed Agent response.
      // The DB final_output at this point is merely the latest progress prose.
      // Stop the streaming cursor, keep the text provisional, and wait for the
      // authoritative terminal status reached by the detached continuation.
      if (!isAuthoritativeFinalRun(reconciledRun)) {
        settleProvisionalAssistantBubbles(runId)
        return
      }

      // Idempotency: if this run already produced a final_answer (a prior
      // terminal/reconcile converted or pushed it), update it from the DB's
      // authoritative terminal output. This is both idempotent and self-heals
      // stale interim finals left by an older browser bundle.
      upsertAuthoritativeFinalAnswer(runId, finalOut)
    } catch {
      // Network error during reconcile — streaming UI is already visible, silently ignore
    }
  }

  // ── Streaming actions (T10) ──────────────────────────────────────────

  /**
   * appendUserMessage — optimistically push the user's input as a UserMessage
   * before the SSE stream starts. Called by useAgentStream.start (T14 fix).
   *
   * The streaming path (handleSend → useAgentStream.start → streamAgentRun)
   * has no DB round-trip that would echo the user message back, and the SSE
   * event protocol has no user_message frame either, so without this call
   * the user's bubble would never render even when the stream succeeds.
   *
   * Mirrors the relevant state reset from startNewRun (clears narration,
   * tool-group cursor, attachments, input box, estimate).
   *
   * NOTE on attachments: this reads `store.attachments.value` (which carries
   * filenames), not the request's ID/URL transport fields. Callers MUST invoke
   * this BEFORE the request's attachments are mutated/cleared elsewhere; in
   * the only caller (useAgentStream.start) the order is guaranteed because
   * the `isStreaming` guard runs synchronously beforehand and this action
   * itself clears `attachments.value` at the end.
   */
  const appendUserMessage = (req: CreateRunRequest, expectedEpoch?: number): void => {
    if (expectedEpoch !== undefined && !isCurrentSessionEpoch(expectedEpoch)) return
    const userMsg: AgentMessage = {
      id: uuid(),
      type: 'user',
      text: req.input_text,
      attachments: attachments.value.map((a) => ({ url: a.url, filename: a.filename })),
      timestamp: new Date().toISOString()
    }
    messages.value.push(userMsg)
    narrationEvents.value = []
    lastNarrationTs.value = ''
    stuckSince.value = null
    lastStreamDeltaAt.value = null
    currentToolGroupId.value = null
    attachments.value = []
    inputText.value = ''
    estimate.value = null
  }

  /**
   * applyStreamEvent — dispatch an AgentStreamEvent from the SSE stream into
   * the store's reactive state. Called by useAgentStream composable (T11).
   *
   * Covers all 14 EventType values per spec §5.3.
   */
  const applyStreamEvent = (e: AgentStreamEvent, expectedEpoch?: number): void => {
    // `useAgentStream` always supplies the epoch captured when its request
    // opened. The optional form preserves the small store-level test seam, but
    // an active route still requires every non-start frame to belong to the
    // current run. Only an explicitly epoch-authorized stream_start may replace
    // a prior run in the same logical session.
    if (expectedEpoch !== undefined && !isCurrentSessionEpoch(expectedEpoch)) return
    const sessionGuardEnabled = expectedEpoch !== undefined || activeSessionID !== null
    if (sessionGuardEnabled && e.type !== 'stream_start' && currentRun.value?.id !== e.run_id) {
      return
    }
    if (
      sessionGuardEnabled &&
      e.type === 'stream_start' &&
      expectedEpoch === undefined &&
      currentRun.value !== null &&
      currentRun.value.id !== e.run_id
    ) {
      return
    }
    switch (e.type) {
      case 'stream_start': {
        const payload = parseStreamStartPayload(e.data, e.run_id)
        if (!payload) break
        // A live new route is provisional only until its own stream reports the
        // canonical server session. This is a binding, not a route replacement:
        // retain the epoch so the open SSE observer and its timers survive the
        // router's new → UUID URL update. Once an established route exists,
        // any different session is a stale/cross-route frame and is inert.
        if (
          activeSessionID !== null &&
          activeSessionID !== 'new' &&
          activeSessionID !== payload.session_id
        ) {
          break
        }
        if (activeSessionID === 'new') activeSessionID = payload.session_id
        // Optimistically establish currentRun so the chat header status badge,
        // the cancel button, and budget logic work DURING streaming. Before this
        // the streaming path left currentRun null until the terminal event, so
        // those run-scoped features were dead on the default (streaming) path
        // (BLK-5). Mirrors startNewRun's currentRun bootstrap minus the DB round
        // trip, but retains the authoritative stream session for route identity.
        if (!currentRun.value || currentRun.value.id !== e.run_id) {
          currentRun.value = {
            id: e.run_id,
            session_id: payload.session_id,
            user_id: 0,
            agent_skill_id: currentAgent.value?.id ?? 0,
            status: 'running',
            state_reason: 'running',
            credits_used: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        } else if (
          !currentRun.value.session_id ||
          currentRun.value.session_id === payload.session_id
        ) {
          currentRun.value = { ...currentRun.value, session_id: payload.session_id }
        } else {
          // A same-run payload that attempts to rewrite its established session
          // is just as unsafe as a cross-route start frame.
          break
        }
        // T3: this run's streamed items start at the current tail; keep them
        // ordered by the backend's monotonic seq from here on.
        seqBlockRunId = e.run_id
        seqBlockStart = messages.value.length
        break
      }

      case 'ping':
        // Keepalive — no-op
        break

      case 'token_delta': {
        const payload = e.data as TokenDeltaPayload
        if (!payload?.message_id) break
        const msg = ensureStreamingAssistantMessage(payload.message_id, e.run_id)
        tagStreamSeq(msg, e)
        msg.markdown += payload.text
        msg.isStreaming = true
        lastStreamDeltaAt.value = Date.now()
        reorderStreamTailBySeq()
        break
      }

      case 'reasoning_delta': {
        const payload = e.data as ReasoningDeltaPayload
        if (!payload?.message_id) break
        const msg = ensureStreamingAssistantMessage(payload.message_id, e.run_id)
        tagStreamSeq(msg, e)
        msg.reasoning = (msg.reasoning ?? '') + payload.text
        lastStreamDeltaAt.value = Date.now()
        reorderStreamTailBySeq()
        break
      }

      case 'assistant_message': {
        const payload = e.data as AssistantMessagePayload
        if (!payload?.message_id) break
        // Find by _stream_id AND _run_id — defense in depth against
        // cross-run message_id collisions (very unlikely but cheap to guard).
        const existing = messages.value.find(
          (m): m is AssistantMessage =>
            m.type === 'assistant' &&
            (m as StreamingAssistantMessage)._stream_id === payload.message_id &&
            (m as StreamingAssistantMessage)._run_id === e.run_id
        )
        if (existing) {
          existing.markdown = payload.content // authoritative final from DB
          existing.isStreaming = false
          if (payload.reasoning_content) {
            existing.reasoning = payload.reasoning_content
          }
        }
        break
      }

      case 'tool_call_start': {
        const payload = e.data as ToolCallStartPayload
        if (!payload?.tool_call_id) break
        const step = e.step ?? 0
        const group = ensureStreamingToolGroupForStep(step)
        tagStreamSeq(group, e)
        // Avoid duplicates (idempotent)
        if (!group.tool_calls.find((t) => t.tool_call_id === payload.tool_call_id)) {
          const actionLabels: Record<string, string> = {
            web_search: '正在搜索网络...',
            web_fetch: '正在抓取网页内容...',
            use_skill: '正在调用技能...',
            ask_user_question: '正在准备提问...',
            remember: '正在写入记忆...',
            file_read: '正在读取文件...',
            file_write: '正在写入文件...',
            load_skill: '正在加载技能...',
            // File-generation tools — these run for tens of seconds in the
            // sandbox and previously fell through to the generic "正在调用工具"
            // label, which (plus zero progress events) made the UI look frozen.
            run_python: '正在运行代码生成文件...',
            create_html: '正在生成网页...',
            create_csv: '正在生成 CSV 表格...',
            create_json: '正在生成 JSON 文件...',
            create_text: '正在生成文本文件...',
            create_png_chart: '正在生成图表...',
            image_gen: '正在生成图片...',
            analyze_image: '正在分析图片...',
            annotate_image: '正在标注图片...'
          }
          // invoke_skill: derive a format-specific label from the skill being
          // invoked (skill_name lives in the truncated input_preview). Falls
          // back to a generic "generating file" message when unavailable.
          const SKILL_LABELS: Record<string, string> = {
            'pptx-author': '正在生成 PPT 演示文稿...',
            'docx-author': '正在生成 Word 文档...',
            'xlsx-author': '正在生成 Excel 表格...',
            'pdf-from-html': '正在生成 PDF 文档...'
          }
          let message: string
          if (payload.tool_name === 'invoke_skill') {
            const skillName =
              typeof payload.input_preview?.skill_name === 'string'
                ? (payload.input_preview.skill_name as string)
                : ''
            message = SKILL_LABELS[skillName] ?? '正在生成文件...'
          } else {
            const base = actionLabels[payload.tool_name] ?? `正在调用工具 ${payload.tool_name}...`
            // Surface the concrete query / url for search & fetch tools.
            message = streamingToolUseLabel(payload.tool_name, payload.input_preview, base)
          }

          // 问题一: capture the load_skill skill name now (input_preview.name) so the
          // result-state label can show "已加载技能：<name>" — tool_call_result carries
          // no input field.
          const skillName =
            payload.tool_name === 'load_skill' && typeof payload.input_preview?.name === 'string'
              ? (payload.input_preview.name as string).trim()
              : ''

          group.tool_calls = [
            ...group.tool_calls,
            {
              tool_call_id: payload.tool_call_id,
              tool_name: payload.tool_name,
              current_state: 'use',
              skill_name: skillName || undefined,
              events: [
                {
                  run_id: e.run_id,
                  tool_call_id: payload.tool_call_id,
                  tool_name: payload.tool_name,
                  state: 'use',
                  message: message,
                  timestamp: e.ts
                }
              ]
            }
          ]
          // Trigger reactivity
          const idx = messages.value.findIndex((m) => m.id === group.id)
          if (idx !== -1) {
            messages.value[idx] = { ...group }
          }
        }
        reorderStreamTailBySeq()
        break
      }

      case 'tool_call_args_delta': {
        // followup3 FE-3: incremental tool-call argument (code/document content) for
        // a whitelisted generation tool. Backend gates emission by tool name, so any
        // event that arrives here belongs to a tool whose args we want to show live.
        // Buffer it in liveCodeStreams (NOT the tool_call aggregate): this event
        // arrives BEFORE tool_call_start creates the aggregate, so writing into the
        // aggregate was a silent no-op (the dev bug). The streaming bubble renders
        // activeCodeStream in a live "writing code" box (AgentMessageItem).
        const payload = e.data as ToolCallArgsDeltaPayload
        if (!payload?.tool_call_id || !payload.args_delta) break
        // Buffer by tool_call_id, independent of the (not-yet-created) aggregate.
        const acid = payload.tool_call_id
        if (!(acid in liveCodeStreams.value)) {
          liveCodeStreamOrder.value = [...liveCodeStreamOrder.value, acid]
        }
        liveCodeStreams.value = {
          ...liveCodeStreams.value,
          [acid]: (liveCodeStreams.value[acid] ?? '') + payload.args_delta
        }
        break
      }

      case 'tool_call_progress': {
        const payload = e.data as ToolCallProgressPayload
        if (!payload?.tool_call_id) break
        updateStreamingToolCall(payload.tool_call_id, (tc) => {
          tc.current_state = 'progress'
          // Push a synthetic NarrationEvent for display consistency
          tc.events.push({
            run_id: e.run_id,
            tool_call_id: payload.tool_call_id,
            tool_name: tc.tool_name,
            state: 'progress',
            message: payload.message,
            verb: payload.verb,
            timestamp: e.ts
          })
        })
        break
      }

      case 'tool_call_result': {
        const payload = e.data as ToolCallResultPayload
        if (!payload?.tool_call_id) break
        updateStreamingToolCall(payload.tool_call_id, (tc) => {
          tc.current_state = 'result'
          // Keep the raw output on preview (not rendered as the headline) for a
          // possible future "view details"; show a friendly summary instead.
          tc.preview = payload.preview
          tc.events.push({
            run_id: e.run_id,
            tool_call_id: payload.tool_call_id,
            tool_name: tc.tool_name,
            state: 'result',
            // 问题一: load_skill result keeps the skill name ("已加载技能：docx-author");
            // tool_call_result has no input, so reuse skill_name captured at start.
            message:
              tc.tool_name === 'load_skill' && tc.skill_name
                ? `已加载技能：${tc.skill_name}`
                : toolResultLabel(tc.tool_name),
            timestamp: e.ts
          })
        })
        // followup3 FE-3 fix: the live "writing code" box is collapsed at the step
        // boundary (step_done), NOT here — args-delta carries the PROVIDER tool-call
        // id while this result carries a backend UUID, so a result-keyed clear would
        // never match the buffered entry.
        // NOTE: generated images are NOT pushed as a transient artifact bubble
        // here — that bubble was lost on reload (loadSessionSnapshot rebuilds from
        // agent_run.messages, which never persisted it). The backend now embeds
        // the image as markdown in the final answer, which IS persisted and
        // renders durably via AgentFinalAnswer / the assistant markdown body.
        break
      }

      case 'tool_call_error': {
        const payload = e.data as ToolCallErrorPayload
        if (!payload?.tool_call_id) break
        updateStreamingToolCall(payload.tool_call_id, (tc) => {
          const recoverable = payload.recoverable === true
          tc.current_state = recoverable ? 'progress' : 'error'
          // A recoverable error is an internal correction attempt: keep it in a
          // live, neutral state and do not persist the raw error as a user-facing
          // failure. Legacy and explicit non-recoverable errors retain the
          // terminal red treatment.
          tc.error_message = recoverable ? undefined : payload.error
          tc.events.push({
            run_id: e.run_id,
            tool_call_id: payload.tool_call_id,
            tool_name: tc.tool_name,
            state: recoverable ? 'progress' : 'error',
            message: recoverable ? '正在调整执行方式' : '执行出错',
            timestamp: e.ts
          })
        })
        break
      }

      case 'step_done':
        // followup3 FE-3 fix: a step boundary means the model finished writing this
        // step's tool args → collapse the live "writing code" box. Clear the buffer
        // HERE (not on tool_call_result) because args-delta carries the PROVIDER
        // tool-call id (call_00_…) while result carries a different backend UUID, so a
        // result-keyed clear never matches and the box hung through the final answer.
        liveCodeStreams.value = {}
        liveCodeStreamOrder.value = []
        console.debug('[agent-stream] step_done', e.step)
        break

      case 'state_change':
        // State machine transition — log only
        console.debug('[agent-stream] state_change', e.data)
        break

      case 'question_prompt': {
        const payload = e.data as QuestionPromptPayload
        if (!payload) break
        const promptMsg: QuestionPromptMessage = {
          id: uuid(),
          type: 'question_prompt',
          run_id: e.run_id,
          // agent-multi-question: 1-4 independent questions, each with its own
          // structured options {label, description}.
          questions: payload.questions ?? [],
          answer_status: 'pending',
          timestamp: e.ts,
          // feishu-integration (T13): carry the pause classification onto the
          // card so an auth pause renders an authorization card (URL+QR) instead
          // of the Q&A UI. Absent on ordinary question prompts (omitempty).
          pause_type: payload.pause_type,
          auth_url: payload.auth_url
        }
        messages.value.push(promptMsg)
        break
      }

      case 'external_action': {
        const payload = e.data as ExternalActionPayload
        const operationID = externalActionOperationID(payload)
        const existingIndex = messages.value.findIndex(
          (message) =>
            message.type === 'external_action' &&
            message.run_id === e.run_id &&
            message.operation_id === operationID
        )
        const actionMessage = externalActionMessage(
          payload,
          e.run_id,
          e.ts || new Date().toISOString(),
          existingIndex >= 0 ? messages.value[existingIndex].id : undefined
        )
        if (!actionMessage) {
          // A malformed replacement must not keep the former authorization URL
          // actionable. There is no safe deadline to poll against, so expose an
          // expired card for Task 18's refresh path instead.
          if (operationID && existingIndex >= 0) {
            settleExternalAction(operationID, 'expired')
          }
          break
        }
        if (existingIndex >= 0) {
          messages.value[existingIndex] = actionMessage
        } else {
          messages.value.push(actionMessage)
        }
        externalActionLiveRevision += 1
        startExternalActionPolling()
        break
      }

      case 'terminal': {
        const reason = terminalReason(e.data)
        const actionStatus = externalActionStatusFromTerminal(e.data)
        // Update currentRun status locally so the UI reacts immediately;
        // reconcileFromDB (getRun, authoritative) follows. Map the raw backend
        // TerminalReason → frontend AgentRunStatus via statusFromTerminalReason
        // ('done' legacy alias = 'completed'; 'waiting_for_user_choice' →
        // 'running'). The previous inline `reason === 'done' ? 'completed' :
        // 'failed'` flashed 'failed' for every real completed run (backend sends
        // 'completed', not 'done') once currentRun is live during streaming.
        if (currentRun.value) {
          currentRun.value = {
            ...currentRun.value,
            status: statusFromTerminalReason(reason),
            state_reason: reason
          }
        }
        // The SSE terminal frame is sufficient to revoke a live external
        // authorization action. Do this synchronously, before the detached DB
        // reconciliation, because that request may be delayed or fail. Scope it
        // to the terminal's run so an unrelated active run keeps its own card.
        if (actionStatus !== null) {
          const pendingOperationIDs = messages.value
            .filter(
              (message): message is ExternalActionMessage =>
                message.type === 'external_action' &&
                message.run_id === e.run_id &&
                message.action_status === 'pending'
            )
            .map((message) => message.operation_id)
          for (const operationID of pendingOperationIDs) {
            settleExternalAction(operationID, actionStatus, e.run_id)
          }
        }
        // issue3: once the run truly ENDS (not a question pause), clear every
        // "still working" signal — the stuck-silence marker + any in-flight tool
        // timer — so nothing keeps spinning after the task is done. A
        // 'waiting_for_user_choice' terminal is a PAUSE, not an end (skip it:
        // finalizeToolGroups would wrongly paint paused tools as errored).
        if (reason !== 'waiting_for_user_choice') {
          stuckSince.value = null
          finalizeToolGroups()
        }
        // Advance the narration cursor to the stream-end timestamp. The streaming
        // path never set it (it owns its own tool cards), so on an
        // ask_user_question answer-resume — which continues via POLLING, not a
        // reopened stream — pollNarration would otherwise fetch the whole run's
        // narration from ts='' and re-aggregate every pre-answer step into one
        // giant duplicate card. QuerySince is strict-after, so setting the cursor
        // to this terminal ts makes the resume poll return only post-answer events
        // (and drops the now-redundant ask_user_question StateUse narration too).
        // The cursor — not an id-based dedup — is the right boundary here: the
        // pre-answer steps are already shown by the streaming leg's own cards, so
        // we want to exclude them by TIME, regardless of id scheme.
        if (e.ts) lastNarrationTs.value = e.ts
        // Surface a friendly failure message for error terminals that did NOT
        // already emit an 'error' event (e.g. max_turns / budget / aborted).
        // user_message is empty for successful / waiting terminals.
        const userMessage =
          e.data && typeof e.data === 'object' && !Array.isArray(e.data)
            ? (e.data as Record<string, unknown>).user_message
            : undefined
        if (typeof userMessage === 'string' && userMessage && !erroredRuns.has(e.run_id)) {
          messages.value.push({
            id: uuid(),
            type: 'system',
            system_subtype: 'failed',
            markdown: userMessage,
            timestamp: e.ts
          })
        }
        // R5: pull authoritative messages + status from DB
        void reconcileFromDB(e.run_id, expectedEpoch)
        break
      }

      case 'error': {
        const payload = e.data as ErrorPayload
        // payload.message is already a friendly Chinese message (backend
        // user_error translation layer). Mark the run so the following terminal
        // event does not show a second failure bubble.
        erroredRuns.add(e.run_id)
        applyError(new Error(payload?.message ?? '服务暂时不可用，请稍后再试。'), expectedEpoch)
        break
      }

      default:
        // Unknown event type — ignore gracefully
        break
    }
  }

  /**
   * applyError — translate a non-409 stream error into a system message visible
   * in the chat UI. Called by useAgentStream composable on catch (T11).
   */
  const applyError = (err: Error | unknown, expectedEpoch?: number): void => {
    if (expectedEpoch !== undefined && !isCurrentSessionEpoch(expectedEpoch)) return
    const message = err instanceof Error ? err.message : String(err)
    messages.value.push({
      id: uuid(),
      type: 'system',
      system_subtype: 'failed',
      markdown: message,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * markQuestionAnswered — flip any pending question_prompt for this run to
   * 'answered' (optimistic). Called when the user submits an ask_user_question
   * answer; gives immediate "已回答，等待 agent 继续..." feedback before the
   * resumed run's narration arrives via polling. Idempotent (the polling
   * run_resumed handler sets the same flag).
   */
  const markQuestionAnswered = (runId: number): void => {
    for (const msg of messages.value) {
      if (
        msg.type === 'question_prompt' &&
        (msg as QuestionPromptMessage).run_id === runId &&
        (msg as QuestionPromptMessage).answer_status === 'pending'
      ) {
        ;(msg as QuestionPromptMessage).answer_status = 'answered'
      }
    }
  }

  const reset = (): void => {
    invalidateSession()
    feishuResumeRequests.clear()
    availableAgents.value = []
    recentSessions.value = []
    currentAgent.value = null
    currentRun.value = null
    messages.value = []
    narrationEvents.value = []
    lastNarrationTs.value = ''
    stuckSince.value = null
    lastStreamDeltaAt.value = null
    currentToolGroupId.value = null
    streamingToolGroupIds.value = new Map()
    liveCodeStreams.value = {}
    liveCodeStreamOrder.value = []
    inputText.value = ''
    attachments.value = []
    estimate.value = null
    isReadOnly.value = false
    loadingAgents.value = false
    loadingSnapshot.value = false
    sendingMessage.value = false
    cancelling.value = false
    agentsError.value = null
    sessionError.value = null
    erroredRuns.clear()
    sessionStorage.removeItem('agentChat:currentRunId')
    sessionStorage.removeItem('agentChat:currentSessionId')
  }

  // Pinia setup stores run in an effect scope. reset() covers normal chat/view
  // replacement, while this guard also releases the timer and DOM listener when
  // Pinia itself disposes the store (logout, test teardown, or app teardown).
  onScopeDispose(() => {
    invalidateSession()
  })

  return {
    ensureCurrentRun,
    availableAgents,
    recentSessions,
    titlePendingIds,
    currentAgent,
    currentRun,
    messages,
    narrationEvents,
    lastNarrationTs,
    stuckSince,
    lastStreamDeltaAt,
    inputText,
    attachments,
    estimate,
    isReadOnly,
    loadingAgents,
    loadingSnapshot,
    sendingMessage,
    cancelling,
    agentsError,
    sessionError,
    isRunning,
    isWaitingForUser,
    isWaitingForAuth,
    isQueuedExternalContinuationActive,
    isWaitingForExternalAction,
    hasActiveToolCall,
    activeCodeStream,
    toolGroups,
    fetchAvailableAgents,
    fetchRecentSessions,
    prepareNewSession,
    estimateInput,
    startNewRun,
    pollNarration,
    refreshRunStatus,
    cancelCurrent,
    uploadAttachment,
    removeAttachment,
    loadSessionSnapshot,
    pinSession,
    renameSession,
    deleteSession,
    reset,
    beginSession,
    currentSessionEpoch,
    isCurrentSessionEpoch,
    appendUserMessage,
    applyStreamEvent,
    applyError,
    markQuestionAnswered,
    resumeFeishuOperation,
    settleFeishuTerminalOperation
  }
})
