/**
 * useBookmarks — SOP 节点书签系统 composable（模块级单例 state）
 *
 * ## 概念
 *
 * 书签（Bookmark）是用户对某次节点运行结果的"收藏"，允许后续新建 run 时一键
 * 应用同一份 output 跳过 LLM 调用（节省配额 + 时间）。
 *
 * ## State 共享语义
 *
 * `bookmarks` / `loading` / `lastError` 是**模块级单例**——所有 `useBookmarks()`
 * 调用返回**同一份** ref。SOPRunView 调一次 loadBookmarks 后，SopStepView 的
 * hasBookmarkForNode 立即看到结果。切换 SOP 模板时调用 `clear()` 重置 state，
 * 避免跨模板串数据。
 *
 * ## 状态与 Actions
 *
 * - `bookmarks: Ref<BookmarkListItem[]>` — 当前模板的所有书签
 * - `loading: Ref<boolean>` — 加载中
 * - `lastError: Ref<string>` — 最近一次错误（供调用方 toast）
 *
 * - `loadBookmarks(templateId)` — 从后端拉取某模板的所有书签
 * - `applyBookmarkToNode(runId, nodeId, bookmarkId?)` — 把书签应用到当前 run 的某节点
 *   - bookmarkId 可省，后端会自动查找该节点的书签
 * - `getBookmarksForNode(nodeId)` — 按 nodeId 过滤本地缓存（不触发网络）
 * - `hasBookmarkForNode(nodeId)` — 快速检查某节点是否有可用书签
 * - `clear()` — 清空状态
 *
 * ## 与 dirty 检测联动
 *
 * legacy 行为（spec §7.2）：用户修改了输入内容后再点"重新生成"，会提示
 * "将删除该节点的书签，确认？"。这由 useInputPersistence.isDirty 判断，
 * 本 composable 只提供书签的 CRUD 能力，不做 dirty 判定。
 *
 * ## 使用示例
 *
 * ```ts
 * const bookmarks = useBookmarks()
 *
 * onMounted(async () => {
 *   await bookmarks.loadBookmarks(templateId)
 * })
 *
 * async function handleApplyBookmark(nodeId: number) {
 *   if (!store.currentRun) return
 *   try {
 *     const res = await bookmarks.applyBookmarkToNode(store.currentRun.id, nodeId)
 *     // res.output / res.thinking 就是应用书签后的节点输出
 *     store.setNodeOutput(nodeId, res.output, res.thinking)
 *   } catch (e) {
 *     // error 已经被 composable 捕获到 lastError，这里可以显示 toast
 *   }
 * }
 * ```
 *
 * 详见 spec §7.2
 */
import { ref, computed, type Ref, type ComputedRef } from 'vue'
import {
  listBookmarksByTemplate,
  applyBookmark as applyBookmarkAPI,
  type BookmarkListItem,
  type ApplyBookmarkResponse
} from '@/api/sop'

export interface UseBookmarksReturn {
  bookmarks: Ref<BookmarkListItem[]>
  loading: Ref<boolean>
  lastError: Ref<string>
  /** 从后端加载某模板的所有书签 */
  loadBookmarks: (templateId: number) => Promise<void>
  /** 把书签应用到当前 run 的指定节点 */
  applyBookmarkToNode: (
    runId: number,
    nodeId: number,
    bookmarkId?: number
  ) => Promise<ApplyBookmarkResponse>
  /** 获取某节点的所有书签（本地过滤，不触发网络） */
  getBookmarksForNode: (nodeId: number) => BookmarkListItem[]
  /** 快速检查某节点是否有可用书签 */
  hasBookmarkForNode: (nodeId: number) => boolean
  /** 按 nodeId 索引书签的 computed（便于 v-for 渲染分组） */
  bookmarksByNodeId: ComputedRef<Record<number, BookmarkListItem[]>>
  /** 清空所有状态 */
  clear: () => void
}

// 模块级单例 state —— 所有 useBookmarks() 调用共享。Hoist 到这里是为了
// 修复 SOPRunView 与 SopStepView 各自持有独立 state 导致按钮显示错乱的 bug。
const bookmarks = ref<BookmarkListItem[]>([])
const loading = ref(false)
const lastError = ref<string>('')

const bookmarksByNodeId = computed<Record<number, BookmarkListItem[]>>(() => {
  const map: Record<number, BookmarkListItem[]> = {}
  for (const bookmark of bookmarks.value) {
    if (!map[bookmark.node_id]) {
      map[bookmark.node_id] = []
    }
    map[bookmark.node_id].push(bookmark)
  }
  return map
})

async function loadBookmarks(templateId: number): Promise<void> {
  loading.value = true
  lastError.value = ''
  try {
    const list = await listBookmarksByTemplate(templateId)
    bookmarks.value = list
  } catch (err) {
    lastError.value = (err as Error)?.message || '加载书签失败'
    bookmarks.value = []
  } finally {
    loading.value = false
  }
}

async function applyBookmarkToNode(
  runId: number,
  nodeId: number,
  bookmarkId?: number
): Promise<ApplyBookmarkResponse> {
  lastError.value = ''
  try {
    return await applyBookmarkAPI(runId, nodeId, bookmarkId)
  } catch (err) {
    lastError.value = (err as Error)?.message || '应用书签失败'
    throw err
  }
}

function getBookmarksForNode(nodeId: number): BookmarkListItem[] {
  return bookmarks.value.filter((b) => b.node_id === nodeId)
}

function hasBookmarkForNode(nodeId: number): boolean {
  return bookmarks.value.some((b) => b.node_id === nodeId)
}

function clear(): void {
  bookmarks.value = []
  loading.value = false
  lastError.value = ''
}

export function useBookmarks(): UseBookmarksReturn {
  return {
    bookmarks,
    loading,
    lastError,
    loadBookmarks,
    applyBookmarkToNode,
    getBookmarksForNode,
    hasBookmarkForNode,
    bookmarksByNodeId,
    clear
  }
}
