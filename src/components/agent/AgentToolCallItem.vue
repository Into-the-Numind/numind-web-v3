<script setup lang="ts">
import { computed, watch, ref, onUnmounted } from 'vue'
import type { ToolCallAggregate, NarrationState } from '@/types/agent'
import { STATE_ICON, STATE_COLOR_CLASS } from '@/shared/agent-icons'

interface Props {
  group: ToolCallAggregate
  /** 紧凑模式（折叠时预览）只显示最新事件 */
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), { compact: false })

// ──────────────────────────────────────────────────────────────────
// T13: Status badge — reflects ToolCallAggregate.current_state
// ──────────────────────────────────────────────────────────────────

/** CSS class for the status dot (color + optional spin) */
const badgeClass = computed<string>(() => {
  return `status-badge status-badge--${props.group.current_state}`
})

/** Chinese label for the status dot */
const badgeLabel = computed<string>(() => {
  const labels: Record<NarrationState, string> = {
    queued: '排队中',
    use: '执行中',
    progress: '进行中',
    result: '已完成',
    error: '失败',
    rejected: '已拒绝'
  }
  return labels[props.group.current_state]
})

const latestEvent = computed(() => props.group.events[props.group.events.length - 1])

// ──────────────────────────────────────────────────────────────────
// Live elapsed timer for in-flight tool calls.
//
// Why: long-running file-generation tools (invoke_skill / run_python) sit in
// the `use` state for 30–60s while the sandbox executes, and the backend emits
// NO intermediate events during that window. Without a ticking signal the UI
// looks frozen. A purely client-side timer (anchored to when this card first
// observed an in-flight state, NOT a server timestamp — avoids clock skew)
// ticks every second and proves the run is alive, regardless of backend events.
// Hidden for the first 2s so fast tools (web_search ~1s) don't flash a timer.
// ──────────────────────────────────────────────────────────────────
const IN_FLIGHT_STATES: NarrationState[] = ['queued', 'use', 'progress']
const isInFlight = computed<boolean>(() => IN_FLIGHT_STATES.includes(props.group.current_state))

const startedAtMs = ref<number | null>(null)
const nowMs = ref<number>(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null

const stopTicker = (): void => {
  if (ticker != null) {
    clearInterval(ticker)
    ticker = null
  }
}

watch(
  isInFlight,
  (active) => {
    if (active) {
      if (startedAtMs.value == null) startedAtMs.value = Date.now()
      nowMs.value = Date.now()
      if (ticker == null) {
        ticker = setInterval(() => {
          nowMs.value = Date.now()
        }, 1000)
      }
    } else {
      stopTicker()
    }
  },
  { immediate: true }
)

onUnmounted(stopTicker)

const elapsedSec = computed<number>(() => {
  if (startedAtMs.value == null) return 0
  return Math.max(0, Math.floor((nowMs.value - startedAtMs.value) / 1000))
})

/** Only surface the timer once a tool has been running a beat (≥2s). */
const showElapsed = computed<boolean>(() => isInFlight.value && elapsedSec.value >= 2)

const elapsedText = computed<string>(() => {
  const s = elapsedSec.value
  if (s < 60) return `已用时 ${s} 秒`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem === 0 ? `已用时 ${m} 分` : `已用时 ${m} 分 ${rem} 秒`
})

// agent-mode v2 #2 (use_skill): 已知的 platform AgentTool 名集合。
// 渲染本身完全靠 event.icon + event.message 通用流（backend tool-display.yaml
// 已模板化好），这里仅做诊断 warn — 后端 emit 陌生 tool 名时提醒前端补 entry。
// 新增 platform tool 时把名字加进来即可消音 warn。
const KNOWN_TOOL_NAMES = new Set<string>([
  'use_skill',
  'ask_user_question',
  'remember',
  'plan_emit',
  'final_answer',
  'file_read',
  'file_write',
  // File-generation platform tools (2026-05-29). Registered here so they
  // render via the generic icon+message pipeline WITHOUT logging a spurious
  // "unknown tool" warn on every run. Their narration templates live in
  // numind-server configs/tool-display.yaml.
  'invoke_skill',
  'run_python',
  'create_html',
  'create_csv',
  'create_json',
  'create_text',
  'create_png_chart',
  'image_gen',
  'analyze_image',
  'annotate_image'
  // SOP-derived skill tools 走 binding 动态生成，名字以 sop_ 前缀 — 见 isKnownTool()。
])
const warnedUnknown = new Set<string>()
const isKnownTool = (name: string): boolean => {
  if (KNOWN_TOOL_NAMES.has(name)) return true
  // SOP-bound tools 命名约定见 numind-server/internal/numind/biz/agent/factory_sop.go
  if (name.startsWith('sop_')) return true
  return false
}

// 渲染 icon 优先级：event.icon → STATE_ICON[state]
const iconFor = (state: NarrationState, providedIcon?: string): string => {
  if (providedIcon && providedIcon.length > 0) return providedIcon
  return STATE_ICON[state]
}

const colorClassFor = (state: NarrationState): string => {
  return STATE_COLOR_CLASS[state]
}

// 该 tool group 是 use_skill 调用 — 加 .skill-use class 让 CSS 单独排版
// （Skill 调用是"扩展能力"语义事件，比普通 tool call 更值得视觉强调）。
const isSkillUse = computed<boolean>(() => props.group.tool_name === 'use_skill')

// 监听 tool name，发现陌生 tool 就 warn 一次（同名只 warn 一次避免刷屏）。
watch(
  () => props.group.tool_name,
  (name) => {
    if (!name || isKnownTool(name)) return
    if (warnedUnknown.has(name)) return
    warnedUnknown.add(name)
    console.warn(
      `[AgentToolCallItem] Unknown narration tool_name: "${name}". ` +
        `Falling back to generic icon+message render. ` +
        `If this is a new platform tool, register it in tool-display.yaml and KNOWN_TOOL_NAMES.`
    )
  },
  { immediate: true }
)
</script>

<template>
  <div :class="['tool-call-item', { 'skill-use': isSkillUse }]">
    <!-- T13: Status badge — upper-right colored dot reflecting current_state.
         NOTE: role="status" removed (P1 fix). With 10+ concurrent tool calls
         the implicit aria-live="polite" causes screen readers to announce every
         state transition per card, making the chat unusable for SR users.
         :title attribute also removed (2026-05-28 follow-up): on some
         browsers / IME states the native tooltip rendered overlapping the
         inline <span class="status-label"> text and produced a "ghost text"
         doubling effect. aria-label alone preserves SR accessibility. -->
    <span :class="badgeClass" :aria-label="badgeLabel">
      <span class="status-dot" />
      <span class="status-label">{{ badgeLabel }}</span>
    </span>
    <!-- compact: 只显示最新事件 -->
    <p v-if="compact" :class="['tool-line', colorClassFor(latestEvent.state)]">
      <span
        :class="[
          'tool-icon',
          { 'animated-dots': ['queued', 'use', 'progress'].includes(latestEvent.state) }
        ]"
      >
        {{ iconFor(latestEvent.state, latestEvent.icon) }}
      </span>
      <span class="tool-msg">{{ latestEvent.message }}</span>
      <span v-if="latestEvent.state === 'progress' && latestEvent.detail" class="tool-detail-text">
        · {{ latestEvent.detail }}
      </span>
      <span v-if="showElapsed" class="tool-elapsed">· {{ elapsedText }}</span>
      <span v-if="latestEvent.state === 'rejected' && latestEvent.reason" class="tool-detail-text">
        ({{ latestEvent.reason }})
      </span>
    </p>

    <!-- expanded: 显示所有事件的 6 态历程 -->
    <template v-else>
      <p
        v-for="(ev, idx) in group.events"
        :key="idx"
        :class="['tool-line', colorClassFor(ev.state)]"
      >
        <span
          :class="[
            'tool-icon',
            { 'animated-dots': ['queued', 'use', 'progress'].includes(ev.state) }
          ]"
        >
          {{ iconFor(ev.state, ev.icon) }}
        </span>
        <span class="tool-msg">{{ ev.message }}</span>
        <span v-if="ev.state === 'progress' && ev.detail" class="tool-detail-text">
          · {{ ev.detail }}
        </span>
        <span v-if="showElapsed && idx === group.events.length - 1" class="tool-elapsed">
          · {{ elapsedText }}
        </span>
        <span v-if="ev.state === 'rejected' && ev.reason" class="tool-detail-text">
          ({{ ev.reason }})
        </span>
      </p>
    </template>
  </div>
</template>

<style scoped>
.tool-line {
  margin: 2px 0;
  font-size: 13px;
  color: var(--color-text-muted, #4b5563);
  line-height: 1.5;
}

.tool-icon {
  display: inline-block;
  width: 18px;
  margin-right: 6px;
  text-align: center;
}

.tool-msg {
  word-break: break-word;
}

.tool-detail-text {
  color: #9ca3af;
  margin-left: 4px;
  font-size: 12px;
}

/* Live elapsed timer on an in-flight tool call. Subtle muted text with a
   gentle opacity pulse so it reads as actively counting (the "it's alive"
   signal for long file-generation tools). Uses tabular-nums so the seconds
   digit doesn't cause horizontal jitter as it ticks. */
.tool-elapsed {
  color: #6b7280;
  margin-left: 4px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  animation: elapsed-pulse 1.6s ease-in-out infinite;
}

@keyframes elapsed-pulse {
  0%,
  100% {
    opacity: 0.65;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tool-elapsed {
    animation: none;
  }
}

/* ─────────────────────────────────────────────────────────────────
   T13: Status badge — per-tool-call colored dot in the upper-right
   ───────────────────────────────────────────────────────────────── */

.tool-call-item {
  position: relative;
  /* P2 fix: guarantee clearance so the absolute-positioned status badge
     never visually collides with long tool message text. */
  padding-right: 60px;
}

.status-badge {
  position: absolute;
  top: 2px;
  right: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  line-height: 1;
  pointer-events: none;
  user-select: none;
}

.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  /* 200ms color transition when state changes */
  transition:
    background-color 0.2s ease,
    box-shadow 0.2s ease;
  flex-shrink: 0;
}

.status-label {
  font-size: 11px;
  transition: color 0.2s ease;
}

/* queued — gray */
.status-badge--queued .status-dot {
  background-color: #9ca3af;
}
.status-badge--queued .status-label {
  color: #9ca3af;
}

/* use — blue solid */
.status-badge--use .status-dot {
  background-color: #3b82f6;
}
.status-badge--use .status-label {
  color: #3b82f6;
}

/* progress — blue + spinning ring (~1s rotation) */
.status-badge--progress .status-dot {
  background-color: transparent;
  border: 2px solid #3b82f6;
  border-top-color: transparent;
  animation: badge-spin 1s linear infinite;
  /* slightly bigger to look like a ring */
  width: 8px;
  height: 8px;
}
.status-badge--progress .status-label {
  color: #3b82f6;
}

@keyframes badge-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* result — green */
.status-badge--result .status-dot {
  background-color: #10b981;
}
.status-badge--result .status-label {
  color: #10b981;
}

/* error — red */
.status-badge--error .status-dot {
  background-color: #ef4444;
}
.status-badge--error .status-label {
  color: #ef4444;
}

/* rejected — dark red/orange */
.status-badge--rejected .status-dot {
  background-color: #dc2626;
}
.status-badge--rejected .status-label {
  color: #dc2626;
}

/* use_skill 调用气泡：左缘强调色 + 浅底，与普通 tool call 视觉区分。
   Skill 是"扩展能力"语义事件，比一次普通 tool call 信息密度更高，
   值得一个轻微的视觉锚点（不喧宾夺主）。 */
.tool-call-item.skill-use {
  border-left: 2px solid #6366f1;
  padding-left: 8px;
  background: rgba(99, 102, 241, 0.04);
  border-radius: 4px;
}

/* State color classes */
.narration-state-queued,
.narration-state-use,
.narration-state-progress {
  color: #3b82f6;
}

.narration-state-result {
  color: #059669;
}

.narration-state-error {
  color: #d97706;
}

.narration-state-rejected {
  color: #dc2626;
}

/* Animated ⋯ for queued/use/progress states */
.animated-dots {
  animation: dots-pulse 1.5s ease-in-out infinite;
}

@keyframes dots-pulse {
  0%,
  100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}
</style>
