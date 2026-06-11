/**
 * useTypewriterReveal —— 把爆裂式抵达的流式文本转为平滑"打字机"揭示。
 *
 * 后端 LLM 流式 SSE 典型节奏是每 ~250ms flush 一次 + 每次 ~13 字符，直接渲染
 * 会被肉眼感知为卡顿/掉帧。本 composable 维护 target（后台累积）和 displayed
 * （UI 可读）两个 ref，由 requestAnimationFrame 驱动的循环从 target 向 displayed
 * 搬字，产生连续流动感。
 *
 * 使用方：
 *   const reveal = useTypewriterReveal()
 *   reveal.append(chunk)         // SSE onMessage 里调用
 *   reveal.displayed.value       // UI 读这个
 *   reveal.flush()               // onDone/onError 前调用，避免尾部丢字
 *   reveal.reset()               // 开始新一轮流式前调用
 *
 * 搬字速率（自适应，非固定）：
 *   旧实现用固定 80 cps，假设到达 ~52 cps。当前快模型（deepseek/glm/doubao 经网关）
 *   到达速率远超于此，固定速率会让 backlog（target 与 displayed 的差）无界累积，
 *   最终靠 flush() 瞬间 dump —— 表现为"前端只呈现 1/5，然后啪一下全量补完"。
 *
 *   改为自适应：每帧速率 = max(charsPerSec 下限, backlog / maxLagMs)。这保证可见
 *   滞后不超过 ~maxLagMs 对应字数。关键性质：maxLagMs 只决定"跟随距离"，不影响
 *   稳态平滑度（稳态每帧揭示量恒等于到达速率 / 帧率）—— 故能收紧滞后而不牺牲打字
 *   流动感。backlog 越大速率越高，自动追上到达；backlog 小则回落到 charsPerSec
 *   下限，保留尾部逐字的打字感。
 *
 * 关键阈值：
 *   - charsPerSec（默认 80）：backlog 很小时的平滑下限，保证"一直在动"
 *   - maxLagMs（默认 300）：可见滞后上界对应的毫秒数。越小越贴近原始 token、
 *     追赶越急；越大追赶越柔和。稳态平滑度与此无关。
 *   - dt > 300ms：视为页面被 backgrounded（rAF 被挂起），直接同步 target→displayed
 *     避免用户切回后看到缓慢滴字
 */
import { ref, type Ref } from 'vue'

export interface TypewriterRevealOptions {
  charsPerSec?: number
  maxLagMs?: number
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
  const maxLagMs = opts.maxLagMs ?? 300
  const hiddenFlushThresholdMs = opts.hiddenFlushThresholdMs ?? 300

  const displayed = ref('')
  const target = ref('')

  let rafId: number | null = null
  let lastTs = 0

  function tick(ts: number): void {
    const dt = ts - lastTs
    lastTs = ts

    const dLen = displayed.value.length
    const tLen = target.value.length

    if (dt > hiddenFlushThresholdMs) {
      // rAF 被挂起（页面切后台）→ 直接整同步，避免切回后看到缓慢滴字
      displayed.value = target.value
    } else if (dLen < tLen) {
      const backlog = tLen - dLen
      // 自适应速率：把可见滞后约束在 maxLagMs 对应字数内，同时不低于 charsPerSec 下限。
      // backlog 越大速率越高 → 自动追上到达速率，稳态滞后 ≈ maxLagMs 对应字数。
      const adaptiveRate = Math.max(charsPerSec, (backlog * 1000) / maxLagMs)
      const budget = Math.max(1, Math.round((dt * adaptiveRate) / 1000))
      const add = Math.min(budget, backlog)
      displayed.value = target.value.slice(0, dLen + add)
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
