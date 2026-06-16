import { describe, it, expect } from 'vitest'
import { stripMergedFileBlocks, formatFileSize, isImageFile } from '../replayInput'

describe('stripMergedFileBlocks', () => {
  const file = (content: string, file_name = 'doc.txt') => ({ content, file_name })

  // Rule 11 复现（客户报告）：首次运行新 SOP，只上传文件不输入文字时，「用户输入」文本块却显示
  // 了上传文件的全部提取内容（与上传卡重复）。根因=前端 compose() 把文件内容直接拼进 input、无
  // `=== 文件名 ===` 标记，旧的分隔符剥离匹配不到→原样返回文件内容。修复=按文件 content 精确移除。
  it('(repro) file-only 新格式：input=文件内容(无标记) → 剥成空', () => {
    const c = '这是上传文档的提取内容ABC\n\n第二段内容DEF'
    expect(stripMergedFileBlocks(c, [file(c)])).toBe('')
  })

  it('(repro2) 用户文本 + 新 compose 格式(无标记，文本\\n\\n内容) → 只留用户文本', () => {
    const c = '文件被抽取的正文内容XYZ'
    expect(stripMergedFileBlocks(`帮我看看这个\n\n${c}`, [file(c)])).toBe('帮我看看这个')
  })

  it('(a) 无文件(files=[]) → 原样返回，即便含 === 也不剥离', () => {
    const input = '请把这段 === 重点 === 标出来'
    expect(stripMergedFileBlocks(input, [])).toBe(input)
  })

  it('(b) 老后端格式：用户文本 + === 文件名 === + 内容 → 只留用户文本', () => {
    const c = '第一章 ... 第二章 ...'
    const input = `请总结这份文件\n\n=== report.pdf ===\n${c}`
    expect(stripMergedFileBlocks(input, [file(c, 'report.pdf')])).toBe('请总结这份文件')
  })

  it('(c) 多个文件内容 → 全部移除，只留用户文本', () => {
    const a = 'aaa内容'
    const b = 'bbb内容'
    const input = `对比这两份资料\n\n${a}\n\n${b}`
    expect(stripMergedFileBlocks(input, [file(a, 'a.txt'), file(b, 'b.txt')])).toBe(
      '对比这两份资料'
    )
  })

  it('(d) CRLF 归一化：input 用 \\r\\n、content 用 \\n 仍能精确移除', () => {
    const c = '第一行\n第二行\n第三行'
    const input = `用户问题\r\n\r\n第一行\r\n第二行\r\n第三行`
    expect(stripMergedFileBlocks(input, [file(c)])).toBe('用户问题')
  })

  it('(e) 老的「用户已上传以下文件：」无内容提示段 → 剥掉提示段', () => {
    const input =
      '看看这些图\n\n用户已上传以下文件：a.png、b.png\n\n注意：这些文件无法自动提取文本内容。'
    expect(stripMergedFileBlocks(input, [file('', 'a.png')])).toBe('看看这些图')
  })

  it('(f) 文件 content 不在 input 中(防御) → 保守保留用户文本', () => {
    const input = '只有这一句话，文件内容没拼进来'
    expect(stripMergedFileBlocks(input, [file('完全不同的内容')])).toBe(
      '只有这一句话，文件内容没拼进来'
    )
  })

  it('(g) 文件内容恰好是用户文字的子串 → 只删拼接块，不误删句中同名子串（锚定移除）', () => {
    const c = 'abc'
    // 用户文字里也含 "abc"，但拼接块 "\n\nabc" 才该被删
    const input = `请分析abc这份文件\n\n${c}`
    expect(stripMergedFileBlocks(input, [file(c)])).toBe('请分析abc这份文件')
  })

  it('空 input + 有文件 → 返回空串', () => {
    expect(stripMergedFileBlocks('', [file('x')])).toBe('')
  })
})

describe('formatFileSize', () => {
  it('字节档', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1023)).toBe('1023 B')
  })
  it('KB 档（整数四舍五入）', () => {
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1536)).toBe('2 KB')
    expect(formatFileSize(1024 * 1023)).toBe('1023 KB')
  })
  it('MB 档（一位小数）', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatFileSize(Math.round(2.5 * 1024 * 1024))).toBe('2.5 MB')
  })
  it('非法输入 → 空串', () => {
    expect(formatFileSize(-1)).toBe('')
    expect(formatFileSize(NaN)).toBe('')
    expect(formatFileSize(Infinity)).toBe('')
  })
  it('KB 上界边界：1MB-1 byte 四舍五入到 1024 KB（锁定当前行为）', () => {
    // Math.round((1024*1024-1)/1024) === 1024 → 显示 "1024 KB" 而非 "1.0 MB"，
    // 仅落在 [1048064, 1048575] 字节窄区间，对 UI 无实质影响。改阈值时此用例保护。
    expect(formatFileSize(1024 * 1024 - 1)).toBe('1024 KB')
  })
})

describe('isImageFile', () => {
  it('MIME image/ 前缀 → true', () => {
    expect(isImageFile({ file_type: 'image/png', file_ext: '', file_name: 'x' })).toBe(true)
    expect(isImageFile({ file_type: 'image/jpeg', file_ext: '', file_name: 'x' })).toBe(true)
  })
  it('非图片 MIME → false', () => {
    expect(
      isImageFile({ file_type: 'application/pdf', file_ext: '.pdf', file_name: 'x.pdf' })
    ).toBe(false)
  })
  it('MIME 缺失时回退 file_ext（含无前导点/大写）', () => {
    expect(isImageFile({ file_type: '', file_ext: '.jpg', file_name: '' })).toBe(true)
    expect(isImageFile({ file_type: '', file_ext: 'PNG', file_name: '' })).toBe(true)
  })
  it('MIME + ext 都缺失时从 file_name 推断', () => {
    expect(isImageFile({ file_type: '', file_ext: '', file_name: 'photo.JPEG' })).toBe(true)
    expect(isImageFile({ file_type: '', file_ext: '', file_name: 'doc.pdf' })).toBe(false)
  })
  it('无任何线索 → false', () => {
    expect(isImageFile({ file_type: '', file_ext: '', file_name: '' })).toBe(false)
  })
})
