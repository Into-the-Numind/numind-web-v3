<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ToolCallAggregate, NarrationState } from '@/types/agent'
import AgentToolCallItem from './AgentToolCallItem.vue'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'

interface Props {
  toolGroups: ToolCallAggregate[]
}

const props = defineProps<Props>()

const ACTIVE_STATES: NarrationState[] = ['queued', 'use', 'progress']
const TERMINAL_STATES: NarrationState[] = ['result', 'error', 'rejected']

const hasActiveTools = computed<boolean>(() => {
  return props.toolGroups.some((group) => ACTIVE_STATES.includes(group.current_state))
})

/** Steps that have reached a terminal state (success OR failure). Neutral count
 *  — the per-item badge already colour-codes which ones errored. */
const doneCount = computed<number>(
  () => props.toolGroups.filter((g) => TERMINAL_STATES.includes(g.current_state)).length
)

const totalCount = computed<number>(() => props.toolGroups.length)

// Cap the expanded list. The post-answer (polling) leg aggregates EVERY tool call
// of the resumed run into a single card, so a deep research run can pile up dozens
// of rows into one wall. Keep the most RECENT steps (where the live action is) and
// fold the older finished ones into a one-line count; the header already carries
// the total. Short cards (the streaming per-step cards) stay fully shown.
const MAX_VISIBLE = 8
const hiddenCount = computed<number>(() => Math.max(0, props.toolGroups.length - MAX_VISIBLE))
const visibleGroups = computed<ToolCallAggregate[]>(() =>
  hiddenCount.value > 0 ? props.toolGroups.slice(-MAX_VISIBLE) : props.toolGroups
)

// ──────────────────────────────────────────────────────────────────
// Wall-clock duration of this step group, computed from the FIRST and LAST
// narration event timestamps. Both are server timestamps, so the delta is free
// of client/server clock skew and is stable across reloads (a real "用时 X" even
// when revisiting a finished session). We only surface it once the group is no
// longer active — while in-flight, the per-item live timer (AgentToolCallItem)
// owns the ticking "it's alive" signal, so the header stays calm.
// ──────────────────────────────────────────────────────────────────
const elapsedSec = computed<number>(() => {
  const stamps: number[] = []
  for (const g of props.toolGroups) {
    for (const ev of g.events) {
      const ms = Date.parse(ev.timestamp)
      if (!Number.isNaN(ms)) stamps.push(ms)
    }
  }
  if (stamps.length < 2) return 0
  const span = Math.max(...stamps) - Math.min(...stamps)
  return Math.max(0, Math.floor(span / 1000))
})

const formatDuration = (sec: number): string => {
  if (sec < 60) return `${sec}秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s === 0 ? `${m}分` : `${m}分${s}秒`
}

const summaryText = computed<string>(() => {
  if (hasActiveTools.value) {
    // While running, show progress so a long silent step (file generation,
    // report writing) never reads as "stuck doing nothing".
    return doneCount.value > 0 ? `执行中 · 已完成 ${doneCount.value} 步` : '执行中…'
  }
  const base = `已完成 ${totalCount.value} 步`
  return elapsedSec.value >= 1 ? `${base} · 用时 ${formatDuration(elapsedSec.value)}` : base
})

// Auto-follow the run state — expand while a tool is active, fold once the step
// finishes — but only until the user takes manual control. After an explicit
// toggle we stop overriding their choice (no fighting the collapse/expand).
const open = ref(hasActiveTools.value)
const userToggled = ref(false)

watch(hasActiveTools, (active) => {
  if (!userToggled.value) open.value = active
})

const toggle = (): void => {
  open.value = !open.value
  userToggled.value = true
}
</script>

<template>
  <div class="tool-call-list" v-if="toolGroups.length > 0">
    <button class="tool-summary" @click="toggle" :aria-expanded="open">
      <span class="summary-lead">
        <span
          class="summary-status"
          :class="hasActiveTools ? 'summary-status--running' : 'summary-status--done'"
          aria-hidden="true"
        />
        <span class="summary-text">{{ summaryText }}</span>
      </span>
      <component :is="open ? ChevronUp : ChevronDown" :size="16" />
    </button>

    <div v-if="open" class="tool-detail">
      <p v-if="hiddenCount > 0" class="tool-folded">··· 前 {{ hiddenCount }} 步已完成</p>
      <AgentToolCallItem v-for="group in visibleGroups" :key="group.tool_call_id" :group="group" />
    </div>

    <!-- 折叠时只显示最新一条作为预览（让学员一眼看到"此刻在做什么"） -->
    <div v-else class="tool-preview">
      <AgentToolCallItem
        v-for="group in toolGroups.slice(-1)"
        :key="group.tool_call_id"
        :group="group"
        compact
      />
    </div>
  </div>
</template>

<style scoped>
.tool-call-list {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px 12px;
}

.tool-summary {
  width: 100%;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
}

.summary-lead {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.summary-text {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Status dot in the header: a spinning ring while the step is running, a solid
   green dot once it finishes. Mirrors the per-item badge vocabulary so the two
   read as the same system. */
.summary-status {
  flex-shrink: 0;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.summary-status--running {
  border: 2px solid var(--accent-soft, hsl(160, 60%, 93%));
  border-top-color: var(--primary, hsl(160, 72%, 40%));
  animation: summary-spin 0.9s linear infinite;
}

.summary-status--done {
  background: var(--primary, hsl(160, 72%, 40%));
}

@keyframes summary-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .summary-status--running {
    animation: none;
  }
}

.tool-detail {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* "前 N 步已完成" fold line above the capped recent steps. */
.tool-folded {
  margin: 0 0 2px;
  font-size: 12px;
  color: var(--text-muted, #8b90a0);
}

.tool-preview {
  margin-top: 6px;
}
</style>
