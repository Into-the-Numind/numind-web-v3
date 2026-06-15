<script setup lang="ts">
/**
 * One line in the agent process timeline (Manus-style). Each tool call renders as
 * a single compact line: [state icon] [activity]. The activity label is stable
 * (the query / what it's doing) and does NOT jump text when the tool completes —
 * the leading icon carries the state instead (spinner while running, the tool's
 * type icon when done, an alert on error). No card, no badge, no per-line timer.
 */
import { computed } from 'vue'
import type { ToolCallAggregate, NarrationState } from '@/types/agent'
import { toolIcon } from '@/shared/agent-tool-icons'
import { Loader2, AlertCircle } from 'lucide-vue-next'

interface Props {
  group: ToolCallAggregate
}
const props = defineProps<Props>()

const ACTIVE_STATES: NarrationState[] = ['queued', 'use', 'progress']
const isActive = computed<boolean>(() => ACTIVE_STATES.includes(props.group.current_state))
const isError = computed<boolean>(
  () => props.group.current_state === 'error' || props.group.current_state === 'rejected'
)

// Stable label: the first (use) event's message, with any leading emoji and a
// leading "正在" stripped, so the query/activity stays visible and the text
// doesn't jump when it finishes. The leading-emoji strip matters because some
// older narration templates still bake a presentation emoji (📚/📖/⚠) into the
// message; the timeline now owns the icon (lucide, in .tl-ic), so the message's
// own emoji would be a duplicate AND violate the no-emoji rule. Falls back to the
// latest message, then the tool name.
const EMOJI_PREFIX = /^(?:[\p{Extended_Pictographic}\u{FE0F}\u{200D}]\s*)+/u
const label = computed<string>(() => {
  const first = props.group.events[0]
  const latest = props.group.events[props.group.events.length - 1]
  const base = first?.message || latest?.message || props.group.tool_name
  return base.replace(EMOJI_PREFIX, '').replace(/^正在\s*/, '')
})

const typeIcon = computed(() => toolIcon(props.group.tool_name))
</script>

<template>
  <div class="tl-line" :class="{ active: isActive, error: isError }">
    <span class="tl-ic" aria-hidden="true">
      <Loader2 v-if="isActive" :size="14" class="tl-spin" />
      <AlertCircle v-else-if="isError" :size="14" />
      <component :is="typeIcon" v-else :size="14" />
    </span>
    <span class="tl-txt">{{ label }}</span>
  </div>
</template>

<style scoped>
.tl-line {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  /* issue2: a light emerald rectangle behind each tool call so adjacent actions
     read as distinct steps. Kept deliberately faint (same --primary hue as the
     alive signals) + a single-line padding so it stays a flat timeline, not the
     heavy card chrome the agent-process-timeline redesign removed. */
  padding: 5px 8px;
  background: var(--tool-line-bg, hsla(160, 72%, 40%, 0.06));
  border-radius: 6px;
  font-size: 13.5px;
  line-height: 1.55;
}
/* the running line is a touch more saturated so the eye lands on it. */
.tl-line.active {
  background: var(--tool-line-bg-active, hsla(160, 72%, 40%, 0.1));
}
/* an errored line drops the emerald tint for a faint red so the background never
   contradicts the red icon/text. */
.tl-line.error {
  background: var(--tool-line-bg-error, hsla(0, 84%, 60%, 0.06));
}
.tl-ic {
  flex-shrink: 0;
  width: 16px;
  margin-top: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* done lines are history → calm muted icon */
  color: var(--text-muted, #8b90a0);
}
/* the currently-running line draws the eye in the brand accent (same emerald as
   every other alive signal — the streaming caret and the run-pulse dot). */
.tl-line.active .tl-ic {
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
@media (prefers-reduced-motion: reduce) {
  .tl-spin {
    animation: none;
  }
}
</style>
