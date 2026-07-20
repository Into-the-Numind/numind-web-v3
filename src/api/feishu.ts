/**
 * Personal Feishu workspace lifecycle client.
 *
 * This module mirrors only the public HTTP contract. User identity, CLI argv,
 * requested scopes, provider routing and credential material remain server
 * owned and must never be accepted or retained by the browser.
 */
import request from './request'
import { isOfficialFeishuActionURL } from '@/utils/feishuActionUrl'

export type FeishuConnectionState =
  | 'none'
  | 'creating_app'
  | 'app_ready'
  | 'waiting_app_approval'
  | 'waiting_user_auth'
  | 'connected'
  | 'reauth_required'
  | 'error'
  | 'disconnecting'

export type FeishuCapabilityDomain = 'docs' | 'base' | 'wiki'

export type FeishuCapabilityState =
  | 'unknown'
  | 'available'
  | 'needs_app_scope'
  | 'needs_user_scope'
  | 'revoked'
  | 'resource_denied'

export type FeishuActionPhase = 'create_app' | 'app_scope' | 'user_auth' | 'confirmation'

export type FeishuOperationState =
  | 'not_started'
  | 'executing'
  | 'waiting_connection'
  | 'waiting_app_scope'
  | 'waiting_user_auth'
  | 'waiting_confirmation'
  | 'succeeded'
  | 'failed'
  | 'unknown'
  | 'cancelled'

export type FeishuAuthorizationNoticeCode =
  | 'authorization_pending'
  | 'authorization_processing'
  | 'authorization_rejected'
  | 'authorization_expired'
  | 'authorization_updated'

/** Safe browser fields for a server-owned authorization action. */
export interface FeishuExternalAction {
  operation_id: string
  session_id: string
  phase: FeishuActionPhase
  expires_at: string
  /** Present only in a live connect/refresh/SSE response, never in snapshots. */
  url?: string
}

export interface FeishuCapability {
  state: FeishuCapabilityState
  last_success_at?: string
}

export type FeishuCapabilities = Record<FeishuCapabilityDomain, FeishuCapability>

/** A read-only pending action from status; it never contains a live URL. */
export interface FeishuStatusAction {
  operation_id?: string
  session_id: string
  phase: FeishuActionPhase
  expires_at: string
  link_available: boolean
  url?: never
}

/** `GET /v1/feishu/status` — strictly read-only and never creates a URL. */
export interface FeishuStatus {
  state: FeishuConnectionState
  connected: boolean
  in_agent_flow?: boolean
  app_id_masked?: string
  cli_version?: string
  capabilities: FeishuCapabilities
  active_action?: FeishuStatusAction
}

/** `POST /v1/feishu/connect` — manual lifecycle only, not business scopes. */
export interface FeishuConnectResult {
  state: FeishuConnectionState
  action?: FeishuExternalAction
}

/** `POST /v1/feishu/operations/:id/resume` response. */
export interface FeishuOperationResult {
  operation_id: string
  state: FeishuOperationState
  /** The server-projected tool result is opaque to the lifecycle client. */
  data?: unknown
  /** A recoverable resume response may replace the current live action. */
  action?: FeishuExternalAction
  /** Fixed allowlisted lifecycle guidance; never a server-provided message. */
  notice_code?: FeishuAuthorizationNoticeCode
}

export interface FeishuRefreshTerminal {
  operation_id: string
  state: Extract<FeishuOperationState, 'succeeded' | 'failed' | 'unknown' | 'cancelled'>
}

/** Refresh returns exactly one new live action or linked terminal state. */
export type FeishuRefreshResult =
  | { action: FeishuExternalAction; terminal?: never }
  | { action?: never; terminal: FeishuRefreshTerminal }

export type FeishuResumeAction = 'user_completed' | 'confirmed' | 'cancelled'

export interface FeishuUnbindResult {
  state: FeishuConnectionState
  connected: boolean
  message: string
}

/** Start only the user-initiated manual connection flow. */
export async function connectFeishu(): Promise<FeishuConnectResult> {
  const { data } = await request.post<unknown>('/v1/feishu/connect', {
    intent: 'manual'
  })
  const result = parseFeishuConnectResult(data)
  if (!result) {
    throw new Error('飞书连接状态无效，请稍后重试。')
  }
  return result
}

/** Acknowledge one exact manual Settings authorization session. */
export async function continueFeishuConnection(sessionId: string): Promise<FeishuConnectResult> {
  if (!sessionId.trim()) throw new Error('飞书授权步骤已更新，请使用最新步骤。')
  const { data } = await request.post<unknown>(
    '/v1/feishu/connect',
    { intent: 'manual', action: 'user_completed', session_id: sessionId },
    { timeout: 60_000 }
  )
  const result = parseFeishuConnectResult(data)
  if (!result) {
    throw new Error('飞书连接状态无效，请稍后重试。')
  }
  return result
}

/** Read status without generating an authorization URL or worker. */
export async function getFeishuStatus(): Promise<FeishuStatus> {
  const { data } = await request.get<FeishuStatus>('/v1/feishu/status')
  return data
}

/**
 * Acknowledge one fixed external-action lifecycle transition. The default is
 * the only action exposed by the ordinary “I have completed this” control.
 */
export async function resumeFeishuOperation(
  operationId: string,
  sessionId: string,
  action: FeishuResumeAction = 'user_completed'
): Promise<FeishuOperationResult> {
  if (!operationId.trim() || !sessionId.trim()) {
    throw new Error('飞书授权步骤已更新，请使用最新步骤。')
  }
  const { data } = await request.post<unknown>(
    `/v1/feishu/operations/${encodeURIComponent(operationId)}/resume`,
    { action, session_id: sessionId },
    { timeout: 60_000 }
  )
  if (!isFeishuOperationResult(data)) {
    throw new Error('飞书授权状态无效，请稍后重试。')
  }
  return data
}

const FEISHU_OPERATION_STATES = new Set<FeishuOperationState>([
  'not_started',
  'executing',
  'waiting_connection',
  'waiting_app_scope',
  'waiting_user_auth',
  'waiting_confirmation',
  'succeeded',
  'failed',
  'unknown',
  'cancelled'
])

const FEISHU_NOTICE_CODES = new Set<FeishuAuthorizationNoticeCode>([
  'authorization_pending',
  'authorization_processing',
  'authorization_rejected',
  'authorization_expired',
  'authorization_updated'
])

const FEISHU_TERMINAL_OPERATION_STATES = new Set<FeishuOperationState>([
  'succeeded',
  'failed',
  'unknown',
  'cancelled'
])

const FEISHU_ACTION_STATE_BY_PHASE: Record<FeishuActionPhase, FeishuOperationState> = {
  create_app: 'waiting_connection',
  app_scope: 'waiting_app_scope',
  user_auth: 'waiting_user_auth',
  confirmation: 'waiting_confirmation'
}

const FEISHU_CONNECTION_STATES = new Set<FeishuConnectionState>([
  'none',
  'creating_app',
  'app_ready',
  'waiting_app_approval',
  'waiting_user_auth',
  'connected',
  'reauth_required',
  'error',
  'disconnecting'
])

function parseFeishuConnectResult(value: unknown): FeishuConnectResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const result = value as Record<string, unknown>
  const allowedKeys = new Set(['state', 'action'])
  if (Object.keys(result).some((key) => !allowedKeys.has(key))) return null
  if (typeof result.state !== 'string' || !FEISHU_CONNECTION_STATES.has(result.state as FeishuConnectionState)) {
    return null
  }
  const state = result.state as FeishuConnectionState
  if (result.action === undefined) return { state }
  if (!result.action || typeof result.action !== 'object' || Array.isArray(result.action)) return null
  const action = result.action as Record<string, unknown>
  if (action.operation_id !== undefined && typeof action.operation_id !== 'string') return null
  const operationId = typeof action.operation_id === 'string' ? action.operation_id : ''
  if (!isSafeFeishuExternalAction(action, operationId)) return null
  if (action.phase === 'confirmation') return null
  const stateByPhase: Partial<Record<FeishuActionPhase, FeishuConnectionState>> = {
    create_app: 'creating_app',
    app_scope: 'waiting_app_approval',
    user_auth: 'waiting_user_auth'
  }
  if (stateByPhase[action.phase as FeishuActionPhase] !== state) return null
  return {
    state,
    action: { ...(action as unknown as FeishuExternalAction), operation_id: operationId }
  }
}

function isSafeFeishuExternalAction(
  value: unknown,
  operationId: string
): value is FeishuExternalAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const action = value as Record<string, unknown>
  const allowedKeys = new Set(['operation_id', 'session_id', 'phase', 'expires_at', 'url'])
  if (Object.keys(action).some((key) => !allowedKeys.has(key))) return false
  return (
    (action.operation_id === operationId || (operationId === '' && action.operation_id === undefined)) &&
    typeof action.session_id === 'string' &&
    action.session_id.trim() !== '' &&
    typeof action.phase === 'string' &&
    ['create_app', 'app_scope', 'user_auth', 'confirmation'].includes(action.phase) &&
    typeof action.expires_at === 'string' &&
    Number.isFinite(Date.parse(action.expires_at)) &&
    (action.url === undefined ||
      isOfficialFeishuActionURL(action.url, action.phase as FeishuActionPhase))
  )
}

function isFeishuOperationResult(value: unknown): value is FeishuOperationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  const allowedKeys = new Set(['operation_id', 'state', 'data', 'action', 'notice_code'])
  if (Object.keys(result).some((key) => !allowedKeys.has(key))) return false
  if (
    typeof result.operation_id !== 'string' ||
    result.operation_id.trim() === '' ||
    typeof result.state !== 'string' ||
    !FEISHU_OPERATION_STATES.has(result.state as FeishuOperationState)
  ) {
    return false
  }

  const state = result.state as FeishuOperationState
  const notice = result.notice_code
  if (
    notice !== undefined &&
    (typeof notice !== 'string' ||
      !FEISHU_NOTICE_CODES.has(notice as FeishuAuthorizationNoticeCode))
  ) {
    return false
  }
  const noticeCode = notice as FeishuAuthorizationNoticeCode | undefined
  const hasAction = result.action !== undefined
  if (hasAction && !isSafeFeishuExternalAction(result.action, result.operation_id)) return false

  if (FEISHU_TERMINAL_OPERATION_STATES.has(state)) {
    return !noticeCode && !hasAction
  }
  if (!noticeCode) {
    if (!hasAction) return true
    const action = result.action as FeishuExternalAction
    return FEISHU_ACTION_STATE_BY_PHASE[action.phase] === state
  }
  if (noticeCode === 'authorization_updated') {
    if (!hasAction) return false
    const replacement = result.action as FeishuExternalAction
    return (
      FEISHU_ACTION_STATE_BY_PHASE[replacement.phase] === state &&
      (replacement.url === undefined ||
        isOfficialFeishuActionURL(replacement.url, replacement.phase))
    )
  }
  if (state !== 'waiting_user_auth') return false
  if (noticeCode === 'authorization_rejected' || noticeCode === 'authorization_expired') {
    return (
      hasAction &&
      (result.action as FeishuExternalAction).phase === 'user_auth' &&
      isOfficialFeishuActionURL((result.action as FeishuExternalAction).url, 'user_auth')
    )
  }
  return !hasAction
}

/** Replace a server-owned authorization session. No body is accepted. */
export async function refreshFeishuAction(sessionId: string): Promise<FeishuRefreshResult> {
  const { data } = await request.post<unknown>(
    `/v1/feishu/actions/${encodeURIComponent(sessionId)}/refresh`
  )
  const result = parseFeishuRefreshResult(data)
  if (!result) {
    throw new Error('飞书操作已更新，请使用对话中的最新步骤。')
  }
  return result
}

function parseFeishuRefreshResult(value: unknown): FeishuRefreshResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => key !== 'action' && key !== 'terminal')) return null
  const hasAction = record.action !== undefined && record.action !== null
  const hasTerminal = record.terminal !== undefined && record.terminal !== null
  if (hasAction === hasTerminal) return null

  if (hasAction) {
    const action = record.action
    if (!action || typeof action !== 'object' || Array.isArray(action)) return null
    const candidate = action as Record<string, unknown>
    const operationId = typeof candidate.operation_id === 'string' ? candidate.operation_id : ''
    if (candidate.operation_id !== undefined && typeof candidate.operation_id !== 'string') return null
    if (!isSafeFeishuExternalAction(candidate, operationId) || candidate.phase === 'confirmation') return null
    return {
      action: { ...(candidate as unknown as FeishuExternalAction), operation_id: operationId }
    }
  }

  const terminal = record.terminal
  if (!terminal || typeof terminal !== 'object' || Array.isArray(terminal)) return null
  const candidate = terminal as Record<string, unknown>
  if (Object.keys(candidate).some((key) => key !== 'operation_id' && key !== 'state')) return null
  if (!(
      typeof candidate.operation_id === 'string' &&
      candidate.operation_id.trim() !== '' &&
      typeof candidate.state === 'string' &&
      ['succeeded', 'failed', 'unknown', 'cancelled'].includes(candidate.state)
  )) return null
  return { terminal: candidate as unknown as FeishuRefreshTerminal }
}

/** Remove the Numind-side workspace connection; the remote app remains owned by the user. */
export async function unbindFeishuConnection(): Promise<FeishuUnbindResult> {
  const { data } = await request.delete<FeishuUnbindResult>('/v1/feishu/connection')
  return data
}
