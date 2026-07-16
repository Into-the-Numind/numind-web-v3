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
  getFeishuStatus,
  refreshFeishuAction,
  unbindFeishuConnection,
  type FeishuCapabilities,
  type FeishuCapabilityDomain,
  type FeishuConnectionState,
  type FeishuConnectResult,
  type FeishuExternalAction,
  type FeishuRefreshResult,
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

  async function fetchStatus(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const result = await getFeishuStatus()
      state.value = result.state
      connected.value = result.connected
      appIdMasked.value = result.app_id_masked ?? ''
      cliVersion.value = result.cli_version ?? ''
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

  async function refreshAction(sessionId: string): Promise<FeishuRefreshResult> {
    refreshingAction.value = true
    error.value = ''
    try {
      const result = await refreshFeishuAction(sessionId)
      if (result.action) liveAction.value = result.action
      return result
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
    refreshAction,
    disconnect
  }
})
