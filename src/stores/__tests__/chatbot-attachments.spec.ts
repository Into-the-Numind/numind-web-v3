/**
 * chatbot store 图片附件单测 (chatbot-image-recognition T6)
 *
 * 覆盖：
 *   1. uploadImage — 成功后 stage id/filename/mimeType
 *   2. removeImage — 移除暂存图片
 *   3. sendMessage — attachment_ids 只含图片 id 透传 + userMsg.attachments + 发送后清空
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatbotStore } from '../chatbot'
import type { ChatbotSession } from '@/types/config'

vi.mock('@/api/chatbot', () => ({
  listVisibleChatbots: vi.fn(),
  createChatbotSession: vi.fn(),
  listChatbotSessions: vi.fn(),
  deleteChatbotSession: vi.fn(),
  listChatbotMessages: vi.fn(),
  sendChatbotMessageStream: vi.fn(),
  renameChatbotSession: vi.fn(),
  pinChatbotSession: vi.fn()
}))

vi.mock('@/api/agent', () => ({ uploadAttachment: vi.fn() }))

vi.mock('@/stores/llmModel', () => ({
  useLLMModelStore: () => ({
    getSelectedModelKey: () => 'qwen3-vl-flash-2026-01-22',
    isThinkingEnabled: () => false
  })
}))

vi.mock('@/stores/notifications', () => ({
  useNotificationsStore: () => ({ warning: vi.fn(), error: vi.fn(), success: vi.fn() })
}))

import { sendChatbotMessageStream, listChatbotSessions } from '@/api/chatbot'
import { uploadAttachment } from '@/api/agent'

function makeSession(overrides: Partial<ChatbotSession> = {}): ChatbotSession {
  return {
    id: 3,
    user_id: 10,
    chatbot_id: 42,
    title: 'S',
    status: 'active',
    message_count: 0,
    pinned_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides
  }
}

function pngFile(name: string): File {
  return new File(['x'], name, { type: 'image/png' })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock')
  globalThis.URL.revokeObjectURL = vi.fn()
  vi.mocked(listChatbotSessions).mockResolvedValue({ data: { list: [], total: 0 } } as any)
})

describe('uploadImage', () => {
  it('成功后 stage id/filename/mimeType', async () => {
    vi.mocked(uploadAttachment).mockResolvedValueOnce({
      id: 99,
      url: 'cos://x',
      filename: 'chart.png',
      size: 10,
      mime_type: 'image/png'
    } as any)

    const store = useChatbotStore()
    await store.uploadImage(pngFile('chart.png'))

    expect(store.imageAttachments).toHaveLength(1)
    expect(store.imageAttachments[0]).toMatchObject({
      id: 99,
      filename: 'chart.png',
      mimeType: 'image/png'
    })
    expect(store.isUploadingImages).toBe(false)
  })

  it('上传失败不 stage + revoke blob', async () => {
    vi.mocked(uploadAttachment).mockRejectedValueOnce(new Error('boom'))
    const store = useChatbotStore()
    await store.uploadImage(pngFile('x.png'))
    expect(store.imageAttachments).toHaveLength(0)
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalled()
  })
})

describe('removeImage', () => {
  it('按 id 移除暂存图片', async () => {
    vi.mocked(uploadAttachment).mockResolvedValueOnce({
      id: 5,
      filename: 'b.png',
      mime_type: 'image/png',
      url: '',
      size: 1
    } as any)
    const store = useChatbotStore()
    await store.uploadImage(pngFile('b.png'))
    expect(store.imageAttachments).toHaveLength(1)

    store.removeImage(5)
    expect(store.imageAttachments).toHaveLength(0)
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })
})

describe('cleanup', () => {
  it('释放 staged 图片 blob + 清空（避免切路由泄漏）', async () => {
    vi.mocked(uploadAttachment).mockResolvedValueOnce({
      id: 8,
      filename: 'd.png',
      mime_type: 'image/png',
      url: '',
      size: 1
    } as any)
    const store = useChatbotStore()
    await store.uploadImage(pngFile('d.png'))
    expect(store.imageAttachments).toHaveLength(1)

    store.cleanup()
    expect(store.imageAttachments).toHaveLength(0)
    expect(globalThis.URL.revokeObjectURL).toHaveBeenCalled()
  })
})

describe('sendMessage with images', () => {
  it('attachment_ids 只含图片 id 透传 + userMsg.attachments + 发送后清空', async () => {
    vi.mocked(uploadAttachment).mockResolvedValueOnce({
      id: 7,
      filename: 'a.png',
      mime_type: 'image/png',
      url: '',
      size: 1
    } as any)
    vi.mocked(sendChatbotMessageStream).mockResolvedValueOnce(undefined as any)

    const store = useChatbotStore()
    store.currentSession = makeSession({ id: 3 })
    store.currentChatbotId = 42
    await store.uploadImage(pngFile('a.png'))

    await store.sendMessage('看这张图')

    // attachment_ids passed as the 7th positional arg
    const call = vi.mocked(sendChatbotMessageStream).mock.calls[0]
    expect(call[6]).toEqual([7])

    // optimistic user message carries attachments (filename chips on reload)
    const userMsg = store.messages.find((m) => m.role === 'user')
    expect(userMsg?.content).toBe('看这张图')
    expect(userMsg?.attachments).toEqual([{ id: 7, filename: 'a.png', mime_type: 'image/png' }])

    // staging cleared after send
    expect(store.imageAttachments).toHaveLength(0)
  })

  it('无图片时不传 attachment_ids（纯文本回归）', async () => {
    vi.mocked(sendChatbotMessageStream).mockResolvedValueOnce(undefined as any)
    const store = useChatbotStore()
    store.currentSession = makeSession({ id: 3 })
    store.currentChatbotId = 42

    await store.sendMessage('纯文本')

    const call = vi.mocked(sendChatbotMessageStream).mock.calls[0]
    expect(call[6]).toBeUndefined()
    const userMsg = store.messages.find((m) => m.role === 'user')
    expect(userMsg?.attachments).toBeUndefined()
  })
})
