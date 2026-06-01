<template>
  <Teleport to="body">
    <Transition name="overlay-fade">
      <div v-if="open" class="ccl-overlay" @click.self="close">
        <div class="ccl-dialog" role="dialog" aria-modal="true" aria-labelledby="ccl-dialog-title">
          <header class="ccl-header">
            <h3 id="ccl-dialog-title" class="ccl-title">积分消耗记录</h3>
            <button class="ccl-close" type="button" aria-label="关闭" @click="close">×</button>
          </header>
          <div class="ccl-body">
            <p v-if="store.error" class="ccl-error">
              加载失败，<button class="ccl-retry" type="button" @click="store.fetchPage(1)">重试</button>
            </p>
            <DataTable
              :columns="columns"
              :data="rows"
              :loading="store.loading"
              :total="store.total"
              :page="store.page"
              :page-size="store.pageSize"
              empty-text="暂无积分消耗记录"
              @update:page="store.fetchPage"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'

import type { ConsumptionLogItem } from '@/api/credits'
import DataTable from '@/components/common/DataTable.vue'
import { useConsumptionLogStore } from '@/stores/consumptionLog'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const store = useConsumptionLogStore()

const columns = [
  { key: 'created_at', title: '时间', width: '180px', align: 'left' as const },
  { key: 'action_label', title: '动作', align: 'left' as const },
  { key: 'credits', title: '消耗积分', width: '110px', align: 'right' as const }
]

// 渲染行：时间格式化为 YYYY-MM-DD HH:mm（credits 正整数展示）
const rows = computed(() =>
  store.records.map((r: ConsumptionLogItem) => ({
    ...r,
    created_at: formatTime(r.created_at)
  }))
)

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function close(): void {
  emit('update:open', false)
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && props.open) close()
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      store.fetchPage(1)
      document.addEventListener('keydown', onKey)
    } else {
      document.removeEventListener('keydown', onKey)
      store.reset() // 关闭时清掉旧分页/记录，避免下次打开闪现陈旧数据
    }
  },
  { immediate: true } // 若组件以 open=true 挂载也能正确注册 ESC 监听
)

onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<style scoped>
.ccl-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}
.ccl-dialog {
  width: 100%;
  max-width: 640px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--color-surface, #fff);
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}
.ccl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #eee);
}
.ccl-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.ccl-close {
  border: none;
  background: none;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  color: var(--color-text-secondary, #888);
}
.ccl-body {
  padding: 16px 20px;
  overflow: auto;
}
.ccl-error {
  margin: 0 0 12px;
  color: var(--color-danger, #d33);
  font-size: 13px;
}
.ccl-retry {
  border: none;
  background: none;
  color: var(--color-primary, #2563eb);
  cursor: pointer;
  text-decoration: underline;
}
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
