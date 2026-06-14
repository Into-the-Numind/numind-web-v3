<script setup lang="ts">
/**
 * AgentRunPulse — the "live status line" (实时进展行).
 *
 * A single always-present line between the transcript and the input box that
 * keeps the run feeling ALIVE through every phase — especially the polling-path
 * gaps (post-answer report composing, LLM thinking between tools) where there is
 * no token stream and no active tool, which previously read as dead/frozen.
 *
 * It is a RELAY, not a 4th competing signal:
 *  - While the SSE stream is delivering tokens, the in-text caret is the alive
 *    signal → this line YIELDS (hidden). The handoff is instant (0ms) so the
 *    moment streaming stops there is no dead-air gap.
 *  - When a tool is in-flight, the line echoes that tool's own narration message.
 *  - In a gap (no stream, no tool), it shows an HONEST silence ladder keyed off
 *    the store's real `stuckSince` anchor — never a fake progress/ETA/step claim.
 *  - It is SUPPRESSED while waiting for the user's answer (the inverse lie).
 *
 * The ping-pong node asserts "busy", not "N% done". prefers-reduced-motion drops
 * the motion and surfaces the numeric elapsed instead (motion-free proof-of-life).
 */
import { ref, computed, watch, onUnmounted } from 'vue'
import { useAgentChatStore } from '@/stores/agentChat'
import { silenceLadder } from '@/utils/agentRunPulse'
import type { NarrationState } from '@/types/agent'

interface Props {
  /** True while the SSE stream is actively delivering tokens. */
  isStreaming?: boolean
}
const props = withDefaults(defineProps<Props>(), { isStreaming: false })

const store = useAgentChatStore()

const ACTIVE_STATES: NarrationState[] = ['queued', 'use', 'progress']

/** The latest in-flight tool's user-facing message, or null when none is active. */
const activeToolMessage = computed<string | null>(() => {
  const groups = store.toolGroups
  for (let i = groups.length - 1; i >= 0; i--) {
    if (ACTIVE_STATES.includes(groups[i].current_state)) {
      const ev = groups[i].events[groups[i].events.length - 1]
      return ev?.message ?? null
    }
  }
  return null
})

// 1s ticker drives the silence ladder + the elapsed tab while the line is shown.
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

/** Real silence (seconds) from the store's `stuckSince` (performance.now() anchor). */
const silenceSec = computed<number>(() => {
  if (store.stuckSince == null) return 0
  void nowMs.value // re-evaluate each tick
  return Math.max(0, Math.floor((performance.now() - store.stuckSince) / 1000))
})

const rawWord = computed<string>(() => activeToolMessage.value ?? silenceLadder(silenceSec.value))

// Throttle the displayed word (leading + trailing, fixed window) so a burst of
// rapid tool transitions can't strobe the line — and, critically, can't chain the
// commit further and further out: the word updates at most once per window and
// always shows the LATEST value at commit time.
const DWELL_MS = 700
const displayWord = ref(rawWord.value)
let lastCommitAt = 0
let trailingTimer: ReturnType<typeof setTimeout> | null = null
const commit = (): void => {
  displayWord.value = rawWord.value // read the latest at commit time
  lastCommitAt = Date.now()
  trailingTimer = null
}
watch(
  rawWord,
  () => {
    const since = Date.now() - lastCommitAt
    if (since >= DWELL_MS) commit()
    else if (trailingTimer == null) trailingTimer = setTimeout(commit, DWELL_MS - since)
    // if a trailing commit is already scheduled, leave it — commit() re-reads rawWord.
  },
  { immediate: true }
)

/** Visible while running, not waiting on the user, and not streaming text. */
const visible = computed<boolean>(
  () => store.isRunning && !store.isWaitingForUser && !props.isStreaming
)

// Completion settle: a brief "已完成" beat as the run finishes, then fade out.
const settling = ref(false)
let settleTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => store.isRunning,
  (running, was) => {
    // A new run starting cancels any lingering settle (else "已完成" would bleed
    // into the new run for up to 1.4s).
    if (!was && running && settling.value) {
      if (settleTimer != null) clearTimeout(settleTimer)
      settleTimer = null
      settling.value = false
    }
    if (was && !running && store.currentRun?.status === 'completed') {
      settling.value = true
      if (settleTimer != null) clearTimeout(settleTimer)
      settleTimer = setTimeout(() => (settling.value = false), 1400)
    }
  }
)

const showLine = computed<boolean>(() => visible.value || settling.value)
const word = computed<string>(() => (settling.value ? '已完成' : displayWord.value))
watch(showLine, (on) => (on ? startTicker() : stopTicker()), { immediate: true })

// Instant (0ms) appearance when handing off directly from a just-ended stream —
// the post-stream gap is the worst place for a 250ms fade hole. Cold starts keep
// the gentle 250ms fade. Use a short timer (not rAF, which is suspended in a
// background tab) so `instant` can't get stuck on.
const instant = ref(false)
let instantTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => props.isStreaming,
  (s, prev) => {
    if (prev === true && s === false && store.isRunning) {
      instant.value = true
      if (instantTimer != null) clearTimeout(instantTimer)
      instantTimer = setTimeout(() => (instant.value = false), 60)
    } else if (s) {
      instant.value = false
    }
  }
)

onUnmounted(() => {
  stopTicker()
  if (trailingTimer != null) clearTimeout(trailingTimer)
  if (settleTimer != null) clearTimeout(settleTimer)
  if (instantTimer != null) clearTimeout(instantTimer)
})

/** Run-level elapsed for the (collapsed) time tab. */
const elapsedText = computed<string>(() => {
  const started = store.currentRun?.started_at
  if (!started) return ''
  const ms = Date.parse(started)
  if (Number.isNaN(ms)) return ''
  const sec = Math.max(0, Math.floor((nowMs.value - ms) / 1000))
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
})
</script>

<template>
  <div class="run-pulse-host">
    <div class="run-pulse" :class="{ show: showLine, instant, settle: settling }">
      <span class="mark" aria-hidden="true">
        <span class="track" />
        <span class="node" />
      </span>
      <span class="word">{{ word }}</span>
      <span v-if="elapsedText" class="time" :title="`已用时 ${elapsedText}`">
        <span class="dot">·</span>
        <span class="val">{{ elapsedText }}</span>
      </span>
    </div>
    <!-- A single visually-hidden polite live-region for screen readers. The word
         is throttled (~700ms min), so this announces at most once per phase
         transition — enough to know the agent is working + what it's doing,
         without the per-tick spam a role=status on the visible line would cause. -->
    <span class="sr-only" aria-live="polite">{{ showLine ? word : '' }}</span>
  </div>
</template>

<style scoped>
.run-pulse-host {
  padding: 0 14px;
}

.run-pulse {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 0;
  opacity: 0;
  overflow: hidden;
  pointer-events: none;
  transition:
    opacity 0.25s ease,
    height 0.25s ease;
}
.run-pulse.show {
  height: 34px;
  opacity: 1;
  pointer-events: auto; /* re-enable so the time tab can expand on hover */
}
/* 0ms baton pass from a just-ended stream — no fade hole. */
.run-pulse.instant {
  transition: none;
}

/* The Press Mark — a node that ping-pongs along a short track. Ping-pong (not a
   left→right sweep) so it reads as "idling-while-busy", never "% toward done". */
.mark {
  position: relative;
  width: 28px;
  height: 10px;
  flex-shrink: 0;
}
.mark .track {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border, #e2e4ea);
  transform: translateY(-50%);
}
.mark .node {
  position: absolute;
  top: 50%;
  left: 0;
  width: 6px;
  height: 6px;
  margin-top: -3px;
  border-radius: 50%;
  background: var(--primary, hsl(160, 72%, 40%));
  box-shadow:
    0 0 4px var(--primary, hsl(160, 72%, 40%)),
    0 0 10px hsla(160, 72%, 40%, 0.5);
  animation: pulse-pingpong 2.4s cubic-bezier(0.4, 0, 0.2, 1) alternate infinite;
}
@keyframes pulse-pingpong {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(22px);
  }
}

/* completion settle: node rests at centre, glow brightens once (no transform, so
   no jump from wherever the ping-pong left it). */
.run-pulse.settle .mark .node {
  left: 11px;
  transform: none;
  animation: pulse-settle 0.5s ease forwards;
}
@keyframes pulse-settle {
  0% {
    box-shadow: 0 0 4px var(--primary, hsl(160, 72%, 40%));
  }
  50% {
    box-shadow: 0 0 12px var(--primary, hsl(160, 72%, 40%));
  }
  100% {
    box-shadow: 0 0 4px var(--primary, hsl(160, 72%, 40%));
  }
}

.word {
  font-size: 13px;
  color: var(--text-secondary, #5f6577);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 0.2s ease;
}

/* time tab — a quiet dot that expands to m:ss on hover. Demoted so an
   ever-incrementing number never reads as a stopwatch on the user's patience. */
.time {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted, #8b90a0);
  font-variant-numeric: tabular-nums;
  user-select: none;
}
.time .val {
  display: none;
}
.time:hover .dot {
  display: none;
}
.time:hover .val {
  display: inline;
}

/* Touch devices can't hover → show the elapsed value outright (the demotion is
   for mouse users who'd find a ticking number nagging; touch users just see it). */
@media (hover: none) {
  .time .dot {
    display: none;
  }
  .time .val {
    display: inline;
  }
}

@media (prefers-reduced-motion: reduce) {
  /* drop the ping-pong; the node sits still and the numeric elapsed is the
     motion-free proof-of-life. */
  .mark .node {
    animation: none;
    left: 11px;
  }
  .run-pulse {
    transition: none;
  }
  .time .dot {
    display: none;
  }
  .time .val {
    display: inline;
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
