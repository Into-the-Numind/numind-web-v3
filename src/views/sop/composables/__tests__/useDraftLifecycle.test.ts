/**
 * useDraftLifecycle 单元测试
 *
 * 覆盖场景：
 *   1. enterDraftMode 设置 draftTemplateId
 *   2. lazyCreateRun 调用 API 并迁移 localStorage
 *   3. migrateLocalStorageKeys 正确迁移多个 key
 *   4. migrateLocalStorageKeys 对无 draft 数据也安全
 *   5. cleanupDraft 调用 sendBeacon 并带 ?token= query
 *   6. cleanupDraft 无 token 返回 false
 *   7. cleanupDraft sendBeacon 不存在返回 false
 *   8. 多实例独立（非 module-level state）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock @/api/sop module（useDraftLifecycle 会 import createRun）
vi.mock('@/api/sop', () => ({
  createRun: vi.fn()
}))

import { useDraftLifecycle } from '../useDraftLifecycle'
import { createRun } from '@/api/sop'

const createRunMock = createRun as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  createRunMock.mockReset()
  // 默认 token 存在
  localStorage.setItem('token', 'fake-test-token')
  // 测试隔离：显式清空 sendBeacon，避免 jsdom 升级后内置 stub 影响测试 7
  // @ts-expect-error - 故意 delete 防御性测试隔离
  delete navigator.sendBeacon
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useDraftLifecycle', () => {
  it('enterDraftMode 设置 draftTemplateId', () => {
    const draft = useDraftLifecycle()
    expect(draft.draftTemplateId.value).toBe(null)
    draft.enterDraftMode(42)
    expect(draft.draftTemplateId.value).toBe(42)
  })

  it('lazyCreateRun 调用 API 返回 CreateRunResponse 并清空 draftTemplateId', async () => {
    const fakeRun = {
      id: 100,
      template_id: 42,
      status: 'draft',
      conversation_id: 'sop_42_25_123456',
      counted: false,
      auto_applied_count: 0
    }
    createRunMock.mockResolvedValue(fakeRun)

    const draft = useDraftLifecycle()
    draft.enterDraftMode(42)
    expect(draft.draftTemplateId.value).toBe(42)

    const result = await draft.lazyCreateRun(42, 'hello')

    expect(createRunMock).toHaveBeenCalledTimes(1)
    expect(createRunMock).toHaveBeenCalledWith({
      template_id: 42,
      text: 'hello',
      auto_apply_bookmarks: true
    })
    expect(result).toEqual(fakeRun)
    // 成功后 draftTemplateId 应被清空（已转后端 run 管理）
    expect(draft.draftTemplateId.value).toBe(null)
  })

  it('lazyCreateRun 成功后迁移 localStorage draft key 到 run key', async () => {
    createRunMock.mockResolvedValue({
      id: 100,
      template_id: 42,
      status: 'draft',
      conversation_id: 'x',
      counted: false
    })

    // 模拟 draft 期间用户已输入的内容
    localStorage.setItem('sop_input_draft_42_product-input', '产品描述')
    localStorage.setItem('sop_input_draft_42_script-input', '口播文案')
    localStorage.setItem('sop_input_draft_42_theme-input', '主题')
    // 不相关的 key 应该不受影响
    localStorage.setItem('sop_input_draft_99_product-input', '别的模板')
    localStorage.setItem('other-unrelated-key', '不应被动')

    const draft = useDraftLifecycle()
    await draft.lazyCreateRun(42, '')

    // 新 key 存在
    expect(localStorage.getItem('sop_input_100_product-input')).toBe('产品描述')
    expect(localStorage.getItem('sop_input_100_script-input')).toBe('口播文案')
    expect(localStorage.getItem('sop_input_100_theme-input')).toBe('主题')

    // 旧 draft key 已删除
    expect(localStorage.getItem('sop_input_draft_42_product-input')).toBe(null)
    expect(localStorage.getItem('sop_input_draft_42_script-input')).toBe(null)
    expect(localStorage.getItem('sop_input_draft_42_theme-input')).toBe(null)

    // 不相关的 key 保持不动
    expect(localStorage.getItem('sop_input_draft_99_product-input')).toBe('别的模板')
    expect(localStorage.getItem('other-unrelated-key')).toBe('不应被动')
  })

  it('migrateLocalStorageKeys 对无 draft 数据也安全（no-op）', () => {
    const draft = useDraftLifecycle()
    // 没设置任何 draft key
    expect(() => draft.migrateLocalStorageKeys(42, 100)).not.toThrow()
    // 不相关的 key 保持不动
    localStorage.setItem('some-other-key', 'value')
    draft.migrateLocalStorageKeys(42, 100)
    expect(localStorage.getItem('some-other-key')).toBe('value')
  })

  it('lazyCreateRun API 失败时不迁移 localStorage', async () => {
    createRunMock.mockRejectedValue(new Error('network error'))

    // draft 期间有数据
    localStorage.setItem('sop_input_draft_42_product-input', '产品描述')

    const draft = useDraftLifecycle()
    draft.enterDraftMode(42)

    await expect(draft.lazyCreateRun(42, '')).rejects.toThrow('network error')

    // 失败：draft key 保留
    expect(localStorage.getItem('sop_input_draft_42_product-input')).toBe('产品描述')
    // draftTemplateId 依然是 42（未成功切换）
    expect(draft.draftTemplateId.value).toBe(42)
  })

  it('cleanupDraft 调用 sendBeacon 并带 ?token= query', () => {
    const sendBeaconMock = vi.fn(() => true)
    // @ts-expect-error - JSDOM 默认没有 sendBeacon
    navigator.sendBeacon = sendBeaconMock

    localStorage.setItem('token', 'my-jwt-token')
    const draft = useDraftLifecycle()
    const result = draft.cleanupDraft(100)

    expect(result).toBe(true)
    expect(sendBeaconMock).toHaveBeenCalledTimes(1)
    const [url] = sendBeaconMock.mock.calls[0]
    expect(url).toContain('/v1/sop/runs/100/draft')
    expect(url).toContain('token=my-jwt-token')
  })

  it('cleanupDraft 无 token 返回 false 且不调用 sendBeacon', () => {
    const sendBeaconMock = vi.fn(() => true)
    // @ts-expect-error - JSDOM 默认没有 sendBeacon
    navigator.sendBeacon = sendBeaconMock

    localStorage.removeItem('token')
    localStorage.removeItem('auth_token')

    const draft = useDraftLifecycle()
    const result = draft.cleanupDraft(100)

    expect(result).toBe(false)
    expect(sendBeaconMock).not.toHaveBeenCalled()
  })

  it('cleanupDraft 当 sendBeacon 不存在时返回 false', () => {
    const originalSendBeacon = navigator.sendBeacon
    // @ts-expect-error - 模拟旧浏览器 / SSR 环境
    navigator.sendBeacon = undefined

    const draft = useDraftLifecycle()
    const result = draft.cleanupDraft(100)

    expect(result).toBe(false)

    // 恢复
    navigator.sendBeacon = originalSendBeacon
  })

  it('cleanupDraft 对 token 做 URL 编码（防止特殊字符破坏 query）', () => {
    const sendBeaconMock = vi.fn(() => true)
    // @ts-expect-error - JSDOM
    navigator.sendBeacon = sendBeaconMock

    // 使用含特殊字符的 token（JWT 通常不会，但防御性测试）
    localStorage.setItem('token', 'token with spaces & symbols')
    const draft = useDraftLifecycle()
    draft.cleanupDraft(100)

    const [url] = sendBeaconMock.mock.calls[0]
    // encodeURIComponent('token with spaces & symbols')
    expect(url).toContain('token=token%20with%20spaces%20%26%20symbols')
  })

  it('多实例独立（非 module-level state）', () => {
    const draft1 = useDraftLifecycle()
    const draft2 = useDraftLifecycle()
    draft1.enterDraftMode(42)
    expect(draft1.draftTemplateId.value).toBe(42)
    expect(draft2.draftTemplateId.value).toBe(null) // 不受 draft1 影响
  })
})
