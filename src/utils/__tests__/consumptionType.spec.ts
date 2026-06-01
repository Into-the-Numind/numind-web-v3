import { describe, it, expect } from 'vitest'

import { consumptionTypeLabel } from '../consumptionType'

describe('consumptionTypeLabel', () => {
  it('maps SOP operations to AI 工作流', () => {
    expect(consumptionTypeLabel('sop_run')).toBe('AI 工作流')
    expect(consumptionTypeLabel('sop_chat')).toBe('AI 工作流')
  })

  it('maps chatbot + sales operations to AI 助手', () => {
    expect(consumptionTypeLabel('chatbot_chat')).toBe('AI 助手')
    expect(consumptionTypeLabel('salesrag_chat')).toBe('AI 助手')
    expect(consumptionTypeLabel('profile_analysis')).toBe('AI 助手')
    expect(consumptionTypeLabel('style_analysis')).toBe('AI 助手')
  })

  it('maps agent mode to AI 智能体', () => {
    expect(consumptionTypeLabel('agent_test')).toBe('AI 智能体')
  })

  it('maps tool operations to 其他', () => {
    expect(consumptionTypeLabel('file_parse')).toBe('其他')
    expect(consumptionTypeLabel('ocr')).toBe('其他')
  })

  it('falls back to 其他 for unknown / empty operation (no throw)', () => {
    expect(consumptionTypeLabel('some_future_op')).toBe('其他')
    expect(consumptionTypeLabel('')).toBe('其他')
  })
})
