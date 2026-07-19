import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AgentInputArea from '../AgentInputArea.vue'

describe('AgentInputArea', () => {
  afterEach(() => vi.useRealTimers())

  it('never shows or requests an estimated credit cost after input', async () => {
    vi.useFakeTimers()
    const wrapper = mount(AgentInputArea, { props: { attachments: [] } })

    await wrapper.find('textarea').setValue('帮我分析这周的数据')
    await vi.advanceTimersByTimeAsync(1_000)

    expect(wrapper.text()).not.toContain('预计消耗')
    expect(wrapper.emitted('estimate-request')).toBeUndefined()
  })
})
