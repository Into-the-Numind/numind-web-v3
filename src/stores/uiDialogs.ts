/**
 * uiDialogs store — 全局 UI dialog 事件总线
 *
 * ## 职责
 *
 * 统一的 dialog 触发入口。项目中任何组件都可以通过 store action 打开
 * 全局 dialog（InsufficientCreditsDialog 等），无需通过 ref / provide/inject
 * 层层传递。
 *
 * App.vue 挂载 dialog 并 watch 本 store 的状态自动显示。
 *
 * ## 向后兼容
 *
 * 项目原有机制是 `window.dispatchEvent(new CustomEvent('insufficient-credits'))`
 * （在 src/api/request.ts 的 axios 拦截器中）。本 store 不取代该路径，而是
 * 作为**共同的汇聚点**：
 *
 *   - 旧路径：request.ts → CustomEvent → App.vue listener → store.openCreditsDialog
 *   - 新路径：任何组件 → store.openCreditsDialog 直接触发
 *
 * 两条路径都通过 store 状态最终驱动 InsufficientCreditsDialog。
 *
 * ## 使用
 *
 * ```ts
 * import { useUiDialogsStore } from '@/stores/uiDialogs'
 *
 * const dialogs = useUiDialogsStore()
 *
 * // 触发余额不足 dialog
 * dialogs.openCreditsDialog('积分不足，请充值后重试')
 *
 * // 程序化关闭
 * dialogs.closeCreditsDialog()
 * ```
 *
 * ## 未来扩展
 *
 * 本 store 可扩展更多全局 dialog（确认、错误、登录引导等），避免每个
 * 都单独建事件总线。当前仅含 InsufficientCreditsDialog 的状态。
 *
 * 详见 spec §10.1
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useUiDialogsStore = defineStore('uiDialogs', () => {
  /**
   * InsufficientCreditsDialog 是否应显示。
   *
   * App.vue 的 watch 监听此 ref，为 true 时调用 dialog 组件的 show() 方法。
   * Dialog 关闭后应置回 false（可手动调 closeCreditsDialog 或通过其他同步机制）。
   */
  const showCreditsDialog = ref(false)

  /**
   * 显示给用户的消息。由 openCreditsDialog 设置，Dialog 组件从 store 读取。
   */
  const creditsMessage = ref<string>('')

  /**
   * 打开余额不足 dialog。
   *
   * @param msg 可选的错误消息；不传则 Dialog 使用默认文案
   */
  function openCreditsDialog(msg?: string): void {
    creditsMessage.value = msg ?? ''
    showCreditsDialog.value = true
  }

  /**
   * 程序化关闭余额不足 dialog。
   *
   * Dialog 组件自身的 "我知道了" 按钮关闭不需要调用此函数（它走内部的
   * visible ref）。但如果在父组件级别需要强制关闭，调用此函数。
   */
  function closeCreditsDialog(): void {
    showCreditsDialog.value = false
  }

  return {
    showCreditsDialog,
    creditsMessage,
    openCreditsDialog,
    closeCreditsDialog
  }
})
