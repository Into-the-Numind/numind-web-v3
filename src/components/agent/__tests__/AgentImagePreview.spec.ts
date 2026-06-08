import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, it, expect, vi, afterEach } from 'vitest'
import AgentImagePreview from '../AgentImagePreview.vue'

const stubs = { Teleport: true }

describe('AgentImagePreview', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when url is null', () => {
    const wrapper = mount(AgentImagePreview, { props: { url: null }, global: { stubs } })
    expect(wrapper.find('.image-preview-overlay').exists()).toBe(false)
  })

  it('renders the enlarged image when a url is provided', () => {
    const wrapper = mount(AgentImagePreview, {
      props: { url: 'https://example.com/test.png' },
      global: { stubs }
    })
    const img = wrapper.find('.preview-img')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe('https://example.com/test.png')
  })

  it('emits close on close button, overlay click', async () => {
    const wrapper = mount(AgentImagePreview, {
      props: { url: 'https://example.com/test.png' },
      global: { stubs }
    })
    await wrapper.find('.close-btn').trigger('click')
    await wrapper.find('.image-preview-overlay').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(2)
  })

  it('emits close on Escape while open', async () => {
    const wrapper = mount(AgentImagePreview, {
      props: { url: 'https://example.com/test.png' },
      global: { stubs }
    })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('does NOT register an Escape listener when closed (url null)', async () => {
    const wrapper = mount(AgentImagePreview, { props: { url: null }, global: { stubs } })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('exposes a download button that triggers a cross-origin-safe download', async () => {
    // Capture the anchor element the component creates so we can assert its attrs.
    let anchor: HTMLAnchorElement | null = null
    const clickSpy = vi.fn()
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLElement
      if (tag === 'a') {
        ;(el as HTMLAnchorElement).click = clickSpy
        anchor = el as HTMLAnchorElement
      }
      return el
    })

    const wrapper = mount(AgentImagePreview, {
      props: { url: 'https://cos.example.com/agent/u1/gen-image-123.png?sign=abc' },
      global: { stubs }
    })

    const downloadBtn = wrapper.find('.download-btn')
    expect(downloadBtn.exists()).toBe(true)
    await downloadBtn.trigger('click')

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(anchor).not.toBeNull()
    expect(anchor!.href).toBe('https://cos.example.com/agent/u1/gen-image-123.png?sign=abc')
    // filename derived from the URL path, query string stripped
    expect(anchor!.download).toBe('gen-image-123.png')
    // cross-origin COS URLs ignore `download` unless opened in a new tab w/o opener
    expect(anchor!.target).toBe('_blank')
    expect(anchor!.rel).toBe('noopener noreferrer')
  })
})
