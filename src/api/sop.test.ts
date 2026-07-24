import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import request from './request'
import { uploadFileForText, uploadImageForOCR } from './sop'

vi.mock('./request', () => ({
  default: {
    post: vi.fn()
  }
}))

const mockedRequest = request as unknown as {
  post: Mock
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SOP upload APIs', () => {
  it('allows document upload and parsing requests to run for two minutes', async () => {
    const file = new File(['pdf'], 'brief.pdf', { type: 'application/pdf' })
    mockedRequest.post.mockResolvedValue({ data: 'parsed text' })

    await expect(uploadFileForText(file, 4315, 1)).resolves.toBe('parsed text')

    expect(mockedRequest.post).toHaveBeenCalledWith(
      '/v1/pdf/convert-to-text',
      expect.any(FormData),
      expect.objectContaining({
        timeout: 120000,
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    )
  })

  it('allows image OCR upload requests to run for two minutes', async () => {
    const file = new File(['image'], 'scan.png', { type: 'image/png' })
    mockedRequest.post.mockResolvedValue({ data: { content: 'recognized text', file_id: 2926 } })

    await expect(uploadImageForOCR(file, 4315, 1)).resolves.toEqual({
      content: 'recognized text',
      file_id: 2926
    })

    expect(mockedRequest.post).toHaveBeenCalledWith(
      '/v1/ali/vision/analyze',
      expect.any(FormData),
      expect.objectContaining({
        timeout: 120000,
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    )
  })
})
