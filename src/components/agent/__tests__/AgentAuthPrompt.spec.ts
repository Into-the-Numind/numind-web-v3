/**
 * AgentAuthPrompt.spec.ts — unit tests for the auth-pause card (feishu-integration
 * T13; feishu-resume-button adds the in-app resume trigger).
 *
 * Covers the card's own lifecycle + the load-bearing contract that the device-code
 * flow has NO server callback, so the user resumes the run by clicking "我已完成，
 * 继续" (the card emits a key-less `continue`; the parent builds the resume key):
 *   - pending (has url) → renders QR + copyable URL + 打开链接 CTA + 我已完成，继续
 *   - copy → copyText util called with the auth_url; ✓ feedback flips
 *   - error (no url)    → quiet re-trigger note, NO dead CTA
 *   - answered          → calm "已完成，正在继续…" recap, no controls
 *   - continue          → emits `continue` once; locks the button (no double submit)
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

// The auth-pause card renders the SAME way for both legs of the 飞书 connect
// flow — both arrive as pause_type=auth + a single auth_url (tool_feishu_connect.go):
//   AUTH_URL       — the OAuth "授权" link (authorize leg)
//   CREATE_APP_URL — the device-code "建应用" page link (create-app leg)
const AUTH_URL = 'https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=cli_x&redirect_uri=cb'
const CREATE_APP_URL = 'https://open.feishu.cn/page/cli?user_code=ABC-123'

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

    // "我已完成，继续" resume trigger + its lead-in hint (device-code has no callback)
    const cont = wrapper.find('.auth-prompt__continue')
    expect(cont.exists()).toBe(true)
    expect(cont.text()).toContain('我已完成，继续')
    expect(wrapper.text()).toContain('在浏览器完成后')
  })

  it('shows the prompt lead-in text when provided', async () => {
    const wrapper = mountCard({ prompt: '飞书连接链接已生成，请在浏览器中完成后回到这里继续' })
    await flushPromises()
    expect(wrapper.text()).toContain('飞书连接链接已生成，请在浏览器中完成后回到这里继续')
  })

  it('falls back to a flow-neutral default lead-in when prompt is empty', async () => {
    const wrapper = mountCard({ prompt: '' })
    await flushPromises()
    // Neutral copy — must NOT assume "授权"-only (the link may create an app).
    expect(wrapper.text()).toContain('请打开下面的链接完成操作')
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

describe('AgentAuthPrompt — both URL flavors (create-app + authorize)', () => {
  // The card must render identically + flow-neutrally for BOTH legs of the connect
  // flow — it cannot tell them apart from auth_url alone, and must not assume the
  // link authorizes (it may instead create an app). These two cases lock that in.
  it('renders the create-app (建应用) link with neutral chrome (打开链接 / 扫码打开)', async () => {
    const wrapper = mountCard({ authUrl: CREATE_APP_URL })
    await flushPromises()

    expect(wrapper.text()).toContain(CREATE_APP_URL)
    const cta = wrapper.find('.auth-prompt__cta')
    expect(cta.attributes('href')).toBe(CREATE_APP_URL)
    // Flow-neutral chrome (NOT "去授权" / "扫码授权" which would mis-describe building an app)
    expect(cta.text()).toContain('打开链接')
    expect(wrapper.find('.auth-prompt__qr-hint').text()).toBe('扫码打开')
    expect(wrapper.text()).not.toContain('去授权')
  })

  it('renders the authorize (授权) link with the same neutral chrome', async () => {
    const wrapper = mountCard({ authUrl: AUTH_URL })
    await flushPromises()

    expect(wrapper.text()).toContain(AUTH_URL)
    const cta = wrapper.find('.auth-prompt__cta')
    expect(cta.attributes('href')).toBe(AUTH_URL)
    expect(cta.text()).toContain('打开链接')
    expect(wrapper.find('.auth-prompt__qr-hint').text()).toBe('扫码打开')
  })

  it('copies whichever link flavor is present (create-app url here)', async () => {
    const wrapper = mountCard({ authUrl: CREATE_APP_URL })
    await flushPromises()
    await wrapper.find('.auth-prompt__copy').trigger('click')
    await flushPromises()
    expect(copyTextMock).toHaveBeenCalledWith(CREATE_APP_URL)
  })
})

describe('AgentAuthPrompt — error (no url)', () => {
  it('renders a re-trigger note and NO dead CTA when auth_url is missing', async () => {
    const wrapper = mountCard({ authUrl: '' })
    await flushPromises()

    expect(wrapper.text()).toContain('连接链接生成失败')
    expect(wrapper.find('.auth-prompt__cta').exists()).toBe(false)
    expect(wrapper.find('.auth-prompt__qr-img').exists()).toBe(false)
  })
})

describe('AgentAuthPrompt — answered (resumed)', () => {
  it('renders the calm "已完成，正在继续…" recap with no link controls', async () => {
    const wrapper = mountCard({ answered: true })
    await flushPromises()

    expect(wrapper.text()).toContain('已完成，正在继续')
    // no actionable controls in the answered state
    expect(wrapper.find('.auth-prompt__cta').exists()).toBe(false)
    expect(wrapper.find('.auth-prompt__copy').exists()).toBe(false)
    expect(wrapper.find('.auth-prompt__continue').exists()).toBe(false)
  })
})

describe('AgentAuthPrompt — continue (resume trigger)', () => {
  it('emits a key-less `continue` when the user clicks 我已完成，继续', async () => {
    const wrapper = mountCard()
    await flushPromises()

    await wrapper.find('.auth-prompt__continue').trigger('click')
    await flushPromises()

    // key-less event — the parent owns the resume key (this pause's question text)
    expect(wrapper.emitted('continue')).toHaveLength(1)
    expect(wrapper.emitted('continue')![0]).toEqual([])
  })

  it('locks the button after one click (no double submit) and shows "正在继续…"', async () => {
    const wrapper = mountCard()
    await flushPromises()

    const btn = wrapper.find('.auth-prompt__continue')
    await btn.trigger('click')
    await flushPromises()

    // disabled + recap copy, and a second click does not re-emit
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.text()).toContain('已完成，正在继续')
    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('continue')).toHaveLength(1)
  })

  it('does not emit `continue` from copy or open-link (only the explicit button)', async () => {
    const wrapper = mountCard()
    await flushPromises()
    await wrapper.find('.auth-prompt__copy').trigger('click')
    await wrapper.find('.auth-prompt__cta').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('continue')).toBeUndefined()
  })
})
