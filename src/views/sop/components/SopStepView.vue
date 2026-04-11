<script setup lang="ts">
/**
 * SopStepView — SOP 节点的主区视图（F4 骨架 + F8 bookmark 接线）
 *
 * 职责：渲染 step header（标题 + 描述）+ OutputCard（当 status 属于 done-current
 * / done-history 时），并接线 OutputCard 的 @toggle-bookmark 事件到
 * saveBookmark / removeBookmark API + useBookmarks 本地缓存刷新。
 *
 * 本 task（F8）**不负责** F11 主容器那种 status → 子组件完整分发逻辑，只接
 * 最小需要的 read-only 展示 + bookmark 开关；其余分支交给后续 task。
 *
 * Props:
 *   - node：当前查看的 SOP 节点（trailing chat 时 StepCanvas 不会渲染本组件）
 *   - status：视图状态机值（spec §3.3，用于后续 task 分发子组件）
 *
 * 约束：
 *   - description 为空字符串时不渲染描述行（R4：types.ts 老节点 description 为 ""）
 *   - destructive 操作（移除书签）必须经 ConfirmModal 二次确认
 *     （`.claude/rules/ui-ux.md` 硬规则 4）
 *
 * 详见 spec §5.2 / §5.4 + plan F4 / F8。
 */
import { computed, ref } from 'vue'
import type { SopNodePublic, ViewingStepStatus } from '@/views/sop/types'
import OutputCard from './OutputCard.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { useSopRunStore } from '@/stores/sopRun'
import { useBookmarks } from '@/views/sop/composables/useBookmarks'
import { saveBookmark, removeBookmark } from '@/api/sop'

const props = defineProps<{
  node: SopNodePublic | null
  status: ViewingStepStatus
}>()

const store = useSopRunStore()
const bookmarks = useBookmarks()

const currentNodeRun = computed(() => {
  const n = props.node
  if (!n) return null
  return store.nodeRuns[n.id] ?? null
})

const hasOutput = computed(() => Boolean(currentNodeRun.value?.output))

const hasBookmark = computed(() =>
  props.node ? bookmarks.hasBookmarkForNode(props.node.id) : false
)

/**
 * 是否渲染 OutputCard：仅在 done-current / done-history 两个 read-only 状态下展示。
 * executing / idle / first-input 等状态由 F11 主容器在后续 task 中分发。
 */
const showOutputCard = computed(
  () => props.status === 'done-current' || props.status === 'done-history'
)

// ConfirmModal 状态（移除书签二次确认）
const showRemoveConfirm = ref(false)
const pendingRemoveBookmarkId = ref<number | null>(null)

async function handleToggleBookmark() {
  const node = props.node
  const run = store.currentRun
  if (!node || !run) return

  if (hasBookmark.value) {
    // 已收藏 → 弹 ConfirmModal，等用户确认后再调 removeBookmark
    const existing = bookmarks.getBookmarksForNode(node.id)[0]
    if (!existing) return
    pendingRemoveBookmarkId.value = existing.id
    showRemoveConfirm.value = true
    return
  }

  // 未收藏 → 直接保存
  try {
    await saveBookmark({ run_id: run.id, node_id: node.id })
    await bookmarks.loadBookmarks(run.template_id)
  } catch (err) {
    // 静默失败不符合规范；交由全局 axios 拦截器弹 toast（见 frontend-state.md §3）
    console.error('[SopStepView] saveBookmark failed', err)
  }
}

async function confirmRemoveBookmark() {
  const bookmarkId = pendingRemoveBookmarkId.value
  const run = store.currentRun
  pendingRemoveBookmarkId.value = null
  if (!bookmarkId || !run) return
  try {
    await removeBookmark(bookmarkId)
    await bookmarks.loadBookmarks(run.template_id)
  } catch (err) {
    console.error('[SopStepView] removeBookmark failed', err)
  }
}

function cancelRemoveBookmark() {
  pendingRemoveBookmarkId.value = null
}

// handleCopy / handleRegenerate 留 placeholder，由 F11 主容器接线真实行为
function handleCopy() {
  // TODO(F11): 复制节点输出到剪贴板
}

function handleRegenerate() {
  // TODO(F11): 触发节点重新生成（含 dirty + bookmark 警告）
}
</script>

<template>
  <div class="sop-step-view">
    <header class="step-header">
      <h2 class="step-header__title">{{ node?.name ?? '' }}</h2>
      <p v-if="node?.description" class="step-header__desc">
        {{ node.description }}
      </p>
    </header>

    <OutputCard
      v-if="showOutputCard"
      :node-run="currentNodeRun"
      state="read-only"
      :has-output="hasOutput"
      :has-bookmark="hasBookmark"
      @toggle-bookmark="handleToggleBookmark"
      @copy="handleCopy"
      @regenerate="handleRegenerate"
    />
    <div v-else class="sop-step-view__placeholder">
      <p>内容加载中...</p>
    </div>

    <!-- 移除书签二次确认（ui-ux.md 硬规则 4：destructive 操作必须 ConfirmModal） -->
    <ConfirmModal
      v-model="showRemoveConfirm"
      title="移除书签"
      message="将移除此节点的书签 · 是否确认？"
      variant="danger"
      confirm-text="移除"
      @confirm="confirmRemoveBookmark"
      @cancel="cancelRemoveBookmark"
    />
  </div>
</template>

<style scoped>
/* SopStepView —— 对齐 mockup 01 .step-header / .step-header__title / .step-header__desc
 * 使用 .sop-run-view-v2 scope 内的 --font-sans / --text / --space-* token。
 * 说明：22px / 14px 字号按 mockup 硬编码（scope 内无对应 token 变量），属于语义层级。
 */
.sop-step-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  font-family: var(--font-sans);
  color: var(--text);
}

.step-header {
  max-width: 980px;
  margin-bottom: var(--space-xl); /* 对齐 mockup 24px */
}

.step-header__title {
  font-family: var(--font-sans);
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 var(--space-sm);
  color: var(--text);
  letter-spacing: -0.005em;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.step-header__desc {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin: 0;
  max-width: 720px;
}

.sop-step-view__placeholder {
  max-width: 980px;
  padding: var(--space-2xl) var(--space-xl);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 14px;
}

.sop-step-view__placeholder p {
  margin: 0;
}
</style>
