<script setup lang="ts">
import { computed } from 'vue'
import type { AgentSkill, AgentRun } from '@/types/agent'
import AppButton from '@/components/common/AppButton.vue'
import { Pause } from 'lucide-vue-next'

interface Props {
  agent: AgentSkill | null
  run: AgentRun | null
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
      <h2 class="name">{{ agent?.name ?? 'AI 助手' }}</h2>
    </div>

    <div class="right">
      <!-- Run status (incl. 已结束 for a read-only / completed record) — the
           statusBadge computed existed but was never rendered, so a student had
           no signal a run was finished vs still live. -->
      <span class="status-badge" :class="'badge-' + statusBadge.color">
        <span class="badge-icon">{{ statusBadge.icon }}</span>
        <span class="badge-label">{{ statusBadge.label }}</span>
      </span>
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

.name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0;
}

.right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  background: hsla(160, 12%, 94%, 0.8);
  color: var(--text-muted, #6b7280);
}

/* gray (待命/已结束/已取消) intentionally uses the base .status-badge styles */
.badge-gray {
  /* no override — neutral default */
}

.badge-green {
  background: hsla(152, 60%, 94%, 0.9);
  color: #047857;
}

.badge-orange {
  background: hsla(38, 90%, 94%, 0.9);
  color: #b45309;
}

.badge-red {
  background: hsla(0, 80%, 96%, 0.9);
  color: #b91c1c;
}

.badge-icon {
  font-size: 11px;
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
}
</style>
