// Pure validation functions for the AgentForm (direct creation form).
// No DOM dependencies — directly unit-testable.
// Returns "" on pass, non-empty error message on fail.

import type { AgentFormState } from '@/types/agentBuilder'

export type ValidationResult = string

export function validateQ1(name: string): ValidationResult {
  if (!name) return '请输入助手名字'
  if (name.length < 2 || name.length > 20) return '名字应为 2-20 字'
  if (/^\d+$/.test(name)) return '名字不能全是数字'
  return ''
}

// 一句话描述（选填）：留空放行；填了仅校验上限。
export function validateQ3(description: string): ValidationResult {
  if (!description) return ''
  if (description.length > 20) return '描述最多 20 字'
  return ''
}

// 欢迎语（选填）：留空放行；填了仅校验上限。
export function validateQ4(welcome: string): ValidationResult {
  if (!welcome) return ''
  if (welcome.length > 500) return '欢迎语最多 500 字'
  return ''
}

export function validateSystemPrompt(prompt: string): ValidationResult {
  if (!prompt || prompt.trim().length === 0) return '请输入提示词（行为指引）'
  return ''
}

/**
 * Validate entire form — returns map of fieldKey → error message.
 * Empty map means everything passed.
 *
 * Field keys map to data-question attributes in AgentForm.vue
 * so parent can scroll to the first error via document.querySelector.
 *
 * 必填：name + system_prompt。description / welcome_message 为选填（留空放行）。
 */
export function validateForm(form: AgentFormState): Record<string, string> {
  const errors: Record<string, string> = {}

  const e1 = validateQ1(form.name)
  if (e1) errors.name = e1

  const e3 = validateQ3(form.description)
  if (e3) errors.description = e3

  const e4 = validateQ4(form.welcome_message)
  if (e4) errors.welcome_message = e4

  const ePrompt = validateSystemPrompt(form.system_prompt)
  if (ePrompt) errors.system_prompt = ePrompt

  return errors
}
