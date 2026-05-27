<script setup lang="ts">
import { computed } from 'vue'
import type { AgentSkill, AgentRun } from '@/types/agent'
import AppButton from '@/components/common/AppButton.vue'
import { Pause } from 'lucide-vue-next'

interface Props {
  agent: AgentSkill | null
  run: AgentRun | null
  balance: number
  readOnly?: boolean
  cancelling?: boolean
  /** stuck 60s 之后强制 enable 取消按钮 */
  cancelAlwaysEnabled?: boolean
  sidebarOpen?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  readOnly: false,
  cancelling: false,
  cancelAlwaysEnabled: false,
  sidebarOpen: false
})

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'toggle-sidebar'): void
}>()

const statusBadge = computed<{ icon: string; label: string; color: string }>(() => {
  if (props.readOnly) return { icon: '📂', label: '已结束', color: 'gray' }
  const s = props.run?.status
  if (!s) return { icon: '⚪', label: '待命', color: 'gray' }
  if (s === 'running' || s === 'pending') {
    if (props.run?.credits_threshold_state === 'warning_60') {
      return { icon: '🟡', label: '进行中', color: 'orange' }
    }
    return { icon: '🟢', label: '进行中', color: 'green' }
  }
  if (s === 'completed') return { icon: '✅', label: '已完成', color: 'green' }
  if (s === 'cancelled') return { icon: '⏸', label: '已取消', color: 'gray' }
  if (s === 'failed' || s === 'timeout') return { icon: '❌', label: '任务失败', color: 'red' }
  if (s === 'budget_exhausted') return { icon: '💳', label: '积分用尽', color: 'red' }
  return { icon: '⚪', label: '待命', color: 'gray' }
})

const showCancel = computed(() => {
  if (props.readOnly) return false
  const s = props.run?.status
  return s === 'running' || s === 'pending' || props.cancelAlwaysEnabled
})

const cancelDisabled = computed(() => props.cancelling)

const creditsUsed = computed(() => props.run?.credits_used ?? 0)
</script>

<template>
  <header class="agent-chat-header" :class="['status-' + statusBadge.color]">
    <div class="left">
      <button class="sidebar-toggle" @click="emit('toggle-sidebar')" aria-label="切换侧边栏">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <span class="emoji">
        <span v-if="agent?.emoji">{{ agent.emoji }}</span>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="bot-header-svg"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>
      </span>
      <h2 class="name">{{ agent?.name ?? 'AI 助手' }}</h2>
      
      <div class="center-info">
        <span class="credits">已用 {{ creditsUsed }} 积分</span>
        <span class="separator desktop-only" aria-hidden="true">·</span>
        <span class="balance desktop-only">余额 {{ balance }}</span>
      </div>
    </div>

    <div class="right">
      <AppButton
        v-if="showCancel"
        variant="secondary"
        size="sm"
        class="cancel-btn"
        :disabled="cancelDisabled"
        @click="emit('cancel')"
      >
        <Pause :size="14" /> <span>取消任务</span>
      </AppButton>
    </div>
  </header>
</template>

<style scoped>
.agent-chat-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  background: var(--bg, #fff);
  border-bottom: 1px solid hsla(160, 20%, 88%, 0.5);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.01);
}

.left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sidebar-toggle {
  display: none;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.2s;
  align-items: center;
  justify-content: center;
}

.sidebar-toggle:hover {
  background: var(--surface-hover, rgba(0, 0, 0, 0.04));
  color: var(--text);
}

.emoji {
  font-size: 20px;
  display: flex;
  align-items: center;
}

.bot-header-svg {
  color: hsl(160, 50%, 45%);
}

.name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0;
}

.center-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  margin-left: 12px;
  padding-left: 12px;
  border-left: 1px solid rgba(0, 0, 0, 0.08);
}

.badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 500;
}

.badge-green {
  color: #059669;
  background: #d1fae5;
}

.badge-orange {
  color: #d97706;
  background: #fef3c7;
}

.badge-red {
  color: #b91c1c;
  background: #fee2e2;
}

.badge-gray {
  color: #4b5563;
  background: #f3f4f6;
}

.separator {
  color: #e5e7eb;
}

.right {
  display: flex;
  align-items: center;
}

/* cancel 按钮覆盖为红色 danger 风格 */
.cancel-btn {
  color: #b91c1c !important;
  border-color: #fca5a5 !important;
}

.cancel-btn:hover:not(:disabled) {
  background: #fee2e2 !important;
  border-color: #ef4444 !important;
}

/* 移动端响应式布局 */
@media (max-width: 768px) {
  .sidebar-toggle {
    display: flex;
  }
  .agent-chat-header {
  }
  .desktop-only {
    display: none;
  }
}
</style>
