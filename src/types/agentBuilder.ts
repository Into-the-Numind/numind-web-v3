// Agent (Skill) types — parent-account configurator UI.
// Originally lived in numind-admin-web/src/types/agent.ts but relocated here
// in feature agent-mode-configurator-relocate (2026-05-22).
//
// Backend source: numind-server/internal/pkg/model/agent_definition.go
//
// Student-facing types are in src/types/agent.ts (do NOT confuse — that file
// is for the consumer view, this file is for the configurator view).

// ============================================================
// Questionnaire — 与 backend QuestionnaireAnswers Go struct 对齐
// (numind-server/internal/numind/biz/skill/questionnaire.go)
// ============================================================

/** Q6 任务类型 — 5 个内置 code + 自由文本（其他选项） */
export type Q6TaskType =
  | 'analyze_data'
  | 'generate_content'
  | 'answer_questions'
  | 'make_plan'
  | 'grade_assignment'

/** Q7 材料类型 */
export type Q7MaterialType = 'text' | 'csv' | 'image' | 'none'

/** Q9 网络搜索 */
export type Q9WebSearch = 'no_web_search' | 'allow_search'

/** Q12 说话风格 */
export type Q12Style = 'friendly' | 'professional' | 'encouraging'

/**
 * 12 题问卷答案（Q1-Q5 存在 AgentDefinition 直接字段；这里仅 Q6-Q12）。
 * 全 optional — 兼容旧 history snapshot；后端 Build() 在保存时校验 q6/q7/q12 非空。
 *
 * 后端 omitempty 序列化可能让历史快照字段为空；q9/q12 union 不允许 ""，
 * 用 normalizeQuestionnaire() 在 store 层把无效值统一为 undefined。
 */
export interface QuestionnaireAnswers {
  q6?: (Q6TaskType | string)[] // 多选 + 自由文本透传
  q7?: Q7MaterialType[] // 多选
  q8?: number // 200-2000；0 视为 default 800
  q9?: Q9WebSearch
  q10?: string
  q11?: string
  q12?: Q12Style
}

/**
 * Store 层 normalize helper — 后端 omitempty 可能返回 "" / null / undefined，
 * 全部统一为 undefined，避免 union type 运行时不一致。
 */
export function normalizeQuestionnaire(
  q: Partial<QuestionnaireAnswers> | null | undefined
): QuestionnaireAnswers {
  const out: QuestionnaireAnswers = {}
  if (!q) return out
  if (Array.isArray(q.q6) && q.q6.length > 0) out.q6 = q.q6
  if (Array.isArray(q.q7) && q.q7.length > 0) out.q7 = q.q7 as Q7MaterialType[]
  if (typeof q.q8 === 'number' && q.q8 > 0) out.q8 = q.q8
  if (q.q9 === 'no_web_search' || q.q9 === 'allow_search') out.q9 = q.q9
  if (typeof q.q10 === 'string' && q.q10 !== '') out.q10 = q.q10
  if (typeof q.q11 === 'string' && q.q11 !== '') out.q11 = q.q11
  if (q.q12 === 'friendly' || q.q12 === 'professional' || q.q12 === 'encouraging') {
    out.q12 = q.q12
  }
  return out
}

// ============================================================
// Tool flags — 3 个已知 boolean key + extensible map（高级模式 UI 用）
// ============================================================

export interface ToolFlags {
  code_sandbox?: boolean
  media?: boolean
  dangerous?: boolean
  [k: string]: boolean | undefined
}

// ============================================================
// AgentDefinition — 对齐后端 model.AgentDefinition (json tags)
// ============================================================

export interface Agent {
  id: number
  parent_user_id: number
  name: string
  description: string
  icon_url: string // 可能是 URL / "lucide:Bot" / "data:image/png;base64,..."
  welcome_message: string
  system_prompt?: string // 行为指引/提示词（最长 65536 字符，与后端 SystemPromptMaxLen 对齐）
  starters: string[] // 后端 datatypes.JSON 序列化后 = array
  questionnaire_answers: QuestionnaireAnswers
  generated_skill_body: string
  advanced_mode: boolean
  custom_skill_body: string
  tool_flags: ToolFlags
  daily_credit_cap: number | null
  version: number
  is_active: boolean
  source_template_id: number | null
  created_by: number
  created_at: string // ISO 8601
  updated_at: string
}

// ============================================================
// API Request payloads
// ============================================================

export interface CreateAgentPayload {
  name: string
  description?: string
  icon_url?: string
  welcome_message?: string
  system_prompt?: string
  starters?: string[]
  tool_flags?: ToolFlags
  daily_credit_cap?: number | null
  source_template_id?: number | null
}

// PATCH payload — 所有 optional；advanced_mode / parent_user_id 不可改
export type PatchAgentPayload = Partial<Omit<CreateAgentPayload, 'source_template_id'>> & {
  is_active?: boolean
}

// ============================================================
// AgentFormState — Builder 表单内部 state shape
// ============================================================

export interface AgentFormState {
  // 顶层字段
  name: string
  icon_url: string
  description: string
  welcome_message: string
  system_prompt: string
  starters: string[]
  // tool_flags + cap 隐藏字段（v1 通过模板预设或保持默认）
  tool_flags: ToolFlags
  daily_credit_cap: number | null
  is_active: boolean
}

/**
 * 初始化空表单 state（仅 NEW-create 路径调用；
 * Edit / template / copy 模式不调此函数，从后端 / 模板拷贝填充）。
 */
export function initialFormState(): AgentFormState {
  return {
    name: '',
    icon_url: 'lucide:Bot',
    description: '',
    welcome_message: '',
    system_prompt: '',
    starters: [],
    tool_flags: {
      code_sandbox: true,
      media: true,
      dangerous: true
    },
    daily_credit_cap: null,
    is_active: true
  }
}

// ============================================================
// API Response wrapper
// ============================================================

export interface ListResponse<T> {
  list: T[]
  total: number
}
