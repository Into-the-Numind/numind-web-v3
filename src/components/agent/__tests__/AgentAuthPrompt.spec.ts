/**
 * AgentAuthPrompt.spec.ts — unit tests for the auth-pause card (feishu-integration T13).
 *
 * Covers the card's own 4-state lifecycle + the load-bearing contract that an
 * auth pause is resolved EXTERNALLY (the card emits nothing — resume is the
 * server-side OAuth callback, not an in-app submit):
 *   - pending (has url) → renders QR + copyable URL + 去授权 CTA + auto-continue hint
 *   - copy → copyText util called with the auth_url; ✓ feedback flips
 *   - error (no url)    → quiet re-trigger note, NO dead CTA
 *   - answered          → calm "已授权，正在继续…" recap, no controls
 *   - emits nothing ever (no answer-submitted) — distinguishes it from QuestionPrompt
 *
 * qrcode is mocked (async toDataURL otherwise races jsdom microtasks).
 * copyText is mocked to assert the call + isolate clipboard/secure-context.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,stub'))
  }
}))

vi.mock('@/utils/clipboard', () => ({
  copyText: vi.fn(() => Promise.resolve(true))
}))

import AgentAuthPrompt from '../AgentAuthPrompt.vue'
import { copyText } from '@/utils/clipboard'

const copyTextMock = copyText as unknown as ReturnType<typeof vi.fn>

const AUTH_URL = 'https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=cli_x&redirect_uri=cb'

const mountCard = (props: Record<string, unknown> = {}): VueWrapper =>
  mount(AgentAuthPrompt, { props: { authUrl: AUTH_URL, ...props } })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AgentAuthPrompt — pending (has url)', () => {
  it('renders the copyable URL, a 去授权 CTA pointing at auth_url, and the auto-continue hint', async () => {
    const wrapper = mountCard()
    await flushPromises()

    // URL is shown (in the <code> block)
    expect(wrapper.text()).toContain(AUTH_URL)

    // CTA opens the auth url in a new tab
    const cta = wrapper.find('.auth-prompt__cta')
    expect(cta.exists()).toBe(true)
    expect(cta.attributes('href')).toBe(AUTH_URL)
    expect(cta.attributes('target')).toBe('_blank')

    // QR rendered from the mocked data URL
    const qr = wrapper.find('.auth-prompt__qr-img')
    expect(qr.exists()).toBe(true)
    expect(qr.attributes('src')).toBe('data:image/png;base64,stub')

    // "auto-continue, no need to come back" hint (the loading signal)
    expect(wrapper.text()).toContain('授权完成后会自动继续')
  })

  it('shows the prompt lead-in text when provided', async () => {
    const wrapper = mountCard({ prompt: '飞书授权链接已发送，完成授权后自动恢复' })
    await flushPromises()
    expect(wrapper.text()).toContain('飞书授权链接已发送，完成授权后自动恢复')
  })

  it('falls back to default lead-in when prompt is empty', async () => {
    const wrapper = mountCard({ prompt: '' })
    await flushPromises()
    expect(wrapper.text()).toContain('需要你授权后才能继续')
  })

  it('copies the auth_url via copyText and flips to ✓ feedback', async () => {
    const wrapper = mountCard()
    await flushPromises()

    await wrapper.find('.auth-prompt__copy').trigger('click')
    await flushPromises()

    expect(copyTextMock).toHaveBeenCalledWith(AUTH_URL)
    expect(wrapper.find('.auth-prompt__copy').text()).toContain('已复制')
  })
})

describe('AgentAuthPrompt — error (no url)', () => {
  it('renders a re-trigger note and NO dead CTA when auth_url is missing', async () => {
    const wrapper = mountCard({ authUrl: '' })
    await flushPromises()

    expect(wrapper.text()).toContain('授权链接生成失败')
    expect(wrapper.find('.auth-prompt__cta').exists()).toBe(false)
    expect(wrapper.find('.auth-prompt__qr-img').exists()).toBe(false)
  })
})

describe('AgentAuthPrompt — answered (resumed)', () => {
  it('renders the calm "已授权，正在继续…" recap with no link controls', async () => {
    const wrapper = mountCard({ answered: true })
    await flushPromises()

    expect(wrapper.text()).toContain('已授权，正在继续')
    // no actionable controls in the answered state
    expect(wrapper.find('.auth-prompt__cta').exists()).toBe(false)
    expect(wrapper.find('.auth-prompt__copy').exists()).toBe(false)
  })
})

describe('AgentAuthPrompt — contract', () => {
  it('never emits answer-submitted (resume is external/server-driven, not in-app)', async () => {
    const wrapper = mountCard()
    await flushPromises()
    await wrapper.find('.auth-prompt__copy').trigger('click')
    await wrapper.find('.auth-prompt__cta').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('answer-submitted')).toBeUndefined()
  })
})
