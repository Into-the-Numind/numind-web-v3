/**
 * 友好错误文案映射 — B+A 双保险的 A 兜底层。
 *
 * 后端 controller boundary 已通过 errtranslate.FriendlyForSSE 把 Go 错误链
 * 转成 errno 友好文案（见 numind-server/internal/numind/biz/errtranslate）。
 * 本工具作为前端兜底防御：万一后端某条路径漏了转换、或第三方代理篡改了
 * response body，前端关键词匹配仍能挡住裸 Go error / Go 调用栈进入 UI。
 *
 * 调用方：
 *  - axios response interceptor (src/api/request.ts)
 *  - SSE event:error handler (src/views/sop/composables/useSSEStream.ts)
 *  - fetchSSE 错误 (src/api/sales.ts)
 */

/**
 * errno code (string) → 友好文案映射。
 * Code 取自 numind-server/internal/pkg/errno/credits.go 的 Errno.Code 字段。
 *
 * 注意：后端 Response struct 的 code 字段当前总是整数 1 (错误标志)，errno
 * 的 string code 不在 body 中。当且仅当后端将来扩展 body 暴露 errno.Code
 * 时，这个映射才会命中。当前主要靠 KEYWORD_OVERRIDES 兜底。
 */
const ERRNO_FRIENDLY: Record<string, string> = {
  'Credits.Insufficient': '积分不足，请前往会员中心查看额度',
  'Subscription.Expired': '订阅已过期，请前往会员中心续费',
  'Membership.Required': '需要会员资格才能使用此功能',
  'Booster.LegacyTierNotAllowed': '老会员制暂不支持加量包，到期升级后可购'
}

/**
 * 关键词覆盖规则（按顺序匹配，首个命中即返回）。
 *
 * 第一组：sentinel error 关键词 — 后端 sentinel 的 .Error() 文本，作为
 * 后端漏转的兜底覆盖。
 *
 * 第二组：Go 调用栈泄漏标记 — fmt.Errorf 链式包装产生的特征短语。出现这些
 * 关键词意味着后端漏了 errtranslate 调用，UI 不应展示。
 */
const KEYWORD_OVERRIDES: Array<[RegExp, string]> = [
  [/insufficient\s+balance|credit:\s*insufficient/i, '积分不足，请前往会员中心查看额度'],
  [/subscription\s+expired|订阅.*过期/i, '订阅已过期，请前往会员中心续费'],
  [
    /node\s+execution\s+failed|executeViaGateway|ChatStream:|ContextBudgetCredits/i,
    'AI 服务暂时不可用，请稍后重试'
  ]
]

/**
 * 给定原始错误文案 + 可选 errno code，返回用户友好文案。
 *
 * 优先级：
 *   1. errno code 命中 ERRNO_FRIENDLY → 返回映射文案
 *   2. raw 关键词命中 KEYWORD_OVERRIDES → 返回兜底文案
 *   3. 默认 → 透传 raw（假设后端已经写了友好文案）
 *
 * 永远不抛错。空输入返回空字符串。
 */
export const friendlyErrorMessage = (
  raw: string | undefined | null,
  code?: string | number | null
): string => {
  if (typeof code === 'string' && ERRNO_FRIENDLY[code]) {
    return ERRNO_FRIENDLY[code]
  }
  const text = String(raw || '').trim()
  if (!text) return ''
  for (const [pattern, friendly] of KEYWORD_OVERRIDES) {
    if (pattern.test(text)) return friendly
  }
  return text
}
