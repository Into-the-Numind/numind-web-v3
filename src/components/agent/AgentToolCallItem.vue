<script setup lang="ts">
import { computed, watch } from 'vue'
import type { ToolCallAggregate, NarrationState } from '@/types/agent'
import { STATE_ICON, STATE_COLOR_CLASS } from '@/shared/agent-icons'

interface Props {
  group: ToolCallAggregate
  /** 紧凑模式（折叠时预览）只显示最新事件 */
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), { compact: false })

const latestEvent = computed(() => props.group.events[props.group.events.length - 1])

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
  'file_write'
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
