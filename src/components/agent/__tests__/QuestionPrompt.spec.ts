/**
 * QuestionPrompt.spec.ts — vitest unit tests for QuestionPrompt.vue
 *
 * Tests:
 *  1. Renders question + 2 option buttons in single-select mode
 *  2. Single-select: clicking an option selects it (no auto-submit); free-text box always present
 *  2. Single-select: clicking option immediately calls postAgentAnswer
 *  3. Multi-select: selecting 2 + free_text + clicking submit calls postAgentAnswer
 *  4. Submitting state: buttons disabled while submitting
 *  5. Error: API rejects → notifications.error called; button re-enabled
 *  6. answered prop: options disabled, answered note shown
 *  7. a11y: ARIA label on group + aria-pressed on option buttons
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

// ── Test helpers ─────────────────────────────────────────────────────────────
const OPTS = [{ label: '选项 A', description: 'A 的描述' }, { label: '选项 B' }]

const mountSingleSelect = (extra: Record<string, unknown> = {}) =>
  mount(QuestionPrompt, {
    props: {
      runId: 42,
      question: '你想要哪个选项？',
      options: OPTS,
      multiSelect: false,
      ...extra
    }
  })

const mountMultiSelect = (extra: Record<string, unknown> = {}) =>
  mount(QuestionPrompt, {
    props: {
      runId: 42,
      question: '请选择所有适用选项',
      options: OPTS,
      multiSelect: true,
      ...extra
    }
  })

beforeEach(() => {
  setActivePinia(createPinia())
  mockPostAgentAnswer.mockReset()
  mockNotificationsError.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('QuestionPrompt — single-select mode', () => {
  it('1. renders question text and 2 option buttons', () => {
    const wrapper = mountSingleSelect()
    expect(wrapper.text()).toContain('你想要哪个选项？')
    const buttons = wrapper.findAll('.question-prompt__option--btn')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].text()).toContain('选项 A')
    expect(buttons[1].text()).toContain('选项 B')
  })

  it('2. clicking an option selects it but does NOT auto-submit (user may add free text)', async () => {
    const wrapper = mountSingleSelect()
    const firstBtn = wrapper.find('.question-prompt__option--btn')
    await firstBtn.trigger('click')
    expect(mockPostAgentAnswer).not.toHaveBeenCalled()
    expect(firstBtn.attributes('aria-pressed')).toBe('true')
  })

  it('2b. single-select always shows a free-text box; option + free text + submit', async () => {
    mockPostAgentAnswer.mockResolvedValueOnce({ run_id: 42, status: 'resumed' })
    const wrapper = mountSingleSelect()
    // free-text box must exist in single-select mode (the always-present补充框)
    const textarea = wrapper.find('.question-prompt__textarea')
    expect(textarea.exists()).toBe(true)
    await wrapper.find('.question-prompt__option--btn').trigger('click')
    await textarea.setValue('我们主要服务留学生，客单价3000')
    await wrapper.find('.question-prompt__submit').trigger('click')
    await flushPromises()
    expect(mockPostAgentAnswer).toHaveBeenCalledWith(42, {
      selected: ['选项 A'],
      free_text: '我们主要服务留学生，客单价3000'
    })
  })

  it('2c. single-select: free text alone (no option) can submit', async () => {
    mockPostAgentAnswer.mockResolvedValueOnce({ run_id: 42, status: 'resumed' })
    const wrapper = mountSingleSelect()
    await wrapper.find('.question-prompt__textarea').setValue('我自己补充的答案')
    await wrapper.find('.question-prompt__submit').trigger('click')
    await flushPromises()
    expect(mockPostAgentAnswer).toHaveBeenCalledWith(42, {
      selected: [],
      free_text: '我自己补充的答案'
    })
  })

  it('7a. group has aria-label matching question', () => {
    const wrapper = mountSingleSelect()
    const group = wrapper.find('[role="group"]')
    expect(group.attributes('aria-label')).toBe('你想要哪个选项？')
  })

  it('7b. option buttons have aria-pressed attribute', () => {
    const wrapper = mountSingleSelect()
    const btn = wrapper.find('.question-prompt__option--btn')
    expect(btn.attributes('aria-pressed')).toBeDefined()
  })
})

describe('QuestionPrompt — multi-select mode', () => {
  it('3. multi-select: check 2 options + free_text + submit calls postAgentAnswer', async () => {
    mockPostAgentAnswer.mockResolvedValueOnce({ run_id: 42, status: 'resumed' })
    const wrapper = mountMultiSelect()

    // Click the option labels to toggle checkboxes (label.click → toggleOption called)
    const optionLabels = wrapper.findAll('.question-prompt__option--checkbox')
    expect(optionLabels).toHaveLength(2)
    await optionLabels[0].trigger('click')
    await optionLabels[1].trigger('click')

    // Fill free text
    const textarea = wrapper.find('.question-prompt__textarea')
    await textarea.setValue('额外说明内容')

    // Submit
    const submitBtn = wrapper.find('.question-prompt__submit')
    await submitBtn.trigger('click')
    await flushPromises()

    expect(mockPostAgentAnswer).toHaveBeenCalledWith(42, {
      selected: ['选项 A', '选项 B'],
      free_text: '额外说明内容'
    })
  })

  it('4. submitting state disables submit button and shows spinner', async () => {
    // Never resolve so we can inspect submitting state
    mockPostAgentAnswer.mockReturnValue(new Promise(() => {}))
    const wrapper = mountMultiSelect()

    // Select one option to enable submit — click the label
    const optionLabel = wrapper.find('.question-prompt__option--checkbox')
    await optionLabel.trigger('click')

    const submitBtn = wrapper.find('.question-prompt__submit')
    await submitBtn.trigger('click')
    await wrapper.vm.$nextTick()

    // While submitting: button should be disabled
    expect(submitBtn.attributes('disabled')).toBeDefined()
    // Spinner element exists in template when submitting=true
    expect(wrapper.find('.question-prompt__spinner').exists()).toBe(true)
  })

  it('5. API error shows notification and re-enables button', async () => {
    mockPostAgentAnswer.mockRejectedValueOnce(new Error('network error'))
    const wrapper = mountMultiSelect()

    // Select one option — click the label
    const optionLabel = wrapper.find('.question-prompt__option--checkbox')
    await optionLabel.trigger('click')

    const submitBtn = wrapper.find('.question-prompt__submit')
    await submitBtn.trigger('click')
    await flushPromises()

    expect(mockNotificationsError).toHaveBeenCalledWith(expect.stringContaining('network error'))
    // Button should be re-enabled after error (submitting=false)
    expect(submitBtn.attributes('disabled')).toBeUndefined()
  })
})

describe('QuestionPrompt — answered state', () => {
  it('6. answered=true disables options and shows answered note', () => {
    const wrapper = mountSingleSelect({ answered: true })
    const buttons = wrapper.findAll('.question-prompt__option--btn')
    buttons.forEach((btn) => {
      expect(btn.attributes('disabled')).toBeDefined()
    })
    expect(wrapper.find('.question-prompt__answered-note').exists()).toBe(true)
    expect(wrapper.find('.question-prompt--answered').exists()).toBe(true)
    // answered state hides the free-text box and submit button (v-if="!answered")
    expect(wrapper.find('.question-prompt__textarea').exists()).toBe(false)
    expect(wrapper.find('.question-prompt__submit').exists()).toBe(false)
  })
})
