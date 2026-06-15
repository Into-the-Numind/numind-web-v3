/**
 * agentArtifacts.spec.ts — unit tests for extractArtifacts (agent-output-polish
 * #2a). Locks the COS-artifact precision (P1-A): only myqcloud.com|cos.ap- hosts
 * with an agent-outputs/ path are extracted; third-party citations/images stay in
 * the prose untouched.
 */
import { describe, it, expect } from 'vitest'
import { extractArtifacts, splitIntoSegments } from '../agentArtifacts'

// A presigned COS image URL (signature query suffix must be ignored).
const COS_IMG =
  'https://numind-1234.cos.ap-guangzhou.myqcloud.com/agent-outputs/run42/chart.png?q-sign-algorithm=sha1&q-ak=AKID;q-sign-time=1;q-signature=abc'
// A presigned COS docx download URL.
const COS_DOCX =
  'https://numind-1234.cos.ap-guangzhou.myqcloud.com/agent-outputs/run42/report.docx?q-sign-algorithm=sha1&q-signature=def'

describe('extractArtifacts — COS images & downloads', () => {
  it('① extracts a signed COS image and a signed COS docx with correct mime', () => {
    const md = `结果如下：\n\n![图表](${COS_IMG})\n\n[下载报告](${COS_DOCX})`
    const { prose, artifacts } = extractArtifacts(md)

    expect(artifacts).toHaveLength(2)
    expect(artifacts[0]).toEqual({
      filename: 'chart.png',
      url: COS_IMG,
      mime: 'image/png'
    })
    expect(artifacts[1]).toEqual({
      filename: 'report.docx',
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
    expect(artifacts.map((a) => a.filename)).toEqual(['chart.png', 'report.docx'])

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
    ['a.csv', false, 'text/csv', 'csv']
  ]

  it.each(cases)('⑤ %s infers the right mime', (name, isImageNode, expectedMime) => {
    const url = cos(name)
    const md = isImageNode ? `![x](${url})` : `[x](${url})`
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
      expect(card.ref.filename).toBe('report.docx')
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
      expect(card.ref.filename).toBe('chart.png')
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
    expect(filenames).toEqual(['chart.png', 'report.docx'])
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
