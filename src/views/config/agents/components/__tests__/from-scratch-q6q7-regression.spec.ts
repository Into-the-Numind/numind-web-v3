import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import QuestionnaireForm from '../QuestionnaireForm.vue'
import { validateForm, validateQ6, validateQ7 } from '../validation'
import { initialFormState } from '@/types/agentBuilder'

// Regression for manifest feature `agent-from-scratch-q6q7`.
//
// Bug: 配置中心→智能体→从零创建 (/config/agents/builder?from=scratch) returned
// 422 "问卷必填项缺失：q6 (任务类型)、q7 (材料类型)" with NO way to recover — the
// QuestionnaireForm never rendered q6/q7 controls and validateForm never enforced
// them, so the create payload always shipped questionnaire_answers.q6=[], q7=[].
// Reproduced live on dev (POST /v1/agent/skills → 422, DOM had no q6/q7 fields).
//
// These assertions encode the FIXED behavior and fail on the pre-fix code.

function filledTopFields() {
  const f = initialFormState()
  f.name = '爆款分析师'
  f.description = '分析小红书笔记找出爆款规律帮助创作者'
  f.welcome_message = '你好我是爆款分析师，可以分析你的笔记内容找出爆款规律～'
  return f
}

describe('from-scratch q6/q7 regression (manifest: agent-from-scratch-q6q7)', () => {
  it('QuestionnaireForm renders q6 (task type) and q7 (material type) controls', () => {
    const wrapper = mount(QuestionnaireForm, { props: { modelValue: initialFormState() } })
    expect(wrapper.find('[data-question="q6"]').exists(), 'q6 control must render').toBe(true)
    expect(wrapper.find('[data-question="q7"]').exists(), 'q7 control must render').toBe(true)
  })

  it('q6 and q7 are marked required', () => {
    const wrapper = mount(QuestionnaireForm, { props: { modelValue: initialFormState() } })
    expect(
      wrapper.find('[data-question="q6"] .questionnaire-form__label--required').exists(),
    ).toBe(true)
    expect(
      wrapper.find('[data-question="q7"] .questionnaire-form__label--required').exists(),
    ).toBe(true)
  })

  it('checking a q6 task type emits it into questionnaire_answers.q6', async () => {
    const wrapper = mount(QuestionnaireForm, { props: { modelValue: initialFormState() } })
    const box = wrapper.find('[data-question="q6"] input[type="checkbox"]')
    await box.setValue(true)
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const last = emitted![emitted!.length - 1][0] as ReturnType<typeof initialFormState>
    expect(last.questionnaire_answers.q6?.length ?? 0).toBeGreaterThan(0)
  })

  it('checking a q7 material type emits it into questionnaire_answers.q7', async () => {
    const wrapper = mount(QuestionnaireForm, { props: { modelValue: initialFormState() } })
    const box = wrapper.find('[data-question="q7"] input[type="checkbox"]')
    await box.setValue(true)
    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const last = emitted![emitted!.length - 1][0] as ReturnType<typeof initialFormState>
    expect(last.questionnaire_answers.q7?.length ?? 0).toBeGreaterThan(0)
  })

  it('validateQ6 / validateQ7 require at least one selection', () => {
    expect(validateQ6([]), 'empty q6 must error').toBeTruthy()
    expect(validateQ7([]), 'empty q7 must error').toBeTruthy()
    expect(validateQ6(['analyze_data'])).toBe('')
    expect(validateQ7(['text'])).toBe('')
  })

  it('the exact from-scratch payload (top fields filled, q6/q7 empty) is now rejected client-side', () => {
    // initialFormState() defaults q6=[], q7=[] — this is the shape that hit the 422.
    const errors = validateForm(filledTopFields())
    expect(errors.q6, 'empty q6 must surface as a form error').toBeTruthy()
    expect(errors.q7, 'empty q7 must surface as a form error').toBeTruthy()
  })

  it('a fully filled form including q6/q7 passes validation', () => {
    const f = filledTopFields()
    f.questionnaire_answers.q6 = ['answer_questions']
    f.questionnaire_answers.q7 = ['text']
    const errors = validateForm(f)
    expect(Object.keys(errors)).toHaveLength(0)
  })
})
