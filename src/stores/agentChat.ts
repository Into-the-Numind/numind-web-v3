/**
 * agentChat store — 学员端 Agent 模式状态机
 *
 * 职责：
 * - currentAgent / currentRun / messages 的中心化
 * - narration 事件累积 + stuck 检测
 * - run lifecycle actions（create / poll / cancel / extend / feedback）
 * - 历史会话恢复（loadSessionSnapshot）
 * - reset() 完整清理 16 个 ref 字段
 *
 * Refs: docs/agent-mode/feature-11-spec.md §6
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '@/api/agent'
import type {
  AgentSkill,
  AgentRun,
  AgentMessage,
  NarrationEvent,
  EstimateResponse,
  RecentSession,
  ToolCallAggregate,
  ToolGroupMessage,
  UploadResponse,
  QuestionPromptMessage
} from '@/types/agent'

// 简易 uuid（避免新增依赖；够用于客户端 message id）
const uuid = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export const useAgentChatStore = defineStore('agentChat', () => {
  // ── State (16 refs) ─────────────────────────────────────────────────
  const availableAgents = ref<AgentSkill[]>([])
  const recentSessions = ref<RecentSession[]>([])
  const currentAgent = ref<AgentSkill | null>(null)
  const currentRun = ref<AgentRun | null>(null)
  const messages = ref<AgentMessage[]>([])
  const narrationEvents = ref<NarrationEvent[]>([])
  const lastNarrationTs = ref<string>('')
  const stuckSince = ref<number | null>(null)
  // Tracks the in-flight tool_group message that mirrors toolGroups computed.
  // Without this bridge, narrationEvents pile up in the store and the existing
  // `toolGroups` computed has no consumer — AgentMessageItem only renders
  // AgentToolCallList when `msg.type === 'tool_group'`, but nothing was
  // injecting such a message into `messages`. Hotfix narration-tool-group-message-wire.
  const currentToolGroupId = ref<string | null>(null)

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
    reset
  }
})
