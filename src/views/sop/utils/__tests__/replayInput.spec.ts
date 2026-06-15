import { describe, it, expect } from 'vitest'
import { stripMergedFileBlocks, formatFileSize, isImageFile } from '../replayInput'

describe('stripMergedFileBlocks', () => {
  it('(a) hasFiles=false → 原样返回，即便含 === 也不剥离', () => {
    const input = '请把这段 === 重点 === 标出来'
    expect(stripMergedFileBlocks(input, false)).toBe(input)
  })

  it('(b) 用户文本 + 单个文件块 → 只留用户文本', () => {
    const input = '请总结这份文件\n\n=== report.pdf ===\n第一章 ... 第二章 ...'
    expect(stripMergedFileBlocks(input, true)).toBe('请总结这份文件')
  })

  it('(c) 用户文本 + 多个文件块 → 在第一个块处截断', () => {
    const input = '对比这两份资料\n\n=== a.txt ===\naaa\n\n=== b.txt ===\nbbb'
    expect(stripMergedFileBlocks(input, true)).toBe('对比这两份资料')
  })

  it('(d) 用户文本为空、input 以文件块开头 → 返回空串', () => {
    const input = '=== shot.png ===\nOCR 识别出的文字'
    expect(stripMergedFileBlocks(input, true)).toBe('')
  })

  it('(e) 无提取内容的「用户已上传以下文件：」提示段 → 只留用户文本', () => {
    const input =
      '看看这些图\n\n用户已上传以下文件：a.png、b.png\n\n注意：这些文件无法自动提取文本内容，请根据文件名和上下文进行处理。'
    expect(stripMergedFileBlocks(input, true)).toBe('看看这些图')
  })

  it('(f) 用户文本为空、以「用户已上传以下文件：」开头 → 返回空串', () => {
    const input = '用户已上传以下文件：a.png\n\n注意：...'
    expect(stripMergedFileBlocks(input, true)).toBe('')
  })

  it('(g) hasFiles=true 但无可识别块 → trim 后全显（防御）', () => {
    const input = '  只有这一句话，没有任何文件块标记  '
    expect(stripMergedFileBlocks(input, true)).toBe('只有这一句话，没有任何文件块标记')
  })

  it('空 input → 原样返回', () => {
    expect(stripMergedFileBlocks('', true)).toBe('')
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
