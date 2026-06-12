/**
 * QuestionPrompt-missing-options.spec.ts — reproduces the dev run 147
 * question-card blank-out (2026-06-12).
 *
 * The backend serialized a zero-option question (a legitimate open question)
 * with the `options` key omitted entirely (json omitempty). The component read
 * `current.options.length` unguarded, threw "Cannot read properties of
 * undefined (reading 'length')" during render, and the whole card blanked —
 * both on the live stream and after a session reload. The paused run looked
 * permanently stuck because the user could never see or answer the question.
 *
 * Contract under test: the card renders (question text + free-text box) even
 * when a question arrives without an options field. Permanent regression
 * protection (NDF Rule 11).
 */

import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import QuestionPrompt from '../QuestionPrompt.vue'
import type { QuestionPromptItem } from '@/types/agent'

vi.mock('@/api/agent', () => ({
  postAgentAnswer: vi.fn()
}))
vi.mock('@/stores/notifications', () => ({
  useNotificationsStore: () => ({ error: vi.fn() })
}))

// Wire-realistic payload: `options` key absent, exactly as the backend
// delivered it for dev run 147's first question.
const NO_OPTIONS_WIRE = [
  {
    question: '创始人的创业经历和背景是什么？',
    header: '创始人故事',
    multi_select: false
  }
] as unknown as QuestionPromptItem[]

describe('QuestionPrompt — options field omitted by backend (dev run 147)', () => {
  it('renders the question and free-text box instead of crashing', () => {
    const wrapper = mount(QuestionPrompt, {
      props: { runId: 147, questions: NO_OPTIONS_WIRE }
    })
    expect(wrapper.text()).toContain('创始人的创业经历和背景是什么？')
    expect(wrapper.find('textarea').exists()).toBe(true)
  })

  it('renders a mixed batch where only some questions carry options', () => {
    const mixed = [
      ...NO_OPTIONS_WIRE,
      {
        question: '陪跑模式是怎样的？',
        options: [{ label: '90天' }, { label: '180天' }],
        multi_select: false
      }
    ] as unknown as QuestionPromptItem[]
    const wrapper = mount(QuestionPrompt, {
      props: { runId: 147, questions: mixed }
    })
    expect(wrapper.text()).toContain('创始人的创业经历和背景是什么？')
  })
})
