/**
 * QuestionPrompt.spec.ts — vitest unit tests for the multi-question
 * QuestionPrompt.vue navigator (agent-multi-question).
 *
 * Covers: single-question form, multi-question tab navigation + per-question
 * state isolation, single/multi select, free text, the Review step, the answers
 * map payload shape, skip-a-question, answered state, API errors, a11y.
 */

import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import QuestionPrompt from '../QuestionPrompt.vue'

// ── Mock postAgentAnswer ─────────────────────────────────────────────────────
const mockPostAgentAnswer = vi.fn()
vi.mock('@/api/agent', () => ({
  postAgentAnswer: (...args: unknown[]) => mockPostAgentAnswer(...args)
}))

// ── Mock notifications store ─────────────────────────────────────────────────
const mockNotificationsError = vi.fn()
vi.mock('@/stores/notifications', () => ({
  useNotificationsStore: () => ({
    error: mockNotificationsError
  })
}))

// ── Fixtures ─────────────────────────────────────────────────────────────────
const SINGLE = [
  {
    question: '你想要哪个格式？',
    options: [{ label: 'PDF', description: '便携文档' }, { label: 'Word' }],
    multi_select: false
  }
]

const MULTI = [
  {
    question: '陪跑周期多长？',
    header: '陪跑',
    options: [{ label: '90天' }, { label: '180天' }],
    multi_select: false
  },
  {
    question: '主要客群是谁？',
    options: [{ label: '宝妈' }, { label: '职场人' }],
    multi_select: true
  }
]

const mountSingle = (extra: Record<string, unknown> = {}) =>
  mount(QuestionPrompt, { props: { runId: 42, questions: SINGLE, ...extra } })

const mountMulti = (extra: Record<string, unknown> = {}) =>
  mount(QuestionPrompt, { props: { runId: 42, questions: MULTI, ...extra } })

const lastPayload = () => mockPostAgentAnswer.mock.calls.at(-1)?.[1]

beforeEach(() => {
  setActivePinia(createPinia())
  mockPostAgentAnswer.mockReset()
  mockNotificationsError.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('QuestionPrompt — single question', () => {
  it('renders the question + options, with no tab bar', () => {
    const wrapper = mountSingle()
    expect(wrapper.text()).toContain('你想要哪个格式？')
    expect(wrapper.findAll('.question-prompt__option--btn')).toHaveLength(2)
    expect(wrapper.find('.question-prompt__tabs').exists()).toBe(false)
  })

  it('cannot submit until something is answered', () => {
    const wrapper = mountSingle()
    expect(wrapper.find('.question-prompt__submit').attributes('disabled')).toBeDefined()
  })

  it('selecting an option + submit POSTs the answers map keyed by question text', async () => {
    mockPostAgentAnswer.mockResolvedValueOnce({ run_id: 42, status: 'resumed' })
    const wrapper = mountSingle()
    await wrapper.find('.question-prompt__option--btn').trigger('click')
    await wrapper.find('.question-prompt__submit').trigger('click')
    await flushPromises()

    expect(mockPostAgentAnswer).toHaveBeenCalledTimes(1)
    expect(mockPostAgentAnswer.mock.calls[0][0]).toBe(42)
    expect(lastPayload().answers['你想要哪个格式？'].selected).toEqual(['PDF'])
    // free_text is omitted (undefined) when empty, per the backend contract
    expect(lastPayload().answers['你想要哪个格式？'].free_text).toBeUndefined()
    expect(wrapper.emitted('answer-submitted')).toBeTruthy()
  })

  it('single-select: clicking the selected option again deselects it', async () => {
    const wrapper = mountSingle()
    const btn = wrapper.find('.question-prompt__option--btn')
    await btn.trigger('click')
    expect(btn.attributes('aria-pressed')).toBe('true')
    await btn.trigger('click')
    expect(btn.attributes('aria-pressed')).toBe('false')
    // nothing answered → submit disabled again
    expect(wrapper.find('.question-prompt__submit').attributes('disabled')).toBeDefined()
  })

  it('free text alone (no option) can submit', async () => {
    mockPostAgentAnswer.mockResolvedValueOnce({ run_id: 42, status: 'resumed' })
    const wrapper = mountSingle()
    await wrapper.find('.question-prompt__textarea').setValue('我要 Markdown')
    await wrapper.find('.question-prompt__submit').trigger('click')
    await flushPromises()
    expect(lastPayload().answers['你想要哪个格式？']).toMatchObject({
      selected: [],
      free_text: '我要 Markdown'
    })
  })

  it('single-select clicking does NOT auto-submit', async () => {
    const wrapper = mountSingle()
    await wrapper.find('.question-prompt__option--btn').trigger('click')
    expect(mockPostAgentAnswer).not.toHaveBeenCalled()
  })
})

describe('QuestionPrompt — multi-question navigation', () => {
  it('renders a tab bar with one chip per question + progress', () => {
    const wrapper = mountMulti()
    expect(wrapper.findAll('.question-prompt__tab')).toHaveLength(2)
    expect(wrapper.find('.question-prompt__progress').text()).toBe('0/2')
    // first question shown
    expect(wrapper.find('.question-prompt__question').text()).toBe('陪跑周期多长？')
  })

  it('advances to the next question and back', async () => {
    const wrapper = mountMulti()
    await wrapper.find('.question-prompt__next').trigger('click')
    expect(wrapper.find('.question-prompt__question').text()).toBe('主要客群是谁？')
    await wrapper.find('.question-prompt__prev').trigger('click')
    expect(wrapper.find('.question-prompt__question').text()).toBe('陪跑周期多长？')
  })

  it('clicking a tab jumps to that question and preserves each selection', async () => {
    const wrapper = mountMulti()
    // answer Q1
    await wrapper.find('.question-prompt__option--btn').trigger('click')
    // jump to Q2 via tab
    await wrapper.findAll('.question-prompt__tab')[1].trigger('click')
    expect(wrapper.find('.question-prompt__question').text()).toBe('主要客群是谁？')
    // jump back to Q1 — its selection persists
    await wrapper.findAll('.question-prompt__tab')[0].trigger('click')
    expect(wrapper.find('.question-prompt__option--btn.is-selected').text()).toContain('90天')
  })

  it('marks a tab answered (☑) once its question has an answer', async () => {
    const wrapper = mountMulti()
    expect(wrapper.findAll('.question-prompt__tab')[0].classes()).not.toContain('is-answered')
    await wrapper.find('.question-prompt__option--btn').trigger('click')
    expect(wrapper.findAll('.question-prompt__tab')[0].classes()).toContain('is-answered')
    expect(wrapper.find('.question-prompt__progress').text()).toBe('1/2')
  })

  it('Review step shows every Q&A and submits the full answers map', async () => {
    mockPostAgentAnswer.mockResolvedValueOnce({ run_id: 42, status: 'resumed' })
    const wrapper = mountMulti()
    // Q1: select 90天
    await wrapper.find('.question-prompt__option--btn').trigger('click')
    // next → Q2 (multi-select): pick both + free text
    await wrapper.find('.question-prompt__next').trigger('click')
    const checks = wrapper.findAll('.question-prompt__option--checkbox')
    await checks[0].trigger('click')
    await checks[1].trigger('click')
    await wrapper.find('.question-prompt__textarea').setValue('一二线城市')
    // 检查并提交 → review
    await wrapper.find('.question-prompt__next').trigger('click')
    expect(wrapper.find('.question-prompt__review').exists()).toBe(true)
    expect(wrapper.find('.question-prompt__review').text()).toContain('陪跑周期多长？')
    expect(wrapper.find('.question-prompt__review').text()).toContain('宝妈、职场人')
    // submit
    await wrapper.find('.question-prompt__submit').trigger('click')
    await flushPromises()

    const ans = lastPayload().answers
    expect(ans['陪跑周期多长？'].selected).toEqual(['90天'])
    expect(ans['主要客群是谁？'].selected).toEqual(['宝妈', '职场人'])
    expect(ans['主要客群是谁？'].free_text).toBe('一二线城市')
  })

  it('a skipped question is omitted from the answers map', async () => {
    mockPostAgentAnswer.mockResolvedValueOnce({ run_id: 42, status: 'resumed' })
    const wrapper = mountMulti()
    // answer Q1 only, skip Q2
    await wrapper.find('.question-prompt__option--btn').trigger('click')
    await wrapper.find('.question-prompt__next').trigger('click') // → Q2
    await wrapper.find('.question-prompt__next').trigger('click') // → review
    await wrapper.find('.question-prompt__submit').trigger('click')
    await flushPromises()

    const ans = lastPayload().answers
    expect(Object.keys(ans)).toEqual(['陪跑周期多长？'])
    expect(ans['主要客群是谁？']).toBeUndefined()
  })

  it('editing from the review jumps back to the question', async () => {
    const wrapper = mountMulti()
    await wrapper.find('.question-prompt__option--btn').trigger('click')
    await wrapper.find('.question-prompt__next').trigger('click') // Q2
    await wrapper.find('.question-prompt__next').trigger('click') // review
    await wrapper.findAll('.question-prompt__edit')[0].trigger('click')
    expect(wrapper.find('.question-prompt__review').exists()).toBe(false)
    expect(wrapper.find('.question-prompt__question').text()).toBe('陪跑周期多长？')
  })

  it('multi-select: clicking a selected option removes only it', async () => {
    const wrapper = mountMulti()
    await wrapper.find('.question-prompt__next').trigger('click') // → Q2 (multi-select)
    const checks = wrapper.findAll('.question-prompt__option--checkbox')
    await checks[0].trigger('click')
    await checks[1].trigger('click')
    expect(checks[0].attributes('aria-pressed')).toBe('true')
    await checks[0].trigger('click') // toggle off
    expect(checks[0].attributes('aria-pressed')).toBe('false')
    expect(checks[1].attributes('aria-pressed')).toBe('true')
  })
})

describe('QuestionPrompt — answered & errors', () => {
  it('answered=true is a read-only recap: questions stay visible, no controls', () => {
    const wrapper = mountMulti({ answered: true })
    expect(wrapper.find('.question-prompt__answered').exists()).toBe(true)
    expect(wrapper.find('.question-prompt--answered').exists()).toBe(true)
    // the questions remain visible so the user can look back at what was asked
    expect(wrapper.text()).toContain('陪跑周期多长？')
    expect(wrapper.text()).toContain('主要客群是谁？')
    expect(wrapper.findAll('.question-prompt__answered-item')).toHaveLength(2)
    // no interactive controls in the answered state
    expect(wrapper.find('.question-prompt__tabs').exists()).toBe(false)
    expect(wrapper.find('.question-prompt__submit').exists()).toBe(false)
    expect(wrapper.find('.question-prompt__next').exists()).toBe(false)
  })

  it('after answering live, the recap echoes the selected answer', async () => {
    mockPostAgentAnswer.mockResolvedValueOnce({ run_id: 42, status: 'resumed' })
    const wrapper = mountSingle()
    await wrapper.find('.question-prompt__option--btn').trigger('click') // select PDF
    await wrapper.find('.question-prompt__submit').trigger('click')
    await flushPromises()
    await wrapper.setProps({ answered: true })
    expect(wrapper.find('.question-prompt__answered').exists()).toBe(true)
    expect(wrapper.text()).toContain('你想要哪个格式？')
    expect(wrapper.find('.question-prompt__answered-a').text()).toContain('PDF')
  })

  it('API error shows a notification and re-enables submit', async () => {
    mockPostAgentAnswer.mockRejectedValueOnce(new Error('network error'))
    const wrapper = mountSingle()
    await wrapper.find('.question-prompt__option--btn').trigger('click')
    await wrapper.find('.question-prompt__submit').trigger('click')
    await flushPromises()
    expect(mockNotificationsError).toHaveBeenCalledWith(expect.stringContaining('network error'))
    expect(wrapper.find('.question-prompt__submit').attributes('disabled')).toBeUndefined()
  })

  it('while submitting: shows spinner, disables submit, and guards double-submit', async () => {
    let resolvePost: (v: unknown) => void = () => {}
    mockPostAgentAnswer.mockReturnValue(
      new Promise((r) => {
        resolvePost = r
      })
    )
    const wrapper = mountSingle()
    await wrapper.find('.question-prompt__option--btn').trigger('click')
    const submit = wrapper.find('.question-prompt__submit')
    await submit.trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.question-prompt__spinner').exists()).toBe(true)
    expect(submit.attributes('disabled')).toBeDefined()
    // a second click while in flight must not fire another POST
    await submit.trigger('click')
    expect(mockPostAgentAnswer).toHaveBeenCalledTimes(1)

    resolvePost({ run_id: 42, status: 'resumed' })
    await flushPromises()
  })
})

describe('QuestionPrompt — a11y', () => {
  it('group has an aria-label; current tab is aria-current', async () => {
    const wrapper = mountMulti()
    expect(wrapper.find('[role="group"]').attributes('aria-label')).toContain('2')
    expect(wrapper.findAll('.question-prompt__tab')[0].attributes('aria-current')).toBe('true')
  })
})
