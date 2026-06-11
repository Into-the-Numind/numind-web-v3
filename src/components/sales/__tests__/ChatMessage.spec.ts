/**
 * ChatMessage 思考自动折叠回归测试（销售对话；与 chatbot 同一 ThinkingBlock 模式）。
 *
 * 需求：
 *   (a) 流式生成思考中：思考展开
 *   (b) 正文一旦开始：自动折叠思考
 *   (c) 历史/已完成消息：思考保持折叠
 *
 * Bug：ChatMessage（和 ChatbotChat）渲染 ThinkingBlock 时没传 `auto-collapse`，
 * 故 ThinkingBlock 的折叠逻辑（autoCollapse && finished）永不触发 → 思考从不折叠。
 * thinkingFinished 信号本身正确（正文一出现即 true）。修复 = 把 auto-collapse 接上。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChatMessage from '../ChatMessage.vue'
import type { SalesMessage } from '@/api/sales'

describe('ChatMessage — thinking 自动折叠', () => {
  it('(a) 流式中只有思考、无正文 → 思考展开', () => {
    const w = mount(ChatMessage, {
      props: { streaming: true, streamThinkingContent: '推理过程', streamContent: '' }
    })
    expect(w.find('.thinking-container').exists()).toBe(true)
    expect(w.find('.thinking-container').classes()).not.toContain('collapsed')
  })

  it('(b) 流式中正文开始 → 思考自动折叠（回归：chatbot/sales 此前从不折叠）', async () => {
    const w = mount(ChatMessage, {
      props: { streaming: true, streamThinkingContent: '推理过程', streamContent: '' }
    })
    expect(w.find('.thinking-container').classes()).not.toContain('collapsed')
    await w.setProps({ streamContent: '正文开始' })
    expect(w.find('.thinking-container').classes()).toContain('collapsed')
  })

  it('(c) 历史助手消息（含 thinking）→ 思考默认折叠', () => {
    const message: SalesMessage = {
      id: 1,
      role: 'assistant',
      content: '答案',
      createdAt: '2026-06-11T00:00:00Z',
      thinking: '推理过程'
    }
    // 不传 sessionId（默认 0）→ onMounted 跳过 getFeedback，无需 mock API
    const w = mount(ChatMessage, { props: { message } })
    expect(w.find('.thinking-container').exists()).toBe(true)
    expect(w.find('.thinking-container').classes()).toContain('collapsed')
  })
})
