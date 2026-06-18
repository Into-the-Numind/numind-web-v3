/**
 * agentArtifacts.spec.ts — unit tests for extractArtifacts (agent-output-polish
 * #2a). Locks the COS-artifact precision (P1-A): only myqcloud.com|cos.ap- hosts
 * with an agent-outputs/ path are extracted; third-party citations/images stay in
 * the prose untouched.
 */
import { describe, it, expect } from 'vitest'
import {
  extractArtifacts,
  splitIntoSegments,
  groupAdjacentImages,
  type Segment
} from '../agentArtifacts'

// A presigned COS image URL (signature query suffix must be ignored).
const COS_IMG =
  'https://numind-1234.cos.ap-guangzhou.myqcloud.com/agent-outputs/run42/chart.png?q-sign-algorithm=sha1&q-ak=AKID;q-sign-time=1;q-signature=abc'
// A presigned COS docx download URL.
const COS_DOCX =
  'https://numind-1234.cos.ap-guangzhou.myqcloud.com/agent-outputs/run42/report.docx?q-sign-algorithm=sha1&q-signature=def'
// A presigned COS HTML URL (问题五 — must extract to a text/html artifact → card).
const COS_HTML =
  'https://numind-1234.cos.ap-guangzhou.myqcloud.com/agent-outputs/run42/page.html?q-sign-algorithm=sha1&q-signature=ghi'

describe('extractArtifacts — COS images & downloads', () => {
  it('① extracts a signed COS image and a signed COS docx with correct mime', () => {
    const md = `结果如下：\n\n![图表](${COS_IMG})\n\n[下载报告](${COS_DOCX})`
    const { prose, artifacts } = extractArtifacts(md)

    expect(artifacts).toHaveLength(2)
    // #2: the display name is the markdown alt / link text the LLM wrote ("图表",
    // "下载报告"), not the COS object-key tail (chart.png / report.docx).
    expect(artifacts[0]).toEqual({
      filename: '图表',
      url: COS_IMG,
      mime: 'image/png'
    })
    expect(artifacts[1]).toEqual({
      filename: '下载报告',
      url: COS_DOCX,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })
    // the COS nodes are stripped from the prose; the surrounding text remains
    expect(prose).toContain('结果如下：')
    expect(prose).not.toContain(COS_IMG)
    expect(prose).not.toContain(COS_DOCX)
    expect(prose).not.toContain('chart.png')
    expect(prose).not.toContain('report.docx')
  })

  it('问题五: extracts a standalone COS HTML link as a text/html artifact (card)', () => {
    const md = `页面做好了：\n\n[查看页面](${COS_HTML})`
    const { prose, artifacts } = extractArtifacts(md)
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toEqual({ filename: '查看页面', url: COS_HTML, mime: 'text/html' })
    expect(prose).not.toContain(COS_HTML)
    expect(prose).toContain('页面做好了：')

    // Also via splitIntoSegments — the path AgentFinalAnswer actually renders.
    const seg = splitIntoSegments(md).find((s) => s.type === 'artifact')
    expect(seg && seg.type === 'artifact' && seg.ref.mime).toBe('text/html')
  })
})

describe('extractArtifacts — third-party nodes are NOT extracted', () => {
  it('② a third-party document link stays an ordinary markdown link in the prose', () => {
    const md = '参考 [来源](https://example.com/report.pdf) 的数据。'
    const { prose, artifacts } = extractArtifacts(md)
    expect(artifacts).toHaveLength(0)
    expect(prose).toBe(md) // untouched
    expect(prose).toContain('[来源](https://example.com/report.pdf)')
  })

  it('③ a third-party image stays inline in the prose', () => {
    const md = '配图：![随机图](https://picsum.photos/200)'
    const { prose, artifacts } = extractArtifacts(md)
    expect(artifacts).toHaveLength(0)
    expect(prose).toBe(md)
    expect(prose).toContain('![随机图](https://picsum.photos/200)')
  })

  it('a COS host without agent-outputs/ in the path is NOT extracted', () => {
    const url = 'https://numind-1234.cos.ap-guangzhou.myqcloud.com/uploads/x.png'
    const md = `![x](${url})`
    const { prose, artifacts } = extractArtifacts(md)
    expect(artifacts).toHaveLength(0)
    expect(prose).toBe(md)
  })

  it('an agent-outputs/ path on a non-COS host is NOT extracted', () => {
    const url = 'https://cdn.example.com/agent-outputs/x.png'
    const md = `![x](${url})`
    const { prose, artifacts } = extractArtifacts(md)
    expect(artifacts).toHaveLength(0)
    expect(prose).toBe(md)
  })

  it('问题五: a third-party .html link is NOT extracted (only COS agent-outputs become cards)', () => {
    const md = '参考 [页面](https://example.com/agent-outputs/page.html) 的排版。'
    const { prose, artifacts } = extractArtifacts(md)
    expect(artifacts).toHaveLength(0)
    expect(prose).toBe(md)
  })
})

describe('extractArtifacts — mixed content', () => {
  it('④ mixed prose + COS image + COS docx + third-party link: prose keeps text + 3rd-party link, drops COS nodes', () => {
    const thirdParty = '[行业报告](https://example.com/2026.pdf)'
    const md = [
      '# 分析结论',
      '',
      '核心要点见下图。',
      '',
      `![趋势图](${COS_IMG})`,
      '',
      `完整版：[下载报告](${COS_DOCX})`,
      '',
      `延伸阅读：${thirdParty}`
    ].join('\n')

    const { prose, artifacts } = extractArtifacts(md)

    expect(artifacts).toHaveLength(2)
    expect(artifacts.map((a) => a.filename)).toEqual(['趋势图', '下载报告'])

    // COS nodes gone from prose
    expect(prose).not.toContain(COS_IMG)
    expect(prose).not.toContain(COS_DOCX)
    // heading + body text + third-party link survive
    expect(prose).toContain('# 分析结论')
    expect(prose).toContain('核心要点见下图。')
    expect(prose).toContain(thirdParty)
  })
})

describe('extractArtifacts — mime inference per extension', () => {
  const cos = (name: string) =>
    `https://b.cos.ap-shanghai.myqcloud.com/agent-outputs/run1/${name}?q-sign-time=1`

  const cases: Array<[string, boolean, string, string]> = [
    // [filename, isImageNode, expectedMime, label]
    ['a.png', true, 'image/png', 'png'],
    ['a.jpg', true, 'image/jpeg', 'jpg'],
    ['a.jpeg', true, 'image/jpeg', 'jpeg'],
    ['a.gif', true, 'image/gif', 'gif'],
    ['a.webp', true, 'image/webp', 'webp'],
    [
      'a.docx',
      false,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'docx'
    ],
    ['a.doc', false, 'application/msword', 'doc'],
    ['a.xlsx', false, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
    ['a.xls', false, 'application/vnd.ms-excel', 'xls'],
    [
      'a.pptx',
      false,
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'pptx'
    ],
    ['a.ppt', false, 'application/vnd.ms-powerpoint', 'ppt'],
    ['a.pdf', false, 'application/pdf', 'pdf'],
    ['a.csv', false, 'text/csv', 'csv'],
    ['a.html', false, 'text/html', 'html'],
    ['a.htm', false, 'text/html', 'htm']
  ]

  // Empty alt/link-text → filename falls back to the URL filename (#2 fallback path).
  it.each(cases)('⑤ %s infers the right mime', (name, isImageNode, expectedMime) => {
    const url = cos(name)
    const md = isImageNode ? `![](${url})` : `[](${url})`
    const { artifacts } = extractArtifacts(md)
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0].mime).toBe(expectedMime)
    expect(artifacts[0].filename).toBe(name)
  })

  it('case-insensitive extension (.PNG) is recognized', () => {
    const url = cos('CHART.PNG')
    const { artifacts } = extractArtifacts(`![x](${url})`)
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0].mime).toBe('image/png')
  })

  it('a COS node with an unknown extension stays inline (no guessed mime)', () => {
    const url = cos('data.bin')
    const md = `[x](${url})`
    const { prose, artifacts } = extractArtifacts(md)
    expect(artifacts).toHaveLength(0)
    expect(prose).toBe(md)
  })
})

describe('extractArtifacts — edge cases', () => {
  it('empty / nullish input returns empty prose + no artifacts', () => {
    expect(extractArtifacts('')).toEqual({ prose: '', artifacts: [] })
    expect(extractArtifacts(null)).toEqual({ prose: '', artifacts: [] })
    expect(extractArtifacts(undefined)).toEqual({ prose: '', artifacts: [] })
  })

  it('plain prose with no links is returned unchanged', () => {
    const md = '# 标题\n\n这是一段没有任何链接的正文。'
    expect(extractArtifacts(md)).toEqual({ prose: md, artifacts: [] })
  })
})

describe('splitIntoSegments — in-place artifact cards (#1/#4)', () => {
  it('① a download link standing alone on its own line (with a label) becomes an artifact segment', () => {
    const md = `分析完成。\n\n文件下载：[报告](${COS_DOCX})\n\n请查收。`
    const segs = splitIntoSegments(md)

    // prose(intro) → artifact(card) → prose(outro), in document order
    expect(segs.map((s) => s.type)).toEqual(['prose', 'artifact', 'prose'])
    const card = segs[1]
    expect(card.type).toBe('artifact')
    if (card.type === 'artifact') {
      expect(card.ref.filename).toBe('报告') // #2: link text, not report.docx
      expect(card.ref.url).toBe(COS_DOCX)
      expect(card.ref.mime).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    }
    // the COS url never leaks into a prose segment
    expect(
      segs
        .filter((s) => s.type === 'prose')
        .map((s) => (s as { html: string }).html)
        .join('')
    ).not.toContain('report.docx')
  })

  it('a bare COS image standing alone on its own line becomes an artifact segment', () => {
    const md = `核心见下图：\n\n![趋势图](${COS_IMG})`
    const segs = splitIntoSegments(md)
    expect(segs.map((s) => s.type)).toEqual(['prose', 'artifact'])
    const card = segs[1]
    if (card.type === 'artifact') {
      expect(card.ref.filename).toBe('趋势图') // #2: alt text, not chart.png
      expect(card.ref.mime).toBe('image/png')
    }
  })

  it('② a COS link embedded inside a list item is NOT split — it stays in the prose', () => {
    const md = `要点：\n\n- 第一条，详见 [报告](${COS_DOCX}) 的数据\n- 第二条`
    const segs = splitIntoSegments(md)

    // no artifact card — the list block stays intact in a single prose segment
    expect(segs.every((s) => s.type === 'prose')).toBe(true)
    const html = (segs[0] as { html: string }).html
    // the list survived as a list, and the COS link is still inside it (marked
    // HTML-escapes `&` in the query string to `&amp;`, so assert on the path).
    expect(html).toContain('<li>')
    expect(html).toContain('agent-outputs/run42/report.docx')
  })

  it('a COS link surrounded by prose on the same line is NOT split (stays inline)', () => {
    const md = `完整版可以从 [这里](${COS_DOCX}) 下载，记得保存。`
    const segs = splitIntoSegments(md)
    expect(segs).toHaveLength(1)
    expect(segs[0].type).toBe('prose')
    // link kept inline (marked escapes `&`→`&amp;`, so assert on the path).
    expect((segs[0] as { html: string }).html).toContain('agent-outputs/run42/report.docx')
  })

  it('③ multiple standalone-line COS artifacts interleave with prose, in document order', () => {
    const md = [
      '# 报告',
      '',
      '正文一。',
      '',
      `![趋势图](${COS_IMG})`,
      '',
      '正文二。',
      '',
      `[下载报告](${COS_DOCX})`,
      '',
      '正文三。'
    ].join('\n')
    const segs = splitIntoSegments(md)

    expect(segs.map((s) => s.type)).toEqual(['prose', 'artifact', 'prose', 'artifact', 'prose'])
    const filenames = segs
      .filter((s): s is { type: 'artifact'; ref: { filename: string } } => s.type === 'artifact')
      .map((s) => s.ref.filename)
    expect(filenames).toEqual(['趋势图', '下载报告'])
  })

  it('④ a standalone third-party link line is NOT split — it stays prose', () => {
    const md = `参考资料：\n\n[行业报告](https://example.com/2026.pdf)`
    const segs = splitIntoSegments(md)
    expect(segs.every((s) => s.type === 'prose')).toBe(true)
    expect(segs.map((s) => (s as { html: string }).html).join('')).toContain(
      'https://example.com/2026.pdf'
    )
  })

  it('a third-party image standing alone is NOT split', () => {
    const md = `配图：\n\n![随机图](https://picsum.photos/200)`
    const segs = splitIntoSegments(md)
    expect(segs.every((s) => s.type === 'prose')).toBe(true)
  })

  it('empty / nullish input → empty segment array', () => {
    expect(splitIntoSegments('')).toEqual([])
    expect(splitIntoSegments(null)).toEqual([])
    expect(splitIntoSegments(undefined)).toEqual([])
  })

  it('plain prose with no COS nodes → a single prose segment', () => {
    const segs = splitIntoSegments('# 标题\n\n一段正文。')
    expect(segs).toHaveLength(1)
    expect(segs[0].type).toBe('prose')
  })
})

describe('display name from markdown text/alt (#2)', () => {
  const cos = (name: string) =>
    `https://b.cos.ap-shanghai.myqcloud.com/agent-outputs/run9/${name}?q-sign-time=1`

  it('image alt is preferred over the URL filename (both extract + split paths)', () => {
    const url = cos('image-20260616-183647.png')
    const md = `![销售漏斗图](${url})`
    // extractArtifacts path
    expect(extractArtifacts(md).artifacts[0].filename).toBe('销售漏斗图')
    // splitIntoSegments / standaloneArtifactOf path
    const seg = splitIntoSegments(md)[0]
    expect(seg.type).toBe('artifact')
    if (seg.type === 'artifact') expect(seg.ref.filename).toBe('销售漏斗图')
  })

  it('link text is preferred over the URL filename for a doc', () => {
    const url = cos('20260615-py-______.docx')
    const md = `[行业定位分析报告](${url})`
    expect(extractArtifacts(md).artifacts[0].filename).toBe('行业定位分析报告')
  })

  it('empty alt falls back to the URL filename', () => {
    const url = cos('image-20260616-183647.png')
    expect(extractArtifacts(`![](${url})`).artifacts[0].filename).toBe('image-20260616-183647.png')
  })

  it('whitespace-only alt falls back to the URL filename', () => {
    const url = cos('report.pdf')
    expect(extractArtifacts(`[   ](${url})`).artifacts[0].filename).toBe('report.pdf')
  })
})

describe('groupAdjacentImages — coalesce consecutive images into a grid (#3 M1)', () => {
  const imgRef = (n: number) => ({
    filename: `图${n}`,
    url: `https://b.cos.ap-shanghai.myqcloud.com/agent-outputs/r/${n}.png`,
    mime: 'image/png'
  })
  const docRef = {
    filename: '报告',
    url: 'https://b.cos.ap-shanghai.myqcloud.com/agent-outputs/r/a.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  const prose = (html: string): Segment => ({ type: 'prose', html })
  const art = (ref: ReturnType<typeof imgRef> | typeof docRef): Segment => ({
    type: 'artifact',
    ref
  })

  it('3 consecutive images → one image-group with all 3 refs', () => {
    const out = groupAdjacentImages([art(imgRef(1)), art(imgRef(2)), art(imgRef(3))])
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('image-group')
    if (out[0].type === 'image-group') expect(out[0].refs).toHaveLength(3)
  })

  it('a single image stays an artifact (rendered as an S2 card, not a grid)', () => {
    const out = groupAdjacentImages([art(imgRef(1))])
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('artifact')
  })

  it('image, prose, image → two separate artifacts (real prose breaks the run)', () => {
    const out = groupAdjacentImages([art(imgRef(1)), prose('<p>x</p>'), art(imgRef(2))])
    expect(out.map((s) => s.type)).toEqual(['artifact', 'prose', 'artifact'])
  })

  it('two images then a doc → image-group(2) + the doc as its own artifact', () => {
    const out = groupAdjacentImages([art(imgRef(1)), art(imgRef(2)), art(docRef)])
    expect(out.map((s) => s.type)).toEqual(['image-group', 'artifact'])
    if (out[0].type === 'image-group') expect(out[0].refs).toHaveLength(2)
  })

  it('a doc never joins an image-group', () => {
    const out = groupAdjacentImages([art(docRef), art(imgRef(1)), art(imgRef(2))])
    // doc first (alone) → artifact; then the two images group
    expect(out.map((s) => s.type)).toEqual(['artifact', 'image-group'])
  })

  it('prose passes through unchanged; empty input → empty array', () => {
    expect(groupAdjacentImages([])).toEqual([])
    const p = prose('<p>hi</p>')
    expect(groupAdjacentImages([p])).toEqual([p])
  })
})

// document-editor-ux #命名：COS 下载 URL 的 response-content-disposition 携带 AI 起的真实
// 文件名（如「本周工作小结.docx」），它优先于 LLM 写的通用链接文字（「点击下载 Word 文档」）和
// 被 ASCII 化的 object-key 尾巴。验证双层编码（query 级 + RFC5987 filename*）正确解出中文名。
describe('extractArtifacts — 文件名取自 response-content-disposition（命名修复）', () => {
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  // 构造一个带 disposition 的预签名 COS 下载 URL。
  function cosUrlWithName(realName: string, withStar = true): string {
    const star = withStar ? `; filename*=UTF-8''${encodeURIComponent(realName)}` : ''
    const cd = `attachment; filename="fallback.docx"${star}`
    // object-key 尾巴故意是 ASCII 化的乱名，证明显示名不取自它
    return (
      'https://numind-1234.cos.ap-guangzhou.myqcloud.com/agent-outputs/run42/' +
      '1700000000-______.docx?q-sign-algorithm=sha1&q-signature=def' +
      `&response-content-disposition=${encodeURIComponent(cd)}`
    )
  }

  it('filename* (RFC5987 中文) 优先于链接文字', () => {
    const url = cosUrlWithName('本周工作小结.docx')
    const md = `这是你的周报：\n\n[点击下载 Word 文档](${url})`
    const { artifacts } = extractArtifacts(md)
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0].filename).toBe('本周工作小结.docx')
    expect(artifacts[0].mime).toBe(DOCX_MIME)
  })

  it('仅 plain filename（无 filename*）时回退到 plain 值', () => {
    const url = cosUrlWithName('季度复盘.docx', false)
    const md = `[下载](${url})`
    const { artifacts } = extractArtifacts(md)
    expect(artifacts).toHaveLength(1)
    // 无 filename* → 取 disposition 的 plain filename="fallback.docx"
    expect(artifacts[0].filename).toBe('fallback.docx')
  })

  it('无 disposition（如图片普通签名 URL）→ 回退链接文字（行为不变）', () => {
    const url =
      'https://numind-1234.cos.ap-guangzhou.myqcloud.com/agent-outputs/run42/chart.png?q-signature=abc'
    const md = `![销售漏斗图](${url})`
    const { artifacts } = extractArtifacts(md)
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0].filename).toBe('销售漏斗图')
  })
})
