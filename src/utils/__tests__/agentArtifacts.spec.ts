/**
 * agentArtifacts.spec.ts — unit tests for extractArtifacts (agent-output-polish
 * #2a). Locks the COS-artifact precision (P1-A): only myqcloud.com|cos.ap- hosts
 * with an agent-outputs/ path are extracted; third-party citations/images stay in
 * the prose untouched.
 */
import { describe, it, expect } from 'vitest'
import { extractArtifacts } from '../agentArtifacts'

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
