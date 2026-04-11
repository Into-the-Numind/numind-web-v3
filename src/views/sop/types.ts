/**
 * SOP 运行页 TypeScript 类型定义
 *
 * 与后端 dto 包字段一一对应：
 *   - SopTemplatePublic ← internal/pkg/model/dto/sop.go SopTemplatePublicDTO
 *   - SopNodePublic     ← internal/pkg/model/dto/sop.go SopNodePublicDTO
 *
 * 实现注意：
 *   - SopRunStatus 包含 'draft' —— 后端有独立的 SopStatusDraft 常量
 *     （model/sop.go:206），不是 pending+counted=false 组合
 *   - SopNodeRun 的 input/output/thinking 是 string | null（GORM longtext 可空）
 *   - 任何 C 端接口拿到的 SopNode 不应包含 api_key/base_url/model_name/
 *     timeout_seconds/prompt 字段（后端 SopNodePublicDTO 已隐藏）
 *
 * 详见 spec §3.3
 */

/**
 * SOP Run 的状态机。
 *
 * - 'draft':     B 端创建后但未执行任何节点（user.Counted=false 且 status='draft'）
 * - 'pending':   已转出 draft 但未执行（暂不常用）
 * - 'running':   节点正在执行
 * - 'succeeded': 全部节点成功完成
 * - 'failed':    至少一个节点失败
 *
 * Beacon 清理只针对 status === 'draft' 的 run（DeleteDraftRun 严格检查）。
 */
export type SopRunStatus = 'draft' | 'pending' | 'running' | 'succeeded' | 'failed'

/**
 * SOP 模板状态（active / inactive）
 */
export type SopTemplateStatus = 'active' | 'inactive'

/**
 * SOP 模板发布状态（仅 B 端创建的模板使用）
 */
export type SopTemplatePublishStatus = 'draft' | 'published' | 'offline'

/**
 * SOP 节点状态（active / inactive）
 */
export type SopNodeStatus = 'active' | 'inactive'

/**
 * 后端 GET /v1/sop/templates/:id/nodes 返回的 template 对象。
 *
 * 对应后端 SopTemplatePublicDTO（隐藏 prompt 和 creator_user_id）。
 */
export interface SopTemplatePublic {
  id: number
  name: string
  description: string
  status: SopTemplateStatus
  publish_status: SopTemplatePublishStatus
  trailing_chat_enabled: boolean
  created_at: string
  updated_at: string
}

/**
 * 后端 GET /v1/sop/templates/:id/nodes 返回的 nodes 数组元素。
 *
 * 对应后端 SopNodePublicDTO（隐藏 5 个敏感字段：api_key/base_url/model_name/
 * timeout_seconds/prompt）。
 *
 * description 可能为空字符串（templateId=1, 2 的老节点 description 为 NULL，
 * 后端转换为 ""）。前端必须优雅退化（不渲染描述行，不显示 "undefined"）。
 */
export interface SopNodePublic {
  id: number
  template_id: number
  name: string
  description: string
  sort: number
  status: SopNodeStatus
  created_at: string
  updated_at: string
}

/**
 * GET /v1/sop/templates/:id/nodes 完整响应结构
 */
export interface SopTemplateNodesResponse {
  template: SopTemplatePublic
  nodes: SopNodePublic[]
  total: number
}

/**
 * SOP Run 实例。
 *
 * 对应后端 model.SopRun。
 *
 * conversation_id 在前端用于 trailing chat 调用，不需要从 SSE 流提取
 * （task 1 调研确认：后端通过 GetRun 返回此字段）。
 */
export interface SopRun {
  id: number
  template_id: number
  user_id: number
  status: SopRunStatus
  conversation_id: string
  counted: boolean
  started_at: string | null
  finished_at: string | null
  /** 节点执行错误信息（空字符串表示无错误，对应后端 model.SopRun.ErrorMessage） */
  error_message: string
  /** 最终生成的 Note ID（对应后端 *uint，可空） */
  final_note_id: number | null
  created_at: string
  updated_at: string
}

/**
 * SOP 节点单次执行记录。
 *
 * 对应后端 model.SopNodeRun。
 *
 * 注意 input/output/thinking 在后端是 Go string（序列化为 "" 而非 null），
 * 但前端代码仍应防御性写 `thinking || ''` 处理可能的不一致。
 */
export interface SopNodeRun {
  id: number
  run_id: number
  node_id: number
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  input: string
  output: string
  thinking: string
  latency_ms: number
  /**
   * 执行使用的模型名（F1 新增，对应后端 SopNodeRun.ModelName）。
   *
   * 空字符串表示字段缺失或老数据，前端 MetaFooter 应整段不渲染。
   */
  model_name?: string
  /**
   * 总 token 数（F1 新增，对应后端 SopNodeRun.TotalTokens，
   * 在 /runs/:id/status 响应的 completed_nodes[] 里透出）。
   */
  total_tokens?: number
  /**
   * 节点是否可访问。
   *
   * 注意：这不是 model.SopNodeRun 的字段，是 biz 层 CompletedNodeInfo 的扩展字段，
   * 仅在某些 SSE execute 事件响应或独立 status 端点中返回。
   * GetRunDetail API 不会返回此字段，所以标为 optional。
   */
  is_accessible?: boolean
  started_at: string | null
  finished_at: string | null
}

/**
 * GET /v1/sop/templates/executed 返回的元素结构（历史记录列表）
 *
 * 字段为 backend response 的子集，便于 HistoryModal 渲染。
 */
export interface ExecutedTemplate {
  run_id: number
  template_id: number
  template_name: string
  status: SopRunStatus
  completed_node_count: number
  total_node_count: number
  created_at: string
}

/**
 * 书签项（GET /v1/sop/templates/:id/bookmarks 元素）
 */
export interface BookmarkItem {
  id: number
  template_id: number
  node_id: number
  content: string
  created_at: string
}

/**
 * Chat 消息元信息（F2 新增，对应 spec §3.5）
 *
 * 用于 MetaFooter 组件（F6）在 trailing chat assistant 气泡下展示
 * 模型名 + 耗时 + token 用量。
 *
 * 字段来源：后端 `sop_chat_message` 表 B5 task 补齐的 model_name / duration_ms，
 * 再加上已有的 prompt/completion/total tokens + created_at。
 */
export interface SopChatMessageMeta {
  model_name: string
  duration_ms: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  created_at: string
}

/**
 * SSE 流中的聊天消息（trailing chat）
 */
export interface ChatMessage {
  id: number | string // 服务器消息用 number ID，临时消息用 tempId() 字符串
  role: 'user' | 'assistant'
  content: string
  thinking?: string
  conversation_id?: string
  created_at?: string
}
