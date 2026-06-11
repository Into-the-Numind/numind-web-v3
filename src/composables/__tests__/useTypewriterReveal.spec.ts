import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useTypewriterReveal } from '../useTypewriterReveal'

/**
 * useTypewriterReveal 单元测试 —— 用虚拟时钟驱动 rAF / performance.now，
 * 确定性地复现并锁死「流式渲染前后端不同步」回归。
 *
 * 复现的 bug：固定 80 cps 搬字速率远低于当前快模型经网关的真实到达速率，
 * 导致 backlog（target 与 displayed 的差）无界累积，最终靠 flush() 瞬间 dump。
 * 期望修复：自适应速率把可见滞后约束在 maxLagMs 对应字数内。
 */
describe('useTypewriterReveal', () => {
  let now: number
  let rafQueue: Array<{ id: number; cb: FrameRequestCallback }>
  let nextId: number

  beforeEach(() => {
    now = 0
    rafQueue = []
    nextId = 1
    vi.stubGlobal('performance', { now: () => now })
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback): number => {
      const id = nextId++
      rafQueue.push({ id, cb })
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number): void => {
      rafQueue = rafQueue.filter((f) => f.id !== id)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** 推进一帧：把当前已排队的 rAF 回调跑掉（回调内部会排下一帧） */
  function frame(dtMs: number): void {
    now += dtMs
    const due = rafQueue
    rafQueue = []
    for (const f of due) f.cb(now)
  }

  it('keeps on-screen lag bounded when tokens arrive faster than the floor rate (regression: was unbounded at fixed 80 cps)', () => {
    // 到达 ~625 cps（10 字符/16ms 帧），远高于 80 cps 下限
    const reveal = useTypewriterReveal({ charsPerSec: 80, maxLagMs: 300 })

    let totalAppended = 0
    let maxLag = 0
    for (let i = 0; i < 120; i++) {
      reveal.append('x'.repeat(10))
      totalAppended += 10
      frame(16)
      const lag = totalAppended - reveal.displayed.value.length
      if (lag > maxLag) maxLag = lag
    }

    // 固定 80 cps：每帧仅搬 ~1 字符、到达 10 字符 → backlog 持续增长到 ~1000，maxLag 远超阈值。
    // 自适应：滞后稳定在 ~maxLagMs 对应字数（625cps × 0.3s ≈ 188），不会无界。
    expect(maxLag).toBeLessThan(400)
  })

  it('catches a large one-shot backlog up far faster than the old 80 cps, then fully drains (no tail loss)', () => {
    const reveal = useTypewriterReveal({ charsPerSec: 80, maxLagMs: 300 })

    // 一次性灌入 1000 字符，模拟「正文 token 一到」时已积压的大块
    reveal.append('x'.repeat(1000))
    frame(16)

    const afterOneFrame = reveal.displayed.value.length
    // 不能一帧瞬间全量呈现（那就是旧的「啪一下」），也不能完全不动
    expect(afterOneFrame).toBeGreaterThan(0)
    expect(afterOneFrame).toBeLessThan(1000)

    // 自适应速率 ease-out：~20 帧（~320ms）内已追掉大半 backlog。
    // 对照固定 80 cps：同期仅搬 ~20 字符（这是用户看到的「卡在 1/5」）。
    for (let i = 0; i < 19; i++) frame(16)
    expect(reveal.displayed.value.length).toBeGreaterThan(500)

    // ease-out 尾部较慢（生产环境 stream 结束的 flush() 会兜底），但最终必须完整呈现、不丢尾字。
    for (let i = 0; i < 200; i++) frame(16)
    expect(reveal.displayed.value).toBe('x'.repeat(1000))
  })

  it('reveals gradually (not instantly) so slow arrival still feels like typing', () => {
    const reveal = useTypewriterReveal({ charsPerSec: 80, maxLagMs: 300 })
    // 小块（30 字符）下，floor 速率主导，应逐帧揭示而非一帧到位
    reveal.append('x'.repeat(30))
    frame(16)
    const first = reveal.displayed.value.length
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(30)
  })

  it('flush() immediately syncs displayed to the full target', () => {
    const reveal = useTypewriterReveal({ charsPerSec: 80, maxLagMs: 300 })
    reveal.append('hello world')
    frame(16)
    expect(reveal.displayed.value.length).toBeLessThan('hello world'.length)
    reveal.flush()
    expect(reveal.displayed.value).toBe('hello world')
  })

  it('full-syncs immediately when a frame gap exceeds the hidden-flush threshold (backgrounded tab)', () => {
    const reveal = useTypewriterReveal({
      charsPerSec: 80,
      maxLagMs: 300,
      hiddenFlushThresholdMs: 300
    })
    reveal.append('x'.repeat(500))
    // 模拟 tab 被切走 rAF 挂起：单帧 dt 远超阈值
    frame(1000)
    expect(reveal.displayed.value).toBe('x'.repeat(500))
  })
})
