/**
 * AgentArtifactItem 单元测试 — 卡片交互模型 + HTML 沙箱预览安全边界
 *
 * 交互模型（dev followup2 第三轮）：卡片只显一个【下载】按钮；【预览/编辑】通过点击
 * 卡片本身进入 —— HTML→渲染预览(iframe)，可编辑文档→编辑器，其余格式→提示"暂不支持预览"。
 *
 * HTML 预览安全边界（产品负责人批准放开脚本以真渲染样式）：iframe 用
 * sandbox="allow-scripts"（让报告自带的 Tailwind CDN / 图表 JS 跑起来渲染样式），
 * 但**绝不**加 allow-same-origin / allow-top-navigation —— opaque origin，脚本碰不到
 * app 的 cookie/DOM/会话。本测试是该边界的回归护栏：谁日后给 iframe 加了
 * allow-same-origin / allow-top-navigation，测试立刻 FAIL。
 *
 * 注意：预览用 <Teleport to="body">，iframe 挂在 document.body。
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AgentArtifactItem from '../AgentArtifactItem.vue'

const htmlArtifact = {
  id: 1,
  filename: 'report.html',
  url: 'https://example-bucket.cos.ap-guangzhou.myqcloud.com/agent-outputs/42/report.html?sign=abc',
  mime: 'text/html; charset=utf-8'
}

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('AgentArtifactItem — HTML preview (click card) + sandbox security boundary', () => {
  it('clicking the card opens the HTML preview iframe with allow-scripts but NOT allow-same-origin', async () => {
    const wrapper = mount(AgentArtifactItem, {
      props: { artifact: htmlArtifact },
      attachTo: document.body
    })

    // iframe 懒加载：未点击前不渲染（不预先请求 COS）
    expect(document.querySelector('iframe')).toBeNull()

    // 预览通过点击卡片本身进入（不再有独立的眼睛按钮）
    await wrapper.get('[data-testid="artifact-card"]').trigger('click')

    const iframe = document.querySelector('iframe') as HTMLIFrameElement
    expect(iframe).not.toBeNull()
    expect(iframe.getAttribute('src')).toBe(htmlArtifact.url)

    const sandbox = iframe.getAttribute('sandbox') ?? ''
    // 对抗性完整：sandbox 必须 EXACTLY 'allow-scripts' —— 既保证脚本能跑(否则裸文字),
    // 又保证没有任何其它 token(allow-same-origin/allow-top-navigation/allow-popups…)。
    // 任何新增 token 都让此断言 FAIL（安全边界的护栏）。
    expect(sandbox).toBe('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')
    expect(sandbox).not.toContain('allow-top-navigation')
    expect(sandbox).not.toContain('allow-popups')
    // 不通过 referrer 泄露预签名 URL
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer')

    wrapper.unmount()
  })

  it('the download button downloads WITHOUT opening the preview (stops propagation)', async () => {
    const wrapper = mount(AgentArtifactItem, {
      props: { artifact: htmlArtifact },
      attachTo: document.body
    })
    await wrapper.get('[data-testid="artifact-download"]').trigger('click')
    // 点下载按钮不应触发预览
    expect(document.querySelector('iframe')).toBeNull()
    wrapper.unmount()
  })

  it('closes the preview via the close button', async () => {
    const wrapper = mount(AgentArtifactItem, {
      props: { artifact: htmlArtifact },
      attachTo: document.body
    })
    await wrapper.get('[data-testid="artifact-card"]').trigger('click')
    expect(document.querySelector('iframe')).not.toBeNull()

    const closeBtn = document.querySelector('[aria-label="关闭预览"]') as HTMLButtonElement
    closeBtn.click()
    await flushPromises()
    expect(document.querySelector('iframe')).toBeNull()
    wrapper.unmount()
  })

  it('closes the preview when Escape is pressed', async () => {
    const wrapper = mount(AgentArtifactItem, {
      props: { artifact: htmlArtifact },
      attachTo: document.body
    })
    await wrapper.get('[data-testid="artifact-card"]').trigger('click')
    expect(document.querySelector('iframe')).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(document.querySelector('iframe')).toBeNull()
    wrapper.unmount()
  })

  it('shows a download fallback when the iframe fails to load', async () => {
    const wrapper = mount(AgentArtifactItem, {
      props: { artifact: htmlArtifact },
      attachTo: document.body
    })
    await wrapper.get('[data-testid="artifact-card"]').trigger('click')
    const frame = document.querySelector('iframe') as HTMLIFrameElement
    frame.dispatchEvent(new Event('error'))
    await flushPromises()
    expect(document.body.textContent).toContain('页面无法显示')
    expect(document.body.textContent).toContain('下载查看')
    wrapper.unmount()
  })
})

describe('AgentArtifactItem — non-previewable card click → hint', () => {
  it('clicking a non-previewable, non-editable file (pdf) flashes "暂不支持预览"', async () => {
    const pdf = {
      id: 9,
      filename: 'report.pdf',
      url: 'https://b.cos.ap-guangzhou.myqcloud.com/agent-outputs/42/report.pdf?sign=abc',
      mime: 'application/pdf'
    }
    const wrapper = mount(AgentArtifactItem, { props: { artifact: pdf } })
    await wrapper.get('[data-testid="artifact-card"]').trigger('click')
    expect(wrapper.text()).toContain('暂不支持预览')
    expect(document.querySelector('iframe')).toBeNull()
    wrapper.unmount()
  })
})

describe('AgentArtifactItem — A1 file card structure', () => {
  it('docx renders the A1 file card: emerald doc badge + filename + uppercase type label + download', () => {
    const doc = {
      id: 1,
      filename: '莫小派_获客调研.docx',
      url: 'https://b.cos.ap-guangzhou.myqcloud.com/agent-outputs/42/x.docx?sign=abc',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
    const wrapper = mount(AgentArtifactItem, { props: { artifact: doc } })
    expect(wrapper.find('.file-row').exists()).toBe(true)
    expect(wrapper.find('.doc-badge').exists()).toBe(true)
    expect(wrapper.find('.filename').text()).toBe('莫小派_获客调研.docx')
    expect(wrapper.find('.file-type').text()).toBe('DOCX')
    expect(wrapper.text()).not.toContain('KB')
    // 只有一个下载按钮（无独立预览/编辑按钮）
    expect(wrapper.find('[data-testid="artifact-download"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('falls back to a mime-derived type label when the filename has no extension', () => {
    const pdf = {
      id: 2,
      filename: 'report',
      url: 'https://b.cos.ap-guangzhou.myqcloud.com/agent-outputs/42/report?sign=abc',
      mime: 'application/pdf'
    }
    const wrapper = mount(AgentArtifactItem, { props: { artifact: pdf } })
    expect(wrapper.find('.file-type').text()).toBe('PDF')
    wrapper.unmount()
  })
})

describe('AgentArtifactItem — S2 image card structure (#3)', () => {
  it('an image renders the bare S2 thumb + caption, click opens the modal', async () => {
    const img = {
      id: 3,
      filename: 'chart.png',
      url: 'https://b.cos.ap-guangzhou.myqcloud.com/agent-outputs/42/chart.png?sign=abc',
      mime: 'image/png'
    }
    const wrapper = mount(AgentArtifactItem, { props: { artifact: img }, attachTo: document.body })
    expect(wrapper.find('.artifact-item--image').exists()).toBe(true)
    const thumb = wrapper.find('.thumb')
    expect(thumb.exists()).toBe(true)
    expect(thumb.attributes('src')).toBe(img.url)
    expect(wrapper.find('.filename').text()).toBe('chart.png')
    expect(wrapper.find('.doc-badge').exists()).toBe(false)
    expect(wrapper.find('.file-row').exists()).toBe(false)
    await wrapper.find('.image-wrap').trigger('click')
    expect(document.querySelector('.preview-img')).not.toBeNull()
    wrapper.unmount()
  })
})
