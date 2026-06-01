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
            <!-- error -->
            <div v-if="store.error" class="ccl-error">
              加载失败，<button class="ccl-retry" type="button" @click="store.fetchPage(1)">重试</button>
            </div>

            <!-- loading -->
            <div v-else-if="store.loading" class="loading-state">
              <div class="loading-spinner"></div>
              <div class="loading-text">加载中…</div>
            </div>

            <!-- empty -->
            <div v-else-if="store.records.length === 0" class="empty-state">
              <p class="empty-text">暂无积分消耗记录</p>
            </div>

            <!-- table (与「客户管理」表格风格一致) -->
            <template v-else>
              <div class="table-container">
                <div class="table-scroll">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th class="col-time">时间</th>
                        <th class="col-action">动作</th>
                        <th class="col-credits">消耗积分</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="r in store.records" :key="r.id" class="data-row">
                        <td class="col-time">{{ formatTime(r.created_at) }}</td>
                        <td class="col-action">{{ r.action_label }}</td>
                        <td class="col-credits">{{ r.credits }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div v-if="totalPages > 1" class="pagination">
                <button
                  class="page-btn"
                  :disabled="store.page <= 1"
                  @click="store.fetchPage(store.page - 1)"
                >
                  上一页
                </button>
                <span class="page-info">{{ store.page }} / {{ totalPages }}</span>
                <button
                  class="page-btn"
                  :disabled="store.page >= totalPages"
                  @click="store.fetchPage(store.page + 1)"
                >
                  下一页
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'

import { useConsumptionLogStore } from '@/stores/consumptionLog'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const store = useConsumptionLogStore()

const totalPages = computed(() => Math.max(1, Math.ceil(store.total / store.pageSize)))

// 时间格式化为 YYYY-MM-DD HH:mm
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
/* ===== Modal shell（与客户管理一致的绿调卡片语言）===== */
.ccl-overlay {
  position: fixed;
  inset: 0;
  background: hsl(150 15% 10% / 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}
.ccl-dialog {
  width: 100%;
  max-width: 680px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, hsla(0, 0%, 100%, 0.98), hsla(150, 12%, 98%, 0.96));
  border: 1px solid hsla(155, 30%, 90%, 0.8);
  border-radius: 20px;
  box-shadow:
    0 24px 64px hsl(150 15% 5% / 0.18),
    inset 0 1px 0 0 hsla(0, 0%, 100%, 0.6);
  overflow: hidden;
}
.ccl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  border-bottom: 1px solid hsl(155, 20%, 93%);
}
.ccl-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: hsl(155, 18%, 22%);
}
.ccl-close {
  border: none;
  background: none;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  color: hsl(155, 12%, 55%);
  transition: color 0.15s;
}
.ccl-close:hover {
  color: hsl(155, 18%, 30%);
}
.ccl-body {
  padding: 18px 22px 10px;
  overflow: auto;
}

/* ===== Table（复刻客户管理 .data-table 风格）===== */
.table-container {
  background: hsla(0, 0%, 100%, 0.6);
  border: 1px solid hsl(155, 20%, 93%);
  border-radius: 14px;
  overflow: hidden;
}
.table-scroll {
  overflow-x: auto;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.data-table th {
  padding: 13px 16px;
  font-size: 12px;
  font-weight: 600;
  color: hsl(155, 15%, 50%);
  letter-spacing: 0.04em;
  border-bottom: 1px solid hsl(155, 20%, 93%);
  white-space: nowrap;
  background: hsla(150, 15%, 98%, 0.5);
}
.data-table td {
  padding: 13px 16px;
  border-bottom: 1px solid hsl(155, 20%, 95%);
  color: hsl(155, 15%, 25%);
  vertical-align: middle;
}
.data-table tbody tr {
  transition: background 0.15s;
}
.data-table tbody tr:last-child td {
  border-bottom: none;
}
.data-table tbody tr:hover td {
  background: hsl(155, 20%, 98%);
}

/* 列对齐：时间/动作左对齐，消耗积分右对齐（数值） */
.col-time {
  text-align: left;
  white-space: nowrap;
  width: 180px;
}
.col-action {
  text-align: left;
}
.col-credits {
  text-align: right;
  white-space: nowrap;
  width: 110px;
  font-variant-numeric: tabular-nums;
}
.data-table td.col-credits {
  color: hsl(155, 18%, 22%);
  font-weight: 600;
}

/* ===== Pagination（复刻客户管理 .pagination）===== */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px 0 8px;
}
.page-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 7px 16px;
  border-radius: 10px;
  border: 1px solid hsl(155, 20%, 90%);
  background: transparent;
  font-size: 13px;
  color: hsl(155, 12%, 40%);
  cursor: pointer;
  transition: all 0.2s;
}
.page-btn:hover:not(:disabled) {
  background: hsl(155, 20%, 96%);
  color: var(--accent, hsl(158, 64%, 42%));
}
.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.page-info {
  font-size: 13px;
  color: hsl(155, 12%, 50%);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

/* ===== Loading ===== */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 20px;
}
.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid hsl(155, 30%, 90%);
  border-top-color: hsl(158, 64%, 45%);
  border-radius: 50%;
  animation: ccl-spin 0.8s linear infinite;
  margin-bottom: 14px;
}
@keyframes ccl-spin {
  to {
    transform: rotate(360deg);
  }
}
.loading-text {
  font-size: 14px;
  color: hsl(155, 12%, 50%);
}

/* ===== Empty ===== */
.empty-state {
  text-align: center;
  padding: 56px 20px;
}
.empty-text {
  margin: 0;
  font-size: 14px;
  color: hsl(155, 12%, 50%);
}

/* ===== Error ===== */
.ccl-error {
  margin: 0 0 12px;
  color: hsl(0, 65%, 52%);
  font-size: 13px;
}
.ccl-retry {
  border: none;
  background: none;
  color: var(--accent, hsl(158, 64%, 42%));
  cursor: pointer;
  text-decoration: underline;
}

/* ===== Transition ===== */
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}
.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
