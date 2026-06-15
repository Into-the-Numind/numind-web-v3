/**
 * QuestionPrompt.spec.ts — vitest unit tests for the multi-question
 * QuestionPrompt.vue navigator (agent-multi-question).
 *
 * Covers: single-question form, multi-question tab navigation + per-question
 * state isolation, single/multi select, free text, the Review step, the
 * answer-submitted emit payload shape, skip-a-question, answered state, a11y.
 *
 * issue4: the card no longer POSTs the answer itself — it emits the answers map
 * up for the parent (AgentChatView) to persist + stream-resume. These tests
 * assert the emit + its payload shape, not a network call.
 */

import { mount } from '@vue/test-utils'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import QuestionPrompt from '../QuestionPrompt.vue'

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

// The answers map emitted on the most recent answer-submitted event.
type AnswersMap = Record<string, { selected: string[]; free_text?: string }>
const lastEmittedAnswers = (wrapper: {
  emitted: (name: string) => unknown[][] | undefined
}): AnswersMap => (wrapper.emitted('answer-submitted')?.at(-1)?.[0] as AnswersMap) ?? {}

beforeEach(() => {
  setActivePinia(createPinia())
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

  it('selecting an option + submit emits the answers map keyed by question text', async () => {
    const wrapper = mountSingle()
    await wrapper.find('.question-prompt__option--btn').trigger('click')
    await wrapper.find('.question-prompt__submit').trigger('click')

    expect(wrapper.emitted('answer-submitted')).toHaveLength(1)
    const answers = lastEmittedAnswers(wrapper)
    expect(answers['你想要哪个格式？'].selected).toEqual(['PDF'])
    // free_text is omitted (undefined) when empty, per the backend contract
    expect(answers['你想要哪个格式？'].free_text).toBeUndefined()
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
    const wrapper = mountSingle()
    await wrapper.find('.question-prompt__textarea').setValue('我要 Markdown')
    await wrapper.find('.question-prompt__submit').trigger('click')
    expect(lastEmittedAnswers(wrapper)['你想要哪个格式？']).toMatchObject({
      selected: [],
      free_text: '我要 Markdown'
    })
  })

  it('single-select clicking does NOT auto-submit', async () => {
    const wrapper = mountSingle()
    await wrapper.find('.question-prompt__option--btn').trigger('click')
    expect(wrapper.emitted('answer-submitted')).toBeUndefined()
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

  it('Review step shows every Q&A and emits the full answers map', async () => {
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

    const ans = lastEmittedAnswers(wrapper)
    expect(ans['陪跑周期多长？'].selected).toEqual(['90天'])
    expect(ans['主要客群是谁？'].selected).toEqual(['宝妈', '职场人'])
    expect(ans['主要客群是谁？'].free_text).toBe('一二线城市')
  })

  it('a skipped question is omitted from the answers map', async () => {
    const wrapper = mountMulti()
    // answer Q1 only, skip Q2
    await wrapper.find('.question-prompt__option--btn').trigger('click')
    await wrapper.find('.question-prompt__next').trigger('click') // → Q2
    await wrapper.find('.question-prompt__next').trigger('click') // → review
    await wrapper.find('.question-prompt__submit').trigger('click')

    const ans = lastEmittedAnswers(wrapper)
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
  it('answered=true: collapsed recap by default, expands on click to review Q&A', async () => {
    const wrapper = mountMulti({ answered: true })
    expect(wrapper.find('.question-prompt__answered').exists()).toBe(true)
    expect(wrapper.find('.question-prompt__answered-toggle').exists()).toBe(true)
    // collapsed by default
    expect(wrapper.find('.question-prompt__answered-toggle').attributes('aria-expanded')).toBe(
      'false'
    )
    // no interactive controls in the answered state
    expect(wrapper.find('.question-prompt__tabs').exists()).toBe(false)
    expect(wrapper.find('.question-prompt__submit').exists()).toBe(false)
    expect(wrapper.find('.question-prompt__next').exists()).toBe(false)
    // click to expand → aria-expanded flips and the questions become visible
    await wrapper.find('.question-prompt__answered-toggle').trigger('click')
    expect(wrapper.find('.question-prompt__answered-toggle').attributes('aria-expanded')).toBe(
      'true'
    )
    expect(wrapper.text()).toContain('陪跑周期多长？')
    expect(wrapper.text()).toContain('主要客群是谁？')
    expect(wrapper.findAll('.question-prompt__answered-item')).toHaveLength(2)
  })

  it('after answering live, the expanded recap echoes the selected answer', async () => {
    const wrapper = mountSingle()
    await wrapper.find('.question-prompt__option--btn').trigger('click') // select PDF
    await wrapper.find('.question-prompt__submit').trigger('click')
    // The parent flips the card to answered (markQuestionAnswered) — simulate it.
    await wrapper.setProps({ answered: true })
    await wrapper.find('.question-prompt__answered-toggle').trigger('click') // expand
    expect(wrapper.text()).toContain('你想要哪个格式？')
    expect(wrapper.find('.question-prompt__answered-a').text()).toContain('PDF')
  })

  it('answered reload: recap shows each question backend-reconstructed answer (issue1)', async () => {
    // A reloaded answered card: live `state` is empty, but the backend embeds the
    // user's actual answer per question (questions[i].answer). The recap must show
    // it, not a bare "已回答" placeholder.
    const wrapper = mount(QuestionPrompt, {
      props: {
        runId: 42,
        answered: true,
        questions: [
          {
            question: '目标受众是谁？',
            options: [{ label: '年轻女性' }],
            multi_select: false,
            answer: '年轻女性'
          }
        ]
      }
    })
    await wrapper.find('.question-prompt__answered-toggle').trigger('click') // expand
    expect(wrapper.text()).toContain('目标受众是谁？')
    const recap = wrapper.find('.question-prompt__answered-a')
    expect(recap.text()).toContain('年轻女性')
    expect(recap.text()).not.toContain('已回答')
    expect(recap.classes()).not.toContain('is-empty')
  })

  it('answered reload (legacy, no answer field): falls back to 已回答 marker', async () => {
    const wrapper = mount(QuestionPrompt, {
      props: {
        runId: 42,
        answered: true,
        questions: [{ question: 'Q1', options: [], multi_select: false }]
      }
    })
    await wrapper.find('.question-prompt__answered-toggle').trigger('click')
    const recap = wrapper.find('.question-prompt__answered-a')
    expect(recap.text()).toContain('已回答')
    expect(recap.classes()).toContain('is-empty')
  })

  it('submit emits exactly once even if clicked again (no error handling in the card)', async () => {
    // issue4: the card no longer POSTs, so there is no API error to surface here —
    // the parent (AgentChatView) owns persistence + the failure notification. The
    // card's only job is to emit the answers once.
    const wrapper = mountSingle()
    await wrapper.find('.question-prompt__option--btn').trigger('click')
    await wrapper.find('.question-prompt__submit').trigger('click')
    expect(wrapper.emitted('answer-submitted')).toHaveLength(1)
  })

  it('while submitting: shows spinner, disables submit, and guards double-submit', async () => {
    const wrapper = mountSingle()
    await wrapper.find('.question-prompt__option--btn').trigger('click')
    const submit = wrapper.find('.question-prompt__submit')
    await submit.trigger('click')
    await wrapper.vm.$nextTick()

    // submitting stays true (the parent flips the card to answered via
    // markQuestionAnswered, which re-renders the footer away). Until then: spinner
    // shown + submit disabled.
    expect(wrapper.find('.question-prompt__spinner').exists()).toBe(true)
    expect(submit.attributes('disabled')).toBeDefined()
    // a second click while still submitting must NOT emit again
    await submit.trigger('click')
    expect(wrapper.emitted('answer-submitted')).toHaveLength(1)
  })
})

describe('QuestionPrompt — a11y', () => {
  it('group has an aria-label; current tab is aria-current', async () => {
    const wrapper = mountMulti()
    expect(wrapper.find('[role="group"]').attributes('aria-label')).toContain('2')
    expect(wrapper.findAll('.question-prompt__tab')[0].attributes('aria-current')).toBe('true')
  })
})
