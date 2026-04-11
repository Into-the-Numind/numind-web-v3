<!--
  SOPRunView — SOP 运行页主集成组件

  任务 21：整合前面 20 个 task 的产出，构建完整的 SOP 运行流程页面。

  ## 路由

  /sop?templateId=X&runId=Y
    - templateId 必填
    - runId 可选；无则进入 Draft 模式

  ## 子组件

  - StepperPanel — 步骤指示器
  - StepInput — 输入区（textarea + 文件上传）
  - StepOutput — 输出区（Markdown + 思维链 + 滚动跟随）
  - ToolbarActions — 工具栏（复制/重生/prev/next）
  - ScrollFollowButton — 跳回底部按钮
  - TrailingChatPanel — 末尾聊天（当 currentStep 在 trailing chat 位置）
  - HistoryModal — 历史记录弹窗
  - ConfirmModal — 重新生成 dirty 确认

  ## 数据流

  1. onMounted:
     - loadTemplate(templateId) — GET /v1/sop/templates/:id/nodes
     - if runId: store.loadRun(runId) — GET /v1/sop/runs/:id + /status
     - else: store.enterDraftMode(templateId)
     - useStepNavigation.restoreFromSession — 恢复上次停留步骤
  2. 用户输入 + 上传文件 → StepInput 管理（v-model + useFileUpload）
  3. 用户点下一步/执行：
     - 如果尚无 runId：useDraftLifecycle.lazyCreateRun → 拿到 runId
     - executeNode via useSSEStream: POST /v1/sop/runs/:id/nodes/:node_id/execute
     - onThinking/onMessage 累积到 store streaming state
     - onDone 把结果持久化为 nodeRun + completedNodeIds，前进到下一步
  4. onBeforeUnmount：cleanup draft + abort SSE + reset store

  详见 spec §9.2
-->
<template>
  <div class="sop-run-view">
    <!-- 顶部栏 -->
    <header class="sop-top-bar">
      <button type="button" class="sop-back-btn" aria-label="返回首页" @click="handleBackHome">
        <span aria-hidden="true">←</span>
        <span>返回</span>
      </button>
      <h1 class="sop-template-title">{{ store.template?.name || '加载中…' }}</h1>
      <button
        type="button"
        class="sop-history-btn"
        aria-label="查看历史记录"
        @click="showHistory = true"
      >
        <span aria-hidden="true">🕐</span>
        <span>历史</span>
      </button>
    </header>

    <!-- 加载状态 -->
    <EmptyStateCard
      v-if="store.loading && !store.template"
      title="加载中…"
      message="正在加载 SOP 模板"
    />

    <!-- 错误状态 -->
    <EmptyStateCard
      v-else-if="loadError"
      variant="error"
      title="加载失败"
      :message="loadError"
      action-label="重试"
      @action="initialize"
    />

    <!-- 空模板（无 nodes） -->
    <EmptyStateCard
      v-else-if="store.template && store.nodes.length === 0"
      title="该 SOP 暂未配置步骤"
      message="请联系 SOP 创建者补充步骤"
    />

    <!-- 正常运行页 -->
    <template v-else-if="store.template">
      <!-- 步骤指示器 -->
      <StepperPanel
        :steps="store.nodes"
        :trailing-chat-enabled="store.trailingChatEnabled"
        :current-step="store.currentStep"
        :completed-ids="store.completedNodeIds"
        :accessibility="store.nodeAccessibility"
        :next-node-id="store.nextNodeId"
        @navigate="handleNavigate"
      />

      <!-- 主内容区 -->
      <main class="sop-main">
        <!-- Trailing chat 步骤 -->
        <TrailingChatPanel
          v-if="store.isOnTrailingChatStep && store.currentRun"
          :run-id="store.currentRun.id"
          :conversation-id="store.currentRun.conversation_id"
          :deep-thinking="false"
          :visible="store.isOnTrailingChatStep"
          @error="handleStreamError"
        />

        <!-- 节点步骤 -->
        <div v-else-if="store.currentNode" class="sop-step-wrapper">
          <div class="sop-step-header">
            <h2 class="sop-step-title">{{ store.currentNode.name }}</h2>
            <p v-if="store.currentNode.description" class="sop-step-description">
              {{ store.currentNode.description }}
            </p>
          </div>

          <StepInput
            ref="stepInputRef"
            v-model="currentInputText"
            :run-id="store.currentRun?.id ?? null"
            :node-id="store.currentNode.id"
            :ensure-run="ensureRun"
            @error="handleStreamError"
          />

          <!-- 输出区（关键：包裹 div 加 position: relative 供 ScrollFollowButton 定位） -->
          <div class="sop-output-wrapper">
            <StepOutput
              ref="stepOutputRef"
              :thinking="currentNodeOutput.thinking"
              :content="currentNodeOutput.content"
              :streaming="isStreamingCurrentNode"
              empty-hint="点击下方按钮开始执行"
            />
            <ScrollFollowButton :visible="scrollFollowVisible" @click="handleResume" />
          </div>

          <ToolbarActions
            :can-go-prev="canGoPrev"
            :can-go-next="canExecute || canGoNext"
            :can-copy="hasOutput"
            :can-regenerate="canRegenerate"
            :is-dirty="isInputDirty"
            :has-bookmark="currentHasBookmark"
            :next-label="nextButtonLabel"
            @prev="handlePrev"
            @next="handleNext"
            @copy="handleCopy"
            @regenerate="handleRegenerateClick"
          />
        </div>
      </main>
    </template>

    <!-- 历史记录弹窗 -->
    <HistoryModal
      v-model="showHistory"
      :current-run-id="currentRunIdStr"
      @switch-run="handleSwitchRun"
    />

    <!-- 重新生成确认弹窗（书签 dirty 警告） -->
    <ConfirmModal
      v-model="showRegenConfirm"
      title="重新生成"
      message="您修改了输入内容，重新生成会删除此节点的书签，是否继续？"
      variant="danger"
      confirm-text="继续"
      @confirm="doRegenerate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'

import StepperPanel from './components/StepperPanel.vue'
import StepInput from './components/StepInput.vue'
import StepOutput from './components/StepOutput.vue'
import ToolbarActions from './components/ToolbarActions.vue'
import ScrollFollowButton from './components/ScrollFollowButton.vue'
import TrailingChatPanel from './components/TrailingChatPanel.vue'
import HistoryModal from './components/HistoryModal.vue'
import EmptyStateCard from './components/EmptyStateCard.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

import { useSopRunStore } from '@/stores/sopRun'
import { useNotificationsStore } from '@/stores/notifications'
import { useUiDialogsStore } from '@/stores/uiDialogs'
import { useDraftLifecycle } from './composables/useDraftLifecycle'
import { useInputPersistence } from './composables/useInputPersistence'
import { useStepNavigation } from './composables/useStepNavigation'
import { useBookmarks } from './composables/useBookmarks'
import { useSSEStream } from './composables/useSSEStream'

const route = useRoute()
const router = useRouter()

const store = useSopRunStore()
const notifications = useNotificationsStore()
const uiDialogs = useUiDialogsStore()

// 使用 storeToRefs 把 store 的 state/computed 转换为真实的 Ref，
// 供 useStepNavigation 这类接受 Ref<T> 的 composable 消费。
const {
  nodes: storeNodes,
  currentStep: storeCurrentStep,
  totalSteps: storeTotalSteps,
  completedNodeIds: storeCompletedNodeIds,
  nextNodeId: storeNextNodeId,
  nodeAccessibility: storeNodeAccessibility,
  trailingChatEnabled: storeTrailingChatEnabled
} = storeToRefs(store)

const draft = useDraftLifecycle()
const persistence = useInputPersistence()
const navigation = useStepNavigation({
  nodes: storeNodes,
  currentStep: storeCurrentStep,
  totalSteps: storeTotalSteps,
  completedNodeIds: storeCompletedNodeIds,
  nextNodeId: storeNextNodeId,
  nodeAccessibility: storeNodeAccessibility,
  trailingChatEnabled: storeTrailingChatEnabled
})
const bookmarks = useBookmarks()
const sseStream = useSSEStream()

// ===== 路由参数 =====
const templateId = computed<number>(() => Number(route.query.templateId) || 0)
const routeRunId = computed<number | null>(() => {
  const val = route.query.runId
  if (!val) return null
  const n = Number(val)
  return Number.isNaN(n) ? null : n
})

const currentRunIdStr = computed(() => (store.currentRun ? String(store.currentRun.id) : ''))

// ===== 本地 UI 状态 =====
const loadError = ref<string>('')
const showHistory = ref(false)
const showRegenConfirm = ref(false)
const currentInputText = ref('')
const pendingRegenerateNodeId = ref<number | null>(null)
const stepInputRef = ref<InstanceType<typeof StepInput> | null>(null)
const stepOutputRef = ref<InstanceType<typeof StepOutput> | null>(null)

// 当前节点的输出（来自 store.nodeRuns 或流式 state）
const currentNodeOutput = computed(() => {
  const node = store.currentNode
  if (!node) return { thinking: '', content: '' }
  // 如果当前节点正在流式输出
  if (store.streamingNodeId === node.id) {
    return {
      thinking: store.streamingThinking,
      content: store.streamingContent
    }
  }
  // 否则显示已保存的 nodeRun 结果
  const nodeRun = store.nodeRuns[node.id]
  return {
    thinking: nodeRun?.thinking ?? '',
    content: nodeRun?.output ?? ''
  }
})

const isStreamingCurrentNode = computed(() => store.streamingNodeId === store.currentNode?.id)

const hasOutput = computed(() => !!currentNodeOutput.value.content)

// ===== 导航权限 =====
const canGoPrev = computed(() => store.currentStep > 1)
const canGoNext = computed(() => navigation.canAccessStep(store.currentStep + 1))

/** 当前节点是否可执行（未完成 + 是下一个待执行） */
const canExecute = computed(() => {
  const node = store.currentNode
  if (!node) return false
  if (store.completedNodeIds.has(node.id)) return false
  return node.id === store.nextNodeId
})

const canRegenerate = computed(() => {
  const node = store.currentNode
  if (!node) return false
  return store.completedNodeIds.has(node.id)
})

const nextButtonLabel = computed(() => (canExecute.value ? '执行' : '下一步'))

// ===== dirty 检测 =====

const isInputDirty = computed(() => {
  const node = store.currentNode
  if (!node) return false
  return persistence.isDirty(String(node.id), currentInputText.value)
})

const currentHasBookmark = computed(() => {
  const node = store.currentNode
  if (!node) return false
  return bookmarks.hasBookmarkForNode(node.id)
})

// ===== ScrollFollow 按钮 =====
const scrollFollowVisible = computed(() => {
  return stepOutputRef.value?.scrollFollow?.isInterrupted?.value ?? false
})

// ===== 持久化 scope =====

const persistenceScope = computed(() => {
  if (store.currentRun) {
    return { kind: 'run' as const, runId: store.currentRun.id }
  }
  return { kind: 'draft' as const, templateId: templateId.value }
})

// ===== 生命周期：初始化 =====

async function initialize() {
  loadError.value = ''
  if (!templateId.value) {
    loadError.value = '缺少 templateId 参数'
    return
  }
  try {
    await store.loadTemplate(templateId.value)
    await bookmarks.loadBookmarks(templateId.value)

    if (routeRunId.value) {
      await store.loadRun(routeRunId.value)
    } else {
      store.enterDraftMode(templateId.value)
      draft.enterDraftMode(templateId.value)
    }

    // 恢复上次停留步骤
    navigation.restoreFromSession(persistenceScope.value)

    // 首次加载当前节点输入（从 localStorage）
    loadInputForCurrentNode()

    // 为当前节点建立 dirty snapshot
    snapshotCurrentInput()
  } catch (err) {
    loadError.value = (err as Error)?.message || '加载失败'
  }
}

function loadInputForCurrentNode() {
  const node = store.currentNode
  if (!node) return
  currentInputText.value = persistence.loadInput(persistenceScope.value, String(node.id))
}

function snapshotCurrentInput() {
  const node = store.currentNode
  if (!node) return
  persistence.snapshot(String(node.id), currentInputText.value)
}

// 当 currentStep 变化时重新加载对应节点的输入并 snapshot
watch(
  () => store.currentStep,
  () => {
    loadInputForCurrentNode()
    snapshotCurrentInput()
  }
)

// 用户输入时实时保存到 localStorage
watch(currentInputText, (newValue) => {
  const node = store.currentNode
  if (!node) return
  persistence.saveInput(persistenceScope.value, String(node.id), newValue)
})

// ===== 用户操作 =====

function handleBackHome() {
  router.push('/')
}

function handleNavigate(step: number) {
  navigation.setActiveStep(step, persistenceScope.value)
}

function handlePrev() {
  const target = store.currentStep - 1
  if (target >= 1) {
    navigation.setActiveStep(target, persistenceScope.value)
  }
}

async function handleNext() {
  if (canExecute.value) {
    await executeCurrentNode()
  } else if (canGoNext.value) {
    navigation.setActiveStep(store.currentStep + 1, persistenceScope.value)
  }
}

async function handleCopy() {
  if (!currentNodeOutput.value.content) return
  try {
    await navigator.clipboard.writeText(currentNodeOutput.value.content)
    notifications.success('已复制到剪贴板')
  } catch {
    notifications.error('复制失败，请手动选择复制')
  }
}

function handleRegenerateClick() {
  const node = store.currentNode
  if (!node) return
  pendingRegenerateNodeId.value = node.id
  if (isInputDirty.value && currentHasBookmark.value) {
    showRegenConfirm.value = true
  } else {
    doRegenerate()
  }
}

async function doRegenerate() {
  const nodeId = pendingRegenerateNodeId.value
  if (!nodeId) return
  pendingRegenerateNodeId.value = null
  // 从 completedNodeIds 移除并重新执行（通过 store action，保持封装）
  store.markNodeIncomplete(nodeId)
  await executeCurrentNode()
}

async function handleSwitchRun(runId: string, templateIdStr: string) {
  // route watcher 会在 params 变化时 abort/reset/initialize，这里不再显式调用 initialize()
  // 避免两次并发 loadTemplate/loadRun
  await router.push({
    path: '/sop/run',
    query: { templateId: templateIdStr, runId }
  })
}

function handleStreamError(msg: string) {
  notifications.error(msg)
}

function handleResume() {
  // defineExpose 暴露的顶层 ref 被 Vue 代理自动 unwrap
  const scrollEl = stepOutputRef.value?.scrollContainerRef
  if (scrollEl) {
    stepOutputRef.value?.scrollFollow?.resume?.(scrollEl)
  }
}

// ===== 节点执行（核心流程）=====

/**
 * 确保存在后端 run —— draft 模式下 lazy 创建。
 *
 * 同时服务于：
 *   - 执行节点前（executeCurrentNode）
 *   - 用户首次上传文件时（StepInput :ensure-run 回调）
 *
 * 返回 runId；失败时 toast 提示并返回 null。
 */
async function ensureRun(): Promise<number | null> {
  if (store.currentRun) return store.currentRun.id
  try {
    const composedText = stepInputRef.value?.compose?.() ?? currentInputText.value
    const created = await draft.lazyCreateRun(templateId.value, composedText)
    store.setCurrentRun({
      id: created.id,
      template_id: created.template_id,
      user_id: 0,
      status: created.status as 'draft' | 'pending' | 'running' | 'succeeded' | 'failed',
      conversation_id: created.conversation_id,
      counted: created.counted,
      started_at: null,
      finished_at: null,
      error_message: '',
      final_note_id: null,
      created_at: '',
      updated_at: ''
    })
    // 更新 URL 加上 runId，避免刷新后丢失
    await router.replace({
      path: '/sop/run',
      query: { templateId: String(templateId.value), runId: String(created.id) }
    })
    return created.id
  } catch (err) {
    notifications.error(`创建 run 失败：${(err as Error).message}`)
    return null
  }
}

/**
 * 执行当前节点：
 * 1. 如果无 runId，先 ensureRun 创建 draft run
 * 2. 通过 useSSEStream 调用 POST /v1/sop/runs/:id/nodes/:node_id/execute
 * 3. 累积 streaming state，onDone 时提交到 nodeRuns + completedNodeIds
 */
async function executeCurrentNode() {
  const node = store.currentNode
  if (!node) return

  // 获取 StepInput 的最终 compose 文本
  const composedText = stepInputRef.value?.compose?.() ?? currentInputText.value

  // Step 1: ensureRun
  const runId = await ensureRun()
  if (runId === null) return

  if (!store.currentRun) return

  // Step 2: 清空 streaming state + 开始流式执行
  store.setStreamingState(node.id, '', '')

  const params = new URLSearchParams()
  // model_key 和 thinking 由 ModelSelector 管理（未集成时不传）
  const url = `${resolveApiBaseURL()}/v1/sop/runs/${store.currentRun.id}/nodes/${node.id}/execute${params.toString() ? '?' + params.toString() : ''}`

  // FormData: text + files（files 来自 StepInput composable，此处复用 composedText 简化）
  const formData = new FormData()
  formData.append('text', composedText)

  await sseStream.streamPost(
    url,
    { method: 'POST', body: formData },
    {
      onThinking: (chunk) => {
        store.appendStreamingThinking(chunk)
      },
      onMessage: (chunk) => {
        store.appendStreamingContent(chunk)
      },
      onDone: () => {
        // 把 streaming 结果作为 nodeRun 持久化到 store（通过 action）
        const thinking = store.streamingThinking
        const content = store.streamingContent
        store.setNodeRun(node.id, {
          id: 0,
          run_id: store.currentRun!.id,
          node_id: node.id,
          status: 'succeeded',
          input: composedText,
          output: content,
          thinking,
          latency_ms: 0,
          started_at: null,
          finished_at: null
        })
        store.markNodeComplete(node.id)
        store.clearStreamingState()

        // 自动前进到下一步
        const nextStep = store.currentStep + 1
        if (nextStep <= store.totalSteps) {
          // 更新 nextNodeId 为下一个未完成的节点
          const nextNode = store.nodes[nextStep - 1]
          store.setNextNodeId(nextNode ? nextNode.id : null)
          navigation.setActiveStep(nextStep, persistenceScope.value)
        }
      },
      onError: (msg) => {
        store.clearStreamingState()
        // 积分/余额/配额/次数 不足走 InsufficientCreditsDialog（spec §10.1 模糊匹配）
        if (
          msg.includes('积分') ||
          msg.includes('余额') ||
          msg.includes('配额') ||
          msg.includes('次数') ||
          msg.includes('额度')
        ) {
          uiDialogs.openCreditsDialog(msg)
        } else {
          notifications.error(msg)
        }
      }
    }
  )
}

// ===== API base URL 辅助 =====

function resolveApiBaseURL(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL || '').trim()
  if (!raw) return '/api'
  if (/\/dev\/?$/i.test(raw) || /youshu\.asia\/dev\/?$/i.test(raw)) return '/api'
  return raw.replace(/\/$/, '')
}

// ===== 路由参数变化时重新初始化 =====
watch(
  () => [templateId.value, routeRunId.value],
  ([newTid, newRid], oldVal) => {
    const [oldTid, oldRid] = oldVal as [number, number | null]
    if (newTid !== oldTid || newRid !== oldRid) {
      // 切换 SOP 或 run，重置并重新加载
      sseStream.abort()
      store.reset()
      initialize()
    }
  }
)

// ===== 生命周期 =====

onMounted(async () => {
  await initialize()
})

onBeforeUnmount(() => {
  // Beacon 清理 draft
  if (store.isDraftRun && store.currentRun) {
    draft.cleanupDraft(store.currentRun.id)
  }
  sseStream.abort()
  store.reset()
})
</script>

<style scoped>
.sop-run-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  padding: var(--space-lg);
  max-width: 960px;
  margin: 0 auto;
  min-height: 100vh;
  background: var(--color-bg, #f7f8fb);
}

/* ==================== 顶部栏 ==================== */

.sop-top-bar {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-md);
}

.sop-back-btn,
.sop-history-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-md);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sop-back-btn:hover,
.sop-history-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}

.sop-template-title {
  flex: 1;
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-text);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ==================== 主内容区 ==================== */

.sop-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  min-height: 400px;
}

.sop-step-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.sop-step-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.sop-step-title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--color-text);
}

.sop-step-description {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  line-height: var(--line-height-relaxed);
}

.sop-output-wrapper {
  position: relative;
}
</style>
