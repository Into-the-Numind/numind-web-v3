// Skill (artifact) types — parent-account configurator UI.
// Backend source: numind-server/internal/pkg/model/skill.go
//
// agent-mode-v2-skill-as-artifact (S4 T09).
// Refs: docs/superpowers/specs/2026-05-24-agent-mode-v2-skill-as-artifact-design.md §3, §4, §5
//
// NOTE: 这里的 Skill 是「资产化技能」(v2 #1)，与 v1 agent_definition.generated_skill_body
// 内嵌的 skill body 完全不同概念。前者是 SOT 资产，后者已 deprecated（仅 dual-read 期保留）。

/** Skill 来源类型 — 与后端 ENUM 对齐 */
export type SkillSourceType =
  | 'custom'
  | 'generated'
  | 'imported_from_template'
  | 'imported_from_marketplace'

export type SkillOriginType = 'official' | 'tenant' | 'user'

/**
 * Skill 三级可见性（skill-3tier-visibility T4）— 与后端 model.Skill.Visibility ENUM 对齐。
 *   - 'official'    → 官方出品，所有机构/用户可见，仅 admin seed/import-template 创建（API 永不可设）
 *   - 'institution' → 机构级，本机构（父账户 + 其所有子账户）可见，仅父账户可创建/设置
 *   - 'sub_user'    → 个人级，仅创建者本人可见（子账户默认；父账户也可建私有技能）
 */
export type SkillVisibility = 'official' | 'institution' | 'sub_user'

/** Skill frontmatter 字段 — Markdown 顶部 YAML 块 of structured form */
export interface Frontmatter {
  name: string
  description?: string
  when_to_use?: string
  allowed_tools?: string[]
}

/** 解析 frontmatter 的结果 */
export interface ParsedFrontmatter {
  ok: boolean
  frontmatter: Frontmatter
  body: string
  error?: string
}

/** Skill 主体（对齐后端 model.Skill, json tags） */
export interface Skill {
  id: number
  parent_user_id: number
  /** 真实创建者 user id（skill-3tier-visibility T4）：父建=父 id，子建=子 id。 */
  owner_user_id: number
  name: string
  description: string
  when_to_use: string
  allowed_tools: string[]
  body_md: string
  source_type: SkillSourceType
  source_template_id: number | null
  /**
   * 三级可见性（skill-3tier-visibility T4）— 替代 origin_type 作为列表主徽章依据。
   * 'official' | 'institution' | 'sub_user'。
   */
  visibility: SkillVisibility
  /** @deprecated 仍保留为 legacy provenance，但不再用于列表主徽章（改用 visibility）。 */
  origin_type: SkillOriginType
  version: number
  is_active: boolean
  created_by: number
  created_at: string // ISO 8601
  updated_at: string

  // 列表/详情接口附加字段（join 计算，非 DB 列）
  bound_agent_count?: number
  bound_agents?: BoundAgentSummary[]

  /**
   * 当前调用者是否可编辑/删除/发布该 Skill（skill-3tier-visibility T4，后端 biz 计算的派生字段）。
   * true iff（父账户 且 visibility='institution' 且 parent_user_id==自己）或（owner_user_id==自己）。
   * 'official' 行对所有人只读（can_edit=false）。前端用此 gate 行级操作按钮。
   */
  can_edit?: boolean

  /**
   * 市场引用指针（skill-3tier-visibility T4，forward-only reference 模式）。
   * 非 0 ⇒ 此行是市场订阅的引用指针，body 非权威（运行时从 marketplace 快照读取）。
   */
  subscription_id?: number
  marketplace_id?: number
}

/** Skill 列表中显示「已装载的 Agent 简要」 */
export interface BoundAgentSummary {
  id: number
  name: string
  icon_url: string
}

/** 版本历史条目（GET /v1/skills/:id/history 返回） */
export interface SkillHistoryItem {
  id: number
  skill_id: number
  version: number
  snapshot: Skill // 后端 datatypes.JSON 序列化的完整 row
  diff_summary: string // 后端 ComputeDiffSummary 算的简短中文摘要
  created_by: number
  created_at: string
}

/** Skill 列表/详情 list response */
export interface SkillListResponse {
  list: Skill[]
  total: number
}

/** Skill 历史 list response */
export interface SkillHistoryListResponse {
  list: SkillHistoryItem[]
}

/** Skill 装载 Agent 列表 response（GET /v1/skills/:id/agents） */
export interface SkillBoundAgentsResponse {
  list: BoundAgentSummary[]
}

// ============================================================
// API Request payloads
// ============================================================

export interface CreateSkillRequest {
  name: string
  description?: string
  when_to_use?: string
  allowed_tools?: string[]
  body_md: string
  source_type?: SkillSourceType
  source_template_id?: number | null
  /**
   * 可见性（skill-3tier-visibility T4）— 仅父账户可传 'institution'；子账户后端强制 'sub_user'。
   * 'official' 故意不可从前端设置（仅 admin seed/import-template），永远不要发送。
   */
  visibility?: 'institution' | 'sub_user'
}

// PUT /v1/skills/:id 同 POST shape
export type UpdateSkillRequest = CreateSkillRequest

export interface ListSkillParams {
  page?: number
  page_size?: number
  search?: string
  sort?: string // e.g. 'updated_at_desc' | 'name_asc' | 'name_desc' | 'updated_at_asc'
}

export interface AttachSkillRequest {
  skill_id: number
  sort_order?: number
}

export interface ReorderSkillsRequest {
  skill_ids: number[]
}

// ============================================================
// API Response wrappers (delete / attach 等)
// ============================================================

/** DELETE /v1/skills/:id response — 受影响的 binding 数量 */
export interface DeleteSkillResponse {
  affected_bindings: number
}

/** POST /v1/agents/:id/skills response */
export interface AttachSkillResponse {
  binding_id: number
  agent_id: number
  skill_id: number
  sort_order: number
}

// ============================================================
// 前端常量 — 与 ADR-2 对齐
// ============================================================

/** body_md 软警告阈值（前端层只警告，不阻塞）— ADR-2 */
export const SKILL_BODY_SOFT_LIMIT = 50 * 1024 // 50KB

/** body_md 硬限制（前端层阻止保存）— ADR-2 */
export const SKILL_BODY_HARD_LIMIT = 200 * 1024 // 200KB

/** 默认排序 */
export const SKILL_SORT_DEFAULT = 'updated_at_desc'
