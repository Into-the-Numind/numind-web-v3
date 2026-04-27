/**
 * inputBudget.ts — Input character budget helper
 *
 * Shows simple `x / 40000` character counters for user-entered input areas.
 * Does NOT expose token estimates or model budget internals.
 *
 * States:
 *   normal  — below 85% of limit
 *   warning — 85% to 100% of limit (inclusive)
 *   error   — above 100% (strictly more than limit)
 */

export const INPUT_CHARACTER_LIMIT = 40000
export const INPUT_WARNING_RATIO = 0.85

export type InputBudgetState = 'normal' | 'warning' | 'error'

export interface InputBudgetInfo {
  count: number
  limit: number
  label: string
  state: InputBudgetState
}

/**
 * Calculate input budget state for a given string value.
 *
 * Uses Array.from() to count Unicode codepoints correctly
 * (avoids counting surrogate pairs as 2 chars for CJK etc.).
 */
export function getInputBudgetState(value: string): InputBudgetInfo {
  const count = Array.from(value ?? '').length
  const ratio = count / INPUT_CHARACTER_LIMIT
  const state: InputBudgetState =
    count > INPUT_CHARACTER_LIMIT ? 'error' : ratio >= INPUT_WARNING_RATIO ? 'warning' : 'normal'
  return {
    count,
    limit: INPUT_CHARACTER_LIMIT,
    label: `${count} / ${INPUT_CHARACTER_LIMIT}`,
    state
  }
}
