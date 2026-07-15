/**
 * Personal Feishu workspace lifecycle client.
 *
 * This module mirrors only the public HTTP contract. User identity, CLI argv,
 * requested scopes, provider routing and credential material remain server
 * owned and must never be accepted or retained by the browser.
 */
import request from './request'

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
  /** Resume responses never carry a live URL. */
  action?: Omit<FeishuExternalAction, 'url'>
}

export type FeishuResumeAction = 'user_completed' | 'confirmed' | 'cancelled'

export interface FeishuUnbindResult {
  state: FeishuConnectionState
  connected: boolean
  message: string
}

/** Start only the user-initiated manual connection flow. */
export async function connectFeishu(): Promise<FeishuConnectResult> {
  const { data } = await request.post<FeishuConnectResult>('/v1/feishu/connect', {
    intent: 'manual'
  })
  return data
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
  action: FeishuResumeAction = 'user_completed'
): Promise<FeishuOperationResult> {
  const { data } = await request.post<FeishuOperationResult>(
    `/v1/feishu/operations/${encodeURIComponent(operationId)}/resume`,
    { action }
  )
  return data
}

/** Replace a server-owned authorization session. No body is accepted. */
export async function refreshFeishuAction(sessionId: string): Promise<FeishuExternalAction> {
  const { data } = await request.post<FeishuExternalAction>(
    `/v1/feishu/actions/${encodeURIComponent(sessionId)}/refresh`
  )
  return data
}

/** Remove the Numind-side workspace connection; the remote app remains owned by the user. */
export async function unbindFeishuConnection(): Promise<FeishuUnbindResult> {
  const { data } = await request.delete<FeishuUnbindResult>('/v1/feishu/connection')
  return data
}
