/**
 * Agent stream event protocol — TypeScript mirror of backend Go types.
 *
 * Source of truth: numind-server/internal/numind/biz/agent/stream/ (backend)
 * Spec: docs/superpowers/specs/2026-05-27-agent-react-streaming-design.md §3.1 / §3.3
 *
 * Field names are intentionally snake_case to match the Go JSON tags 1:1,
 * enabling direct JSON deserialization without any case conversion.
 */

// ---------------------------------------------------------------------------
// Event type discriminant
// ---------------------------------------------------------------------------

export type AgentStreamEventType =
  | 'stream_start'
  | 'token_delta'
  | 'reasoning_delta'
  | 'assistant_message'
  | 'tool_call_start'
  | 'tool_call_args_delta'
  | 'tool_call_progress'
  | 'tool_call_result'
  | 'tool_call_error'
  | 'step_done'
  | 'state_change'
  | 'question_prompt'
  | 'terminal'
  | 'error'
  | 'ping'

// ---------------------------------------------------------------------------
// Envelope (matches Go stream.Event)
// ---------------------------------------------------------------------------

export interface AgentStreamEvent<T = unknown> {
  /** Discriminant — one of AgentStreamEventType */
  type: AgentStreamEventType
  /** Monotonically increasing sequence number (reserved for reconnect gap-fill) */
  seq: number
  /** RFC 3339 timestamp */
  ts: string
  /** Agent run ID */
  run_id: number
  /** Current ReAct step index (omitted for stream_start / error / ping) */
  step?: number
  /** Type-specific payload — see payload interfaces below */
  data?: T
}

// ---------------------------------------------------------------------------
// Payload interfaces (one per non-ping EventType)
// ---------------------------------------------------------------------------

/** token_delta — LLM text increment (highest-frequency event) */
export interface TokenDeltaPayload {
  /** UUID identifying the assistant message bubble */
  message_id: string
  /** Incremental text fragment */
  text: string
}

/** reasoning_delta — internal reasoning increment from thinking models */
export interface ReasoningDeltaPayload {
  message_id: string
  text: string
}

/** assistant_message — complete assistant turn emitted at step boundary */
export interface AssistantMessagePayload {
  message_id: string
  content: string
  /** Present only for thinking models */
  reasoning_content?: string
  has_tool_calls: boolean
}

/** tool_call_start — tool invocation beginning */
export interface ToolCallStartPayload {
  tool_call_id: string
  tool_name: string
  /** SHA hash of input; fetch full input by ID when expanding */
  input_digest: string
  /** Truncated input JSON (first 500 chars) for preview display */
  input_preview?: Record<string, unknown>
}

/** tool_call_args_delta — incremental tool-call argument (code/document content)
 *  streamed for the whitelisted generation tools (run_python / create_html /
 *  create_docx / create_csv / create_json / create_text / create_png_chart). The
 *  backend gates emission by tool name; other tools never send this. Accumulating
 *  args_delta by tool_call_id reconstructs the tool's full argument JSON live so
 *  the UI can show a "writing code" preview while the LLM composes a long call. */
export interface ToolCallArgsDeltaPayload {
  tool_call_id: string
  function_name: string
  args_delta: string
}

/** tool_call_progress — narration / progress update inside a tool call */
export interface ToolCallProgressPayload {
  tool_call_id: string
  /** Narration message text */
  message: string
  /** Optional action verb for display (e.g. "Searching", "Reading") */
  verb?: string
}

/** tool_call_result — tool completed successfully */
export interface ToolCallResultPayload {
  tool_call_id: string
  /** Truncated result (first 500 chars) */
  preview: string
  /** Generated-file artifact URL (image_gen / create_*), if any */
  artifact_url?: string
  /** Artifact filename (for download name / alt text) */
  artifact_filename?: string
  /** Artifact MIME type (e.g. image/png) — frontend uses it to render inline images */
  artifact_mime?: string
  duration_ms: number
}

/** tool_call_error — tool call failed */
export interface ToolCallErrorPayload {
  tool_call_id: string
  error: string
  duration_ms: number
}

/** step_done — one complete ReAct iteration finished */
export interface StepDonePayload {
  step_index: number
  /** LLM finish_reason (e.g. "stop", "tool_calls") */
  stop_reason?: string
}

/** state_change — agent state machine transition */
export interface StateChangePayload {
  /** LoopEvent enum value from the backend state machine */
  loop_event: string
  previous_state?: string
}

/** question_prompt — agent is waiting for user input via ask_user_question.
 *  agent-multi-question: carries 1-4 independent questions (mirrors backend
 *  stream.QuestionPromptPayload). */
export interface QuestionPromptPayload {
  questions: Array<{
    question: string
    /** Structured options — mirrors backend stream.QuestionOption. */
    options: Array<{ label: string; description?: string }>
    header?: string
    multi_select: boolean
  }>
}

/** terminal — stream ended (success or failure) */
export interface TerminalPayload {
  /** TerminalReason enum value */
  reason: string
  duration_ms: number
  step_count: number
  /** Friendly Chinese message derived from reason for error terminals (empty for success) */
  user_message?: string
  final_output?: string
  terminal_metadata?: Record<string, unknown>
  permission_denial?: Record<string, unknown>
}

/** error — fatal stream-level error */
export interface ErrorPayload {
  /** "model_error" | "permission" | "internal" */
  code: string
  /** Human-readable message; may match terminal_metadata.error_message */
  message: string
}

// ---------------------------------------------------------------------------
// Typed convenience aliases (narrow AgentStreamEvent to specific payload)
// ---------------------------------------------------------------------------

export type TokenDeltaEvent = AgentStreamEvent<TokenDeltaPayload>
export type ReasoningDeltaEvent = AgentStreamEvent<ReasoningDeltaPayload>
export type AssistantMessageEvent = AgentStreamEvent<AssistantMessagePayload>
export type ToolCallStartEvent = AgentStreamEvent<ToolCallStartPayload>
export type ToolCallArgsDeltaEvent = AgentStreamEvent<ToolCallArgsDeltaPayload>
export type ToolCallProgressEvent = AgentStreamEvent<ToolCallProgressPayload>
export type ToolCallResultEvent = AgentStreamEvent<ToolCallResultPayload>
export type ToolCallErrorEvent = AgentStreamEvent<ToolCallErrorPayload>
export type StepDoneEvent = AgentStreamEvent<StepDonePayload>
export type StateChangeEvent = AgentStreamEvent<StateChangePayload>
export type QuestionPromptEvent = AgentStreamEvent<QuestionPromptPayload>
export type TerminalEvent = AgentStreamEvent<TerminalPayload>
export type ErrorEvent = AgentStreamEvent<ErrorPayload>

// ---------------------------------------------------------------------------
// SSE 409 fallback — raised when the run already has an active subscriber
// ---------------------------------------------------------------------------

/**
 * Thrown by useAgentStream when the backend returns 409 (single-subscriber lock
 * already held by another tab/window).  The caller should fall back to polling
 * GET /v1/agent-runs/:id.
 */
export class AgentStreamConflict extends Error {
  constructor(
    public readonly runId: number,
    public readonly snapshot?: unknown
  ) {
    super('agent stream already attached')
    this.name = 'AgentStreamConflict'
  }
}
