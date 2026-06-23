<!--
  XhsTopicList — 小红书选题库（T8）

  DataTable 服务端分页列表。筛选（note_type/keyword/enrich_status）+ 排序 + 分页。
  列：标题 / 类型 / 互动（赞藏评）/ 选题角度 / 一句话 / 发布时间 / enrich_status / 操作。
  4 状态：loading / error / empty（含"去安装插件"引导）/ success。
  行点击 → 详情抽屉。
  enrich_status 行级 UI：enriching=转圈、partial=tooltip、insufficient_credits=角标+弹窗。
  导出：勾选行（≤200）→ 调 exportNotes → 触发下载。
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Loader2, AlertTriangle, Coins, Trash2 } from 'lucide-vue-next'

import { useXhsStore } from '@/stores/xhs'
import { useNotificationsStore } from '@/stores/notifications'
import { useUiDialogsStore } from '@/stores/uiDialogs'
import DataTable, { type Column } from '@/components/common/DataTable.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import XhsNoteDrawer from './XhsNoteDrawer.vue'
import { formatDateTime } from '@/utils/datetime'
import type { NoteItem, NoteType, EnrichStatus, NoteSort, ListNotesParams } from '@/api/xhs'

const router = useRouter()
const store = useXhsStore()
const notifications = useNotificationsStore()
const uiDialogs = useUiDialogsStore()

const MAX_EXPORT = 200

// ==================== Filters / paging ====================
const page = ref(1)
const pageSize = 20
const noteType = ref<NoteType | ''>('')
const keyword = ref('')
const enrichStatus = ref<EnrichStatus | ''>('')
const sort = ref<NoteSort>('collected_at_desc')

const noteTypeOptions: { value: NoteType | ''; label: string }[] = [
  { value: '', label: '全部类型' },
  { value: 'normal', label: '图文' },
  { value: 'video', label: '视频' }
]

const enrichStatusOptions: { value: EnrichStatus | ''; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待分析' },
  { value: 'enriching', label: '分析中' },
  { value: 'done', label: '已完成' },
  { value: 'partial', label: '部分完成' },
  { value: 'failed', label: '失败' },
  { value: 'insufficient_credits', label: '积分不足' }
]

const sortOptions: { value: NoteSort; label: string }[] = [
  { value: 'collected_at_desc', label: '采集时间（新→旧）' },
  { value: 'collected_at_asc', label: '采集时间（旧→新）' },
  { value: 'published_at_desc', label: '发布时间（新→旧）' },
  { value: 'published_at_asc', label: '发布时间（旧→新）' },
  { value: 'like_count_desc', label: '点赞最多' },
  { value: 'collect_count_desc', label: '收藏最多' }
]

const columns: Column[] = [
  { key: 'select', title: '', width: '44px', align: 'center' },
  { key: 'title', title: '标题', align: 'left' },
  { key: 'note_type', title: '类型', width: '70px', align: 'center' },
  { key: 'interaction', title: '互动（赞/藏/评）', width: '150px', align: 'center' },
  { key: 'ai_topic_angle', title: '选题角度', width: '160px', align: 'left' },
  { key: 'ai_one_line', title: '一句话', width: '180px', align: 'left' },
  { key: 'published_at', title: '发布时间', width: '150px', align: 'center' },
  { key: 'enrich_status', title: '状态', width: '120px', align: 'center' },
  { key: 'actions', title: '操作', width: '80px', align: 'center' }
]

// ==================== Selection ====================
const selectedIds = ref<Set<number>>(new Set())

const selectedCount = computed(() => selectedIds.value.size)
const allOnPageSelected = computed(
  () => store.notes.length > 0 && store.notes.every((n) => selectedIds.value.has(n.id))
)

function isSelected(id: number): boolean {
  return selectedIds.value.has(id)
}

function toggleRow(id: number, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) {
    if (next.size >= MAX_EXPORT && !next.has(id)) {
      notifications.warning(`最多只能选择 ${MAX_EXPORT} 条`)
      return
    }
    next.add(id)
  } else {
    next.delete(id)
  }
  selectedIds.value = next
}

function toggleAllOnPage(checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) {
    for (const n of store.notes) {
      if (next.size >= MAX_EXPORT) {
        notifications.warning(`最多只能选择 ${MAX_EXPORT} 条`)
        break
      }
      next.add(n.id)
    }
  } else {
    for (const n of store.notes) {
      next.delete(n.id)
    }
  }
  selectedIds.value = next
}

// ==================== Data load ====================
function buildParams(): ListNotesParams {
  const params: ListNotesParams = {
    page: page.value,
    page_size: pageSize,
    sort: sort.value
  }
  if (noteType.value) params.note_type = noteType.value
  if (keyword.value.trim()) params.keyword = keyword.value.trim()
  if (enrichStatus.value) params.enrich_status = enrichStatus.value
  return params
}

async function load() {
  await store.fetchNotes(buildParams())
  // 分页/筛选 reload 失败时：全页 error 块只覆盖"初始空列表"场景，
  // 列表已有数据（isEmpty=false）时 error 块不显示，这里补一个 toast 兜底。
  if (store.error) notifications.error(store.error)
}

onMounted(load)

function applyFilters() {
  page.value = 1
  load()
}

function onPageChange(p: number) {
  page.value = p
  load()
}

// ==================== Detail drawer ====================
const drawerOpen = ref(false)
const drawerLoading = ref(false)
const activeNote = ref<NoteItem | null>(null)

async function openDetail(row: NoteItem) {
  // insufficient_credits 行点击：弹积分不足弹窗，不打开抽屉
  if (row.enrich_status === 'insufficient_credits') {
    showInsufficientCredits()
    return
  }
  activeNote.value = row
  drawerOpen.value = true
  drawerLoading.value = true
  const full = await store.getNoteDetail(row.id)
  if (full) activeNote.value = full
  drawerLoading.value = false
}

function showInsufficientCredits() {
  uiDialogs.openCreditsDialog({
    message: '该笔记 AI 分析因积分不足未完成',
    reason: '请联系管理员充值后重新分析'
  })
}

// ==================== Delete ====================
const confirmOpen = ref(false)
const pendingDelete = ref<NoteItem | null>(null)

function askDelete(row: NoteItem) {
  pendingDelete.value = row
  confirmOpen.value = true
}

async function doDelete() {
  if (!pendingDelete.value) return
  const row = pendingDelete.value
  confirmOpen.value = false
  try {
    await store.removeNote(row.id)
    selectedIds.value.delete(row.id)
    selectedIds.value = new Set(selectedIds.value)
    notifications.success('已删除')
  } catch (e) {
    notifications.error(`删除失败：${(e as Error).message || '请稍后重试'}`)
  } finally {
    pendingDelete.value = null
  }
}

// ==================== Export ====================
async function doExport() {
  if (selectedCount.value === 0) return
  const ids = Array.from(selectedIds.value)
  try {
    const url = await store.exportSelected(ids)
    if (!url) {
      notifications.error('导出失败：未返回下载链接')
      return
    }
    // 触发浏览器下载
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener'
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    notifications.success('导出成功，下载链接 1 小时内有效')
  } catch (e) {
    notifications.error(`导出失败：${(e as Error).message || '请稍后重试'}`)
  }
}

// ==================== enrich_status helpers ====================
function enrichLabel(s: EnrichStatus): string {
  return enrichStatusOptions.find((o) => o.value === s)?.label || s
}

// partial 的 tooltip 文案：视频已过期 vs 部分失败
function partialTooltip(row: NoteItem): string {
  if (row.note_type === 'video' && !row.video_url) {
    return '视频已过期，无法获取转写'
  }
  return '部分分析字段未完成'
}
</script>

<template>
  <MainLayout>
    <div class="xhs-topic-list">
      <header class="page-header">
        <div>
          <h1>小红书选题库</h1>
          <p class="subtitle">通过浏览器插件采集的笔记，已自动 AI 分析选题角度</p>
        </div>
        <div class="header-actions">
          <AppButton variant="secondary" size="md" @click="router.push('/xhs/install')">
            安装插件
          </AppButton>
          <AppButton
            variant="primary"
            size="md"
            :disabled="selectedCount === 0"
            :loading="store.exporting"
            @click="doExport"
          >
            导出{{ selectedCount > 0 ? `（${selectedCount}）` : '' }}
          </AppButton>
        </div>
      </header>

      <!-- 筛选栏 -->
      <div class="filters">
        <div class="filter-search">
          <AppInput v-model="keyword" placeholder="搜索标题 / 内容关键词" @blur="applyFilters" />
        </div>
        <select v-model="noteType" class="filter-select" @change="applyFilters">
          <option v-for="o in noteTypeOptions" :key="o.value" :value="o.value">
            {{ o.label }}
          </option>
        </select>
        <select v-model="enrichStatus" class="filter-select" @change="applyFilters">
          <option v-for="o in enrichStatusOptions" :key="o.value" :value="o.value">
            {{ o.label }}
          </option>
        </select>
        <select v-model="sort" class="filter-select" @change="applyFilters">
          <option v-for="o in sortOptions" :key="o.value" :value="o.value">
            {{ o.label }}
          </option>
        </select>
        <AppButton variant="secondary" size="md" @click="applyFilters">查询</AppButton>
      </div>

      <!-- error 态 -->
      <div v-if="store.error && store.isEmpty" class="state-msg state-msg--error">
        <p>{{ store.error }}</p>
        <AppButton @click="load">重试</AppButton>
      </div>

      <!-- empty 态（含去安装插件引导）— 仅在非 loading 且无筛选结果时显示 -->
      <div v-else-if="!store.loading && store.isEmpty" class="state-msg state-msg--empty">
        <p>选题库还是空的</p>
        <p class="empty-hint">安装浏览器插件，浏览小红书时一键采集感兴趣的笔记</p>
        <AppButton variant="primary" @click="router.push('/xhs/install')">去安装插件 →</AppButton>
      </div>

      <!-- success / loading：DataTable -->
      <DataTable
        v-else
        :columns="columns"
        :data="store.notes"
        :loading="store.loading"
        :total="store.total"
        :page="page"
        :page-size="pageSize"
        row-key="id"
        clickable
        @update:page="onPageChange"
        @row-click="openDetail"
      >
        <!-- 表头全选放在 select 列的 header 不便（DataTable 无 header slot），
             改用每行 checkbox + 顶部「本页全选」按钮代替（见 select cell）。 -->
        <template #cell-select="{ row }">
          <input
            type="checkbox"
            class="row-checkbox"
            :checked="isSelected((row as NoteItem).id)"
            @click.stop
            @change="toggleRow((row as NoteItem).id, ($event.target as HTMLInputElement).checked)"
          />
        </template>

        <template #cell-title="{ row }">
          <span class="title-cell" :title="(row as NoteItem).title">
            {{ (row as NoteItem).title || '（无标题）' }}
          </span>
        </template>

        <template #cell-note_type="{ row }">
          <span class="type-badge" :class="`type-badge--${(row as NoteItem).note_type}`">
            {{ (row as NoteItem).note_type === 'video' ? '视频' : '图文' }}
          </span>
        </template>

        <template #cell-interaction="{ row }">
          <span class="interaction">
            {{ (row as NoteItem).like_count }} / {{ (row as NoteItem).collect_count }} /
            {{ (row as NoteItem).comment_count }}
          </span>
        </template>

        <template #cell-ai_topic_angle="{ row }">
          <span class="clamp-2" :title="(row as NoteItem).ai_topic_angle">
            {{ (row as NoteItem).ai_topic_angle || '—' }}
          </span>
        </template>

        <template #cell-ai_one_line="{ row }">
          <span class="clamp-2" :title="(row as NoteItem).ai_one_line">
            {{ (row as NoteItem).ai_one_line || '—' }}
          </span>
        </template>

        <template #cell-published_at="{ row }">
          {{ formatDateTime((row as NoteItem).published_at) }}
        </template>

        <!-- enrich_status 行级 UI -->
        <template #cell-enrich_status="{ row }">
          <!-- enriching：转圈 -->
          <span
            v-if="(row as NoteItem).enrich_status === 'enriching'"
            class="status status--enriching"
          >
            <Loader2 :size="14" class="spin" />
            分析中
          </span>
          <!-- partial：tooltip 区分原因 -->
          <span
            v-else-if="(row as NoteItem).enrich_status === 'partial'"
            class="status status--partial"
            :title="partialTooltip(row as NoteItem)"
          >
            <AlertTriangle :size="14" />
            部分完成
          </span>
          <!-- insufficient_credits：角标 + 点击弹窗 -->
          <button
            v-else-if="(row as NoteItem).enrich_status === 'insufficient_credits'"
            class="status status--credits"
            title="积分不足，点击查看"
            @click.stop="showInsufficientCredits"
          >
            <Coins :size="14" />
            积分不足
          </button>
          <!-- failed -->
          <span
            v-else-if="(row as NoteItem).enrich_status === 'failed'"
            class="status status--failed"
          >
            失败
          </span>
          <!-- done / pending -->
          <span
            v-else
            class="status"
            :class="(row as NoteItem).enrich_status === 'done' ? 'status--done' : 'status--pending'"
          >
            {{ enrichLabel((row as NoteItem).enrich_status) }}
          </span>
        </template>

        <template #cell-actions="{ row }">
          <button class="icon-btn" title="删除" @click.stop="askDelete(row as NoteItem)">
            <Trash2 :size="16" />
          </button>
        </template>
      </DataTable>

      <!-- 本页全选（DataTable 无 header slot，放在表格下方 toolbar） -->
      <div v-if="!store.isEmpty" class="select-toolbar">
        <label class="select-all">
          <input
            type="checkbox"
            :checked="allOnPageSelected"
            @change="toggleAllOnPage(($event.target as HTMLInputElement).checked)"
          />
          本页全选
        </label>
        <span v-if="selectedCount > 0" class="selected-info">
          已选 {{ selectedCount }} 条（最多 {{ MAX_EXPORT }} 条）
        </span>
      </div>

      <!-- 详情抽屉 -->
      <XhsNoteDrawer v-model="drawerOpen" :note="activeNote" :loading="drawerLoading" />

      <!-- 删除确认 -->
      <ConfirmModal
        v-model="confirmOpen"
        title="确认删除"
        :message="
          pendingDelete
            ? `删除笔记「${pendingDelete.title || '（无标题）'}」后无法恢复，继续？`
            : ''
        "
        variant="danger"
        confirm-text="删除"
        @confirm="doDelete"
      />
    </div>
  </MainLayout>
</template>

<style scoped>
.xhs-topic-list {
  max-width: 1280px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  gap: 16px;
}

.page-header h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--text, #1a1d26);
}

.subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-muted, #6b7085);
}

.header-actions {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.filters {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-search {
  width: 280px;
}

.filter-select {
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--color-border, #e8e9ee);
  border-radius: var(--radius-md, 8px);
  font-size: 14px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #1a1d26);
  cursor: pointer;
}

.filter-select:focus {
  outline: none;
  border-color: var(--color-accent, #10b981);
}

.state-msg {
  text-align: center;
  padding: 64px 20px;
  color: var(--text-muted, #6b7085);
}

.state-msg p {
  margin: 0 0 8px;
}

.state-msg--error {
  color: var(--color-danger, #dc2626);
}

.empty-hint {
  font-size: 13px;
  color: var(--text-muted, #9ea1b1);
  margin-bottom: 16px;
}

.row-checkbox {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

.title-cell {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-weight: 500;
  color: var(--text, #1a1d26);
}

.clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--text-secondary, #4b5563);
}

.type-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
}

.type-badge--video {
  background: #ede9fe;
  color: #6d28d9;
}

.type-badge--normal {
  background: #dbeafe;
  color: #1d4ed8;
}

.interaction {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  font-weight: 600;
  border: none;
}

.status--enriching {
  background: #fef3c7;
  color: #92400e;
}

.status--partial {
  background: #fff7ed;
  color: #c2410c;
  cursor: help;
}

.status--credits {
  background: #fef2f2;
  color: #dc2626;
  cursor: pointer;
}

.status--failed {
  background: #fef2f2;
  color: #b91c1c;
}

.status--done {
  background: #d1fae5;
  color: #047857;
}

.status--pending {
  background: #f3f4f6;
  color: #6b7280;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  color: var(--text-muted, #6b7085);
  cursor: pointer;
  transition: all 0.15s;
}

.icon-btn:hover {
  background: #fef2f2;
  color: #dc2626;
}

.select-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 14px;
  padding: 0 4px;
}

.select-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary, #4b5563);
  cursor: pointer;
}

.select-all input {
  cursor: pointer;
}

.selected-info {
  font-size: 13px;
  color: var(--text-muted, #6b7085);
}
</style>
