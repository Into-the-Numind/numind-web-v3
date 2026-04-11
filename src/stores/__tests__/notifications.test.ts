/**
 * notifications store 单元测试
 *
 * 覆盖：
 *   1. show() 添加消息并自动分配 id
 *   2. timeout 0 不自动消失
 *   3. 正常 timeout 自动消失（fake timer）
 *   4. dismiss() 手动关闭
 *   5. clear() 清空所有
 *   6. success / error / info / warning 快捷方法 + 默认 timeout
 *   7. error 默认 timeout 5s
 *   8. warning 默认 timeout 4s
 *   9. 多条消息 id 递增
 *  10. dismiss 不存在的 id 安全 no-op
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNotificationsStore } from '../notifications'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('notifications store', () => {
  it('show() 添加消息并分配递增 id', () => {
    const store = useNotificationsStore()
    expect(store.messages.length).toBe(0)

    const id1 = store.show('hello')
    expect(store.messages.length).toBe(1)
    expect(store.messages[0]).toMatchObject({
      id: id1,
      content: 'hello',
      type: 'info'
    })

    const id2 = store.show('world')
    expect(id2).toBe(id1 + 1)
    expect(store.messages.length).toBe(2)
  })

  it('timeout 0 不自动消失', () => {
    const store = useNotificationsStore()
    store.show('persist', 'info', 0)
    expect(store.messages.length).toBe(1)

    vi.advanceTimersByTime(10000)
    expect(store.messages.length).toBe(1) // 仍然存在
  })

  it('正常 timeout 到期后自动消失', () => {
    const store = useNotificationsStore()
    store.show('temp', 'info', 3000)
    expect(store.messages.length).toBe(1)

    vi.advanceTimersByTime(2999)
    expect(store.messages.length).toBe(1)

    vi.advanceTimersByTime(1)
    expect(store.messages.length).toBe(0)
  })

  it('dismiss() 立即移除指定 id', () => {
    const store = useNotificationsStore()
    const id1 = store.show('a')
    const id2 = store.show('b')

    store.dismiss(id1)
    expect(store.messages.length).toBe(1)
    expect(store.messages[0].id).toBe(id2)
  })

  it('dismiss 不存在的 id 安全 no-op', () => {
    const store = useNotificationsStore()
    store.show('a')
    store.dismiss(9999)
    expect(store.messages.length).toBe(1) // 未受影响
  })

  it('clear() 清空所有', () => {
    const store = useNotificationsStore()
    store.show('a')
    store.show('b')
    store.show('c')
    expect(store.messages.length).toBe(3)

    store.clear()
    expect(store.messages.length).toBe(0)
  })

  it('success() 快捷方法 type=success + 默认 3s', () => {
    const store = useNotificationsStore()
    store.success('操作成功')
    expect(store.messages[0]).toMatchObject({
      type: 'success',
      content: '操作成功',
      timeout: 3000
    })

    vi.advanceTimersByTime(3000)
    expect(store.messages.length).toBe(0)
  })

  it('error() 快捷方法 type=error + 默认 5s（比 success 久）', () => {
    const store = useNotificationsStore()
    store.error('请求失败')
    expect(store.messages[0]).toMatchObject({
      type: 'error',
      content: '请求失败',
      timeout: 5000
    })

    // 3 秒时 success 已经消失，但 error 还在
    vi.advanceTimersByTime(3000)
    expect(store.messages.length).toBe(1)

    // 5 秒时消失
    vi.advanceTimersByTime(2000)
    expect(store.messages.length).toBe(0)
  })

  it('warning() 快捷方法 type=warning + 默认 4s', () => {
    const store = useNotificationsStore()
    store.warning('注意')
    expect(store.messages[0].type).toBe('warning')
    expect(store.messages[0].timeout).toBe(4000)
  })

  it('info() 快捷方法 type=info + 默认 3s', () => {
    const store = useNotificationsStore()
    store.info('提示')
    expect(store.messages[0].type).toBe('info')
    expect(store.messages[0].timeout).toBe(3000)
  })

  it('快捷方法支持自定义 timeout', () => {
    const store = useNotificationsStore()
    store.success('持久消息', 0)
    expect(store.messages[0].timeout).toBe(0)

    vi.advanceTimersByTime(10000)
    expect(store.messages.length).toBe(1) // 不消失
  })

  it('多条消息同时存在，各自独立自动消失', () => {
    const store = useNotificationsStore()
    store.show('a', 'info', 2000)
    store.show('b', 'info', 4000)
    store.show('c', 'info', 6000)

    expect(store.messages.length).toBe(3)

    vi.advanceTimersByTime(2000)
    expect(store.messages.length).toBe(2)
    expect(store.messages.map((m) => m.content)).toEqual(['b', 'c'])

    vi.advanceTimersByTime(2000)
    expect(store.messages.length).toBe(1)
    expect(store.messages[0].content).toBe('c')

    vi.advanceTimersByTime(2000)
    expect(store.messages.length).toBe(0)
  })
})
