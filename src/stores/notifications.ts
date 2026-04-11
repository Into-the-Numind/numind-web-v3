/**
 * notifications store — 全局 toast 通知事件总线
 *
 * ## 设计
 *
 * 项目中任何组件都可以通过 `useNotificationsStore().show(msg)` 弹 toast，
 * 无需通过 ref/props 层层传递。
 *
 * `AppNotification.vue` 挂载在 `App.vue` 顶层，监听本 store 的 messages 列表
 * 自动渲染消息。
 *
 * ## 使用
 *
 * ```ts
 * import { useNotificationsStore } from '@/stores/notifications'
 *
 * const notifications = useNotificationsStore()
 * notifications.success('复制成功')
 * notifications.error('网络请求失败')
 * notifications.info('已自动恢复 3 个步骤的书签')
 * ```
 *
 * ## 自动消失
 *
 * 每条消息默认 3 秒自动消失。传 `timeout: 0` 则永久显示直到手动关闭。
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'

export type NotificationType = 'success' | 'error' | 'info' | 'warning'

export interface NotificationItem {
  id: number
  type: NotificationType
  content: string
  /** 自动消失毫秒数，0 表示不自动消失 */
  timeout: number
}

/** 默认自动消失时长 */
const DEFAULT_TIMEOUT = 3000

export const useNotificationsStore = defineStore('notifications', () => {
  const messages = ref<NotificationItem[]>([])
  let nextId = 1

  /** 核心 show 函数，其他快捷方法基于此构造 */
  function show(
    content: string,
    type: NotificationType = 'info',
    timeout: number = DEFAULT_TIMEOUT
  ): number {
    const id = nextId++
    const item: NotificationItem = { id, type, content, timeout }
    messages.value.push(item)

    if (timeout > 0) {
      // 自动消失 —— 使用 setTimeout 而非 composable，因为 store 可能
      // 被多个组件共享，不方便用 onBeforeUnmount 清理
      setTimeout(() => {
        dismiss(id)
      }, timeout)
    }

    return id
  }

  /** 手动关闭某条通知 */
  function dismiss(id: number): void {
    const idx = messages.value.findIndex((m) => m.id === id)
    if (idx !== -1) {
      messages.value.splice(idx, 1)
    }
  }

  /** 清空所有通知 */
  function clear(): void {
    messages.value = []
  }

  // 快捷方法
  function success(content: string, timeout?: number): number {
    return show(content, 'success', timeout ?? DEFAULT_TIMEOUT)
  }

  function error(content: string, timeout?: number): number {
    // 错误消息默认停留更久（5 秒）
    return show(content, 'error', timeout ?? 5000)
  }

  function info(content: string, timeout?: number): number {
    return show(content, 'info', timeout ?? DEFAULT_TIMEOUT)
  }

  function warning(content: string, timeout?: number): number {
    return show(content, 'warning', timeout ?? 4000)
  }

  return {
    messages,
    show,
    dismiss,
    clear,
    success,
    error,
    info,
    warning
  }
})
