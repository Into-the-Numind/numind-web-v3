/**
 * AgentArtifactItem 单元测试 — 卡片交互模型
 *
 * 交互模型（followup3）：卡片只显一个【下载】按钮；点击卡片本身 —— 可编辑文档
 * (docx/md/txt)→打开右侧编辑器；图片→放大 modal；其余格式（含 HTML）→提示"暂不支持预览"。
 *
 * followup3 FE-2：HTML 从源头切断 iframe 预览，只下载。本测试断言 HTML 卡片点击
 * 不再产生 iframe，而是 flash"暂不支持预览"——是该决策的回归护栏：谁日后又给
 * HTML 加回 iframe 预览，测试立刻 FAIL。
 *
 * 注意：图片预览用 <Teleport to="body">，挂在 document.body。
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
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

describe('AgentArtifactItem — HTML is download-only (no iframe preview)', () => {
  it('clicking an HTML card flashes "暂不支持预览" and never renders an iframe', async () => {
    const wrapper = mount(AgentArtifactItem, {
      props: { artifact: htmlArtifact },
      attachTo: document.body
    })

    // 点击前后都不应出现 iframe（HTML 预览已从源头移除）
    expect(document.querySelector('iframe')).toBeNull()
    await wrapper.get('[data-testid="artifact-card"]').trigger('click')
    expect(document.querySelector('iframe')).toBeNull()
    expect(wrapper.text()).toContain('暂不支持预览')

    wrapper.unmount()
  })

  it('the download button is present and stops propagation (no preview triggered)', async () => {
    const wrapper = mount(AgentArtifactItem, {
      props: { artifact: htmlArtifact },
      attachTo: document.body
    })
    expect(wrapper.find('[data-testid="artifact-download"]').exists()).toBe(true)
    await wrapper.get('[data-testid="artifact-download"]').trigger('click')
    // 点下载按钮不应出现 iframe，也不应 flash 提示（stop 冒泡）
    expect(document.querySelector('iframe')).toBeNull()
    expect(wrapper.text()).not.toContain('暂不支持预览')
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
