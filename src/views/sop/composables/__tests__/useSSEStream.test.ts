/**
 * useSSEStream 单元测试
 *
 * 覆盖 5 个关键边界（task 6 DoD）：
 *   1. 正常流：thinking + message + done 事件正确分发
 *   2. 心跳行过滤：":\n\n" 不触发任何 handler
 *   3. 双 done 事件：onDone 只触发一次（幂等保护）
 *   4. error 事件：调用 onError 传递字符串
 *   5. chunk 跨越 buffer 边界：不完整事件留到下次循环组装
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSSEStream, type SSEStreamHandlers } from '../useSSEStream'

/**
 * 构造一个 fake ReadableStream，按给定 chunks 逐次返回。
 *
 * 每个 chunk 会被 encode 为 Uint8Array，模拟真实网络分片。
 */
function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i]))
        i++
      } else {
        controller.close()
      }
    }
  })
}

/**
 * Mock global fetch 返回一个 Response，其 body 是给定的 SSE chunks。
 */
function mockFetchWithSSE(chunks: string[]): void {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      body: makeStream(chunks)
    } as unknown as Response)
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  // vitest jsdom 环境中 localStorage 已存在，设置一个 token 避免 undefined
  localStorage.setItem('token', 'fake-test-token')
})

describe('useSSEStream', () => {
  it('正常流：thinking + message + done 事件正确分发', async () => {
    mockFetchWithSSE([
      'event: thinking\ndata: "思考片段1"\n\n',
      'data: "输出片段1"\n\n', // message 事件没有 event 行
      'data: "输出片段2"\n\n',
      'event: done\ndata: {"status":"completed"}\n\n'
    ])

    const thinkingChunks: string[] = []
    const messageChunks: string[] = []
    let doneMeta: unknown = null

    const handlers: SSEStreamHandlers = {
      onThinking: (chunk) => thinkingChunks.push(chunk),
      onMessage: (chunk) => messageChunks.push(chunk),
      onDone: (meta) => {
        doneMeta = meta
      }
    }

    const { streamPost } = useSSEStream()
    await streamPost('/fake-url', { method: 'POST', body: '' }, handlers)

    expect(thinkingChunks).toEqual(['思考片段1'])
    expect(messageChunks).toEqual(['输出片段1', '输出片段2'])
    expect(doneMeta).toEqual({ status: 'completed' })
  })

  it('心跳行 :\\n\\n 不触发任何 handler', async () => {
    mockFetchWithSSE([
      ':\n\n', // 纯心跳
      'data: "内容"\n\n',
      ':\n\n', // 中间穿插的心跳
      'event: done\ndata: {"status":"completed"}\n\n'
    ])

    const onThinking = vi.fn()
    const onMessage = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    const { streamPost } = useSSEStream()
    await streamPost(
      '/fake-url',
      { method: 'POST', body: '' },
      { onThinking, onMessage, onDone, onError }
    )

    expect(onThinking).not.toHaveBeenCalled()
    expect(onMessage).toHaveBeenCalledTimes(1)
    expect(onMessage).toHaveBeenCalledWith('内容')
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('双 done 事件：onDone 只触发一次（幂等保护）', async () => {
    // 模拟 ExecuteNodeStream 的行为：biz 回调发一次 done，controller 再补一次带 uploaded_file_ids
    mockFetchWithSSE([
      'data: "内容"\n\n',
      'event: done\ndata: {"status":"completed"}\n\n',
      'event: done\ndata: {"status":"completed","uploaded_file_ids":[1,2,3]}\n\n'
    ])

    const onDone = vi.fn()

    const { streamPost } = useSSEStream()
    await streamPost('/fake-url', { method: 'POST', body: '' }, { onDone })

    // 只触发一次，即使后端发了两次 done
    expect(onDone).toHaveBeenCalledTimes(1)
    // 第一次的 meta（不含 uploaded_file_ids）
    expect(onDone).toHaveBeenCalledWith({ status: 'completed' })
  })

  it('error 事件：调用 onError 传递字符串', async () => {
    mockFetchWithSSE(['data: "已生成的部分内容"\n\n', 'event: error\ndata: "余额不足"\n\n'])

    const onMessage = vi.fn()
    const onError = vi.fn()

    const { streamPost } = useSSEStream()
    await streamPost('/fake-url', { method: 'POST', body: '' }, { onMessage, onError })

    // 已接收的部分内容应该还在
    expect(onMessage).toHaveBeenCalledWith('已生成的部分内容')
    // error 应被 handler 接收到
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith('余额不足')
  })

  it('chunk 跨越 buffer 边界：不完整事件留到下次循环组装', async () => {
    // 模拟网络分片：一个事件被切成 3 块到达
    mockFetchWithSSE([
      'event: think', // 被切断的 event 字段
      'ing\ndata: "分片', // 跨越 data 字段
      '内容"\n\n', // 最后组装完成
      'event: done\ndata: {"status":"completed"}\n\n'
    ])

    const onThinking = vi.fn()
    const onDone = vi.fn()

    const { streamPost } = useSSEStream()
    await streamPost('/fake-url', { method: 'POST', body: '' }, { onThinking, onDone })

    // 跨 chunk 的事件应被正确组装并分发
    expect(onThinking).toHaveBeenCalledTimes(1)
    expect(onThinking).toHaveBeenCalledWith('分片内容')
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('HTTP 非 200 响应：调用 onError 报告状态码', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        body: null
      } as unknown as Response)
    )

    const onError = vi.fn()
    const { streamPost } = useSSEStream()
    await streamPost('/fake-url', { method: 'POST', body: '' }, { onError })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toContain('500')
  })

  it('流异常终止（TCP FIN 但无 event:done）：触发 onError 而非静默卡死', async () => {
    // Latent bug 场景：proxy idle timeout / nginx reload / 移动网络 NAT 断连。
    // reader.read() 返回 {done:true} 但流中从未出现 event:done。
    // 修复前：while 循环退出 + 函数正常 return → onDone 和 onError 都不触发
    //   → SOPRunView.executeNode 的 onDone/onError 回调都不跑
    //   → UI 永远停在 streaming 态。
    // 修复后：在 while 循环后、catch 前检测 doneFired，未触发则调 onError。
    mockFetchWithSSE([
      'event: thinking\ndata: "思考片段"\n\n',
      'data: "已到达的部分内容"\n\n'
      // 没有 event: done — 流直接关闭（模拟 TCP FIN）
    ])

    const onThinking = vi.fn()
    const onMessage = vi.fn()
    const onDone = vi.fn()
    const onError = vi.fn()

    const { streamPost } = useSSEStream()
    await streamPost(
      '/fake-url',
      { method: 'POST', body: '' },
      { onThinking, onMessage, onDone, onError }
    )

    // 已到达的 chunk 应正常分发
    expect(onThinking).toHaveBeenCalledWith('思考片段')
    expect(onMessage).toHaveBeenCalledWith('已到达的部分内容')
    // 没有 event: done 到达 → onDone 不该触发
    expect(onDone).not.toHaveBeenCalled()
    // 关键：onError 必须触发，让上层决定如何兜底（静默恢复 / 报错 / 重试）
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toContain('中断')
  })

  it('Authorization header 携带 localStorage token', async () => {
    mockFetchWithSSE(['event: done\ndata: {"status":"completed"}\n\n'])
    localStorage.setItem('token', 'my-jwt-token')

    const { streamPost } = useSSEStream()
    await streamPost('/fake-url', { method: 'POST', body: '' }, {})

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [, init] = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer my-jwt-token')
  })
})
