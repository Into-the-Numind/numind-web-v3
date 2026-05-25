<script setup lang="ts">
import { computed } from 'vue'
import type { AgentSkill, AgentRun } from '@/types/agent'
import AppButton from '@/components/common/AppButton.vue'
import { Pause, ArrowLeft } from 'lucide-vue-next'

interface Props {
  agent: AgentSkill | null
  run: AgentRun | null
  balance: number
  readOnly?: boolean
  cancelling?: boolean
  /** stuck 60s 之后强制 enable 取消按钮 */
  cancelAlwaysEnabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  readOnly: false,
  cancelling: false,
  cancelAlwaysEnabled: false
})

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'back'): void
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
      <button class="back-btn" @click="emit('back')" title="返回">
        <ArrowLeft :size="18" />
      </button>
      <span class="emoji">{{ agent?.emoji ?? '🤖' }}</span>
      <h2 class="name">{{ agent?.name ?? 'AI 助手' }}</h2>
    </div>

    <div class="center">
      <span class="badge" :class="'badge-' + statusBadge.color">
        {{ statusBadge.icon }} {{ statusBadge.label }}
      </span>
      <span class="separator" aria-hidden="true">·</span>
      <span class="credits">已用 {{ creditsUsed }} 积分</span>
      <span class="separator desktop-only" aria-hidden="true">·</span>
      <span class="balance desktop-only">余额 {{ balance }}</span>
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
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 12px 20px;
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.agent-chat-header.status-orange {
  border-bottom-color: #f59e0b;
}
.agent-chat-header.status-red {
  border-bottom-color: #ef4444;
}

.left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-surface, #fff);
  color: var(--color-text-muted, #6b7280);
  cursor: pointer;
  transition: all 0.2s ease;
}

.back-btn:hover {
  background: var(--color-surface-tint, #f3f4f6);
  color: var(--color-text, #1f2937);
  border-color: var(--color-accent, #2563eb);
}

.emoji {
  font-size: 22px;
}

.name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0;
}

.center {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
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
  color: #d1d5db;
}

.right {
  justify-self: end;
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

/* 移动端：隐藏 balance，仅显示已用积分 + 取消按钮 */
@media (max-width: 768px) {
  .agent-chat-header {
    grid-template-columns: 1fr auto;
    padding: 10px 12px;
  }
  .left .name {
    display: none;
  }
  .center {
    grid-row: 2;
    grid-column: 1 / -1;
    justify-content: flex-start;
    font-size: 12px;
  }
  .desktop-only {
    display: none;
  }
}
</style>
