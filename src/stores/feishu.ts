/**
 * feishu store — 飞书 (Lark) 账号连接状态（用户端）。
 *
 * Contract: numind-server design.md §10（前端契约）。Pinia setup store
 * （Composition API 风格，遵循 .claude/rules/frontend-state.md §1）。
 *
 * 职责：托管「账号连接」区的连接状态 + 发起连接 / 解绑动作。HTTP 全走
 * src/api/feishu.ts（其底层走 request.ts）。每个 async action 用 try/catch +
 * finally 复位 loading，并把面向用户的报错落进 `error`，供 T12 连接 UI 渲染
 * 异步 4 状态（loading / empty+CTA / error 重连 / success+解绑）。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  connectFeishu,
  getFeishuStatus,
  disconnectFeishu,
  type FeishuConnectionStatus,
  type FeishuConnectResult
} from '@/api/feishu'

export const useFeishuStore = defineStore('feishu', () => {
  // ==================== State ====================
  /**
   * 连接状态：none（未连）/ connected（已连）。device-code 契约下不再有
   * active/expired —— 可靠判定看 `isConnected` 布尔字段（getter `connected`）。
   */
  const status = ref<FeishuConnectionStatus>('none')
  /** 后端 connected 布尔（已连且授权有效时为 true）—— 连接与否的可靠来源。 */
  const isConnected = ref(false)
  /** 已建飞书自建应用 ID（未连/未建时为空串）。 */
  const appId = ref('')

  /** 加载状态标志（每个 async surface 一个）。 */
  // fetchStatus 进行中（首屏 / 刷新连接状态）。
  const loading = ref(false)
  // connect 进行中（发起/推进连接，取建应用/授权 URL）。
  const connecting = ref(false)
  // disconnect 进行中（解绑）。
  const disconnecting = ref(false)

  /** 面向用户的错误文案（供 error 状态渲染）；空串表示无错误。 */
  const error = ref('')

  // ==================== Getters ====================
  /** 是否已连接（看后端 connected 布尔，device-code 下不再依赖 status 字符串）。 */
  const connected = computed(() => isConnected.value)
  /** 是否未连接（empty 状态 + CTA「连接飞书」）。 */
  const notConnected = computed(() => !isConnected.value)

  // ==================== Actions ====================

  /**
   * 拉取连接状态 —— 进入「账号连接」区 / 解绑后刷新调用。
   * 失败时落 error，不抛（让 UI 走 error 状态渲染 + retry）。
   */
  async function fetchStatus(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const res = await getFeishuStatus()
      status.value = res.status
      isConnected.value = !!res.connected
      appId.value = res.app_id ?? ''
    } catch (e) {
      error.value = e instanceof Error ? e.message : '获取飞书连接状态失败'
      console.error('[feishu] fetchStatus failed:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * 发起连接 —— 返回下一步（建应用 / 授权）+ URL + state，供 UI 跳转或渲染
   * 授权卡片。失败时落 error 并 rethrow（调用方需知道无法继续，不应静默跳转）。
   */
  async function connect(): Promise<FeishuConnectResult> {
    connecting.value = true
    error.value = ''
    try {
      return await connectFeishu()
    } catch (e) {
      error.value = e instanceof Error ? e.message : '发起飞书连接失败'
      console.error('[feishu] connect failed:', e)
      throw e
    } finally {
      connecting.value = false
    }
  }

  /**
   * 解绑 —— 销毁性操作，调用方须先经 ConfirmModal 确认（ui-ux.md 硬规则 4）。
   * 成功后本地复位为未连接状态并刷新；失败时落 error 并 rethrow。
   */
  async function disconnect(): Promise<void> {
    disconnecting.value = true
    error.value = ''
    try {
      await disconnectFeishu()
      // 本地立即复位为未连接（避免解绑后短暂仍显示已连）。
      status.value = 'none'
      isConnected.value = false
      appId.value = ''
    } catch (e) {
      error.value = e instanceof Error ? e.message : '解绑飞书失败'
      console.error('[feishu] disconnect failed:', e)
      throw e
    } finally {
      disconnecting.value = false
    }
  }

  return {
    // State
    status,
    isConnected,
    appId,
    loading,
    connecting,
    disconnecting,
    error,

    // Getters
    connected,
    notConnected,

    // Actions
    fetchStatus,
    connect,
    disconnect
  }
})
