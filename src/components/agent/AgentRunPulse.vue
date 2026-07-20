<script setup lang="ts">
/**
 * AgentRunPulse — the inline "still working" line at the TAIL of the process
 * timeline. It is the consistent alive signal across both the streaming first
 * turn and the polling answer-resume, filling the dead-air gaps (tool execution,
 * thinking, report composing) that previously read as frozen.
 *
 * It is a RELAY, not a duplicate:
 *  - while the last assistant message is actively STREAMING text, the in-text
 *    caret is the alive signal → this line yields (hidden);
 *  - otherwise, while the run is going, it shows a breathing dot + an HONEST
 *    status word without any visible elapsed clock. The WORD is generic
 *    ("处理中…"), never an echo of the active tool —
 *    the tool's own timeline line above already shows the specifics, so there is
 *    no duplication.
 *  - suppressed while waiting for the user's answer (the inverse lie).
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import { useAgentChatStore } from '@/stores/agentChat'
import { silenceLadder } from '@/utils/agentRunPulse'
import type { AssistantMessage } from '@/types/agent'

const store = useAgentChatStore()

/** The last message is an assistant bubble still streaming tokens → the caret
 *  carries the alive signal, so this line yields. */
const lastMsgStreaming = computed<boolean>(() => {
  const last = store.messages[store.messages.length - 1]
  return !!last && last.type === 'assistant' && !!(last as AssistantMessage).isStreaming
})

/** 问题5a: belt-and-suspenders — even if isRunning somehow reads stale-true (e.g. a
 *  lagging reconcile race), a run whose status is a TERMINAL one (completed/failed/
 *  cancelled/timeout/budget_exhausted) must never show the "处理中…" pulse. Only
 *  running/pending are non-terminal, so anything else = ended. */
const TERMINAL_STATUSES = ['completed', 'timeout', 'failed', 'cancelled', 'budget_exhausted']
const isTerminal = computed<boolean>(() => {
  const s = store.currentRun?.status
  return s != null && TERMINAL_STATUSES.includes(s)
})

const visible = computed<boolean>(() => {
  const active = store.sendingMessage || (store.isRunning && !isTerminal.value)
  return active && !store.isWaitingForUser && !lastMsgStreaming.value
})

// The internal ticker only advances the coarse patience wording. It never
// renders an elapsed clock or elapsed seconds to the user.
const nowMs = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null
const startTicker = (): void => {
  if (ticker == null) ticker = setInterval(() => (nowMs.value = Date.now()), 1000)
}
const stopTicker = (): void => {
  if (ticker != null) {
    clearInterval(ticker)
    ticker = null
  }
}
watch(visible, (on) => (on ? startTicker() : stopTicker()), { immediate: true })
onUnmounted(stopTicker)

const word = computed<string>(() => {
  if (store.stuckSince == null) return '处理中…'
  void nowMs.value
  const sec = Math.max(0, Math.floor((performance.now() - store.stuckSince) / 1000))
  return silenceLadder(sec)
})
</script>

<template>
  <div v-if="visible" class="run-pulse">
    <span class="dot" aria-hidden="true" />
    <span class="word" aria-hidden="true">{{ word }}</span>
    <span class="sr-only" aria-live="polite">{{ word }}</span>
  </div>
</template>

<style scoped>
.run-pulse {
  display: flex;
  align-items: center;
  gap: 9px;
  /* align with the timeline content (avatar 28 + gap 8) */
  padding-left: 36px;
  font-size: 13px;
  color: var(--text-secondary, #5f6577);
}

.dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary, hsl(160, 72%, 40%));
  box-shadow:
    0 0 4px var(--primary, hsl(160, 72%, 40%)),
    0 0 9px hsla(160, 72%, 40%, 0.5);
  animation: pulse-breathe 1.6s ease-in-out infinite;
}
@keyframes pulse-breathe {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

.word {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (prefers-reduced-motion: reduce) {
  .dot {
    animation: none;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
