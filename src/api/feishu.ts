/**
 * feishu.ts — HTTP client for the 飞书 (Lark) 账号连接 endpoints
 * (feishu-integration T11).
 *
 * Contract: numind-server design.md §5（端点契约）+ §10（前端契约）。形状严格
 * 对齐后端 biz/feishu DTO（StatusResult / ConnectResult，service.go）的 JSON 标签。
 *
 * All HTTP goes through the shared axios instance (src/api/request.ts) —
 * NEVER import axios directly here (.claude/rules/frontend-state.md §2).
 *
 * request 响应拦截器在 code 0/200 时直接返回 envelope 对象本身
 * （{code,message,data}），不是 AxiosResponse；业务载荷在该 envelope 的 `.data`
 * 字段下。故各 wrapper 取 (res as any)?.data —— 用可选链兜底拦截器 HTML-fallback
 * 路径返回 undefined 的情况（对齐 announcements.ts / sales.ts）。
 */

import request from './request'

// ==================== Types ====================

/** 连接状态枚举（后端 StatusResult.status）。 */
export type FeishuConnectionStatus = 'none' | 'active' | 'expired'

/** 连接下一步枚举（后端 ConnectResult.next_step）。 */
export type FeishuNextStep = 'create_app' | 'authorize'

/**
 * GET /v1/feishu/status 响应。
 * - connected: 是否已连接（active 时为 true）。
 * - status: none（未连）/ active（已连）/ expired（已过期需重连）。
 * - scopes: 已授权 scope 列表（未连时为空/可能为 null，调用方需兜底）。
 * - app_id: 已建飞书自建应用 ID（未连时为空串）。
 */
export interface FeishuStatus {
  connected: boolean
  status: FeishuConnectionStatus
  scopes: string[]
  app_id: string
}

/**
 * POST /v1/feishu/connect 响应。
 * - next_step: create_app（需先建应用）/ authorize（直接授权）。
 * - url: 建应用页 URL（device-code）或飞书授权 URL。
 * - state: 签名后的 OAuth state（create_app 时为空串）。
 */
export interface FeishuConnectResult {
  next_step: FeishuNextStep
  url: string
  state: string
}

// ==================== API Functions ====================

/**
 * POST /v1/feishu/connect — 发起连接。req 空（userID 从 token）。
 * 返回当前需要的下一步（建应用 URL 或授权 URL）+ state。
 */
export const connectFeishu = async (): Promise<FeishuConnectResult> => {
  const res = await request.post('/v1/feishu/connect')
  return (res as any)?.data as FeishuConnectResult
}

/** GET /v1/feishu/status — 连接状态（未连/已连/过期 + scopes）。 */
export const getFeishuStatus = async (): Promise<FeishuStatus> => {
  const res = await request.get('/v1/feishu/status')
  return (res as any)?.data as FeishuStatus
}

/**
 * DELETE /v1/feishu/connection — 解绑（删 token 行；飞书侧 app 保留）。
 * 后端 resp data 为 null；本 wrapper 不返回值。
 */
export const disconnectFeishu = async (): Promise<void> => {
  await request.delete('/v1/feishu/connection')
}
