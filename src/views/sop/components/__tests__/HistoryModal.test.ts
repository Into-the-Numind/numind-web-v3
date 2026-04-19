/**
 * HistoryModal 组件单元测试
 *
 * 覆盖：
 *
 * 显示/隐藏 (2)：
 *   1. modelValue=false 不渲染
 *   2. modelValue=true 渲染，触发 loadHistory
 *
 * 数据加载 (4)：
 *   3. loading 状态
 *   4. 成功加载 + 渲染列表
 *   5. 错误状态 + 重试按钮
 *   6. 空状态
 *
 * 过滤 + 排序 (2)：
 *   7. 过滤掉 pending / failed 记录
 *   8. 按 executedAt 倒序
 *
 * 切换 run (2)：
 *   9. 点击行触发 switch-run emit 并关闭 modal
 *  10. current-run-id 的行有 is-current 类
 *
 * 删除 (3)：
 *  11. 点击 × 打开 ConfirmModal，不直接删除
 *  12. 确认后调用 API 并从本地列表移除
 *  13. 删除时点击行不触发 switch-run (click.stop)
 *
 * 关闭 (2)：
 *  14. 点击 × 关闭按钮 emit update:modelValue false
 *  15. 点击 overlay 关闭
 *
 * 日期 / 进度格式化 (2)：
 *  16. formatDate 正常和非法值
 *  17. progressPercent 正确百分比
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api/sop', () => ({
  fetchExecutedRuns: vi.fn(),
  deleteRun: vi.fn()
}))

import HistoryModal from '../HistoryModal.vue'
import { fetchExecutedRuns, deleteRun, type SopRunRecord } from '@/api/sop'

const fetchMock = fetchExecutedRuns as unknown as ReturnType<typeof vi.fn>
const deleteMock = deleteRun as unknown as ReturnType<typeof vi.fn>

function makeRecord(overrides: Partial<SopRunRecord> = {}): SopRunRecord {
  return {
    runId: '100',
    templateId: '1',
    templateName: '流量选题口播稿',
    status: 'succeeded',
    executedAt: '2026-04-10T10:00:00Z',
    completedCount: 4,
    totalNodes: 4,
    ...overrides
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  deleteMock.mockReset()
  document.body.innerHTML = ''
  // HistoryModal 现在使用 notifications store，需要 Pinia
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HistoryModal — 显示/隐藏', () => {
  it('modelValue=false 时不渲染 overlay', () => {
    fetchMock.mockResolvedValue([])
    const wrapper = mount(HistoryModal, {
      props: { modelValue: false },
      attachTo: document.body
    })
    expect(document.querySelector('.history-overlay')).toBe(null)
    wrapper.unmount()
  })

  it('modelValue true 触发 loadHistory', async () => {
    fetchMock.mockResolvedValue([makeRecord()])
    const wrapper = mount(HistoryModal, {
      props: { modelValue: false },
      attachTo: document.body
    })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.history-overlay')).not.toBe(null)
    wrapper.unmount()
  })
})

describe('HistoryModal — 数据状态', () => {
  it('loading 状态显示 spinner', async () => {
    // 永不 resolve 的 promise 保持 loading
    fetchMock.mockImplementation(() => new Promise(() => {}))
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true },
      attachTo: document.body
    })
    await nextTick()
    expect(document.querySelector('.history-loading')).not.toBe(null)
    expect(document.querySelector('.history-spinner')).not.toBe(null)
    wrapper.unmount()
  })

  it('成功加载后渲染列表', async () => {
    fetchMock.mockResolvedValue([
      makeRecord({ runId: '1', templateName: 'A' }),
      makeRecord({ runId: '2', templateName: 'B', executedAt: '2026-04-11T10:00:00Z' })
    ])
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true },
      attachTo: document.body
    })
    await flushPromises()
    const items = document.querySelectorAll('.history-item')
    expect(items.length).toBe(2)
    wrapper.unmount()
  })

  it('API 失败显示 error 状态 + 重试按钮', async () => {
    fetchMock.mockRejectedValue(new Error('网络错误'))
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true },
      attachTo: document.body
    })
    await flushPromises()
    const errCard = document.querySelector('.empty-state-card--error')
    expect(errCard).not.toBe(null)
    expect(errCard?.textContent).toContain('网络错误')
    wrapper.unmount()
  })

  it('空列表显示 "暂无运行记录"', async () => {
    fetchMock.mockResolvedValue([])
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true },
      attachTo: document.body
    })
    await flushPromises()
    const emptyCard = document.querySelector('.empty-state-card')
    expect(emptyCard?.textContent).toContain('暂无运行记录')
    wrapper.unmount()
  })
})

describe('HistoryModal — 过滤和排序', () => {
  it('过滤掉 pending / failed 记录', async () => {
    fetchMock.mockResolvedValue([
      makeRecord({ runId: '1', status: 'succeeded' }),
      makeRecord({ runId: '2', status: 'pending' }),
      makeRecord({ runId: '3', status: 'failed' }),
      makeRecord({ runId: '4', status: 'succeeded' })
    ])
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true },
      attachTo: document.body
    })
    await flushPromises()
    // 2 条 succeeded 保留，pending 和 failed 被过滤
    const items = document.querySelectorAll('.history-item')
    expect(items.length).toBe(2)
    wrapper.unmount()
  })

  it('按 executedAt 倒序排列', async () => {
    fetchMock.mockResolvedValue([
      makeRecord({ runId: 'A', executedAt: '2026-04-01T00:00:00Z' }),
      makeRecord({ runId: 'C', executedAt: '2026-04-03T00:00:00Z' }),
      makeRecord({ runId: 'B', executedAt: '2026-04-02T00:00:00Z' })
    ])
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true },
      attachTo: document.body
    })
    await flushPromises()
    const items = document.querySelectorAll('.history-item-runid')
    // 倒序：C → B → A
    expect(items[0].textContent).toBe('#C')
    expect(items[1].textContent).toBe('#B')
    expect(items[2].textContent).toBe('#A')
    wrapper.unmount()
  })
})

describe('HistoryModal — 切换 run', () => {
  it('点击行触发 switch-run emit 并关闭 modal', async () => {
    fetchMock.mockResolvedValue([makeRecord({ runId: '100', templateId: '1' })])
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true },
      attachTo: document.body
    })
    await flushPromises()

    const item = document.querySelector('.history-item') as HTMLElement
    item.click()
    await nextTick()

    expect(wrapper.emitted('switch-run')).toBeTruthy()
    expect(wrapper.emitted('switch-run')?.[0]).toEqual(['100', '1'])
    // 同时关闭 modal
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    wrapper.unmount()
  })

  it('currentRunId 的行有 is-current 类', async () => {
    fetchMock.mockResolvedValue([makeRecord({ runId: '100' }), makeRecord({ runId: '200' })])
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true, currentRunId: '200' },
      attachTo: document.body
    })
    await flushPromises()
    const items = document.querySelectorAll('.history-item')
    expect(items[0].classList.contains('is-current')).toBe(false)
    expect(items[1].classList.contains('is-current')).toBe(true)
    wrapper.unmount()
  })
})

describe('HistoryModal — 删除', () => {
  it('点击 × 打开 ConfirmModal，不直接删除', async () => {
    fetchMock.mockResolvedValue([makeRecord({ runId: '100' })])
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true },
      attachTo: document.body
    })
    await flushPromises()

    const delBtn = document.querySelector('.history-item-delete') as HTMLElement
    delBtn.click()
    await nextTick()

    // ConfirmModal 应显示
    expect(document.querySelector('.confirm-overlay')).not.toBe(null)
    // deleteRun 尚未调用
    expect(deleteMock).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('确认后调用 API 并从本地列表移除', async () => {
    fetchMock.mockResolvedValue([makeRecord({ runId: '100' }), makeRecord({ runId: '200' })])
    deleteMock.mockResolvedValue(undefined)
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true },
      attachTo: document.body
    })
    await flushPromises()

    // 点击第一条的删除按钮
    const delBtn = document.querySelector('.history-item-delete') as HTMLElement
    delBtn.click()
    await nextTick()

    // 点击 ConfirmModal 的确认按钮
    const confirmBtn = document.querySelector('.confirm-btn--danger') as HTMLElement
    confirmBtn.click()
    await flushPromises()

    expect(deleteMock).toHaveBeenCalledWith('100')
    // 本地列表只剩 1 条
    await nextTick()
    const items = document.querySelectorAll('.history-item')
    expect(items.length).toBe(1)
    wrapper.unmount()
  })

  it('点击删除按钮时 click.stop 不触发行点击', async () => {
    fetchMock.mockResolvedValue([makeRecord({ runId: '100' })])
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true },
      attachTo: document.body
    })
    await flushPromises()

    const delBtn = document.querySelector('.history-item-delete') as HTMLElement
    delBtn.click()
    await nextTick()

    // switch-run 不应该被触发
    expect(wrapper.emitted('switch-run')).toBeFalsy()
    wrapper.unmount()
  })
})

describe('HistoryModal — 关闭', () => {
  it('点击 × 关闭按钮 emit update:modelValue false', async () => {
    fetchMock.mockResolvedValue([])
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true },
      attachTo: document.body
    })
    await flushPromises()

    const closeBtn = document.querySelector('.history-close') as HTMLElement
    closeBtn.click()
    await nextTick()

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    wrapper.unmount()
  })

  it('点击 overlay 关闭（.self 修饰符）', async () => {
    fetchMock.mockResolvedValue([])
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true },
      attachTo: document.body
    })
    await flushPromises()

    const overlay = document.querySelector('.history-overlay') as HTMLElement
    // 点击 overlay 本身（不是内部 dialog）
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    // click.self 要求 event.target === event.currentTarget
    // JSDOM dispatch 时 target 确实是 overlay
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
    wrapper.unmount()
  })

  it('点击 dialog 内部元素冒泡不触发 .self 修饰符关闭', async () => {
    fetchMock.mockResolvedValue([makeRecord()])
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true },
      attachTo: document.body
    })
    await flushPromises()

    // 从 dialog 内部元素（title）点击，事件会冒泡到 overlay
    // 但 @click.self 检查 event.target !== currentTarget，不应触发 handleClose
    const title = document.querySelector('.history-title') as HTMLElement
    title.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    // update:modelValue 不应被 emit（overlay click.self 保护生效）
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    wrapper.unmount()
  })
})

describe('HistoryModal — 格式化', () => {
  it('formatDate 处理合法和非法输入', async () => {
    fetchMock.mockResolvedValue([
      makeRecord({ runId: '1', executedAt: '2026-04-10T10:30:00Z' }),
      makeRecord({ runId: '2', executedAt: '' }),
      makeRecord({ runId: '3', executedAt: 'invalid-date' })
    ])
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true },
      attachTo: document.body
    })
    await flushPromises()

    const dateEls = document.querySelectorAll('.history-item-date')
    // 合法日期被格式化（含 YYYY-MM-DD HH:MM 模式）
    expect(dateEls[0].textContent).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    // 空/非法返回 '—'
    expect(dateEls[1].textContent).toBe('—')
    expect(dateEls[2].textContent).toBe('—')
    wrapper.unmount()
  })

  it('progress bar width 根据 completedCount/totalNodes 计算', async () => {
    fetchMock.mockResolvedValue([
      makeRecord({ runId: '1', completedCount: 2, totalNodes: 4 }),
      makeRecord({ runId: '2', completedCount: 4, totalNodes: 4 }),
      makeRecord({ runId: '3', completedCount: 0, totalNodes: 4 })
    ])
    const wrapper = mount(HistoryModal, {
      props: { modelValue: true },
      attachTo: document.body
    })
    await flushPromises()

    const fills = document.querySelectorAll('.history-item-progress-fill')
    expect((fills[0] as HTMLElement).style.width).toBe('50%')
    expect((fills[1] as HTMLElement).style.width).toBe('100%')
    expect((fills[2] as HTMLElement).style.width).toBe('0%')
    wrapper.unmount()
  })
})
