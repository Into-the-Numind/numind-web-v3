/**
 * useTypewriterReveal —— 把爆裂式抵达的流式文本转为平滑"打字机"揭示。
 *
 * 后端 LLM 流式 SSE 典型节奏是每 ~250ms flush 一次 + 每次 ~13 字符，直接渲染
 * 会被肉眼感知为卡顿/掉帧。本 composable 维护 target（后台累积）和 displayed
 * （UI 可读）两个 ref，由 requestAnimationFrame 驱动的循环从 target 向 displayed
 * 以固定速率搬字，产生连续流动感。
 *
 * 使用方：
 *   const reveal = useTypewriterReveal()
 *   reveal.append(chunk)         // SSE onMessage 里调用
 *   reveal.displayed.value       // UI 读这个
 *   reveal.flush()               // onDone/onError 前调用，避免尾部丢字
 *   reveal.reset()               // 开始新一轮流式前调用
 *
 * 关键阈值：
 *   - 80 cps：平均到达 ~52 cps 的 1.5x，既保证"一直在动"的流动感，又不积压
 *     到肉眼可见落后
 *   - dt > 300ms：视为页面被 backgrounded（rAF 被挂起），直接同步 target→displayed
 *     避免用户切回后看到缓慢滴字
 */
import { ref, type Ref } from 'vue'

export interface TypewriterRevealOptions {
  charsPerSec?: number
  hiddenFlushThresholdMs?: number
}

export interface TypewriterReveal {
  /** UI 读这个 ref */
  displayed: Readonly<Ref<string>>
  /** 追加一段文本到 target，并启动揭示循环 */
  append: (chunk: string) => void
  /** 立即把 displayed 同步到 target（流式结束/错误前调用） */
  flush: () => void
  /** 清零并停止循环 */
  reset: (initial?: string) => void
  /** 停止循环，不清数据（组件卸载时调用） */
  dispose: () => void
}

export function useTypewriterReveal(opts: TypewriterRevealOptions = {}): TypewriterReveal {
  const charsPerSec = opts.charsPerSec ?? 80
  const hiddenFlushThresholdMs = opts.hiddenFlushThresholdMs ?? 300

  const displayed = ref('')
  const target = ref('')

  let rafId: number | null = null
  let lastTs = 0

  function tick(ts: number): void {
    const dt = ts - lastTs
    lastTs = ts

    if (dt > hiddenFlushThresholdMs) {
      displayed.value = target.value
    } else {
      const budget = Math.max(1, Math.round((dt * charsPerSec) / 1000))
      const dLen = displayed.value.length
      const tLen = target.value.length
      if (dLen < tLen) {
        const add = Math.min(budget, tLen - dLen)
        displayed.value = target.value.slice(0, dLen + add)
      }
    }

    if (displayed.value.length >= target.value.length) {
      rafId = null
    } else {
      rafId = requestAnimationFrame(tick)
    }
  }

  function start(): void {
    if (rafId !== null) return
    lastTs = performance.now()
    rafId = requestAnimationFrame(tick)
  }

  function stop(): void {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  function append(chunk: string): void {
    target.value += chunk
    start()
  }

  function flush(): void {
    stop()
    displayed.value = target.value
  }

  function reset(initial = ''): void {
    stop()
    displayed.value = initial
    target.value = initial
  }

  function dispose(): void {
    stop()
  }

  return {
    displayed: displayed as Readonly<Ref<string>>,
    append,
    flush,
    reset,
    dispose
  }
}
