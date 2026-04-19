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

/**
 * 用户滚动触发 auto-resume 的"近底部"阈值（像素）。
 *
 * 流式生成期间内容持续增高：用户开始滑向底部到浏览器 fire 'scroll' 事件
 * 之间可能已经多产出几十像素内容。80px 足以捕捉"用户意图回到底部"的
 * 信号，同时小到不会误判"用户只是往下滑一点"为"想跟随"。
 */
const RESUME_NEAR_BOTTOM_THRESHOLD = 80

/** 可作为滚动容器的目标：元素或 window（body 级滚动） */
export type ScrollTarget = HTMLElement | Window

export interface UseScrollFollowReturn {
  /** 当前是否处于"被用户打断"状态（用于显示跳回按钮） */
  isInterrupted: Ref<boolean>
  /** 安装事件监听（通常在 onMounted 中调用）。支持 HTMLElement 或 Window */
  install: (target: ScrollTarget) => void
  /** 卸载事件监听（通常在 onBeforeUnmount 中调用） */
  uninstall: () => void
  /** 流式内容更新时调用：如果在 Following 状态则自动滚到底部 */
  checkAndScroll: (target: ScrollTarget) => void
  /**
   * 恢复 Following 状态（用户点跳回按钮 / 新节点执行触发）。
   * 传入 target 时立即滚到底部；不传只更新状态。
   */
  resume: (target?: ScrollTarget) => void
}

/**
 * 抽象：读取滚动位置 / 尺寸，兼容 HTMLElement 和 Window。
 * Window 级滚动使用 document.documentElement（CSSOM 标准根元素）。
 */
function readMetrics(target: ScrollTarget): {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
} {
  if (target instanceof Window) {
    const root = document.documentElement
    return {
      scrollTop: target.scrollY,
      scrollHeight: root.scrollHeight,
      clientHeight: target.innerHeight
    }
  }
  return {
    scrollTop: target.scrollTop,
    scrollHeight: target.scrollHeight,
    clientHeight: target.clientHeight
  }
}

/** 抽象：命令式滚到底部 */
function scrollToBottom(target: ScrollTarget): void {
  const { scrollHeight } = readMetrics(target)
  if (target instanceof Window) {
    target.scrollTo({ top: scrollHeight, behavior: 'auto' })
  } else {
    target.scrollTop = scrollHeight
  }
}

export function useScrollFollow(): UseScrollFollowReturn {
  const isInterrupted = ref(false)

  /** 已安装的滚动目标（用于 uninstall 时移除 listener） */
  let installedTarget: ScrollTarget | null = null

  /** touchstart 时记录的 Y 坐标（用于判断 touchmove 方向） */
  let touchStartY: number | null = null

  /**
   * 上一次 onScroll 观察到的 scrollTop，用于判定"用户正在向下滚动"。
   * 仅在 Interrupted 状态下 + 向下滚 + 近底部 时才 resume，避免"body 短、
   * scrollY=0 本身就在 80px 阈值内"的误判。
   */
  let lastScrollTop = 0

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

  /**
   * scroll 事件处理：用户滚回底部时立即恢复 Following。
   *
   * 不能只靠 checkAndScroll 的 atBottom 判断做 auto-resume —— 因为
   * checkAndScroll 通常在 content 变化（v-html 更新 scrollHeight 增长）
   * 之后触发，此时 atBottom 已经不成立（body 刚刚变高 N 像素，距底差 N）。
   *
   * 必须用独立的 scroll 监听器在"用户滑回底部的瞬间"判定，而不是等下一
   * 次内容更新。
   */
  function onScroll(): void {
    if (!installedTarget) return
    const { scrollTop, scrollHeight, clientHeight } = readMetrics(installedTarget)
    const movingDown = scrollTop > lastScrollTop
    lastScrollTop = scrollTop

    if (!isInterrupted.value) return
    // 只在 "用户主动向下滚" + "近底部" 时恢复 Following。
    // 仅"近底部"还不够：body 初期很短时，scrollTop=0 本身就可能落在
    // RESUME_NEAR_BOTTOM_THRESHOLD 阈值内，会误把刚打断后的静止状态当成
    // "滚回底"而 resume。
    const nearBottom = scrollHeight - scrollTop - clientHeight <= RESUME_NEAR_BOTTOM_THRESHOLD
    if (movingDown && nearBottom) {
      isInterrupted.value = false
    }
  }

  function install(target: ScrollTarget): void {
    if (installedTarget) uninstall()
    installedTarget = target
    // addEventListener 对 HTMLElement 和 Window 的签名兼容
    target.addEventListener('wheel', onWheel as EventListener, { passive: true })
    target.addEventListener('touchstart', onTouchStart as EventListener, { passive: true })
    target.addEventListener('touchmove', onTouchMove as EventListener, { passive: true })
    target.addEventListener('scroll', onScroll as EventListener, { passive: true })
  }

  function uninstall(): void {
    if (!installedTarget) return
    installedTarget.removeEventListener('wheel', onWheel as EventListener)
    installedTarget.removeEventListener('touchstart', onTouchStart as EventListener)
    installedTarget.removeEventListener('touchmove', onTouchMove as EventListener)
    installedTarget.removeEventListener('scroll', onScroll as EventListener)
    installedTarget = null
    touchStartY = null
    lastScrollTop = 0
  }

  /**
   * 检查并滚动到底部（仅 Following 状态下执行）。
   *
   * Auto-resume 不在这里做：checkAndScroll 在**内容生长完**后才运行，此时
   * scrollTop 还停在旧位置但 scrollHeight 已增高，靠 atBottom 判定会在
   * 内容刚出现的那一刻（scrollHeight 刚 > clientHeight 几像素）误触发。
   * Auto-resume 全部交给 `onScroll` —— 它有方向检测，更准确。
   */
  function checkAndScroll(target: ScrollTarget): void {
    if (!isInterrupted.value) {
      scrollToBottom(target)
    }
  }

  /**
   * 恢复 Following 状态并立刻滚到底部。
   *
   * 由"跳回底部"按钮点击或新一轮节点执行触发。调用方需要自行传入容器元素
   * 来触发立即滚动；如果不传，只更新状态。
   *
   * 调用后：
   *   - isInterrupted 立即变为 false
   *   - 如果传入 el，立即 scrollTop = scrollHeight（命令式一次性滚动）
   *   - 后续流式内容更新时，`checkAndScroll` 会继续自动保持在底部
   *     （因为已回到 Following 状态），无需调用方手动持续滚动
   */
  function resume(target?: ScrollTarget): void {
    isInterrupted.value = false
    if (target) {
      scrollToBottom(target)
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
