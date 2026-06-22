import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AgentForm from '../AgentForm.vue'
import { initialFormState } from '@/types/agentBuilder'

function makeForm() {
  return initialFormState()
}

describe('AgentForm', () => {
  describe('question blocks rendered', () => {
    it('renders the direct-creation data-question attributes', () => {
      const wrapper = mount(AgentForm, {
        props: { modelValue: makeForm() }
      })
      const expectedAttrs = ['name', 'description', 'welcome_message', 'system_prompt']
      expectedAttrs.forEach((attr) => {
        expect(
          wrapper.find(`[data-question="${attr}"]`).exists(),
          `data-question="${attr}" should exist`
        ).toBe(true)
      })
    })

    it('does NOT render the removed questionnaire blocks (q6/q7/q8)', () => {
      const wrapper = mount(AgentForm, {
        props: { modelValue: makeForm() }
      })
      expect(wrapper.find('[data-question="q6"]').exists()).toBe(false)
      expect(wrapper.find('[data-question="q7"]').exists()).toBe(false)
      expect(wrapper.find('[data-question="q8"]').exists()).toBe(false)
    })

    it('does not render the tool_flags switch block', () => {
      const wrapper = mount(AgentForm, {
        props: { modelValue: makeForm() }
      })
      expect(wrapper.find('[data-question="tool_flags"]').exists()).toBe(false)
      expect(wrapper.find('.tool-flags').exists()).toBe(false)
    })

    it('does not render removed avatar / starters blocks', () => {
      const wrapper = mount(AgentForm, {
        props: { modelValue: makeForm() }
      })
      expect(wrapper.find('[data-question="icon_url"]').exists()).toBe(false)
      expect(wrapper.find('[data-question="starters"]').exists()).toBe(false)
    })

    it('renders exactly 4 question blocks total', () => {
      const wrapper = mount(AgentForm, {
        props: { modelValue: makeForm() }
      })
      expect(wrapper.findAll('[data-question]')).toHaveLength(4)
    })
  })

  describe('required markers', () => {
    it('only name + system_prompt are required (2)', () => {
      const wrapper = mount(AgentForm, {
        props: { modelValue: makeForm() }
      })
      // Required fields surface a `*` marker via `.field__req`
      const requiredMarkers = wrapper.findAll('.field__req')
      expect(requiredMarkers.length).toBe(2)
    })

    it('name label is required', () => {
      const wrapper = mount(AgentForm, {
        props: { modelValue: makeForm() }
      })
      const nameBlock = wrapper.find('[data-question="name"]')
      expect(nameBlock.find('.field__req').exists()).toBe(true)
    })

    it('description is optional (no required marker)', () => {
      const wrapper = mount(AgentForm, {
        props: { modelValue: makeForm() }
      })
      const descBlock = wrapper.find('[data-question="description"]')
      expect(descBlock.find('.field__req').exists()).toBe(false)
    })

    it('welcome_message is optional (no required marker)', () => {
      const wrapper = mount(AgentForm, {
        props: { modelValue: makeForm() }
      })
      const block = wrapper.find('[data-question="welcome_message"]')
      expect(block.find('.field__req').exists()).toBe(false)
    })
  })

  describe('system_prompt editor', () => {
    it('renders the prompt textarea and binds the value', () => {
      const form = makeForm()
      form.system_prompt = '你是一个测试助手'
      const wrapper = mount(AgentForm, {
        props: { modelValue: form }
      })
      const block = wrapper.find('[data-question="system_prompt"]')
      const textarea = block.find<HTMLTextAreaElement>('textarea')
      expect(textarea.exists()).toBe(true)
      expect(textarea.element.value).toBe('你是一个测试助手')
    })

    it('emits update:modelValue when system_prompt changes', async () => {
      const wrapper = mount(AgentForm, {
        props: { modelValue: makeForm() }
      })
      const block = wrapper.find('[data-question="system_prompt"]')
      const textarea = block.find('textarea')
      await textarea.setValue('新的提示词')
      await textarea.trigger('input')
      const emitted = wrapper.emitted('update:modelValue')
      expect(emitted).toBeTruthy()
      const lastForm = emitted![emitted!.length - 1][0] as ReturnType<typeof makeForm>
      expect(lastForm.system_prompt).toBe('新的提示词')
    })

    it('shows system_prompt error when errors prop has the key', () => {
      const wrapper = mount(AgentForm, {
        props: {
          modelValue: makeForm(),
          errors: { system_prompt: '请输入提示词（行为指引）' }
        }
      })
      const block = wrapper.find('[data-question="system_prompt"]')
      const error = block.find('.field__error')
      expect(error.exists()).toBe(true)
      expect(error.text()).toBe('请输入提示词（行为指引）')
    })
  })

  describe('error message display', () => {
    it('shows error message when errors prop has an entry', () => {
      const wrapper = mount(AgentForm, {
        props: {
          modelValue: makeForm(),
          errors: { name: '请输入助手名字' }
        }
      })
      const nameBlock = wrapper.find('[data-question="name"]')
      const error = nameBlock.find('.field__error')
      expect(error.exists()).toBe(true)
      expect(error.text()).toBe('请输入助手名字')
    })

    it('does not show error when errors is empty', () => {
      const wrapper = mount(AgentForm, {
        props: { modelValue: makeForm(), errors: {} }
      })
      expect(wrapper.findAll('.field__error')).toHaveLength(0)
    })

    it('shows error border class on input', () => {
      const wrapper = mount(AgentForm, {
        props: {
          modelValue: makeForm(),
          errors: { description: '描述必填' }
        }
      })
      const descBlock = wrapper.find('[data-question="description"]')
      const input = descBlock.find('.field__input')
      expect(input.classes()).toContain('field__input--error')
    })
  })

  describe('readonly propagation', () => {
    it('applies agent-form--readonly class when readonly=true', () => {
      const wrapper = mount(AgentForm, {
        props: { modelValue: makeForm(), readonly: true }
      })
      expect(wrapper.classes()).toContain('agent-form--readonly')
    })

    it('disables name input when readonly=true', () => {
      const wrapper = mount(AgentForm, {
        props: { modelValue: makeForm(), readonly: true }
      })
      const nameBlock = wrapper.find('[data-question="name"]')
      const input = nameBlock.find<HTMLInputElement>('input')
      expect(input.element.disabled).toBe(true)
    })

    it('disables system_prompt textarea when readonly=true', () => {
      const wrapper = mount(AgentForm, {
        props: { modelValue: makeForm(), readonly: true }
      })
      const block = wrapper.find('[data-question="system_prompt"]')
      const textarea = block.find<HTMLTextAreaElement>('textarea')
      expect(textarea.element.disabled).toBe(true)
    })
  })

  describe('emits update:modelValue on input', () => {
    it('emits when name input changes', async () => {
      const wrapper = mount(AgentForm, {
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
