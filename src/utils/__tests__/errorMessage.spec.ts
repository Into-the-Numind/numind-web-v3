import { describe, it, expect } from 'vitest'

import { friendlyErrorMessage } from '../errorMessage'

describe('friendlyErrorMessage', () => {
  describe('errno code 命中', () => {
    it('Credits.Insufficient → 友好充值提示', () => {
      expect(friendlyErrorMessage('any raw text', 'Credits.Insufficient')).toBe(
        '积分不足，请前往会员中心查看额度'
      )
    })

    it('Subscription.Expired → 续费提示', () => {
      expect(friendlyErrorMessage(null, 'Subscription.Expired')).toBe(
        '订阅已过期，请前往会员中心续费'
      )
    })

    it('未知 code 不命中 ERRNO_FRIENDLY，落到 raw 透传', () => {
      expect(friendlyErrorMessage('原始文案', 'Unknown.Code')).toBe('原始文案')
    })

    it('code 是数字（后端 Response.Code 默认 1）→ 不命中映射，走关键词兜底', () => {
      expect(friendlyErrorMessage('随便一段错误', 1)).toBe('随便一段错误')
    })
  })

  describe('关键词兜底（KEYWORD_OVERRIDES）', () => {
    it('英文 sentinel "insufficient balance" → 友好积分提示', () => {
      const raw = 'credit: insufficient balance: requested 50, available 0'
      expect(friendlyErrorMessage(raw)).toBe('积分不足，请前往会员中心查看额度')
    })

    it('中文 "订阅过期" → 续费提示', () => {
      expect(friendlyErrorMessage('用户订阅已过期 5 天')).toBe('订阅已过期，请前往会员中心续费')
    })

    it('Go 调用栈泄漏标记 "node execution failed" → 通用 AI 服务文案', () => {
      const raw =
        'node execution failed: executeViaGateway: ChatStream: ContextBudgetCredits: credit: insufficient balance'
      // 这条同时匹配 "insufficient balance" 和 "node execution failed"，
      // 数组顺序首个命中 → 优先返回更具体的"积分不足"
      expect(friendlyErrorMessage(raw)).toBe('积分不足，请前往会员中心查看额度')
    })

    it('纯 ChatStream 调用栈 → 通用 AI 服务文案', () => {
      expect(friendlyErrorMessage('ChatStream: connection refused')).toBe(
        'AI 服务暂时不可用，请稍后重试'
      )
    })

    it('executeViaGateway 标记 → 通用 AI 服务文案', () => {
      expect(friendlyErrorMessage('executeViaGateway: timeout exceeded')).toBe(
        'AI 服务暂时不可用，请稍后重试'
      )
    })
  })

  describe('已经是友好文案 → 透传不误覆盖', () => {
    it('"积分不足" 不被 KEYWORD_OVERRIDES 误覆盖', () => {
      expect(friendlyErrorMessage('积分不足')).toBe('积分不足')
    })

    it('普通业务错误透传', () => {
      expect(friendlyErrorMessage('参数 sessionID 无效')).toBe('参数 sessionID 无效')
    })

    it('英文友好文案透传', () => {
      expect(friendlyErrorMessage('Session not found.')).toBe('Session not found.')
    })
  })

  describe('边界情况', () => {
    it('null 输入 → 空字符串', () => {
      expect(friendlyErrorMessage(null)).toBe('')
    })

    it('undefined 输入 → 空字符串', () => {
      expect(friendlyErrorMessage(undefined)).toBe('')
    })

    it('空字符串 → 空字符串', () => {
      expect(friendlyErrorMessage('')).toBe('')
    })

    it('全空格 → 空字符串', () => {
      expect(friendlyErrorMessage('   \n\t  ')).toBe('')
    })

    it('code 优先级高于 raw 关键词：raw 有 stack 标记但 code 命中映射', () => {
      // 这种情况理论上不应出现（后端正确填友好文案时 raw 不会含 stack），
      // 但万一发生，code 映射优先 — 这是 B+A 模式下 A 的最强防御。
      expect(
        friendlyErrorMessage(
          'node execution failed: executeViaGateway: ChatStream',
          'Credits.Insufficient'
        )
      ).toBe('积分不足，请前往会员中心查看额度')
    })
  })
})
