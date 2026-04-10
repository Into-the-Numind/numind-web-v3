/**
 * useScrollFollow — 自动滚动跟随状态机
 *
 * 等价复刻 legacy `scrollFollowManager`（sop-legacy.js 原实现的抽象）。
 *
 * ## 状态机（2 个状态）
 *
 * ```
 *                ┌──────────────┐
 *                │  Following   │ ← 默认状态：流式输出时自动滚到底部
 *                └──────┬───────┘
 *                       │
 *                       │ 用户向上滚动 / 移动端手指向下滑
 *                       ↓
 *                ┌──────────────┐
 *                │  Interrupted │ → 显示"跳回底部"按钮
 *                └──────┬───────┘
 *                       │
 *        ┌──────────────┼──────────────┐
 *        │              │              │
 *   点击跳回按钮    滚到真实底部     新一轮节点执行
 *        │              │              │
 *        ↓              ↓              ↓
 *            resume() → Following
 * ```
 *
 * ## 使用方式
 *
 * ```ts
 * const scrollFollow = useScrollFollow()
 *
 * onMounted(() => {
 *   scrollFollow.install(scrollContainerEl.value!)
 * })
 * onBeforeUnmount(() => {
 *   scrollFollow.uninstall()
 * })
 *
 * // 流式输出新内容时调用（仅当 Following 状态才真的滚动）
 * watch(streamingContent, () => {
 *   scrollFollow.checkAndScroll(scrollContainerEl.value!)
 * })
 *
 * // 显示"跳回底部"按钮
 * <button v-if="scrollFollow.isInterrupted" @click="scrollFollow.resume()">↓</button>
 * ```
 *
 * ## 设计决策
 *
 * - **状态是 Vue ref**，方便在组件模板直接绑定 `v-if`
 * - **install(element)** 显式传入滚动容器，避免隐式 document 级监听污染
 * - **resume() 清空 Interrupted 状态**，调用方（ScrollFollowButton / 新节点执行）触发
 * - **checkAndScroll()** 是唯一的滚动入口，仅在 Following 状态下执行
 * - **底部探测容差 = 4px**：避免浮点 scrollTop 精度问题误判
 * - **listeners 用 passive: true**：wheel / touchmove 不阻塞默认滚动行为
 *
 * 详见 spec §5.2
 */
import { ref, type Ref } from 'vue'

/** 距离底部多少像素内视为"在底部"（容差，处理浮点精度） */
const BOTTOM_THRESHOLD = 4

export interface UseScrollFollowReturn {
  /** 当前是否处于"被用户打断"状态（用于显示跳回按钮） */
  isInterrupted: Ref<boolean>
  /** 安装事件监听（通常在 onMounted 中调用） */
  install: (el: HTMLElement) => void
  /** 卸载事件监听（通常在 onBeforeUnmount 中调用） */
  uninstall: () => void
  /** 流式内容更新时调用：如果在 Following 状态则自动滚到底部 */
  checkAndScroll: (el: HTMLElement) => void
  /** 恢复 Following 状态（用户点跳回按钮 / 新节点执行触发） */
  resume: () => void
}

export function useScrollFollow(): UseScrollFollowReturn {
  const isInterrupted = ref(false)

  /** 已安装的容器元素（用于 uninstall 时移除 listener） */
  let installedEl: HTMLElement | null = null

  /** touchstart 时记录的 Y 坐标（用于判断 touchmove 方向） */
  let touchStartY: number | null = null

  /**
   * wheel 事件处理：deltaY < 0 表示向上滚
   *
   * 只有在 Following 状态下向上滚才触发 Interrupted（Interrupted 状态下的
   * 滚动事件忽略，避免状态抖动）。
   */
  function onWheel(e: WheelEvent): void {
    if (isInterrupted.value) return
    if (e.deltaY < 0) {
      isInterrupted.value = true
    }
  }

  /**
   * touchstart 记录起点
   */
  function onTouchStart(e: TouchEvent): void {
    touchStartY = e.touches[0]?.clientY ?? null
  }

  /**
   * touchmove 事件处理：移动端"向下滑动手指"= 向上滚动内容
   *
   * 只有当手指明显下移（> 8px，避免轻微抖动）时才打断。
   */
  function onTouchMove(e: TouchEvent): void {
    if (isInterrupted.value) return
    if (touchStartY === null) return
    const currentY = e.touches[0]?.clientY
    if (currentY === undefined) return
    // 手指向下移（currentY 增大）= 内容向上滚 = 用户看之前的内容 → Interrupted
    if (currentY - touchStartY > 8) {
      isInterrupted.value = true
    }
  }

  function install(el: HTMLElement): void {
    if (installedEl) uninstall()
    installedEl = el
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
  }

  function uninstall(): void {
    if (!installedEl) return
    installedEl.removeEventListener('wheel', onWheel)
    installedEl.removeEventListener('touchstart', onTouchStart)
    installedEl.removeEventListener('touchmove', onTouchMove)
    installedEl = null
    touchStartY = null
  }

  /**
   * 检查并滚动到底部（仅 Following 状态下执行）。
   *
   * 特殊情况：如果用户已经滚到了真实底部（Interrupted 状态下手动滚回底），
   * 自动恢复 Following 状态。
   */
  function checkAndScroll(el: HTMLElement): void {
    // 自动恢复：用户手动滚回底部后重新进入 Following
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_THRESHOLD
    if (isInterrupted.value && atBottom) {
      isInterrupted.value = false
    }

    // 仅在 Following 状态下执行自动滚动
    if (!isInterrupted.value) {
      el.scrollTop = el.scrollHeight
    }
  }

  /**
   * 恢复 Following 状态并立刻滚到底部。
   *
   * 由"跳回底部"按钮点击或新一轮节点执行触发。调用方需要自行传入容器元素
   * 来触发立即滚动；如果不传，只更新状态。
   */
  function resume(el?: HTMLElement): void {
    isInterrupted.value = false
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }

  return {
    isInterrupted,
    install,
    uninstall,
    checkAndScroll,
    resume
  }
}
