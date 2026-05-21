<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, ref } from "vue";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Inbox,
} from "lucide-vue-next";

export interface Column {
  key: string;
  title: string;
  width?: string;
  align?: "left" | "center" | "right";
}

interface Props {
  columns: Column[];
  data: T[];
  loading?: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
  rowKey?: string;
  emptyText?: string;
  clickable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  total: 0,
  page: 1,
  pageSize: 20,
  rowKey: "id",
  emptyText: "暂无数据",
  clickable: false,
});

const emit = defineEmits<{
  "update:page": [page: number];
  "row-click": [row: T];
}>();

const totalPages = computed(() =>
  Math.max(1, Math.ceil(props.total / props.pageSize)),
);

const pageNumbers = computed(() => {
  const pages: number[] = [];
  const total = totalPages.value;
  const current = props.page;
  let start = Math.max(1, current - 2);
  const end = Math.min(total, start + 4);
  start = Math.max(1, end - 4);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }
  return pages;
});

const jumpInput = ref("");

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value && page !== props.page) {
    emit("update:page", page);
  }
}

function handleJump() {
  const p = parseInt(jumpInput.value, 10);
  if (!isNaN(p)) {
    goToPage(p);
  }
  jumpInput.value = "";
}
</script>

<template>
  <div class="data-table-wrapper">
    <div class="data-table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="col.key"
              :style="col.width ? { width: col.width } : {}"
              :class="`align-${col.align || 'center'}`"
            >
              {{ col.title }}
            </th>
          </tr>
        </thead>
        <tbody>
          <template v-if="loading">
            <tr v-for="i in 5" :key="i">
              <td v-for="col in columns" :key="col.key">
                <div class="skeleton" />
              </td>
            </tr>
          </template>
          <template v-else-if="data.length === 0">
            <tr>
              <td :colspan="columns.length" class="empty-cell">
                <div class="empty-state">
                  <Inbox :size="40" />
                  <p>{{ emptyText }}</p>
                </div>
              </td>
            </tr>
          </template>
          <template v-else>
            <tr
              v-for="row in data"
              :key="String(row[rowKey])"
              class="data-row"
              :class="{ 'data-row--clickable': clickable }"
              @click="$emit('row-click', row)"
            >
              <td
                v-for="col in columns"
                :key="col.key"
                :class="`align-${col.align || 'center'}`"
              >
                <slot
                  :name="`cell-${col.key}`"
                  :row="row"
                  :value="row[col.key]"
                >
                  {{ row[col.key] ?? "-" }}
                </slot>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <div v-if="total > 0" class="pagination">
      <span class="pagination__info"> 共 {{ total }} 条 </span>
      <div class="pagination__controls">
        <button
          class="pagination__btn"
          :disabled="page <= 1"
          aria-label="首页"
          @click="goToPage(1)"
        >
          <ChevronsLeft :size="16" />
        </button>
        <button
          class="pagination__btn"
          :disabled="page <= 1"
          aria-label="上一页"
          @click="goToPage(page - 1)"
        >
          <ChevronLeft :size="16" />
        </button>
        <button
          v-for="p in pageNumbers"
          :key="p"
          class="pagination__btn"
          :class="{ 'pagination__btn--active': p === page }"
          @click="goToPage(p)"
        >
          {{ p }}
        </button>
        <button
          class="pagination__btn"
          :disabled="page >= totalPages"
          aria-label="下一页"
          @click="goToPage(page + 1)"
        >
          <ChevronRight :size="16" />
        </button>
        <button
          class="pagination__btn"
          :disabled="page >= totalPages"
          aria-label="尾页"
          @click="goToPage(totalPages)"
        >
          <ChevronsRight :size="16" />
        </button>
        <div class="pagination__jump">
          <input
            v-model="jumpInput"
            class="pagination__jump-input"
            type="text"
            :placeholder="`${page}/${totalPages}`"
            @keydown.enter="handleJump"
          />
          <button class="pagination__btn" @click="handleJump">跳转</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.data-table-wrapper {
  background: var(--surface);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  border: 1px solid rgba(169, 180, 185, 0.05);
  overflow: hidden;
}

.data-table-container {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  padding: 16px 24px;
  background: rgba(240, 244, 247, 0.5);
  border-bottom: 1px solid rgba(169, 180, 185, 0.1);
  white-space: nowrap;
}

.data-table td {
  font-size: 13px;
  padding: 16px 24px;
  color: var(--text);
  border-bottom: 1px solid rgba(169, 180, 185, 0.05);
  vertical-align: middle;
}

.data-row {
  transition: background var(--transition-fast);
}

.data-row--clickable {
  cursor: pointer;
}

.data-row:hover {
  background: var(--surface-tint);
}

.data-row:last-child td {
  border-bottom: none;
}

.align-left {
  text-align: left;
}
.align-center {
  text-align: center;
}
.align-right {
  text-align: right;
}

.empty-cell {
  padding: 0 !important;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) var(--space-6);
  color: var(--text-muted);
}

.empty-state p {
  margin-top: var(--space-3);
  font-size: 0.875rem;
}

.skeleton {
  height: 16px;
  background: linear-gradient(
    90deg,
    var(--surface-tint) 25%,
    var(--surface-hover) 50%,
    var(--surface-tint) 75%
  );
  background-size: 200% 100%;
  border-radius: var(--radius-sm);
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  background: rgba(240, 244, 247, 0.3);
  border-top: 1px solid rgba(169, 180, 185, 0.1);
}

.pagination__info {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.pagination__controls {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.pagination__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 var(--space-2);
  border: none;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  color: var(--text);
  background: transparent;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.pagination__btn:hover:not(:disabled) {
  background: var(--surface-hover);
}

.pagination__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pagination__btn--active {
  font-weight: 700;
  color: var(--text);
  background: transparent;
}

.pagination__btn--active:hover {
  background: var(--surface-hover);
}

.pagination__jump {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-left: var(--space-2);
}

.pagination__jump-input {
  width: 56px;
  height: 32px;
  padding: 0 var(--space-2);
  border: 1px solid rgba(169, 180, 185, 0.1);
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  color: var(--text);
  background: var(--surface);
  text-align: center;
  outline: none;
  transition: border-color var(--transition-fast);
}

.pagination__jump-input:focus {
  border-color: var(--primary);
}
</style>
