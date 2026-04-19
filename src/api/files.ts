import request from './request'

/**
 * 提取文件文本内容（支持 PDF/TXT/MD/DOCX/DOC）
 */
export const extractFileText = async (file: File): Promise<string> => {
  const form = new FormData()
  form.append('file', file)
  const res = await request.post('/v1/files/extract-text', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000 // 5 min for large files
  })
  const data = (res as unknown as { data: string }).data
  return typeof data === 'string' ? data : ''
}
