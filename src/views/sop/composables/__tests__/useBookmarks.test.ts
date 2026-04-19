/**
 * useBookmarks 单元测试（12 用例，分 4 组）
 *
 * loadBookmarks (3)：成功 / 失败保留空数组 / 重试清除 error
 * applyBookmarkToNode (3)：成功 / 省略 bookmarkId / 失败抛出 + lastError
 * 本地查询方法 (4)：getBookmarksForNode / hasBookmarkForNode /
 *                   bookmarksByNodeId 分组 / 空状态返回空对象
 * 其他 (2)：clear / 多实例独立
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { BookmarkListItem } from '@/api/sop'

vi.mock('@/api/sop', () => ({
  listBookmarksByTemplate: vi.fn(),
  applyBookmark: vi.fn()
}))

import { useBookmarks } from '../useBookmarks'
import { listBookmarksByTemplate, applyBookmark } from '@/api/sop'

const listMock = listBookmarksByTemplate as unknown as ReturnType<typeof vi.fn>
const applyMock = applyBookmark as unknown as ReturnType<typeof vi.fn>

function makeBookmark(overrides: Partial<BookmarkListItem> = {}): BookmarkListItem {
  return {
    id: 1,
    node_id: 1,
    node_sort: 0,
    node_name: 'Step 1',
    bookmark_name: 'My Bookmark',
    output_preview: 'preview',
    has_thinking: false,
    total_tokens: 100,
    created_at: '2026-04-01T00:00:00Z',
    ...overrides
  }
}

beforeEach(() => {
  listMock.mockReset()
  applyMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useBookmarks — loadBookmarks', () => {
  it('成功加载多个书签', async () => {
    const fakeList = [
      makeBookmark({ id: 1, node_id: 1 }),
      makeBookmark({ id: 2, node_id: 2 }),
      makeBookmark({ id: 3, node_id: 1 })
    ]
    listMock.mockResolvedValue(fakeList)

    const bm = useBookmarks()
    expect(bm.loading.value).toBe(false)

    const promise = bm.loadBookmarks(42)
    // loading 状态已设置（在 await 之前）
    expect(bm.loading.value).toBe(true)
    await promise

    expect(listMock).toHaveBeenCalledWith(42)
    expect(bm.bookmarks.value.length).toBe(3)
    expect(bm.loading.value).toBe(false)
    expect(bm.lastError.value).toBe('')
  })

  it('API 失败时 bookmarks 为空，lastError 有值', async () => {
    listMock.mockRejectedValue(new Error('network error'))

    const bm = useBookmarks()
    await bm.loadBookmarks(42)

    expect(bm.bookmarks.value).toEqual([])
    expect(bm.lastError.value).toContain('network error')
    expect(bm.loading.value).toBe(false)
  })

  it('重新加载清除上次 error', async () => {
    listMock.mockRejectedValueOnce(new Error('first fail'))
    listMock.mockResolvedValueOnce([makeBookmark()])

    const bm = useBookmarks()
    await bm.loadBookmarks(42)
    expect(bm.lastError.value).toContain('first fail')

    await bm.loadBookmarks(42)
    expect(bm.lastError.value).toBe('')
    expect(bm.bookmarks.value.length).toBe(1)
  })
})

describe('useBookmarks — applyBookmarkToNode', () => {
  it('成功返回 ApplyBookmarkResponse', async () => {
    const fakeResp = {
      node_run_id: 999,
      from_bookmark: true,
      bookmark_id: 10,
      output: '应用后的输出',
      thinking: '思考过程'
    }
    applyMock.mockResolvedValue(fakeResp)

    const bm = useBookmarks()
    const result = await bm.applyBookmarkToNode(100, 5, 10)

    expect(applyMock).toHaveBeenCalledWith(100, 5, 10)
    expect(result).toEqual(fakeResp)
    expect(bm.lastError.value).toBe('')
  })

  it('不传 bookmarkId 时后端自动查找', async () => {
    applyMock.mockResolvedValue({
      node_run_id: 999,
      from_bookmark: true,
      bookmark_id: 10,
      output: '',
      thinking: ''
    })

    const bm = useBookmarks()
    await bm.applyBookmarkToNode(100, 5)
    expect(applyMock).toHaveBeenCalledWith(100, 5, undefined)
  })

  it('API 失败时 lastError 被设置且错误抛出', async () => {
    applyMock.mockRejectedValue(new Error('apply error'))

    const bm = useBookmarks()
    await expect(bm.applyBookmarkToNode(100, 5)).rejects.toThrow('apply error')
    expect(bm.lastError.value).toContain('apply error')
  })
})

describe('useBookmarks — 本地查询方法', () => {
  it('getBookmarksForNode 按 node_id 过滤', async () => {
    listMock.mockResolvedValue([
      makeBookmark({ id: 1, node_id: 1 }),
      makeBookmark({ id: 2, node_id: 2 }),
      makeBookmark({ id: 3, node_id: 1 })
    ])

    const bm = useBookmarks()
    await bm.loadBookmarks(42)

    expect(bm.getBookmarksForNode(1).length).toBe(2)
    expect(bm.getBookmarksForNode(2).length).toBe(1)
    expect(bm.getBookmarksForNode(999).length).toBe(0)
  })

  it('hasBookmarkForNode 快速判断', async () => {
    listMock.mockResolvedValue([makeBookmark({ node_id: 5 })])

    const bm = useBookmarks()
    await bm.loadBookmarks(42)

    expect(bm.hasBookmarkForNode(5)).toBe(true)
    expect(bm.hasBookmarkForNode(999)).toBe(false)
  })

  it('bookmarksByNodeId computed 正确分组', async () => {
    listMock.mockResolvedValue([
      makeBookmark({ id: 1, node_id: 1 }),
      makeBookmark({ id: 2, node_id: 2 }),
      makeBookmark({ id: 3, node_id: 1 })
    ])

    const bm = useBookmarks()
    await bm.loadBookmarks(42)

    const grouped = bm.bookmarksByNodeId.value
    expect(grouped[1]?.length).toBe(2)
    expect(grouped[2]?.length).toBe(1)
    expect(grouped[999]).toBeUndefined()
  })

  it('bookmarksByNodeId 空状态返回空对象', () => {
    const bm = useBookmarks()
    expect(bm.bookmarksByNodeId.value).toEqual({})
  })
})

describe('useBookmarks — 其他', () => {
  it('clear 清空所有状态', async () => {
    listMock.mockResolvedValue([makeBookmark()])

    const bm = useBookmarks()
    await bm.loadBookmarks(42)
    bm.lastError.value = 'some error'

    bm.clear()
    expect(bm.bookmarks.value).toEqual([])
    expect(bm.lastError.value).toBe('')
    expect(bm.loading.value).toBe(false)
  })

  it('多实例状态独立', async () => {
    listMock.mockResolvedValueOnce([makeBookmark({ id: 1 })])
    listMock.mockResolvedValueOnce([])

    const bm1 = useBookmarks()
    const bm2 = useBookmarks()

    await bm1.loadBookmarks(42)
    await bm2.loadBookmarks(43)

    expect(bm1.bookmarks.value.length).toBe(1)
    expect(bm2.bookmarks.value.length).toBe(0)
  })
})
