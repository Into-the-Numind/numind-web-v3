/**
 * 积分消耗记录「类型」列：机读 operation → 产品化类型标签。
 *
 * 映射（2026-06-01 产品 owner 确认）：
 *   - AI 工作流  = SOP（sop_run / sop_chat）
 *   - AI 助手    = chatbot（chatbot_chat）+ 销售助手（salesrag_chat / profile_analysis / style_analysis）
 *   - AI 智能体  = agent mode（agent_test）
 *   - 其他       = 工具类操作（file_parse / ocr）及未知 operation
 *
 * 与后端 internal/numind/biz/credit/consumption_log.go 的 operationLabels 一一对应（9 种）。
 * 未知 operation 兜底「其他」，不报错。
 */
const TYPE_LABELS: Record<string, string> = {
  sop_run: 'AI 工作流',
  sop_chat: 'AI 工作流',
  chatbot_chat: 'AI 助手',
  salesrag_chat: 'AI 助手',
  profile_analysis: 'AI 助手',
  style_analysis: 'AI 助手',
  agent_test: 'AI 智能体',
  file_parse: '其他',
  ocr: '其他',
}

/** consumptionTypeLabel 返回 operation 的产品化类型标签；未知 operation 回退「其他」。 */
export function consumptionTypeLabel(action: string): string {
  return TYPE_LABELS[action] ?? '其他'
}
