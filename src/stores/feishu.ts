/**
 * Personal Feishu workspace state.
 *
 * Persistent connection metadata is safe to render in Pinia. A live
 * authorization URL is held only in the private `liveAction` ref and exposed
 * as a computed value, so it is never copied to storage or a session snapshot.
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  connectFeishu,
  continueFeishuConnection,
  getFeishuStatus,
  refreshFeishuAction,
  resumeFeishuOperation,
  unbindFeishuConnection,
  type FeishuCapabilities,
  type FeishuCapabilityDomain,
  type FeishuConnectionState,
  type FeishuConnectResult,
  type FeishuExternalAction,
  type FeishuRefreshResult,
  type FeishuOperationResult,
  type FeishuStatusAction
} from '@/api/feishu'

const capabilityDomains: FeishuCapabilityDomain[] = ['docs', 'base', 'wiki']

function unknownCapabilities(): FeishuCapabilities {
  return {
    docs: { state: 'unknown' },
    base: { state: 'unknown' },
    wiki: { state: 'unknown' }
  }
}

function normalizeCapabilities(capabilities: FeishuCapabilities): FeishuCapabilities {
  const normalized = unknownCapabilities()
  for (const domain of capabilityDomains) {
    const capability = capabilities[domain]
    if (capability) normalized[domain] = capability
  }
  return normalized
}

function userFacingError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export const useFeishuStore = defineStore('feishu', () => {
  const state = ref<FeishuConnectionState>('none')
  const connected = ref(false)
  const appIdMasked = ref('')
  const cliVersion = ref('')
  const inAgentFlow = ref(false)
  const capabilities = ref<FeishuCapabilities>(unknownCapabilities())

  const loading = ref(false)
  const connecting = ref(false)
  const refreshingAction = ref(false)
  const disconnecting = ref(false)
  const error = ref('')

  // This is intentionally not returned directly. Pinia only tracks returned
  // refs as state, while the computed value remains reactive for the card.
  const liveAction = ref<FeishuExternalAction | FeishuStatusAction | null>(null)
  const activeAction = computed(() => liveAction.value)

  const notConnected = computed(() => !connected.value)
  const availableCapabilities = computed(() =>
    capabilityDomains.filter((domain) => capabilities.value[domain].state === 'available')
  )

  function hasAvailableCapability(domain: FeishuCapabilityDomain): boolean {
    return capabilities.value[domain].state === 'available'
  }

  function applyConnectResult(result: FeishuConnectResult): FeishuConnectResult {
    state.value = result.state
    connected.value = result.state === 'connected'
    liveAction.value = result.action ?? null
    return result
  }

  function applyContinuedConnectResult(
    result: FeishuConnectResult,
    expectedSessionId: string
  ): FeishuConnectResult {
    if (liveAction.value?.session_id !== expectedSessionId) return result
    state.value = result.state
    connected.value = result.state === 'connected'
    if (result.state === 'connected') {
      liveAction.value = null
    } else if (result.action) {
      liveAction.value = result.action
    }
    return result
  }

  async function fetchStatus(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const result = await getFeishuStatus()
      state.value = result.state
      connected.value = result.connected
      appIdMasked.value = result.app_id_masked ?? ''
      cliVersion.value = result.cli_version ?? ''
      inAgentFlow.value = result.in_agent_flow ?? false
      capabilities.value = normalizeCapabilities(result.capabilities)
      liveAction.value = result.active_action ?? null
    } catch (cause) {
      error.value = userFacingError(cause, '获取飞书连接状态失败')
    } finally {
      loading.value = false
    }
  }

  async function connect(): Promise<FeishuConnectResult> {
    connecting.value = true
    error.value = ''
    try {
      return applyConnectResult(await connectFeishu())
    } catch (cause) {
      error.value = userFacingError(cause, '发起飞书连接失败')
      throw cause
    } finally {
      connecting.value = false
    }
  }

  async function continueConnection(sessionId: string): Promise<FeishuConnectResult> {
    connecting.value = true
    error.value = ''
    try {
      return applyContinuedConnectResult(await continueFeishuConnection(sessionId), sessionId)
    } catch (cause) {
      error.value = userFacingError(cause, '确认飞书授权失败')
      throw cause
    } finally {
      connecting.value = false
    }
  }

  async function resumeConnectionAction(
    operationId: string,
    sessionId: string
  ): Promise<FeishuOperationResult> {
    connecting.value = true
    error.value = ''
    try {
      const result = await resumeFeishuOperation(operationId, sessionId)
      if (liveAction.value?.session_id !== sessionId) return result
      if (result.state === 'succeeded') {
        state.value = 'connected'
        connected.value = true
        liveAction.value = null
      } else if (['failed', 'unknown', 'cancelled'].includes(result.state)) {
        state.value = 'error'
        connected.value = false
        liveAction.value = null
      } else if (result.action) {
        liveAction.value = result.action
        state.value = result.action.phase === 'create_app' ? 'creating_app' :
          result.action.phase === 'app_scope' ? 'waiting_app_approval' : 'waiting_user_auth'
      }
      return result
    } catch (cause) {
      error.value = userFacingError(cause, '确认飞书授权失败')
      throw cause
    } finally {
      connecting.value = false
    }
  }

  async function restoreConnectionAction(sessionId: string): Promise<FeishuRefreshResult> {
    refreshingAction.value = true
    error.value = ''
    try {
      const result = await refreshFeishuAction(sessionId)
      if (liveAction.value?.session_id !== sessionId) return result
      if (result.action) {
        liveAction.value = result.action
        state.value = result.action.phase === 'create_app' ? 'creating_app' :
          result.action.phase === 'app_scope' ? 'waiting_app_approval' : 'waiting_user_auth'
      } else {
        liveAction.value = null
      }
      return result
    } catch (cause) {
      error.value = userFacingError(cause, '恢复飞书授权步骤失败')
      throw cause
    } finally {
      refreshingAction.value = false
    }
  }

  async function refreshAction(sessionId: string): Promise<FeishuRefreshResult> {
    refreshingAction.value = true
    error.value = ''
    try {
      // The caller owns route/session identity across this async boundary.
      // Returning the tagged result without touching shared connection state
      // prevents a late response from an old Agent card replacing a newer URL.
      return await refreshFeishuAction(sessionId)
    } catch (cause) {
      error.value = userFacingError(cause, '刷新飞书授权链接失败')
      throw cause
    } finally {
      refreshingAction.value = false
    }
  }

  async function disconnect(): Promise<void> {
    disconnecting.value = true
    error.value = ''
    try {
      const result = await unbindFeishuConnection()
      state.value = result.state
      connected.value = result.connected
      appIdMasked.value = ''
      cliVersion.value = ''
      inAgentFlow.value = false
      capabilities.value = unknownCapabilities()
      liveAction.value = null
    } catch (cause) {
      error.value = userFacingError(cause, '解绑飞书失败')
      throw cause
    } finally {
      disconnecting.value = false
    }
  }

  return {
    state,
    connected,
    appIdMasked,
    cliVersion,
    inAgentFlow,
    capabilities,
    activeAction,
    loading,
    connecting,
    refreshingAction,
    disconnecting,
    error,
    notConnected,
    availableCapabilities,
    hasAvailableCapability,
    fetchStatus,
    connect,
    continueConnection,
    resumeConnectionAction,
    restoreConnectionAction,
    refreshAction,
    disconnect
  }
})
