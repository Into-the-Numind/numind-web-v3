<script setup lang="ts">
import { computed } from 'vue'
import type { ToolCallAggregate, NarrationState } from '@/types/agent'
import { STATE_ICON, STATE_COLOR_CLASS } from '@/shared/agent-icons'

interface Props {
  group: ToolCallAggregate
  /** 紧凑模式（折叠时预览）只显示最新事件 */
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), { compact: false })

const latestEvent = computed(() => props.group.events[props.group.events.length - 1])

// 渲染 icon 优先级：event.icon → STATE_ICON[state]
const iconFor = (state: NarrationState, providedIcon?: string): string => {
  if (providedIcon && providedIcon.length > 0) return providedIcon
  return STATE_ICON[state]
}

const colorClassFor = (state: NarrationState): string => {
  return STATE_COLOR_CLASS[state]
}
</script>

<template>
  <div class="tool-call-item">
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
