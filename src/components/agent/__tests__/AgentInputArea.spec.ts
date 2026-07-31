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

  it.each(['uploading', 'processing'] as const)(
    'shows a spinning attachment chip and blocks send while status is %s',
    async (status) => {
    const wrapper = mount(AgentInputArea, {
      props: {
        attachments: [
          {
            id: 0,
            url: 'upload-1',
            filename: 'a.pdf',
            size: 1,
            mime_type: 'application/pdf',
            created_at: '',
            status,
            client_id: 'upload-1'
          }
        ]
      }
    })

    expect(wrapper.text()).toContain('a.pdf')
    expect(wrapper.find('.attachment-icon--spin').exists()).toBe(true)

    await wrapper.find('textarea').setValue('总结这份文档')

    expect(wrapper.find('button[aria-label="发送"]').attributes('disabled')).toBeDefined()

    await wrapper.find('.attachment-remove').trigger('click')
    expect(wrapper.emitted('remove-attachment')?.[0]).toEqual(['upload-1'])
    }
  )
})
