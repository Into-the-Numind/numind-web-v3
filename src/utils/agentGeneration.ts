/**
 * Generation-stall detection for the streaming assistant bubble (问题三).
 *
 * The long mid-stream wait happens while the LLM is composing tool-call arguments:
 * the assistant message is still "streaming" but no token/reasoning delta has
 * arrived for a while, so the bubble shows only a static blinking caret and reads
 * as frozen. When that silence crosses a threshold AND no tool call is active yet
 * (a tool_call_start would otherwise own the liveness signal via the timeline),
 * we upgrade the caret to an explicit "正在生成…" indicator.
 *
 * Pure + exported so it can be unit-tested without a clock or a component.
 */

/** Silence threshold (ms) before a streaming-but-silent bubble reads as stalled.
 *  ~1.3s: long enough that a normal token cadence (sub-second) never trips it,
 *  short enough that a real generation gap surfaces the indicator promptly. */
export const GENERATION_STALL_MS = 1300

/**
 * @param isStreaming  the bubble is the actively-streaming assistant message
 * @param hasActiveTool a tool_call is currently running (its timeline line owns
 *                      the liveness signal → suppress the generation indicator)
 * @param lastDeltaAt   timestamp (ms, e.g. Date.now/performance.now domain of `now`)
 *                      of the last token/reasoning delta; null = no delta yet
 * @param now           current time in the same domain as lastDeltaAt
 */
export function isGenerationStalled(
  isStreaming: boolean,
  hasActiveTool: boolean,
  lastDeltaAt: number | null,
  now: number
): boolean {
  if (!isStreaming || hasActiveTool) return false
  if (lastDeltaAt == null) return false
  return now - lastDeltaAt >= GENERATION_STALL_MS
}
