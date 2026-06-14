/**
 * The honest "silence ladder" for the agent live-status line (AgentRunPulse).
 *
 * Every rung is TRUE: it sets patience expectations ("可能需要几分钟"), it NEVER
 * claims progress, an ETA, or a step count. Keyed off the real elapsed silence
 * (seconds) since the run last produced narration. Pure + exported for testing.
 */
export function silenceLadder(sec: number): string {
  if (sec < 12) return '处理中…'
  if (sec < 45) return '仍在处理中…'
  if (sec < 180) return '复杂调研可能需要几分钟…'
  return '仍在处理，你也可以随时停止'
}
