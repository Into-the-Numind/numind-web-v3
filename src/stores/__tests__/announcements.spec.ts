/**
 * announcements store 单元测试
 *
 * 覆盖：
 *   1. loadAnnouncements 设置 list/total/unreadCount
 *   2. refreshUnread 走轻量 fetchUnreadCount（断言不是 fetchAnnouncements）并更新 unreadCount
 *   3. markRead 乐观标记列表项 is_read + 用响应更新 unreadCount
 *   4. submitSurvey 成功后将 current.is_survey_submitted 置 true
 *
 * 注意：本测试针对 useAnnouncementsStore（公告/问卷），与 notifications.test.ts（toast）无关。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useAnnouncementsStore } from '../announcements'
import * as api from '@/api/announcements'

vi.mock('@/api/announcements')

const mockedApi = vi.mocked(api)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('announcements store', () => {
  it('loadAnnouncements 设置 list/total/unreadCount', async () => {
    const list: api.AnnouncementBrief[] = [
      {
        id: 1,
        type: 'plain',
        title: '公告 A',
        content: '内容',
        is_important: false,
        published_at: '2026-06-16T00:00:00Z',
        expires_at: null,
        is_read: false,
        is_survey_submitted: false
      }
    ]
    mockedApi.fetchAnnouncements.mockResolvedValue({ list, total: 12, unread_count: 3 })

    const store = useAnnouncementsStore()
    await store.loadAnnouncements({ page: 1, page_size: 20 })

    expect(mockedApi.fetchAnnouncements).toHaveBeenCalledWith({ page: 1, page_size: 20 })
    expect(store.list).toEqual(list)
    expect(store.total).toBe(12)
    expect(store.unreadCount).toBe(3)
    expect(store.hasUnread).toBe(true)
    expect(store.loading).toBe(false)
  })

  it('refreshUnread 走轻量 fetchUnreadCount（不调列表接口）并更新 unreadCount', async () => {
    mockedApi.fetchUnreadCount.mockResolvedValue({ unread_count: 5 })

    const store = useAnnouncementsStore()
    await store.refreshUnread()

    // 关键断言：走的是轻量 unread-count 端点，绝不调列表接口
    expect(mockedApi.fetchUnreadCount).toHaveBeenCalledTimes(1)
    expect(mockedApi.fetchAnnouncements).not.toHaveBeenCalled()
    expect(store.unreadCount).toBe(5)
  })

  it('markRead 乐观标记列表项 is_read + 用响应更新 unreadCount', async () => {
    const list: api.AnnouncementBrief[] = [
      {
        id: 7,
        type: 'plain',
        title: '公告 B',
        content: '内容',
        is_important: false,
        published_at: '2026-06-16T00:00:00Z',
        expires_at: null,
        is_read: false,
        is_survey_submitted: false
      }
    ]
    mockedApi.fetchAnnouncements.mockResolvedValue({ list, total: 1, unread_count: 1 })
    mockedApi.markAnnouncementRead.mockResolvedValue({ unread_count: 0 })

    const store = useAnnouncementsStore()
    await store.loadAnnouncements({ page: 1, page_size: 20 })
    expect(store.list[0].is_read).toBe(false)
    expect(store.unreadCount).toBe(1)

    await store.markRead(7)

    expect(mockedApi.markAnnouncementRead).toHaveBeenCalledWith(7)
    expect(store.list[0].is_read).toBe(true) // 乐观更新
    expect(store.unreadCount).toBe(0) // 来自响应
  })

  it('submitSurvey 成功后将 current.is_survey_submitted 置 true', async () => {
    const detail: api.AnnouncementDetail = {
      id: 9,
      type: 'survey',
      title: '问卷',
      content: '内容',
      is_important: false,
      published_at: '2026-06-16T00:00:00Z',
      expires_at: null,
      is_read: true,
      is_survey_submitted: false,
      questions: [
        {
          id: 10,
          order_index: 0,
          question_type: 'single',
          title: '题目',
          required: true,
          options: ['A', 'B'],
          rating_max: null,
          rating_style: null
        }
      ]
    }
    mockedApi.fetchAnnouncementDetail.mockResolvedValue(detail)
    mockedApi.submitSurvey.mockResolvedValue({ submitted: true })

    const store = useAnnouncementsStore()
    await store.loadDetail(9)
    expect(store.current?.is_survey_submitted).toBe(false)

    const answers: api.SubmitAnswer[] = [
      { question_id: 10, options: ['A'], rating: null, text: null }
    ]
    const ok = await store.submitSurvey(9, answers)

    expect(ok).toBe(true)
    expect(mockedApi.submitSurvey).toHaveBeenCalledWith(9, answers)
    expect(store.current?.is_survey_submitted).toBe(true)
    expect(store.submitting).toBe(false)
  })
})
