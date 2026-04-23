/**
 * useSSEStream — 通用 SSE 流解析 composable
 *
 * 基于**实测**后端 SOP SSE 协议（参考 task 1 research + spec §4）：
 *
 * 1. **thinking 事件**：
 *    ```
 *    event: thinking
 *    data: "<JSON-encoded string>"\n\n
 *    ```
 *    data 是 `json.Marshal(chunk)` 的结果，即一个带引号的 JSON 字符串，
 *    需要 `JSON.parse` 还原（结果是 string）。
 *
 * 2. **message 事件**（**没有 event 行**，默认事件类型）：
 *    ```
 *    data: "<JSON-encoded string>"\n\n
 *    ```
 *    同样是 JSON-encoded 字符串。
 *
 * 3. **done 事件**（可能被发送两次）：
 *    ```
 *    event: done
 *    data: {"status":"completed"}\n\n
 *    ```
 *    或带 uploaded_file_ids：
 *    ```
 *    event: done
 *    data: {"status":"completed","uploaded_file_ids":[1,2,3]}\n\n
 *    ```
 *    data 是 **JSON 对象**（不是字符串）。
 *    ExecuteNodeStream 会发送两次 done（biz 回调一次 + controller 补一次）。
 *    `doneFiredRef` 保证完成动作只触发一次。
 *
 * 4. **error 事件**：
 *    ```
 *    event: error
 *    data: "<JSON-encoded error message>"\n\n
 *    ```
 *    data 是 JSON 编码的字符串（不是 `{code, message}` 对象）。
 *
 * 5. **心跳行** `:\n\n`：
 *    由后端每 15 秒发送一次（controller heartbeat goroutine）。
 *    前端 parser 必须忽略以 `:` 开头的行（SSE 标准注释行）。
 *
 * 实现细节：
 *   - 按 `\n\n` 分割事件块
 *   - pop 最后一个不完整 chunk 留到下次循环
 *   - 流结束时 flush buffer 残留
 *   - AbortController 支持组件卸载时取消
 *
 * 详见 spec §4 + task 1 research。
 */
import { ref } from 'vue'

export interface SSEDoneMeta {
  status: string
  /** ExecuteNodeStream 的第二次 done 会带此字段（uploaded 文件 ID 列表） */
  uploaded_file_ids?: number[]
  /**
   * ChatAfterRunStream 的 done payload 带此字段（assistant 消息入库后的 ID）。
   * 实测自 biz/sop/sop.go:1336-1337：`{"status":"completed","message_id":<id>}`。
   * 前端用于关联新消息到 store 列表。
   */
  message_id?: number
}

export interface SSEStreamHandlers {
  onThinking?: (chunk: string) => void
  onMessage?: (chunk: string) => void
  onDone?: (meta: SSEDoneMeta) => void
  onError?: (errorMessage: string) => void
}

interface SSEEvent {
  /** 事件类型，默认 "message" */
  event: string
  /** data 字段原文（未 JSON.parse） */
  data: string
}

/**
 * 从 localStorage 读取 JWT token，用于 Authorization header。
 */
function getToken(): string {
  return localStorage.getItem('token') || localStorage.getItem('auth_token') || ''
}

export function useSSEStream() {
  const abortController = ref<AbortController | null>(null)
  /** 幂等保护：done 可能被发送两次，onDone handler 只触发一次 */
  const doneFired = ref(false)
  /** 追踪 event:error 是否已触发。和 doneFired 一起用于判定"异常终止"兜底逻辑 */
  const errorFired = ref(false)

  /**
   * 发起 SSE POST 请求并流式解析响应。
   *
   * @param url 完整 URL（含 query params）
   * @param init fetch 的 RequestInit（body / headers 由调用方构造）
   * @param handlers 事件处理函数
   */
  async function streamPost(
    url: string,
    init: RequestInit,
    handlers: SSEStreamHandlers
  ): Promise<void> {
    abortController.value = new AbortController()
    doneFired.value = false
    errorFired.value = false

    const response = await fetch(url, {
      ...init,
      signal: abortController.value.signal,
      headers: {
        Authorization: `Bearer ${getToken()}`,
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...(init.headers || {})
      }
    })

    if (!response.ok) {
      // 非 2xx：优先解析后端 JSON body 拿到真实 message，避免向用户展示裸 "HTTP 403:"。
      // 对 402 / 含"积分|额度|充值"的 403，与 axios interceptor 行为对齐派发
      // `insufficient-credits` 事件，让 App.vue 打开 InsufficientCreditsDialog。
      let message = ''
      let code = ''
      try {
        const body = await response.json()
        message = body?.message || body?.msg || ''
        code = body?.code || ''
      } catch {
        // body 非 JSON（如 nginx 错误页、空 body），保持 message 为空。
      }

      const insufficientCredits =
        response.status === 402 || (response.status === 403 && /积分|额度|充值/.test(message))

      if (insufficientCredits) {
        const detail = { message: message || '积分不足', reason: code }
        window.dispatchEvent(new CustomEvent('insufficient-credits', { detail }))
      }

      handlers.onError?.(message || `请求失败 (HTTP ${response.status})`)
      return
    }

    const body = response.body
    if (!body) {
      handlers.onError?.('Response body is null')
      return
    }

    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      let streamEnded = false
      while (!streamEnded) {
        const { done, value } = await reader.read()
        if (done) {
          streamEnded = true
          break
        }
        buffer += decoder.decode(value, { stream: true })
        // 按 \n\n 分割事件块，最后一个可能不完整，留到下次循环
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() ?? ''
        for (const block of blocks) {
          const evt = parseEventBlock(block)
          if (evt) dispatchEvent(evt, handlers)
        }
      }
      // flush buffer 中剩余的最后一块（如果有）
      if (buffer.trim()) {
        const evt = parseEventBlock(buffer)
        if (evt) dispatchEvent(evt, handlers)
      }
      // Stream 已结束（reader.read 返回 {done: true}）但从未收到 event:done 和 event:error。
      // 触发场景：proxy idle timeout / nginx reload / 移动网络 NAT 丢连接 / 任何让 TCP
      // 正常 FIN 但后端尚未发送终止事件的情形。不抛异常走 catch，必须在这里显式
      // 触发 onError，否则调用方（SOPRunView.executeNode 等）的 onDone/onError 回调
      // 都不跑 → UI 永远停在 streaming 态，即使后端已 persist 完整结果到 DB。
      // 如果 error event 已发（errorFired=true），则对应的 onError 已通知过上层，
      // 不要重复 fire。
      if (!doneFired.value && !errorFired.value) {
        handlers.onError?.('连接在响应完成前中断，请刷新或重试')
      }
    } catch (err) {
      // AbortController 触发的中止不应视为错误
      if ((err as Error).name === 'AbortError') {
        return
      }
      handlers.onError?.((err as Error).message || 'SSE stream error')
    }
  }

  /**
   * 解析单个 SSE 事件块（多行，每行以 field: value 格式）。
   *
   * 返回 null 表示该块是心跳行或空块，应忽略。
   */
  function parseEventBlock(block: string): SSEEvent | null {
    const trimmed = block.trim()
    // 心跳行：以 ":" 开头的注释行（SSE 标准）
    if (!trimmed || trimmed.startsWith(':')) return null

    let event = 'message' // SSE 默认事件类型
    let data = ''
    for (const line of trimmed.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        data = line.slice(5).trim()
      }
      // 其他字段（id:, retry:）当前后端不发送，忽略
    }
    return { event, data }
  }

  /**
   * 根据事件类型分发到对应的 handler。
   *
   * 负责 JSON.parse 还原和 done 幂等保护。
   */
  function dispatchEvent(evt: SSEEvent, handlers: SSEStreamHandlers): void {
    try {
      switch (evt.event) {
        case 'thinking': {
          // data 是 JSON-encoded 字符串（如 `"思考片段"`），parse 后是 string
          const chunk = JSON.parse(evt.data) as string
          handlers.onThinking?.(chunk)
          break
        }
        case 'message': {
          const chunk = JSON.parse(evt.data) as string
          handlers.onMessage?.(chunk)
          break
        }
        case 'done': {
          // 幂等保护：done 可能被发送两次
          if (doneFired.value) {
            // 第二次 done 仅用于补 uploaded_file_ids（execute 端点的行为），
            // 不再触发 onDone 回调，避免重复的"完成"动作（新消息入队等）
            return
          }
          doneFired.value = true
          const meta = JSON.parse(evt.data) as SSEDoneMeta
          handlers.onDone?.(meta)
          break
        }
        case 'error': {
          errorFired.value = true
          const errMsg = JSON.parse(evt.data) as string
          handlers.onError?.(errMsg)
          break
        }
        default:
        // 未知事件类型，忽略
      }
    } catch (e) {
      // JSON.parse 失败时打日志但不抛出，避免单个坏事件中断整个流
      // eslint-disable-next-line no-console
      console.warn('[useSSEStream] parse error', e, evt)
    }
  }

  /**
   * 中止当前正在进行的 SSE 流（由组件 onBeforeUnmount 调用）。
   */
  function abort(): void {
    abortController.value?.abort()
    abortController.value = null
  }

  return { streamPost, abort }
}
