<!--
  SkillHistory — Skill 版本历史时间线 + diff 对比 + 回滚

  左侧：版本时间线（按 version desc）
  右侧：选中版本 vs 当前版本的 body_md diff

  agent-mode-v2-skill-as-artifact (S4 T12)
-->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSkillStore } from '@/stores/skill'
import { useNotificationsStore } from '@/stores/notifications'
import AppButton from '@/components/common/AppButton.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import DiffViewer from './components/DiffViewer.vue'
import { formatDateTime } from '@/utils/datetime'

const route = useRoute()
const router = useRouter()
const store = useSkillStore()
const notifications = useNotificationsStore()

const skillId = computed(() => Number(route.params.id))

const selectedVersion = ref<number | null>(null)
const restoreVisible = ref(false)
const restoring = ref(false)

onMounted(async () => {
  await Promise.all([store.fetchOne(skillId.value), store.fetchHistory(skillId.value)])
  // 默认选中倒数第二个版本（与当前对比有意义）
  if (store.history.length > 1) {
    selectedVersion.value = store.history[1].version
  } else if (store.history.length === 1) {
    selectedVersion.value = store.history[0].version
  }
})

watch(skillId, async (newId) => {
  if (newId) {
    selectedVersion.value = null
    await Promise.all([store.fetchOne(newId), store.fetchHistory(newId)])
    if (store.history.length > 1) {
      selectedVersion.value = store.history[1].version
    }
  }
})

const selectedItem = computed(() => {
  if (selectedVersion.value === null) return null
  return store.history.find((h) => h.version === selectedVersion.value) || null
})

// 当前版本作为 new；选中版本快照作为 old
const currentBody = computed(() => store.current?.body_md || '')
const selectedBody = computed(() => selectedItem.value?.snapshot?.body_md || '')

function selectVersion(version: number) {
  selectedVersion.value = version
}

function confirmRestore() {
  if (selectedVersion.value === null) return
  restoreVisible.value = true
}

async function executeRestore() {
  if (selectedVersion.value === null) return
  restoring.value = true
  try {
    const restored = await store.restore(skillId.value, selectedVersion.value)
    notifications.success(`已回滚到 v${selectedVersion.value}（新版本 v${restored.version}）`)
    // 回滚成功后跳回详情页查看效果
    router.push(`/config/skills/${skillId.value}`)
  } catch (e) {
    notifications.error((e as Error).message || '回滚失败')
  } finally {
    restoring.value = false
    restoreVisible.value = false
  }
}

function cancelRestore() {
  restoreVisible.value = false
}

function goBack() {
  router.push(`/config/skills/${skillId.value}`)
}
</script>

<template>
  <div class="skill-history">
    <header class="skill-history__header">
      <div class="skill-history__title-block">
        <AppButton variant="text" size="sm" @click="goBack">← 返回详情</AppButton>
        <h2>版本历史</h2>
        <span v-if="store.current" class="skill-history__current">
          {{ store.current.name }} · 当前 v{{ store.current.version }}
        </span>
      </div>
      <AppButton
        variant="primary"
        :disabled="selectedVersion === null || selectedVersion === store.current?.version"
        @click="confirmRestore"
      >
        回滚到 v{{ selectedVersion ?? '?' }}
      </AppButton>
    </header>

    <div class="skill-history__body">
      <!-- 左侧时间线 -->
      <aside class="skill-history__timeline">
        <div v-if="store.historyLoading" class="state state--loading">加载中…</div>
        <div v-else-if="store.historyError" class="state state--error">
          {{ store.historyError }}
        </div>
        <div v-else-if="store.history.length === 0" class="state state--empty">
          还没有任何版本历史
        </div>
        <ul v-else class="timeline">
          <li
            v-for="item in store.history"
            :key="item.id"
            :class="[
              'timeline__item',
              { 'timeline__item--selected': selectedVersion === item.version }
            ]"
            @click="selectVersion(item.version)"
          >
            <div class="timeline__dot" />
            <div class="timeline__content">
              <div class="timeline__version">
                v{{ item.version }}
                <span v-if="item.version === store.current?.version" class="badge badge--current">
                  当前
                </span>
              </div>
              <div class="timeline__summary">{{ item.diff_summary || '—' }}</div>
              <div class="timeline__time">{{ formatDateTime(item.created_at) }}</div>
            </div>
          </li>
        </ul>
      </aside>

      <!-- 右侧 diff -->
      <section class="skill-history__diff">
        <header class="panel-header">
          <h3>
            <template v-if="selectedItem">
              v{{ selectedItem.version }} → 当前 v{{ store.current?.version }} 的 body_md 对比
            </template>
            <template v-else>选择左侧一个版本查看 diff</template>
          </h3>
        </header>
        <DiffViewer v-if="selectedItem" :old-text="selectedBody" :new-text="currentBody" />
      </section>
    </div>

    <ConfirmModal
      :model-value="restoreVisible"
      title="确认回滚？"
      :message="`将创建一个新版本，内容来自 v${selectedVersion}。\n当前版本不会被删除（出现在历史里）。`"
      :variant="'danger'"
      confirm-text="确认回滚"
      cancel-text="取消"
      @confirm="executeRestore"
      @cancel="cancelRestore"
    />
  </div>
</template>

<style scoped>
.skill-history {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.skill-history__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.skill-history__title-block {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.skill-history__title-block h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.skill-history__current {
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.skill-history__body {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: var(--space-4);
}

.skill-history__timeline,
.skill-history__diff {
  background: var(--surface);
  border-radius: var(--radius-md);
  border: 1px solid rgba(169, 180, 185, 0.1);
  padding: var(--space-4);
}

.state {
  text-align: center;
  padding: var(--space-6);
  color: var(--text-muted);
  font-size: 0.875rem;
}

.state--error {
  color: var(--danger, #dc2626);
}

.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.timeline__item {
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: var(--space-3);
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.timeline__item:hover {
  background: var(--surface-tint);
}

.timeline__item--selected {
  background: rgba(99, 102, 241, 0.08);
  outline: 1px solid var(--primary);
}

.timeline__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
  margin-top: 6px;
  align-self: start;
}

.timeline__version {
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--text);
}

.badge--current {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 8px;
  border-radius: 9px;
  background: rgba(34, 197, 94, 0.1);
  color: #15803d;
  font-size: 0.6875rem;
}

.timeline__summary {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin-top: 2px;
  line-height: 1.4;
}

.timeline__time {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 4px;
}

.panel-header h3 {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

@media (max-width: 900px) {
  .skill-history__body {
    grid-template-columns: 1fr;
  }
}
</style>
