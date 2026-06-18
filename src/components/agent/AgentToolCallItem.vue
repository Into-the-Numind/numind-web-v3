<script setup lang="ts">
/**
 * One line in the agent process timeline (Manus-style). Each tool call renders as
 * a single compact line: [state icon] [activity] that TRANSITIONS IN PLACE — while
 * running it shows the "use" activity + a spinner; once done it shows the "result"
 * message + a green checkmark; an error shows an alert. One tool call = one line:
 * it never spawns a second "已…" row, and never leaves a spinner stuck on a
 * completed run. No card, no badge, no per-line timer.
 */
import { computed } from 'vue'
import type { ToolCallAggregate, NarrationState } from '@/types/agent'
import { Loader2, AlertCircle, Check } from 'lucide-vue-next'

interface Props {
  group: ToolCallAggregate
}
const props = defineProps<Props>()

const ACTIVE_STATES: NarrationState[] = ['queued', 'use', 'progress']
const isActive = computed<boolean>(() => ACTIVE_STATES.includes(props.group.current_state))
const isError = computed<boolean>(
  () => props.group.current_state === 'error' || props.group.current_state === 'rejected'
)
// done = the only remaining state today, 'result' (NarrationState is a closed
// union). A future variant would also render as the done checkmark — intentional
// catch-all so a new state never regresses to a stuck spinner.
const isDone = computed<boolean>(() => !isActive.value && !isError.value)

// The label always reflects the LATEST event's message: while running it shows the
// newest 'use'/'progress' activity (问题四 — a long tool that emits progress events
// updates in place instead of freezing on the first line, e.g. "加载技能：docx-author");
// once done/errored it shows the result/error text ("已加载技能：docx-author"). A
// leading presentation emoji (📚/📖/⚠ baked into older templates) and a leading "正在"
// are stripped — the timeline owns the icon (lucide, in .tl-ic), so a message emoji
// would duplicate it AND break the no-emoji rule. Falls back across events, then the
// tool name.
const EMOJI_PREFIX = /^(?:[\p{Extended_Pictographic}\u{FE0F}\u{200D}]\s*)+/u
const label = computed<string>(() => {
  const first = props.group.events[0]
  const latest = props.group.events[props.group.events.length - 1]
  const base = latest?.message || first?.message || props.group.tool_name
  return base.replace(EMOJI_PREFIX, '').replace(/^正在\s*/, '')
})
</script>

<template>
  <div class="tl-line" :class="{ active: isActive, error: isError, done: isDone }">
    <span class="tl-ic" aria-hidden="true">
      <Loader2 v-if="isActive" :size="14" class="tl-spin" />
      <AlertCircle v-else-if="isError" :size="14" />
      <Check v-else :size="14" />
    </span>
    <span class="tl-txt">{{ label }}</span>
    <!-- 问题四: flowing dots after the active label — a second, more obvious liveness
         signal beside the spinner for long-running tools (docx/HTML gen) where the
         single static line otherwise looks frozen. -->
    <span v-if="isActive" class="tl-dots" aria-hidden="true"><i></i><i></i><i></i></span>
  </div>
</template>

<style scoped>
.tl-line {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  /* No background — a flat, fully transparent timeline. State is carried by the
     leading icon (spinner / green check / red alert) + the dashed connector, not a
     tinted rectangle. Padding stays for vertical rhythm AND the connector geometry
     (its left/top offsets are measured off this padding). */
  padding: 5px 8px;
  font-size: 13.5px;
  line-height: 1.55;
  /* anchor for the dashed connector (::after) to the next tool line */
  position: relative;
}

/* 同一 narration 下相邻工具调用之间：左侧状态图标用竖向虚线上下相连，形成
   连续的过程时间线（Manus 风）。每条 .tl-line（最后一条除外）在自己图标正
   下方画一段虚线，跨过行间 gap 连到下一条的图标上方。 */
.tl-line:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 16px; /* 图标水平中心：padding-left 8 + .tl-ic 宽 16 的一半 */
  top: 22px; /* 紧接本行图标下方（图标底 ≈ 21px） */
  bottom: -8px; /* 跨过 .tool-timeline 的 3px gap，连到下一行图标上方 */
  border-left: 1px dashed var(--border, #d4d8df);
  pointer-events: none;
}

.tl-ic {
  flex-shrink: 0;
  width: 16px;
  margin-top: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* fallback icon color; the per-state rules below override it (active + done →
     emerald, error → red), so this only shows if a state has no rule. */
  color: var(--text-muted, #8b90a0);
}
/* the currently-running line draws the eye in the brand accent (same emerald as
   every other alive signal — the streaming caret and the run-pulse dot). */
.tl-line.active .tl-ic {
  color: var(--primary, hsl(160, 72%, 40%));
}
/* a completed step → green checkmark (success signal), distinct from the muted
   default and the running emerald spinner by its shape. */
.tl-line.done .tl-ic {
  color: var(--primary, hsl(160, 72%, 40%));
}
.tl-line.error .tl-ic {
  color: #ef4444;
}
.tl-txt {
  color: var(--text, #1a1d26);
  word-break: break-word;
}
.tl-line.error .tl-txt {
  color: var(--text-secondary, #5f6577);
}

.tl-spin {
  animation: tl-spin 0.8s linear infinite;
}
@keyframes tl-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 问题四: flowing in-progress dots beside the active label. */
.tl-dots {
  display: inline-flex;
  align-items: flex-end;
  gap: 3px;
  margin-left: 5px;
  padding-bottom: 3px;
  flex-shrink: 0;
}
.tl-dots i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--primary, hsl(160, 72%, 40%));
  opacity: 0.35;
  animation: tl-dot 1.2s ease-in-out infinite;
}
.tl-dots i:nth-child(2) {
  animation-delay: 0.2s;
}
.tl-dots i:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes tl-dot {
  0%,
  60%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-2px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .tl-spin {
    animation: none;
  }
  .tl-dots i {
    animation: none;
    opacity: 0.55;
  }
}
</style>
