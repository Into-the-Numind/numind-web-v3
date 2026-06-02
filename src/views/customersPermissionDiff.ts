/**
 * 客户管理「管理模板权限」弹窗的授权差异计算。
 *
 * 给定「当前勾选状态」(current) 与「原始已授权集合」(original)，算出本次保存
 * 需要 grant / revoke 的 key 列表。模板、智能体(chatbot)、功能(sales_agent) 三类
 * 共用同一套语义：current 是 Record<string, boolean>，约定「勾选」= 值为真。
 *
 * ⚠️ 历史 bug (sales-agent-uncheck-grant)：grant 判断曾经只看 `Object.keys`
 * 是否存在该 key，而没有看它的值。当用户「全选 → 再取消销售智能体」时，
 * `featurePermissions['sales_agent']` 残留为 `false`（key 还在），于是被误判为
 * 「新增授权」反向打开。修复后 grant 必须看值。详见同名测试。
 */
export function diffSelection(
  current: Record<string, boolean>,
  original: Set<string>
): { toGrant: string[]; toRevoke: string[] } {
  const toGrant: string[] = []
  const toRevoke: string[] = []
  Object.keys(current).forEach((key) => {
    if (!original.has(key)) toGrant.push(key)
  })
  original.forEach((key) => {
    if (!current[key]) toRevoke.push(key)
  })
  return { toGrant, toRevoke }
}
