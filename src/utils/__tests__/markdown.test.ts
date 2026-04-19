/**
 * markdown.ts 单元测试（16 用例，分 3 组）
 *
 * 基础渲染 (6)：
 *   - null / undefined / '' 返回空字符串
 *   - 普通段落 / GFM 表格 / 代码块 hljs class / 未知 lang 降级 / breaks
 *
 * XSS 防护 (4)：
 *   - <script> / onclick / javascript: 协议 / img onerror
 *
 * stripCodeFence (6)：
 *   - ```markdown 围栏剥离 / ``` 围栏剥离 / 无围栏保持 /
 *     只有末尾无开头保持不变 / null/undefined/'' 返回空 /
 *     只有开头无末尾也剥离
 */
import { describe, it, expect } from 'vitest'
import { renderMarkdown, stripCodeFence } from '../markdown'

describe('renderMarkdown — 基础渲染', () => {
  it('null / undefined / 空字符串返回空字符串', () => {
    expect(renderMarkdown(null)).toBe('')
    expect(renderMarkdown(undefined)).toBe('')
    expect(renderMarkdown('')).toBe('')
  })

  it('普通段落渲染为 <p> 元素', () => {
    const html = renderMarkdown('Hello World')
    expect(html).toContain('<p>')
    expect(html).toContain('Hello World')
    expect(html).toContain('</p>')
  })

  it('GFM 表格正确渲染为 <table>', () => {
    const md = `
| Header 1 | Header 2 |
|----------|----------|
| Cell A   | Cell B   |
    `.trim()
    const html = renderMarkdown(md)
    expect(html).toContain('<table>')
    expect(html).toContain('<th>Header 1</th>')
    expect(html).toContain('<td>Cell A</td>')
  })

  it('代码块带 language 应用 hljs class', () => {
    const md = '```js\nconst x = 1\n```'
    const html = renderMarkdown(md)
    expect(html).toContain('<pre>')
    expect(html).toContain('<code class="hljs language-js">')
  })

  it('代码块未知 language 降级为 plaintext', () => {
    const md = '```unknown-lang-xyz\nsome code\n```'
    const html = renderMarkdown(md)
    expect(html).toContain('language-plaintext')
  })

  it('breaks: true 让单换行变 <br>', () => {
    const md = 'line 1\nline 2'
    const html = renderMarkdown(md)
    expect(html).toContain('<br>')
  })
})

describe('renderMarkdown — XSS 防护', () => {
  it('<script> 标签被 DOMPurify 剥离', () => {
    const md = 'Hello <script>alert("xss")</script> World'
    const html = renderMarkdown(md)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('alert')
  })

  it('onclick 内联事件被剥离', () => {
    const md = '<a href="https://example.com" onclick="alert(1)">click</a>'
    const html = renderMarkdown(md)
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('alert')
  })

  it('javascript: 协议链接被剥离', () => {
    const md = '[click me](javascript:alert(1))'
    const html = renderMarkdown(md)
    // DOMPurify 会移除或替换 javascript: 协议
    expect(html).not.toContain('javascript:alert')
  })

  it('img onerror 被剥离', () => {
    const md = '<img src=x onerror="alert(1)">'
    const html = renderMarkdown(md)
    expect(html).not.toContain('onerror')
  })
})

describe('stripCodeFence', () => {
  it('```markdown 围栏被正确剥离', () => {
    const input = '```markdown\n# Title\n正文\n```'
    const output = stripCodeFence(input)
    expect(output).toBe('# Title\n正文')
  })

  it('``` (无 lang) 围栏被正确剥离', () => {
    const input = '```\n# Title\n正文\n```'
    const output = stripCodeFence(input)
    expect(output).toBe('# Title\n正文')
  })

  it('无围栏时保持不变', () => {
    const input = '# Title\n正文'
    expect(stripCodeFence(input)).toBe('# Title\n正文')
  })

  it('只有末尾 ``` 无开头围栏时保持不变（避免误伤正常的代码块）', () => {
    const input = '这是说明\n\n```js\ncode\n```'
    // 应保持原样，因为开头没有围栏
    expect(stripCodeFence(input)).toBe('这是说明\n\n```js\ncode\n```')
  })

  it('null / undefined / 空字符串返回空字符串', () => {
    expect(stripCodeFence(null)).toBe('')
    expect(stripCodeFence(undefined)).toBe('')
    expect(stripCodeFence('')).toBe('')
    expect(stripCodeFence('   ')).toBe('')
  })

  it('只有开头 ```markdown 无末尾围栏时也剥离开头', () => {
    const input = '```markdown\n# Title'
    expect(stripCodeFence(input)).toBe('# Title')
  })
})
