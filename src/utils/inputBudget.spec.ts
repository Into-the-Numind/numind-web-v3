import { describe, expect, it } from 'vitest'
import { getInputBudgetState, INPUT_CHARACTER_LIMIT, INPUT_WARNING_RATIO } from './inputBudget'

describe('getInputBudgetState', () => {
  it('returns normal, warning and error states around the 40000 limit', () => {
    expect(getInputBudgetState('a'.repeat(10)).state).toBe('normal')
    expect(getInputBudgetState('a'.repeat(34000)).state).toBe('warning')
    expect(getInputBudgetState('a'.repeat(40001)).state).toBe('error')
  })

  it('counts unicode codepoints not bytes', () => {
    // 你好 is 2 codepoints but 6 UTF-8 bytes
    expect(getInputBudgetState('你好').count).toBe(2)
  })

  it('handles empty string gracefully', () => {
    expect(getInputBudgetState('').state).toBe('normal')
    expect(getInputBudgetState('').count).toBe(0)
  })

  it('warning starts at exactly 85% (34000 chars)', () => {
    const warningThreshold = Math.ceil(INPUT_CHARACTER_LIMIT * INPUT_WARNING_RATIO)
    expect(getInputBudgetState('a'.repeat(warningThreshold)).state).toBe('warning')
    expect(getInputBudgetState('a'.repeat(warningThreshold - 1)).state).toBe('normal')
  })

  it('exactly at limit (40000) is still warning, not error', () => {
    expect(getInputBudgetState('a'.repeat(INPUT_CHARACTER_LIMIT)).state).toBe('warning')
  })

  it('error starts above 100% (40001+)', () => {
    expect(getInputBudgetState('a'.repeat(INPUT_CHARACTER_LIMIT + 1)).state).toBe('error')
  })

  it('returns correct label string', () => {
    expect(getInputBudgetState('hello').label).toBe('5 / 40000')
  })

  it('returns correct limit in result', () => {
    expect(getInputBudgetState('test').limit).toBe(INPUT_CHARACTER_LIMIT)
  })

  it('counts emoji as 1 codepoint (Array.from splits correctly)', () => {
    // '😀' is U+1F600, outside BMP — represented as surrogate pair in UTF-16,
    // but Array.from iterates by Unicode codepoint, yielding exactly 1 element.
    // Note: some emoji sequences (family emoji with ZWJ) count as multiple codepoints.
    const singleEmoji = '😀'
    expect(getInputBudgetState(singleEmoji).count).toBe(1)
  })
})
