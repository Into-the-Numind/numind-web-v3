// API wrappers for /v1/skills/* + /v1/agents/:id/skills/* (11 endpoints, user_token).
// Backend: numind-server feature agent-mode-v2-skill-as-artifact (v2 #1).
//
// skill-3tier-visibility T4: 子账户不再被后端 403 拦截 —— 子账户可创建/编辑/删除自己的
// 个人级（visibility='sub_user'）技能。列表接口返回三级可见性过滤后的行 + can_edit 派生字段。
//
// createSkill / updateSkill 的 payload 透传 visibility（CreateSkillRequest.visibility）：
// 仅父账户可传 'institution'；子账户后端强制 'sub_user'；'official' 前端永不发送。
//
// 不要与 src/api/agentBuilder.ts 的 /v1/agent/skills/* 混淆（那是 v1 #5 路径，
// 操作 agent_definition；本文件操作的是 v2 #1 独立 Skill 资产表）。
//
// Refs: docs/superpowers/specs/2026-05-24-agent-mode-v2-skill-as-artifact-design.md §4
//
// Implementation note: web-v3 axios `request` instance has a response interceptor
// that unwraps `{code, message, data}` and returns the body. TypeScript still
// sees axios's `AxiosResponse<T>` type, so we cast through `as unknown as { data }`
// to bridge the gap. This matches the established pattern in src/api/agentBuilder.ts.

import request from './request'
import type {
  Skill,
  SkillListResponse,
  CreateSkillRequest,
  UpdateSkillRequest,
  ListSkillParams,
  AttachSkillRequest,
  AttachSkillResponse,
  ReorderSkillsRequest,
  DeleteSkillResponse
} from '@/types/skill'

// 1. POST /v1/skills — 创建 Skill
export const createSkill = async (payload: CreateSkillRequest): Promise<Skill> => {
  const res = await request.post('/v1/skills', payload)
  return (res as unknown as { data: Skill }).data
}

// 2. GET /v1/skills — 列表（分页 + 搜索 + 排序）
export const listSkills = async (params: ListSkillParams = {}): Promise<SkillListResponse> => {
  const res = await request.get('/v1/skills', { params })
  return (res as unknown as { data: SkillListResponse }).data
}

// 3. GET /v1/skills/:id — 详情
//
// 后端返回 shape (controller skill_artifact.go:163):
//   { code, message, data: { skill: {...}, bound_agents: [...] } }
//
// 这里只 return skill 主体，避免 store.current 被写成 {skill, bound_agents}
// 这种包装对象，导致编辑器读取字段时拿不到真实 Skill。
export const getSkill = async (id: number): Promise<Skill> => {
  const res = await request.get(`/v1/skills/${id}`)
  return (res as unknown as { data: { skill: Skill; bound_agents: unknown[] } }).data.skill
}

// 4. PUT /v1/skills/:id — 全量更新（version 自增）
export const updateSkill = async (id: number, payload: UpdateSkillRequest): Promise<Skill> => {
  const res = await request.put(`/v1/skills/${id}`, payload)
  return (res as unknown as { data: Skill }).data
}

// 5. DELETE /v1/skills/:id — 软删 + 级联卸载 binding
export const deleteSkill = async (id: number): Promise<DeleteSkillResponse> => {
  const res = await request.delete(`/v1/skills/${id}`)
  return (res as unknown as { data: DeleteSkillResponse }).data
}

// 9. POST /v1/agents/:id/skills — 装载 Skill 到 Agent
export const attachSkillToAgent = async (
  agentId: number,
  payload: AttachSkillRequest
): Promise<AttachSkillResponse> => {
  const res = await request.post(`/v1/agents/${agentId}/skills`, payload)
  return (res as unknown as { data: AttachSkillResponse }).data
}

// 10. DELETE /v1/agents/:id/skills/:skill_id — 卸载 Skill
export const detachSkillFromAgent = async (agentId: number, skillId: number): Promise<void> => {
  await request.delete(`/v1/agents/${agentId}/skills/${skillId}`)
}

// 11. PUT /v1/agents/:id/skills/reorder — 重排装载顺序
export const reorderAgentSkills = async (
  agentId: number,
  payload: ReorderSkillsRequest
): Promise<void> => {
  await request.put(`/v1/agents/${agentId}/skills/reorder`, payload)
}

// ============================================================
// 辅助：根据 agent_id 列出已装载的 Skill 列表
// 注：后端 §4.2 未单独定义 GET /v1/agents/:id/skills，统一通过 getAgent + bound_skills 字段
// 拉。这里保留 helper signature 给 SkillBindingPanel 使用，可选实现路径：
//   选项 A: GET /v1/agents/:id 返回的 agent 中带 bound_skills
//   选项 B: 后端可单独提供 GET /v1/agents/:id/skills（如果存在）
// 当前实现按选项 B 调用；如果 404 由 caller 切换到选项 A。
// ============================================================
export const listAgentSkills = async (agentId: number): Promise<{ list: Skill[] }> => {
  const res = await request.get(`/v1/agents/${agentId}/skills`)
  return (res as unknown as { data: { list: Skill[] } }).data
}

// 12. POST /v1/skills/import-template — 从官方模板一键克隆技能
export const importSkillTemplate = async (templateId: number): Promise<Skill> => {
  const res = await request.post('/v1/skills/import-template', { template_id: templateId })
  return (res as unknown as { data: Skill }).data
}

// 13. GET /v1/agent/skill-templates — 获取官方技能模板列表
export const listSkillTemplates = async (): Promise<{ list: any[]; total: number }> => {
  const res = await request.get('/v1/agent/skill-templates')
  return (res as unknown as { data: { list: any[]; total: number } }).data
}
