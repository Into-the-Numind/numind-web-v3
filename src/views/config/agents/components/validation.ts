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

export function validateQ3(description: string): ValidationResult {
  if (!description) return '请输入描述'
  if (description.length < 10 || description.length > 20) return '描述应为 10-20 字'
  return ''
}

export function validateQ4(welcome: string): ValidationResult {
  if (!welcome) return '请输入欢迎语'
  if (welcome.length < 20 || welcome.length > 500) return '欢迎语应为 20-500 字'
  return ''
}

export function validateQ5(starters: string[]): ValidationResult {
  if (starters.length > 4) return '最多 4 个快速开始按钮'
  for (const s of starters) {
    if (s.length < 5 || s.length > 50) return '每条快速开始按钮应为 5-50 字'
  }
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
 */
export function validateForm(form: AgentFormState): Record<string, string> {
  const errors: Record<string, string> = {}

  const e1 = validateQ1(form.name)
  if (e1) errors.name = e1

  const e3 = validateQ3(form.description)
  if (e3) errors.description = e3

  const e4 = validateQ4(form.welcome_message)
  if (e4) errors.welcome_message = e4

  const e5 = validateQ5(form.starters)
  if (e5) errors.starters = e5

  const ePrompt = validateSystemPrompt(form.system_prompt)
  if (ePrompt) errors.system_prompt = ePrompt

  return errors
}
