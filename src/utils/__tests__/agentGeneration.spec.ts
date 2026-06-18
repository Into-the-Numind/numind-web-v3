import { describe, it, expect } from 'vitest'
import { isGenerationStalled, GENERATION_STALL_MS } from '../agentGeneration'

// 问题三: during the long mid-stream wait (LLM composing tool-call args / file content)
// the assistant bubble is streaming but no delta arrives — once silence crosses the
// threshold AND no tool is active, the caret upgrades to a "正在生成…" indicator.
describe('isGenerationStalled', () => {
  const base = 1_000_000

  it('not stalled when the bubble is not streaming', () => {
    expect(isGenerationStalled(false, false, base, base + GENERATION_STALL_MS + 1)).toBe(false)
  })

  it('not stalled when a tool is active (the timeline line owns the liveness signal)', () => {
    expect(isGenerationStalled(true, true, base, base + GENERATION_STALL_MS + 1)).toBe(false)
  })

  it('not stalled before any delta has arrived (lastDeltaAt null)', () => {
    expect(isGenerationStalled(true, false, null, base + 99_999)).toBe(false)
  })

  it('not stalled while deltas are still flowing (silence under threshold)', () => {
    expect(isGenerationStalled(true, false, base, base + GENERATION_STALL_MS - 1)).toBe(false)
  })

  it('stalled when streaming + no active tool + silence ≥ threshold', () => {
    expect(isGenerationStalled(true, false, base, base + GENERATION_STALL_MS)).toBe(true)
    expect(isGenerationStalled(true, false, base, base + GENERATION_STALL_MS + 5000)).toBe(true)
  })
})
