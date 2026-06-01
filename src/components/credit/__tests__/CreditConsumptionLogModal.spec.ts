/**
 * CreditConsumptionLogModal 组件测试（Micro credit-log-type-column）
 *
 * 覆盖：
 *   T1: 表头 4 列「时间/类型/任务/消耗积分」+ 每行类型 pill 标签映射正确
 *   T2: 长任务名全称完整存在于 DOM（截断不丢数据）+ 无 detail_name 行回退 action_label
 *   T3: 单元格被截断时，悬停弹出气泡显示全称
 *   T4: 单元格未截断时，悬停不弹气泡（短名无需提示）
 *
 * 注意：组件用 <Teleport to="body">，需 attachTo: document.body + document.querySelector 查元素。
 * jsdom 无布局（scrollWidth/clientWidth 恒 0），故 T3/T4 用 Object.defineProperty 手动模拟截断。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

vi.mock('@/api/credits', () => ({
  getConsumptionLog: vi.fn(),
}))

import CreditConsumptionLogModal from '../CreditConsumptionLogModal.vue'
import { getConsumptionLog } from '@/api/credits'

const apiMock = getConsumptionLog as unknown as ReturnType<typeof vi.fn>

const LONG_NAME = '超长获客SOP名称 · 第十二步极其冗长的开场白话术设计步骤名称需要悬停才能看全'

function makeRows() {
  return [
    { id: 1, action: 'sop_run', action_label: 'SOP 执行', detail_name: LONG_NAME, credits: 18, created_at: '2026-06-01T10:00:00Z' },
    { id: 2, action: 'sop_chat', action_label: 'SOP 对话', detail_name: '获客SOP', credits: 8, created_at: '2026-06-01T10:01:00Z' },
    { id: 3, action: 'chatbot_chat', action_label: '智能对话', detail_name: '合规问答助手', credits: 5, created_at: '2026-06-01T10:02:00Z' },
    { id: 4, action: 'salesrag_chat', action_label: '销售对话', detail_name: '李总跟进', credits: 6, created_at: '2026-06-01T10:03:00Z' },
    { id: 5, action: 'agent_test', action_label: '智能体运行', detail_name: '', credits: 3, created_at: '2026-06-01T10:04:00Z' },
    { id: 6, action: 'ocr', action_label: '文字识别', detail_name: '', credits: 2, created_at: '2026-06-01T10:05:00Z' },
  ]
}

let wrapper: VueWrapper | null = null

async function mountOpen(): Promise<void> {
  wrapper = mount(CreditConsumptionLogModal, {
    props: { open: true },
    attachTo: document.body,
  })
  await flushPromises()
  await nextTick()
}

describe('CreditConsumptionLogModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiMock.mockReset()
    apiMock.mockResolvedValue({ data: { list: makeRows(), total: 6 } })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  it('T1: renders 4-column header + correct per-row type pill labels', async () => {
    await mountOpen()
    const headers = Array.from(document.querySelectorAll('.data-table thead th')).map((th) => th.textContent?.trim())
    expect(headers).toEqual(['时间', '类型', '任务', '消耗积分'])

    const pills = Array.from(document.querySelectorAll('.data-table tbody .type-pill')).map((p) => p.textContent?.trim())
    expect(pills).toEqual(['AI 工作流', 'AI 工作流', 'AI 助手', 'AI 助手', 'AI 智能体', '其他'])
  })

  it('T2: keeps the full long task name in the DOM; rows without detail_name fall back to action_label', async () => {
    await mountOpen()
    const cells = Array.from(document.querySelectorAll('.data-table tbody .col-action')).map((td) => td.textContent?.trim())
    expect(cells[0]).toBe(LONG_NAME)
    expect(cells[4]).toBe('智能体运行') // agent_test 无 detail_name → 回退
    expect(cells[5]).toBe('文字识别') // ocr 无 detail_name → 回退
  })

  it('T3: pops a tooltip with the full name on hover when the cell is truncated', async () => {
    await mountOpen()
    const cell = document.querySelector('.data-table tbody .col-action') as HTMLElement
    Object.defineProperty(cell, 'scrollWidth', { value: 500, configurable: true })
    Object.defineProperty(cell, 'clientWidth', { value: 120, configurable: true })
    cell.dispatchEvent(new MouseEvent('mouseenter'))
    await flushPromises()
    await nextTick()
    const tip = document.querySelector('.ccl-tip')
    expect(tip).not.toBeNull()
    expect(tip?.textContent?.trim()).toBe(LONG_NAME)
  })

  it('T4: does NOT pop a tooltip when the cell is not truncated', async () => {
    await mountOpen()
    const cells = Array.from(document.querySelectorAll('.data-table tbody .col-action')) as HTMLElement[]
    const shortCell = cells[1]
    Object.defineProperty(shortCell, 'scrollWidth', { value: 80, configurable: true })
    Object.defineProperty(shortCell, 'clientWidth', { value: 120, configurable: true })
    shortCell.dispatchEvent(new MouseEvent('mouseenter'))
    await flushPromises()
    await nextTick()
    expect(document.querySelector('.ccl-tip')).toBeNull()
  })
})
