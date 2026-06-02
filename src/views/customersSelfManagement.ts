/**
 * 判断「管理模板权限」弹窗的目标行是否是当前登录的父账户自己。
 *
 * 背景：客户管理列表会把父账户自己也列出来（self pinned 置顶），但父账户对所有
 * 功能都是 bypass —— 无需任何授权记录即可使用全部模板/智能体/销售智能体。后端三个
 * 读接口（模板/功能/chatbot）都先过 GetSubUser 归属校验，而父账户自己的
 * parent_user_id 为 NULL，校验必然失败，被前端 .catch 吞成空列表 —— 这就是「管理
 * 自己时所有模块都没打勾」的根因。识别出 self 后，弹窗应直接只读全勾显示「全部可
 * 用」，不再去调那三个会报错的接口。
 *
 * id 在前后端有 number / string 两种形态，统一转 string 比较。
 */
// TODO(parent-self-permission-display): 当前为占位实现，等价于现状——从不识别 self，
// 弹窗对父账户自己走与子账户相同的逻辑（拉取失败 → 空）。下个 commit 实现真正比较。
export function isSelfRow(
  _target: { id?: number | string; user_id?: number | string } | null | undefined,
  _currentUserId: number | string | null | undefined
): boolean {
  return false
}
