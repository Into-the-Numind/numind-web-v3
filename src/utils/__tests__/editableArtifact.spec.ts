import { describe, it, expect } from 'vitest'

import { isEditable } from '@/utils/editableArtifact'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

describe('isEditable', () => {
  it('文本类可编：docx / md / txt(带 charset) / html', () => {
    expect(isEditable(DOCX, 'a.docx')).toBe(true)
    expect(isEditable('', 'a.md')).toBe(true)
    expect(isEditable('text/markdown', 'a.md')).toBe(true)
    expect(isEditable('text/plain; charset=utf-8', 'a.txt')).toBe(true)
    expect(isEditable('text/html', 'a.html')).toBe(true)
    expect(isEditable('', 'a.htm')).toBe(true)
  })

  it('扩展名兜底（mime 缺失/未知）', () => {
    expect(isEditable(undefined, 'report.docx')).toBe(true)
    expect(isEditable('application/octet-stream', 'report.docx')).toBe(true)
  })

  it('非文本类不可编：png / csv / xlsx / pptx / pdf', () => {
    expect(isEditable('image/png', 'chart.png')).toBe(false)
    expect(isEditable('text/csv', 'a.csv')).toBe(false)
    expect(
      isEditable('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'a.xlsx')
    ).toBe(false)
    expect(
      isEditable(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'a.pptx'
      )
    ).toBe(false)
    expect(isEditable('application/pdf', 'a.pdf')).toBe(false)
  })

  it('无 mime 无 filename → false', () => {
    expect(isEditable()).toBe(false)
    expect(isEditable('', '')).toBe(false)
  })
})
