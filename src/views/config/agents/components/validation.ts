// Pure validation functions for AgentBuilder 12-question form.
// No DOM dependencies — directly unit-testable.
// Returns "" on pass, non-empty error message on fail.
// Spec ref: S2 §7 (with P1-6 fix for Q8 NaN handling).

import type { AgentFormState, QuestionnaireAnswers } from "@/types/agentBuilder";

export type ValidationResult = string;

export function validateQ1(name: string): ValidationResult {
  if (!name) return "请输入助手名字";
  if (name.length < 2 || name.length > 20) return "名字应为 2-20 字";
  if (/^\d+$/.test(name)) return "名字不能全是数字";
  return "";
}

export function validateQ3(description: string): ValidationResult {
  if (!description) return "请输入描述";
  if (description.length < 10 || description.length > 100)
    return "描述应为 10-100 字";
  return "";
}

export function validateQ4(welcome: string): ValidationResult {
  if (!welcome) return "请输入欢迎语";
  if (welcome.length < 20 || welcome.length > 500)
    return "欢迎语应为 20-500 字";
  return "";
}

export function validateQ5(starters: string[]): ValidationResult {
  if (starters.length > 4) return "最多 4 个快速开始按钮";
  for (const s of starters) {
    if (s.length < 5 || s.length > 50) return "每条快速开始按钮应为 5-50 字";
  }
  return "";
}

export function validateQ6(q6: string[]): ValidationResult {
  if (!q6 || q6.length === 0) return "请至少选择一种任务类型";
  return "";
}

export function validateQ7(q7: string[]): ValidationResult {
  if (!q7 || q7.length === 0) return "请至少选择一种材料类型";
  return "";
}

export function validateQ8(q8: number): ValidationResult {
  // P1-6 fix: handle NaN / Infinity (typed input can produce these)
  if (!Number.isFinite(q8) || q8 < 200 || q8 > 2000)
    return "积分上限应在 200-2000";
  return "";
}

export function validateQ9(q9: string): ValidationResult {
  if (!q9) return "请选择是否允许网络搜索";
  if (q9 !== "no_web_search" && q9 !== "allow_search") return "无效选项";
  return "";
}

export function validateQ10(q10: string): ValidationResult {
  if (q10.length > 500) return "注意话题最多 500 字";
  return "";
}

export function validateQ11(q11: string): ValidationResult {
  // Q11 is optional — empty is fine; non-empty must be 5-200 chars
  if (q11 && (q11.length < 5 || q11.length > 200))
    return "越界话术应为 5-200 字";
  return "";
}

export function validateQ12(q12: string): ValidationResult {
  if (!q12) return "请选择说话风格";
  if (!["friendly", "professional", "encouraging"].includes(q12))
    return "无效选项";
  return "";
}

/**
 * Validate entire form — returns map of fieldKey → error message.
 * Empty map means everything passed.
 *
 * Field keys map to data-question attributes in QuestionnaireForm.vue
 * so parent can scroll to the first error via document.querySelector.
 */
export function validateForm(form: AgentFormState): Record<string, string> {
  const errors: Record<string, string> = {};
  const q: QuestionnaireAnswers = form.questionnaire_answers ?? {};

  const e1 = validateQ1(form.name);
  if (e1) errors.name = e1;

  const e3 = validateQ3(form.description);
  if (e3) errors.description = e3;

  const e4 = validateQ4(form.welcome_message);
  if (e4) errors.welcome_message = e4;

  const e5 = validateQ5(form.starters);
  if (e5) errors.starters = e5;

  const e6 = validateQ6(q.q6 ?? []);
  if (e6) errors.q6 = e6;

  const e7 = validateQ7(q.q7 ?? []);
  if (e7) errors.q7 = e7;

  const e8 = validateQ8(q.q8 ?? 800);
  if (e8) errors.q8 = e8;

  const e9 = validateQ9(q.q9 ?? "");
  if (e9) errors.q9 = e9;

  const e10 = validateQ10(q.q10 ?? "");
  if (e10) errors.q10 = e10;

  const e11 = validateQ11(q.q11 ?? "");
  if (e11) errors.q11 = e11;

  const e12 = validateQ12(q.q12 ?? "");
  if (e12) errors.q12 = e12;

  return errors;
}
