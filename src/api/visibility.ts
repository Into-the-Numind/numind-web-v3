import request from './request'
import type { ApiResponse } from './request'

/**
 * 前端共享类型: 可见范围 v-model 值 (VisibilityScopeCard / 编辑页 store).
 *
 * 注意字段命名差异:
 *   - 后端 API JSON: snake_case (restricted, sub_user_ids) — 见 VisibilityState / VisibilityUpdatePayload
 *   - 前端组件 prop: camelCase (restricted, subUserIDs) — 见 VisibilityValue
 *
 * 编辑页 store 在 load 时做 snake → camel 映射, save 时做 camel → snake 映射.
 */
export interface VisibilityValue {
  restricted: boolean
  subUserIDs: number[]
}

/**
 * SOP / 智能体可见范围权限 API 层（sop-chatbot-visibility-scope）。
 *
 * 两层 gate 串行 (后端 spec §4.2):
 *   - 可见范围 (本 API): 父账户配置哪些子用户能看到该实体, 未在白名单的子用户连入口都看不到
 *   - 运行权限 (既有 child-run-permission): 在前者基础上再决定能否运行
 *
 * 配置入口: SOP/chatbot 编辑页内联. 仅父账户可调.
 */

/**
 * 可见范围当前状态 (GET 响应 / 编辑页加载用).
 *
 * D3 保留语义: restricted=false 时 sub_user_ids 仍可能非空, 是 "上次关闭前的历史名单",
 * 前端用于 "上次已配置 N 位" 提示, 重新打开开关时可一键恢复.
 */
export interface VisibilityState {
  restricted: boolean
  sub_user_ids: number[]
}

/**
 * PUT 请求体. 当 restricted=false 时 sub_user_ids 字段被后端忽略 (D3 保留语义,
 * 不动 grant 表). 当 restricted=true 时 sub_user_ids 必填 (空数组表示严格全拒).
 */
export interface VisibilityUpdatePayload {
  restricted: boolean
  sub_user_ids?: number[]
}

// ============================================================
// SOP visibility
// ============================================================

/** GET /v1/sop/templates/:id/visibility — 读取 SOP 可见范围配置（仅父账户）。 */
export const getSopVisibility = (id: number): Promise<ApiResponse<VisibilityState>> => {
  return request.get(`/v1/sop/templates/${id}/visibility`)
}

/**
 * PUT /v1/sop/templates/:id/visibility — 更新 SOP 可见范围配置（仅父账户）。
 *
 * 错误码（透传后端）:
 *   - 404 ResourceNotFound.SopTemplateNotFound: SOP 不存在
 *   - 403 FailedOperation.EntityNotOwnedByCaller: SOP 不属于 caller
 *   - 403 FailedOperation.VisibilityPermissionDenied: 子账户调用
 *   - 422 InvalidParameter.CrossParentSubUser: 提交了不属于 caller 的子用户 ID
 *   - 422 InvalidParameter.SubUserNotFound: 子用户 ID 不存在
 */
export const putSopVisibility = (
  id: number,
  body: VisibilityUpdatePayload
): Promise<ApiResponse<null>> => {
  return request.put(`/v1/sop/templates/${id}/visibility`, body)
}

// ============================================================
// Chatbot visibility
// ============================================================

/** GET /v1/chatbot/:id/visibility — 读取智能体可见范围配置（仅父账户）。 */
export const getChatbotVisibility = (id: number): Promise<ApiResponse<VisibilityState>> => {
  return request.get(`/v1/chatbot/${id}/visibility`)
}

/**
 * PUT /v1/chatbot/:id/visibility — 更新智能体可见范围配置（仅父账户）。
 *
 * 错误码透传（结构同 putSopVisibility, 仅 404 改为 ResourceNotFound.ChatbotNotFound）。
 */
export const putChatbotVisibility = (
  id: number,
  body: VisibilityUpdatePayload
): Promise<ApiResponse<null>> => {
  return request.put(`/v1/chatbot/${id}/visibility`, body)
}
