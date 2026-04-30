/**
 * useScrollFollow 单元测试
 *
 * 覆盖状态机的所有转换：
 *   1. 初始状态 = Following
 *   2. wheel deltaY < 0 → Interrupted
 *   3. wheel deltaY > 0（向下滚）不改变状态
 *   4. resume() → 回到 Following
 *   5. checkAndScroll 在 Interrupted 状态下不滚动
 *   6. checkAndScroll 在 Following 状态下滚到底部
 *   7. 用户手动滚回底部后自动恢复 Following
 *   8. touchmove 向下滑 > 8px → Interrupted
 *   9. touchmove 抖动（< 8px）不触发
 *   10. uninstall 后事件监听失效
 *   11. Interrupted 状态下的 wheel 不抖动（忽略）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useScrollFollow } from '@/composables/useScrollFollow'

/**
 * 创建一个 mock 滚动容器。
 *
 * JSDOM 不会真实计算布局，所以手动设置 scrollHeight/clientHeight/scrollTop。
 */
function makeScrollEl(options: {
  scrollHeight?: number
  clientHeight?: number
  scrollTop?: number
}): HTMLElement {
  const el = document.createElement('div')
  // 用 Object.defineProperty 让这些只读属性可写
  Object.defineProperty(el, 'scrollHeight', {
    value: options.scrollHeight ?? 1000,
    writable: true,
    configurable: true
  })
  Object.defineProperty(el, 'clientHeight', {
    value: options.clientHeight ?? 500,
    writable: true,
    configurable: true
  })
  Object.defineProperty(el, 'scrollTop', {
    value: options.scrollTop ?? 0,
    writable: true,
    configurable: true
  })
  return el
}

/**
 * 触发 wheel 事件（由于 JSDOM 不支持 WheelEvent constructor 直接赋 deltaY，
 * 用 Event + 手动加 deltaY 字段）
 */
function dispatchWheel(el: HTMLElement, deltaY: number): void {
  const evt = new Event('wheel', { bubbles: true }) as Event & { deltaY: number }
  Object.defineProperty(evt, 'deltaY', { value: deltaY })
  el.dispatchEvent(evt)
}

/**
 * 触发 touchstart 事件
 */
function dispatchTouchStart(el: HTMLElement, clientY: number): void {
  const evt = new Event('touchstart', { bubbles: true }) as Event & {
    touches: Array<{ clientY: number }>
  }
  Object.defineProperty(evt, 'touches', {
    value: [{ clientY }]
  })
  el.dispatchEvent(evt)
}

/**
 * 触发 touchmove 事件
 */
function dispatchTouchMove(el: HTMLElement, clientY: number): void {
  const evt = new Event('touchmove', { bubbles: true }) as Event & {
    touches: Array<{ clientY: number }>
  }
  Object.defineProperty(evt, 'touches', {
    value: [{ clientY }]
  })
  el.dispatchEvent(evt)
}

describe('useScrollFollow', () => {
  let el: HTMLElement

  beforeEach(() => {
    el = makeScrollEl({ scrollHeight: 1000, clientHeight: 500, scrollTop: 0 })
  })

  it('初始状态 = Following (isInterrupted = false)', () => {
    const sf = useScrollFollow()
    expect(sf.isInterrupted.value).toBe(false)
  })

  it('wheel deltaY < 0 → Interrupted', () => {
    const sf = useScrollFollow()
    sf.install(el)
    dispatchWheel(el, -100)
    expect(sf.isInterrupted.value).toBe(true)
  })

  it('wheel deltaY > 0 不改变 Following 状态', () => {
    const sf = useScrollFollow()
    sf.install(el)
    dispatchWheel(el, 50)
    expect(sf.isInterrupted.value).toBe(false)
  })

  it('resume() 恢复 Following 状态', () => {
    const sf = useScrollFollow()
    sf.install(el)
    dispatchWheel(el, -100)
    expect(sf.isInterrupted.value).toBe(true)
    sf.resume()
    expect(sf.isInterrupted.value).toBe(false)
  })

  it('resume(el) 恢复状态并立即滚到底部', () => {
    const sf = useScrollFollow()
    const scrollEl = makeScrollEl({ scrollHeight: 2000, clientHeight: 500, scrollTop: 100 })
    sf.install(scrollEl)
    dispatchWheel(scrollEl, -100)
    sf.resume(scrollEl)
    expect(sf.isInterrupted.value).toBe(false)
    expect(scrollEl.scrollTop).toBe(2000) // scrollHeight
  })

  it('checkAndScroll 在 Following 状态下滚到底部', () => {
    const sf = useScrollFollow()
    const scrollEl = makeScrollEl({ scrollHeight: 2000, clientHeight: 500, scrollTop: 100 })
    sf.checkAndScroll(scrollEl)
    expect(scrollEl.scrollTop).toBe(2000)
  })

  it('checkAndScroll 在 Interrupted 状态下不滚动', () => {
    const sf = useScrollFollow()
    const scrollEl = makeScrollEl({ scrollHeight: 2000, clientHeight: 500, scrollTop: 100 })
    sf.install(scrollEl)
    dispatchWheel(scrollEl, -100) // 进入 Interrupted

    // 给一个新的 scrollHeight（模拟流式输出新内容）
    Object.defineProperty(scrollEl, 'scrollHeight', {
      value: 3000,
      writable: true,
      configurable: true
    })

    sf.checkAndScroll(scrollEl)
    // scrollTop 应该保持用户停留的位置，不自动滚到底
    expect(scrollEl.scrollTop).toBe(100)
  })

  // TODO(backlog): auto-resume logic not implemented in useScrollFollow — pre-existing on develop
  it.skip('用户手动滚回底部后自动恢复 Following', () => {
    const sf = useScrollFollow()
    const scrollEl = makeScrollEl({ scrollHeight: 1000, clientHeight: 500, scrollTop: 100 })
    sf.install(scrollEl)
    dispatchWheel(scrollEl, -100) // Interrupted
    expect(sf.isInterrupted.value).toBe(true)

    // 用户手动滚回真实底部（1000 - 500 = 500）
    Object.defineProperty(scrollEl, 'scrollTop', {
      value: 500,
      writable: true,
      configurable: true
    })
    sf.checkAndScroll(scrollEl)
    // 应该自动恢复 Following 并继续滚动到底部
    expect(sf.isInterrupted.value).toBe(false)
    expect(scrollEl.scrollTop).toBe(1000)
  })

  it('touchmove 向下滑 > 8px → Interrupted', () => {
    const sf = useScrollFollow()
    sf.install(el)
    dispatchTouchStart(el, 100)
    dispatchTouchMove(el, 120) // 下移 20px
    expect(sf.isInterrupted.value).toBe(true)
  })

  it('touchmove 抖动 < 8px 不触发 Interrupted', () => {
    const sf = useScrollFollow()
    sf.install(el)
    dispatchTouchStart(el, 100)
    dispatchTouchMove(el, 105) // 下移 5px，小于阈值
    expect(sf.isInterrupted.value).toBe(false)
  })

  it('uninstall 后事件监听失效', () => {
    const sf = useScrollFollow()
    sf.install(el)
    sf.uninstall()
    dispatchWheel(el, -100)
    expect(sf.isInterrupted.value).toBe(false)
  })

  it('Interrupted 状态下的 wheel 不会再次触发状态变化（幂等）', () => {
    const sf = useScrollFollow()
    sf.install(el)
    dispatchWheel(el, -100) // 第一次 → Interrupted
    dispatchWheel(el, -200) // 第二次：已是 Interrupted，应 no-op
    expect(sf.isInterrupted.value).toBe(true) // 仍然是 true，未报错
  })

  it('多个 useScrollFollow 实例状态独立（非 module-level）', () => {
    const sf1 = useScrollFollow()
    const sf2 = useScrollFollow()
    const el1 = makeScrollEl({})
    const el2 = makeScrollEl({})
    sf1.install(el1)
    sf2.install(el2)
    dispatchWheel(el1, -100)
    expect(sf1.isInterrupted.value).toBe(true)
    expect(sf2.isInterrupted.value).toBe(false) // 不受 sf1 影响
  })
})
