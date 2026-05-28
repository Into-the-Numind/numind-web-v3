import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import QuestionnaireForm from '../QuestionnaireForm.vue'
import { initialFormState } from '@/types/agentBuilder'

function makeForm() {
  return initialFormState()
}

describe('QuestionnaireForm', () => {
  describe('12 questions rendered', () => {
    it('renders all 8 data-question attributes', () => {
      const wrapper = mount(QuestionnaireForm, {
        props: { modelValue: makeForm() }
      })
      // 模板新增 system_prompt block（行为指引输入框），见 QuestionnaireForm.vue:210
      const expectedAttrs = [
        'name',
        'icon_url',
        'description',
        'welcome_message',
        'system_prompt',
        'starters',
        'q8',
        'tool_flags'
      ]
      expectedAttrs.forEach((attr) => {
        expect(
          wrapper.find(`[data-question="${attr}"]`).exists(),
          `data-question="${attr}" should exist`
        ).toBe(true)
      })
    })

    it('renders 8 question blocks total', () => {
      const wrapper = mount(QuestionnaireForm, {
        props: { modelValue: makeForm() }
      })
      expect(wrapper.findAll('.questionnaire-form__question')).toHaveLength(8)
    })
  })

  describe('required labels show *', () => {
    it('required questions have label--required class', () => {
      const wrapper = mount(QuestionnaireForm, {
        props: { modelValue: makeForm() }
      })
      const requiredLabels = wrapper.findAll('.questionnaire-form__label--required')
      // Q1, Q3, Q4 = 3 required questions
      expect(requiredLabels.length).toBe(3)
    })

    it('required label text includes * via CSS (class present)', () => {
      const wrapper = mount(QuestionnaireForm, {
        props: { modelValue: makeForm() }
      })
      // Q1 (name) should be required
      const nameBlock = wrapper.find('[data-question="name"]')
      const label = nameBlock.find('.questionnaire-form__label')
      expect(label.classes()).toContain('questionnaire-form__label--required')
    })

    it('optional questions do not have required label class', () => {
      const wrapper = mount(QuestionnaireForm, {
        props: { modelValue: makeForm() }
      })
      // Q2 (icon_url) is optional
      const iconBlock = wrapper.find('[data-question="icon_url"]')
      const label = iconBlock.find('.questionnaire-form__label')
      expect(label.classes()).not.toContain('questionnaire-form__label--required')
    })
  })

  describe('error message display', () => {
    it('shows error message when errors prop has an entry', () => {
      const wrapper = mount(QuestionnaireForm, {
        props: {
          modelValue: makeForm(),
          errors: { name: '请输入助手名字' }
        }
      })
      const nameBlock = wrapper.find('[data-question="name"]')
      const error = nameBlock.find('.questionnaire-form__error')
      expect(error.exists()).toBe(true)
      expect(error.text()).toBe('请输入助手名字')
    })

    it('does not show error when errors is empty', () => {
      const wrapper = mount(QuestionnaireForm, {
        props: { modelValue: makeForm(), errors: {} }
      })
      expect(wrapper.findAll('.questionnaire-form__error')).toHaveLength(0)
    })

    it('shows error with error border class on input', () => {
      const wrapper = mount(QuestionnaireForm, {
        props: {
          modelValue: makeForm(),
          errors: { description: '描述必填' }
        }
      })
      const descBlock = wrapper.find('[data-question="description"]')
      const input = descBlock.find('.questionnaire-form__input')
      expect(input.classes()).toContain('questionnaire-form__input--error')
    })

    it('can show errors for multiple questions simultaneously', () => {
      const wrapper = mount(QuestionnaireForm, {
        props: {
          modelValue: makeForm(),
          errors: {
            name: '名字错误',
            description: '描述错误',
            welcome_message: '欢迎语错误'
          }
        }
      })
      expect(wrapper.findAll('.questionnaire-form__error')).toHaveLength(3)
    })
  })

  describe('readonly propagation', () => {
    it('applies questionnaire-form--readonly class when readonly=true', () => {
      const wrapper = mount(QuestionnaireForm, {
        props: { modelValue: makeForm(), readonly: true }
      })
      expect(wrapper.classes()).toContain('questionnaire-form--readonly')
    })

    it('disables Q1 name input when readonly=true', () => {
      const wrapper = mount(QuestionnaireForm, {
        props: { modelValue: makeForm(), readonly: true }
      })
      const nameBlock = wrapper.find('[data-question="name"]')
      const input = nameBlock.find<HTMLInputElement>('input')
      expect(input.element.disabled).toBe(true)
    })

    it('disables Q3 description input when readonly=true', () => {
      const wrapper = mount(QuestionnaireForm, {
        props: { modelValue: makeForm(), readonly: true }
      })
      const block = wrapper.find('[data-question="description"]')
      const input = block.find<HTMLInputElement>('input')
      expect(input.element.disabled).toBe(true)
    })

    it('disables Q4 welcome_message textarea when readonly=true', () => {
      const wrapper = mount(QuestionnaireForm, {
        props: { modelValue: makeForm(), readonly: true }
      })
      const block = wrapper.find('[data-question="welcome_message"]')
      const textarea = block.find<HTMLTextAreaElement>('textarea')
      expect(textarea.element.disabled).toBe(true)
    })
  })

  describe('data-question attributes for scroll', () => {
    it('each question block has a data-question attribute', () => {
      const wrapper = mount(QuestionnaireForm, {
        props: { modelValue: makeForm() }
      })
      const questions = wrapper.findAll('.questionnaire-form__question')
      questions.forEach((q) => {
        expect(q.attributes('data-question')).toBeTruthy()
      })
    })
  })

  describe('emits update:modelValue on input', () => {
    it('emits when Q1 name input changes', async () => {
      const wrapper = mount(QuestionnaireForm, {
        props: { modelValue: makeForm() }
      })
      const nameBlock = wrapper.find('[data-question="name"]')
      const input = nameBlock.find('input')
      await input.setValue('New Name')
      await input.trigger('input')
      const emitted = wrapper.emitted('update:modelValue')
      expect(emitted).toBeTruthy()
      const lastForm = emitted![emitted!.length - 1][0] as ReturnType<typeof makeForm>
      expect(lastForm.name).toBe('New Name')
    })
  })
})
