/**
 * AgentArtifactItem 单元测试 — HTML artifact 沙箱渲染回归保护
 *
 * 背景：后端 create_html 工具把 agent 生成的 HTML 原样(raw / un-escaped)发布到 COS，
 * 若被 prompt-injection（web_search / RAG 内容）注入 <script>，直接打开会执行。
 * 前端必须把 HTML artifact 渲染在一个 fully-sandboxed iframe 里
 * （空 sandbox：无 allow-scripts / 无 allow-same-origin），让注入脚本无法以
 * app 身份读取或外泄任何东西。本测试是该加固的回归护栏 —— 若有人日后给 iframe
 * 加上 allow-scripts / allow-same-origin（或任何 sandbox token），测试立刻 FAIL。
 *
 * 注意：预览用 <Teleport to="body">，iframe 挂在 document.body，
 * 需要 attachTo: document.body 并通过 document.querySelector 查找。
 * 每个用例都 unmount，移除组件挂在 document 上的 keydown 监听。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AgentArtifactItem from '../AgentArtifactItem.vue'

const htmlArtifact = {
  id: 1,
  filename: 'report.html',
  url: 'https://example-bucket.cos.ap-guangzhou.myqcloud.com/agent-outputs/42/report.html?sign=abc',
  mime: 'text/html; charset=utf-8'
}

afterEach(() => {
  // 清理 Teleport 残留，避免污染下一个用例的 document.body 查询
  // （与仓库内 BoosterPurchaseDialog.spec.ts 的 Teleport 用例同一惯例）
  document.body.innerHTML = ''
})

describe('AgentArtifactItem — HTML sandbox preview', () => {
  it('renders HTML artifacts inside a fully sandboxed iframe (empty sandbox)', async () => {
    const wrapper = mount(AgentArtifactItem, {
      props: { artifact: htmlArtifact },
      attachTo: document.body
    })

    // iframe 仅在打开预览后才渲染（懒加载，避免预先请求 COS）
    expect(document.querySelector('iframe')).toBeNull()

    await wrapper.get('[data-testid="html-preview-btn"]').trigger('click')

    const iframe = document.querySelector('iframe')
    expect(iframe).not.toBeNull()
    const frame = iframe as HTMLIFrameElement

    // src 指向 COS 预签名 URL
    expect(frame.getAttribute('src')).toBe(htmlArtifact.url)

    // 关键断言：sandbox 必须存在且为空字符串（最强限制）。
    // toBe('') 是 adversarially-complete 的护栏：任何新增 token
    // （allow-scripts / allow-same-origin / allow-popups / allow-top-navigation …）都会让它 FAIL。
    expect(frame.hasAttribute('sandbox')).toBe(true)
    const sandbox = frame.getAttribute('sandbox') ?? ''
    expect(sandbox).toBe('')
    expect(sandbox).not.toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')

    // 不通过 referrer 泄露预签名 URL
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')

    wrapper.unmount()
  })

  it('closes the preview via the close button', async () => {
    const wrapper = mount(AgentArtifactItem, {
      props: { artifact: htmlArtifact },
      attachTo: document.body
    })
    await wrapper.get('[data-testid="html-preview-btn"]').trigger('click')
    expect(document.querySelector('iframe')).not.toBeNull()

    const closeBtn = document.querySelector('[aria-label="关闭预览"]') as HTMLButtonElement
    expect(closeBtn).not.toBeNull()
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
    await wrapper.get('[data-testid="html-preview-btn"]').trigger('click')
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
    await wrapper.get('[data-testid="html-preview-btn"]').trigger('click')

    const frame = document.querySelector('iframe') as HTMLIFrameElement
    frame.dispatchEvent(new Event('error'))
    await flushPromises()

    // 错误兜底：提示 + 下载查看入口（满足 ui-ux Rule 2 的 error 状态）
    expect(document.body.textContent).toContain('页面无法显示')
    expect(document.body.textContent).toContain('下载查看')
    wrapper.unmount()
  })

  it('clears the loading state once the iframe load event fires', async () => {
    const wrapper = mount(AgentArtifactItem, {
      props: { artifact: htmlArtifact },
      attachTo: document.body
    })
    await wrapper.get('[data-testid="html-preview-btn"]').trigger('click')

    const frame = document.querySelector('iframe') as HTMLIFrameElement
    frame.dispatchEvent(new Event('load'))
    await flushPromises()

    expect(document.body.textContent).not.toContain('加载中')
    wrapper.unmount()
  })

  it('still offers a download button for HTML artifacts (explicit user action)', () => {
    const wrapper = mount(AgentArtifactItem, { props: { artifact: htmlArtifact } })
    expect(wrapper.find('[aria-label="下载文件"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('does NOT render an iframe or preview button for image artifacts', () => {
    const imageArtifact = {
      id: 2,
      filename: 'chart.png',
      url: 'https://example-bucket.cos.ap-guangzhou.myqcloud.com/agent-outputs/42/chart.png?sign=abc',
      mime: 'image/png'
    }
    const wrapper = mount(AgentArtifactItem, {
      props: { artifact: imageArtifact },
      attachTo: document.body
    })
    expect(wrapper.find('[data-testid="html-preview-btn"]').exists()).toBe(false)
    expect(document.querySelector('iframe')).toBeNull()
    wrapper.unmount()
  })

  it('does NOT render an iframe or preview button for non-HTML files (e.g. docx)', () => {
    const docArtifact = {
      id: 3,
      filename: 'report.docx',
      url: 'https://example-bucket.cos.ap-guangzhou.myqcloud.com/agent-outputs/42/report.docx?sign=abc',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }
    const wrapper = mount(AgentArtifactItem, { props: { artifact: docArtifact } })
    expect(wrapper.find('[data-testid="html-preview-btn"]').exists()).toBe(false)
    expect(document.querySelector('iframe')).toBeNull()
    // 非 HTML 文件仍提供下载
    expect(wrapper.find('[aria-label="下载文件"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
