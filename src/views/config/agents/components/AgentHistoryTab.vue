<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAgentBuilderStore } from '@/stores/agentBuilder'
import { useNotificationsStore } from '@/stores/notifications'
import { formatDate } from '@/utils/datetime'
import type { AgentHistory } from '@/types/agentBuilder'
import type { Column } from '@/components/common/DataTable.vue'
import DataTable from '@/components/common/DataTable.vue'
import AppButton from '@/components/common/AppButton.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import HistoryViewModal from './HistoryViewModal.vue'

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  agentId: number
}

const props = defineProps<Props>()

// ── Composables ────────────────────────────────────────────────────────────

const store = useAgentBuilderStore()
const notifications = useNotificationsStore()

// ── Local state ────────────────────────────────────────────────────────────

const viewModalVisible = ref(false)
const viewSnapshot = ref<AgentHistory | null>(null)

const restoreConfirmVisible = ref(false)
const restoreTarget = ref<AgentHistory | null>(null)

// ── Computed ───────────────────────────────────────────────────────────────

const currentVersion = computed(() => store.current?.version ?? -1)

const maxVersion = computed(() => store.history.reduce((m, h) => Math.max(m, h.version), 0))

const columns: Column[] = [
  { key: 'version', title: '版本', width: '80px', align: 'center' },
  { key: 'created_at', title: '创建时间', align: 'left' },
  { key: 'changes_summary', title: '变更摘要', align: 'left' },
  { key: 'actions', title: '操作', width: '160px', align: 'center' }
]

// ── Lifecycle ──────────────────────────────────────────────────────────────

onMounted(async () => {
  // store.fetchHistory sets historyError on failure; swallow the re-throw here
  // so Vue's async onMounted doesn't produce an unhandled rejection.
  await store.fetchHistory(props.agentId).catch(() => {})
})

// ── Handlers ───────────────────────────────────────────────────────────────

function openView(h: AgentHistory) {
  viewSnapshot.value = h
  viewModalVisible.value = true
}

function closeView() {
  viewModalVisible.value = false
  viewSnapshot.value = null
}

function openRestoreConfirm(h: AgentHistory) {
  restoreTarget.value = h
  restoreConfirmVisible.value = true
}

function cancelRestore() {
  restoreConfirmVisible.value = false
  restoreTarget.value = null
}

async function confirmRestore() {
  if (!restoreTarget.value) return
  const { version } = restoreTarget.value
  restoreConfirmVisible.value = false
  restoreTarget.value = null
  try {
    await store.restore(props.agentId, version)
    notifications.success('已恢复')
  } catch {
    notifications.error('恢复失败，请重试')
  }
}

async function retryFetch() {
  await store.fetchHistory(props.agentId)
}
</script>

<template>
  <div class="agent-history-tab">
    <!-- Loading -->
    <div v-if="store.historyLoading" class="history-loading">
      <DataTable :columns="columns" :data="[]" :loading="true" :total="0" />
    </div>

    <!-- Error -->
    <div v-else-if="store.historyError" class="history-error">
      <p class="history-error__msg">{{ store.historyError }}</p>
      <AppButton variant="secondary" size="sm" @click="retryFetch">重试</AppButton>
    </div>

    <!-- Success (including empty) -->
    <template v-else>
      <DataTable
        :columns="columns"
        :data="store.history"
        :total="store.history.length"
        :loading="false"
        row-key="id"
        empty-text="暂无历史版本"
      >
        <!-- Version cell -->
        <template #cell-version="{ row }">
          <span class="version-cell">v{{ (row as AgentHistory).version }}</span>
        </template>

        <!-- created_at cell -->
        <template #cell-created_at="{ row }">
          {{ formatDate((row as AgentHistory).created_at) }}
        </template>

        <!-- changes_summary cell -->
        <template #cell-changes_summary="{ row }">
          <span class="summary-cell">
            {{ (row as AgentHistory).changes_summary || '-' }}
          </span>
        </template>

        <!-- Actions cell -->
        <template #cell-actions="{ row }">
          <div class="actions-cell">
            <!-- Current version: static badge, no buttons -->
            <span v-if="(row as AgentHistory).version === currentVersion" class="current-badge"
              >当前版本</span
            >

            <!-- Other versions: view + restore -->
            <template v-else>
              <AppButton variant="text" size="sm" @click="openView(row as AgentHistory)"
                >查看</AppButton
              >
              <AppButton
                variant="secondary"
                size="sm"
                @click="openRestoreConfirm(row as AgentHistory)"
                >恢复</AppButton
              >
            </template>
          </div>
        </template>
      </DataTable>
    </template>

    <!-- History View Modal -->
    <HistoryViewModal
      v-if="viewSnapshot"
      :visible="viewModalVisible"
      :snapshot="viewSnapshot.snapshot"
      @close="closeView"
    />

    <!-- Restore Confirm Modal -->
    <ConfirmModal
      :model-value="restoreConfirmVisible"
      :title="restoreTarget ? `确认恢复到 v${restoreTarget.version}？` : '确认恢复'"
      :message="
        restoreTarget
          ? `恢复将创建 v${maxVersion + 1}，当前 v${currentVersion} 仍保留在历史中。`
          : ''
      "
      confirm-text="确认恢复"
      cancel-text="取消"
      variant="danger"
      @confirm="confirmRestore"
      @cancel="cancelRestore"
    />
  </div>
</template>

<style scoped>
.agent-history-tab {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.history-loading {
  /* pass-through; DataTable handles skeleton */
}

.history-error {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.15);
  border-radius: var(--radius-sm);
  color: var(--danger);
}

.history-error__msg {
  flex: 1;
  font-size: var(--text-sm);
}

.version-cell {
  font-family: var(--font-mono, monospace);
  font-size: var(--text-sm);
  font-weight: 600;
}

.summary-cell {
  font-size: var(--text-sm);
  color: var(--on-surface-variant);
}

.actions-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}

.current-badge {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  background: var(--surface-high);
  border-radius: var(--radius-full, 9999px);
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--on-surface-variant);
  white-space: nowrap;
}
</style>
