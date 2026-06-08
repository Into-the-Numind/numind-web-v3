/**
 * agentChat store — 学员端 Agent 模式状态机
 *
 * 职责：
 * - currentAgent / currentRun / messages 的中心化
 * - narration 事件累积 + stuck 检测
 * - run lifecycle actions（create / poll / cancel / extend / feedback）
 * - 历史会话恢复（loadSessionSnapshot）
 * - 流式事件处理（applyStreamEvent / applyError）— T10
 * - reset() 完整清理 16 个 ref 字段
 *
 * Refs: docs/agent-mode/feature-11-spec.md §6
 * Spec: docs/superpowers/specs/2026-05-27-agent-react-streaming-design.md §5.3
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '@/api/agent'
import type {
  AgentSkill,
  AgentRun,
  AgentRunStatus,
  AgentMessage,
  AssistantMessage,
  CreateRunRequest,
  NarrationEvent,
  EstimateResponse,
  RecentSession,
  ToolCallAggregate,
  ToolGroupMessage,
  UploadResponse,
  QuestionPromptMessage
} from '@/types/agent'
import type { AgentStreamEvent } from '@/types/agent-stream'
import type {
  TokenDeltaPayload,
  ReasoningDeltaPayload,
  AssistantMessagePayload,
  ToolCallStartPayload,
  ToolCallProgressPayload,
  ToolCallResultPayload,
  ToolCallErrorPayload,
  QuestionPromptPayload,
  TerminalPayload,
  ErrorPayload
} from '@/types/agent-stream'

// 简易 uuid（避免新增依赖；够用于客户端 message id）
const uuid = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

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
  const currentAgent = ref<AgentSkill | null>(null)
  const currentRun = ref<AgentRun | null>(null)
  const messages = ref<AgentMessage[]>([])
  // Runs that already surfaced an 'error' event — so the following 'terminal'
  // event's user_message is not shown as a duplicate failure bubble.
  const erroredRuns = new Set<number>()
  const narrationEvents = ref<NarrationEvent[]>([])
  const lastNarrationTs = ref<string>('')
  const stuckSince = ref<number | null>(null)
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

  // ── Getters ─────────────────────────────────────────────────────────
  const isRunning = computed(
    () => currentRun.value?.status === 'running' || currentRun.value?.status === 'pending'
  )

  /** True when agent is paused waiting for user to answer an ask_user_question */
  const isWaitingForUser = computed(
    () => currentRun.value?.state_reason === 'waiting_for_user_choice'
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

  const budgetThresholdState = computed<'under_60' | 'warning_60' | 'blocked_100'>(
    () => currentRun.value?.credits_threshold_state ?? 'under_60'
  )

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

  const fetchRecentSessions = async (): Promise<void> => {
    try {
      recentSessions.value = await api.listRecentSessions(5)
    } catch {
      recentSessions.value = []
    }
  }

  const estimateInput = async (agentId: number, text: string): Promise<void> => {
    if (!text.trim()) {
      estimate.value = null
      return
    }
    try {
      estimate.value = await api.estimateRun({
        agent_skill_id: agentId,
        input_text: text,
        attachment_meta: attachments.value.map((a) => ({
          filename: a.filename,
          size: a.size,
          mime_type: a.mime_type
        }))
      })
    } catch {
      estimate.value = null
    }
  }

  const startNewRun = async (agentId: number, text: string, sessionId?: string): Promise<void> => {
    sendingMessage.value = true
    try {
      const res = await api.createRun({
        agent_skill_id: agentId,
        input_text: text,
        session_id: sessionId && sessionId !== 'new' ? sessionId : undefined,
        // Server expects "attachment_urls": array of COS URLs (NOT numeric ids).
        // The upload endpoint does not return an id, so url IS the identity.
        attachment_urls: attachments.value.map((a) => a.url)
      })
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
      currentRun.value = await api.getRun(res.run_id)
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
      sendingMessage.value = false
    }
  }

  const pollNarration = async (): Promise<void> => {
    if (!currentRun.value || !isRunning.value) return
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
      const events = await api.fetchNarrationEvents(currentRun.value.id, lastNarrationTs.value)
      if (events.length > 0) {
        for (const ev of events) {
          if (ev.event_type === 'tool_call_yield' && ev.yield_payload) {
            // ask_user_question yield — inject a question_prompt message into the chat
            const qp = ev.yield_payload
            const promptMsg: QuestionPromptMessage = {
              id: uuid(),
              type: 'question_prompt',
              run_id: qp.run_id,
              question: qp.question,
              options: qp.options,
              header: qp.header,
              multi_select: qp.multi_select,
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

  const refreshRunStatus = async (): Promise<void> => {
    if (!currentRun.value) return
    try {
      const prevStatus = currentRun.value.status
      const next = await api.getRun(currentRun.value.id)
      currentRun.value = next
      // When the run transitions from active → terminal and the backend
      // surfaced a final_output (extracted from agent_run.messages), push it
      // as a FinalAnswerMessage so the chat UI renders the AI's reply.
      const wasActive = prevStatus === 'running' || prevStatus === 'pending'
      const isTerminal = next.status !== 'running' && next.status !== 'pending'
      const finalOut = next.final_output ?? ''
      const alreadyHasFinal = messages.value.some(
        (m) => m.type === 'final_answer' && (m as { run_id?: number }).run_id === next.id
      )
      if (wasActive && isTerminal && finalOut && !alreadyHasFinal) {
        messages.value.push({
          id: uuid(),
          type: 'final_answer',
          markdown: finalOut,
          run_id: next.id,
          timestamp: new Date().toISOString()
        })
      }
    } catch {
      // 忽略；下次重试
    }
  }

  const cancelCurrent = async (): Promise<void> => {
    if (!currentRun.value) return
    cancelling.value = true
    try {
      await api.cancelRun(currentRun.value.id)
      currentRun.value = { ...currentRun.value, status: 'cancelled' }
      messages.value.push({
        id: uuid(),
        type: 'system',
        system_subtype: 'cancelled',
        timestamp: new Date().toISOString()
      })
    } finally {
      cancelling.value = false
    }
  }

  const extendCurrentBudget = async (extra: number): Promise<void> => {
    if (!currentRun.value) return
    currentRun.value = await api.extendBudget(currentRun.value.id, { extra_credits: extra })
  }

  const submitFeedback = async (
    runId: number,
    fb: 'positive' | 'negative',
    note?: string
  ): Promise<void> => {
    await api.submitFeedback(runId, { feedback: fb, note })
  }

  const uploadAttachment = async (file: File): Promise<void> => {
    const res = await api.uploadAttachment(file)
    attachments.value.push(res)
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
    loadingSnapshot.value = true
    sessionError.value = null
    try {
      const snap = await api.getSessionSnapshot(sessionId)
      // Defensive: backend may omit timestamp on restored messages; fill with
      // a stable fallback so BaseMessage.timestamp is always a valid string.
      const now = new Date().toISOString()
      const localUserMsgs = messages.value.filter((m) => m.type === 'user')
      const snapMsgs = (snap.messages ?? []).map((m) => ({
        ...m,
        timestamp: m.timestamp ?? now
      }))
      // 边界防御：如果后端传回的快照里还没有任何用户消息，而我们本地正好有刚发的用户消息
      if (snapMsgs.filter((m) => m.type === 'user').length === 0 && localUserMsgs.length > 0) {
        snapMsgs.unshift(...localUserMsgs)
      }
      messages.value = snapMsgs
      isReadOnly.value = readOnly
      if (snap.compact_summary) {
        messages.value.unshift({
          id: uuid(),
          type: 'system',
          system_subtype: 'restored',
          markdown: snap.compact_summary,
          timestamp: new Date().toISOString()
        })
      }
    } catch (err) {
      sessionError.value = (err as Error).message ?? '会话加载失败'
    } finally {
      loadingSnapshot.value = false
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
  const reconcileFromDB = async (runId: number): Promise<void> => {
    try {
      const run = await api.getRun(runId)
      currentRun.value = run
      const finalOut = run.final_output ?? ''

      // Match only bubbles that BELONG to this run AND are still streaming.
      // The isStreaming guard makes reconcile re-entry truly idempotent: a
      // duplicate terminal SSE frame would otherwise re-overwrite markdown
      // (current backend returns a stable final_output, so it's invisible —
      // but reviewer flagged this as a latent correctness bug masked by the
      // test using identical mock values).
      const streamingBubbles = messages.value.filter(
        (m): m is StreamingAssistantMessage =>
          m.type === 'assistant' &&
          (m as StreamingAssistantMessage)._stream_id !== undefined &&
          (m as StreamingAssistantMessage)._run_id === runId &&
          (m as StreamingAssistantMessage).isStreaming === true
      )

      if (streamingBubbles.length > 0) {
        for (const b of streamingBubbles) {
          b.isStreaming = false
        }
        if (finalOut) {
          streamingBubbles[streamingBubbles.length - 1].markdown = finalOut
        }
        return
      }

      // Fallback: no ACTIVE streaming bubble for this run. Push the DB
      // final_output as a stand-alone final_answer, but only if this run
      // has NO existing UI representation. A second reconcile fires when:
      //   (a) duplicate terminal SSE frame — the first reconcile already
      //       finalized a bubble (filter now empty because isStreaming=false);
      //       must NOT push final_answer because the finalized bubble IS the
      //       UI for this run.
      //   (b) the first reconcile already pushed a final_answer (tool-only
      //       run path); subsequent calls must dedup against that.
      if (finalOut) {
        const hasAnyUiForRun = messages.value.some(
          (m) =>
            (m.type === 'assistant' && (m as StreamingAssistantMessage)._run_id === runId) ||
            (m.type === 'final_answer' && (m as { run_id?: number }).run_id === runId)
        )
        if (!hasAnyUiForRun) {
          messages.value.push({
            id: uuid(),
            type: 'final_answer',
            markdown: finalOut,
            run_id: runId,
            timestamp: new Date().toISOString()
          })
        }
      }
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
   * filenames), NOT `req.attachment_urls` (URL-only). Callers MUST invoke
   * this BEFORE the request's attachments are mutated/cleared elsewhere; in
   * the only caller (useAgentStream.start) the order is guaranteed because
   * the `isStreaming` guard runs synchronously beforehand and this action
   * itself clears `attachments.value` at the end.
   */
  const appendUserMessage = (req: CreateRunRequest): void => {
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
  const applyStreamEvent = (e: AgentStreamEvent): void => {
    switch (e.type) {
      case 'stream_start': {
        // Optimistically establish currentRun so the chat header status badge,
        // the cancel button, and budget logic work DURING streaming. Before this
        // the streaming path left currentRun null until the terminal event, so
        // those run-scoped features were dead on the default (streaming) path
        // (BLK-5). Mirrors startNewRun's currentRun bootstrap minus the DB round
        // trip. session_id is intentionally left empty so the new-session route
        // replace still fires later from reconcileFromDB (URL timing unchanged).
        if (!currentRun.value || currentRun.value.id !== e.run_id) {
          currentRun.value = {
            id: e.run_id,
            session_id: '',
            user_id: 0,
            agent_skill_id: currentAgent.value?.id ?? 0,
            status: 'running',
            state_reason: 'running',
            credits_used: 0,
            credits_budget: 0,
            credits_threshold_state: 'under_60',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        }
        break
      }

      case 'ping':
        // Keepalive — no-op
        break

      case 'token_delta': {
        const payload = e.data as TokenDeltaPayload
        if (!payload?.message_id) break
        const msg = ensureStreamingAssistantMessage(payload.message_id, e.run_id)
        msg.markdown += payload.text
        msg.isStreaming = true
        break
      }

      case 'reasoning_delta': {
        const payload = e.data as ReasoningDeltaPayload
        if (!payload?.message_id) break
        const msg = ensureStreamingAssistantMessage(payload.message_id, e.run_id)
        msg.reasoning = (msg.reasoning ?? '') + payload.text
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
            message = actionLabels[payload.tool_name] ?? `正在调用工具 ${payload.tool_name}...`
          }

          group.tool_calls = [
            ...group.tool_calls,
            {
              tool_call_id: payload.tool_call_id,
              tool_name: payload.tool_name,
              current_state: 'use',
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
          tc.preview = payload.preview
          tc.events.push({
            run_id: e.run_id,
            tool_call_id: payload.tool_call_id,
            tool_name: tc.tool_name,
            state: 'result',
            message: payload.preview,
            timestamp: e.ts
          })
        })
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
          tc.current_state = 'error'
          tc.error_message = payload.error
          tc.events.push({
            run_id: e.run_id,
            tool_call_id: payload.tool_call_id,
            tool_name: tc.tool_name,
            state: 'error',
            message: payload.error,
            timestamp: e.ts
          })
        })
        break
      }

      case 'step_done':
        // Step boundary — no direct UI action; just log
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
          question: payload.question,
          // Backend (T3) now sends structured options {label, description};
          // pass them through directly (was stringified to {label: opt}, which
          // rendered [object Object] once the backend contract changed).
          options: payload.options ?? [],
          header: payload.header,
          multi_select: payload.multi_select ?? false,
          answer_status: 'pending',
          timestamp: e.ts
        }
        messages.value.push(promptMsg)
        break
      }

      case 'terminal': {
        const payload = e.data as TerminalPayload
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
            status: statusFromTerminalReason(payload?.reason),
            state_reason: payload?.reason
          }
        }
        // Surface a friendly failure message for error terminals that did NOT
        // already emit an 'error' event (e.g. max_turns / budget / aborted).
        // user_message is empty for successful / waiting terminals.
        if (payload?.user_message && !erroredRuns.has(e.run_id)) {
          messages.value.push({
            id: uuid(),
            type: 'system',
            system_subtype: 'failed',
            markdown: payload.user_message,
            timestamp: e.ts
          })
        }
        // R5: pull authoritative messages + status from DB
        void reconcileFromDB(e.run_id)
        break
      }

      case 'error': {
        const payload = e.data as ErrorPayload
        // payload.message is already a friendly Chinese message (backend
        // user_error translation layer). Mark the run so the following terminal
        // event does not show a second failure bubble.
        erroredRuns.add(e.run_id)
        applyError(new Error(payload?.message ?? '服务暂时不可用，请稍后再试。'))
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
  const applyError = (err: Error | unknown): void => {
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
    availableAgents.value = []
    recentSessions.value = []
    currentAgent.value = null
    currentRun.value = null
    messages.value = []
    narrationEvents.value = []
    lastNarrationTs.value = ''
    stuckSince.value = null
    currentToolGroupId.value = null
    streamingToolGroupIds.value = new Map()
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

  return {
    availableAgents,
    recentSessions,
    currentAgent,
    currentRun,
    messages,
    narrationEvents,
    lastNarrationTs,
    stuckSince,
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
    toolGroups,
    budgetThresholdState,
    fetchAvailableAgents,
    fetchRecentSessions,
    estimateInput,
    startNewRun,
    pollNarration,
    refreshRunStatus,
    cancelCurrent,
    extendCurrentBudget,
    submitFeedback,
    uploadAttachment,
    removeAttachment,
    loadSessionSnapshot,
    pinSession,
    renameSession,
    deleteSession,
    reset,
    appendUserMessage,
    applyStreamEvent,
    applyError,
    markQuestionAnswered
  }
})
