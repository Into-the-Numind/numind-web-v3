<!--
  SOPRunView — SOP 运行页主集成组件（F11 重写）

  F11 把旧的"垂直滚动列表"重写为 topbar + 左 nav + 主区三栏布局。
  所有 v2 子组件通过主容器协调接线：

    - TopBar        ← 返回首页 / 模板名 / 历史 icon
    - StepNav       ← 左侧 264px 步骤导航（主流程 + 追问两组）
    - StepCanvas    ← 主区路由器，根据 store.viewingStepStatus 渲染
       ├ SopStepView     ← InputCard / OutputCard / ActionRow / HistoryViewStrip
       └ TrailingChat    ← 全铺聊天面板（state F）

  ## 主容器职责（Spec §5.2 + 附录 A）

  1. Template / Run / Bookmarks 初始加载（onMounted）
  2. Draft lazy create run（useDraftLifecycle）
  3. Node 执行：ensureRun → useSSEStream.streamPost → onDone refreshNodeRun
  4. Trailing chat 执行：useSSEStream 调 /sop/chat/stream
  5. 书签 toast / auto_applied_count toast / 信用不足弹窗
  6. Regenerate 的 ConfirmModal（销毁性操作，ui-ux.md 硬规则 4）
  7. 4 态处理：loading / empty / error / success（ui-ux.md 硬规则 2）

  详见 spec §5.2 + 附录 A 交互矩阵 + plan Task F11
-->
<template>
  <div class="sop-run-view-v2">
    <!-- 4 态：loading -->
    <EmptyStateCard
      v-if="store.loading && !store.template"
      title="加载中…"
      message="正在加载 SOP 模板"
    />

    <!-- 4 态：error -->
    <EmptyStateCard
      v-else-if="loadError"
      variant="error"
      title="加载失败"
      :message="loadError"
      action-label="重试"
      @action="initialize"
    />

    <!-- 4 态：empty -->
    <EmptyStateCard
      v-else-if="store.template && store.nodes.length === 0"
      title="该 SOP 暂未配置步骤"
      message="请联系 SOP 创建者补充步骤"
    />

    <!-- 4 态：success —— 正常运行页 -->
    <template v-else-if="store.template">
      <TopBar
        :template-name="store.template?.name || ''"
        @back="handleBackHome"
        @open-history="showHistory = true"
      />

      <div class="body">
        <StepNav
          :nodes="store.nodes"
          :current-step="store.currentStep"
          :viewing-step="store.viewingStep"
          :completed-node-ids="store.completedNodeIds"
          :accessibility="store.nodeAccessibility"
          :trailing-chat-enabled="store.trailingChatEnabled"
          :streaming-node-id="store.streamingNodeId"
          @navigate="handleNavigate"
        />

        <StepCanvas
          :ensure-run="ensureRun"
          :current-step="store.currentStep"
          :current-step-name="store.currentNode?.name ?? ''"
          :chat-streaming="chatStreaming"
          :chat-streaming-message="chatStreamingMessage"
          :chat-reload-trigger="chatReloadTrigger"
          @execute="handleExecute"
          @stop="handleStop"
          @copy="handleCopy"
          @regenerate="handleRegenerateClick"
          @primary="handlePrimary"
          @secondary="handleSecondary"
          @return-current="handleReturnCurrent"
          @error="handleStreamError"
          @chat-send="handleChatSend"
          @chat-stop="handleChatStop"
          @chat-error="handleStreamError"
        />
      </div>
    </template>

    <!-- 历史记录弹窗 -->
    <HistoryModal
      v-model="showHistory"
      :current-run-id="currentRunIdStr"
      @switch-run="handleSwitchRun"
    />

    <!-- 重新生成确认弹窗（销毁性操作：覆盖旧 output） -->
    <ConfirmModal
      v-model="showRegenConfirm"
      title="重新生成"
      :message="regenConfirmMessage"
      variant="danger"
      confirm-text="继续"
      @confirm="doRegenerate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import TopBar from './components/TopBar.vue'
import StepNav from './components/StepNav.vue'
import StepCanvas from './components/StepCanvas.vue'
import EmptyStateCard from './components/EmptyStateCard.vue'
import HistoryModal from './components/HistoryModal.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import type { ChatBubbleMessage } from './components/ChatBubble.vue'

import { useSopRunStore } from '@/stores/sopRun'
import { useNotificationsStore } from '@/stores/notifications'
import { useUiDialogsStore } from '@/stores/uiDialogs'
import { useDraftLifecycle } from './composables/useDraftLifecycle'
import { useBookmarks } from './composables/useBookmarks'
import { useSSEStream } from './composables/useSSEStream'

const route = useRoute()
const router = useRouter()

const store = useSopRunStore()
const notifications = useNotificationsStore()
const uiDialogs = useUiDialogsStore()

const draft = useDraftLifecycle()
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
const regenConfirmMessage = ref<string>('重新生成会抹除当前 AI 输出，是否继续？')
const pendingRegenerateText = ref<string>('')

// ===== Trailing chat 流式状态 =====
const chatStreaming = ref(false)
const chatStreamingMessage = ref<ChatBubbleMessage | null>(null)
/** F11 fix P1-3: trigger TrailingChat reload after chat onDone (so finished message stays visible) */
const chatReloadTrigger = ref(0)
let tempMsgCounter = 0
function makeTempId(): string {
  tempMsgCounter += 1
  return `tmp_${Date.now()}_${tempMsgCounter}`
}

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
      // 已有 run：从 nextNodeId 推断 currentStep（第一个未完成节点）
      const idx = store.nodes.findIndex((n) => n.id === store.nextNodeId)
      if (idx >= 0) {
        store.setActiveStep(idx + 1)
      }
      store.setViewingStep(store.currentStep)
    } else {
      store.enterDraftMode(templateId.value)
      draft.enterDraftMode(templateId.value)
      store.setActiveStep(1)
      store.setViewingStep(1)
    }

    // F11 P1-2 恢复：从 sessionStorage 还原上次停留的步骤。
    // key 约定与 useStepNavigation 一致：
    //   run 模式   → sop_step_<runId>
    //   draft 模式 → sop_step_draft_<templateId>
    // 仅在恢复值 <= currentStep（已解锁）且在范围内时生效，守不变量。
    restoreViewingStepFromSession()
  } catch (err) {
    loadError.value = (err as Error)?.message || '加载失败'
  }
}

/**
 * 从 sessionStorage 恢复用户上次停留的步骤（viewingStep）。
 *
 * F11 主容器重写时漏接了这条路径，本修复补齐（F11 P1-2 deferred）。
 * currentStep 由后端 run 状态驱动（已完成节点 / next_node），不可随便覆盖；
 * 这里只动 viewingStep，利用已有 setViewingStep 的守卫保证 viewingStep <= currentStep。
 */
function restoreViewingStepFromSession() {
  try {
    const key = store.currentRun
      ? `sop_step_${store.currentRun.id}`
      : `sop_step_draft_${templateId.value}`
    const raw = sessionStorage.getItem(key)
    if (raw === null) return
    const step = parseInt(raw, 10)
    if (Number.isNaN(step) || step < 1) return
    if (step > store.currentStep) return // 尚未解锁，保持默认
    if (step > store.totalSteps) return
    store.setViewingStep(step)
  } catch {
    // sessionStorage 可能被禁用（隐私模式），静默忽略
  }
}

// ===== 用户操作 =====

function handleBackHome() {
  router.push('/')
}

function handleNavigate(step: number) {
  // StepNav 点击 → 切换 viewingStep（不改 currentStep —— 双指针模型）
  // 守 viewingStep <= currentStep（store.setViewingStep 内部已检查）
  store.setViewingStep(step)
  // 持久化到 sessionStorage 以支持刷新恢复（F11 P1-2 deferred）
  persistViewingStepToSession()
}

function persistViewingStepToSession() {
  try {
    const key = store.currentRun
      ? `sop_step_${store.currentRun.id}`
      : `sop_step_draft_${templateId.value}`
    sessionStorage.setItem(key, String(store.viewingStep))
  } catch {
    // 隐私模式静默忽略
  }
}

function handleReturnCurrent() {
  // HistoryViewStrip 返回按钮 → store.returnToCurrentTask（SopStepView 内部已调）
  // 这里是 placeholder 以便后续埋点 / 日志
}

async function handleCopy() {
  const node = store.viewingNode
  if (!node) return
  const text = store.nodeRuns[node.id]?.output || ''
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    notifications.success('已复制到剪贴板')
  } catch {
    notifications.error('复制失败，请手动选择复制')
  }
}

function handleRegenerateClick() {
  const node = store.viewingNode
  if (!node) return
  const hasBookmark = bookmarks.hasBookmarkForNode(node.id)
  regenConfirmMessage.value = hasBookmark
    ? '重新生成会抹除当前 AI 输出，并删除此节点的书签，是否继续？'
    : '重新生成会抹除当前 AI 输出，是否继续？'
  // 使用当前 nodeRun.input 作为 regenerate 的 text（保持原输入）
  pendingRegenerateText.value = store.nodeRuns[node.id]?.input || ''
  showRegenConfirm.value = true
}

async function doRegenerate() {
  const node = store.viewingNode
  if (!node) return
  store.markNodeIncomplete(node.id)
  await executeNode(node.id, pendingRegenerateText.value)
  pendingRegenerateText.value = ''
}

function handlePrimary() {
  // done-current 态的"下一步" → advanceCurrentStep
  store.advanceCurrentStep()
}

function handleSecondary() {
  // done-current 态的"重新生成" → 走 ConfirmModal
  handleRegenerateClick()
}

function handleStop() {
  sseStream.abort()
  // partial content 保留在 store.streamingContent，不入 nodeRuns
  store.clearStreamingState()
}

async function handleSwitchRun(runId: string, templateIdStr: string) {
  await router.push({
    path: '/sop/run',
    query: { templateId: templateIdStr, runId }
  })
}

function handleStreamError(msg: string) {
  notifications.error(msg)
}

// ===== Execute 流程 =====

/**
 * draft 模式下 lazy 创建后端 run。返回 runId 或 null（失败）。
 *
 * 同时服务：
 *   - 执行节点前（handleExecute）
 *   - StepInput 文件上传前（InputCard :ensure-run 透传）
 */
async function ensureRun(): Promise<number | null> {
  if (store.currentRun) return store.currentRun.id
  try {
    const created = await draft.lazyCreateRun(templateId.value, '')
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
    // createRun 可能自动应用了书签，刷新后重新加载 run 补全 completedNodeIds
    if (created.auto_applied_count && created.auto_applied_count > 0) {
      notifications.success(`已自动应用 ${created.auto_applied_count} 个书签`)
      // 重新拉 run status 刷新 completedNodeIds / nextNodeId
      await store.loadRun(created.id)
      // 切回第一个未完成节点
      const idx = store.nodes.findIndex((n) => n.id === store.nextNodeId)
      if (idx >= 0) {
        store.setActiveStep(idx + 1)
        store.setViewingStep(store.currentStep)
      }
    }
    // 更新 URL 加上 runId
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

async function handleExecute(text: string) {
  const node = store.viewingNode
  if (!node) return
  await executeNode(node.id, text)
}

/**
 * 执行指定节点 —— F11 核心流程。
 *
 * 1. ensureRun（lazy create draft run）
 * 2. setStreamingState + POST /v1/sop/runs/:id/nodes/:node_id/execute
 * 3. onThinking / onMessage → appendStreaming
 * 4. onDone → setNodeRun + markNodeComplete + **refreshNodeRun (P0-2)**
 *    （不自动 advance：完成后保持在当前步骤，由用户手动点"下一步"按钮前进）
 */
async function executeNode(nodeId: number, text: string) {
  const runId = await ensureRun()
  if (runId === null || !store.currentRun) return

  store.setStreamingState(nodeId, '', '')

  const url = `${resolveApiBaseURL()}/v1/sop/runs/${store.currentRun.id}/nodes/${nodeId}/execute`
  const formData = new FormData()
  formData.append('text', text)

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
      onDone: async () => {
        const thinking = store.streamingThinking
        const content = store.streamingContent
        store.setNodeRun(nodeId, {
          id: 0,
          run_id: store.currentRun!.id,
          node_id: nodeId,
          status: 'succeeded',
          input: text,
          output: content,
          thinking,
          latency_ms: 0,
          started_at: null,
          finished_at: null
        })
        store.markNodeComplete(nodeId)
        store.clearStreamingState()

        // P0-2 修复：拉 /status 补齐 model_name / latency_ms / total_tokens
        await store.refreshNodeRun(nodeId)

        // 执行完成后保留在当前步骤（viewingStepStatus → 'done-current'），
        // 由用户手动点"下一步"按钮 (handlePrimary → advanceCurrentStep) 前进
      },
      onError: (msg) => {
        store.clearStreamingState()
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

// ===== Trailing chat 流式发送 =====

async function handleChatSend(question: string) {
  if (!store.currentRun) {
    notifications.error('run ID 无效')
    return
  }

  chatStreaming.value = true
  chatStreamingMessage.value = {
    id: makeTempId(),
    role: 'assistant',
    content: '',
    thinking: ''
  }

  const body = {
    run_id: store.currentRun.id,
    conversation_id: store.currentRun.conversation_id || '',
    question,
    deep_thinking: false,
    regenerate_msg_id: 0
  }
  const url = `${resolveApiBaseURL()}/v1/sop/chat/stream`

  await sseStream.streamPost(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    },
    {
      onThinking: (chunk) => {
        if (chatStreamingMessage.value) {
          chatStreamingMessage.value = {
            ...chatStreamingMessage.value,
            thinking: (chatStreamingMessage.value.thinking || '') + chunk
          }
        }
      },
      onMessage: (chunk) => {
        if (chatStreamingMessage.value) {
          chatStreamingMessage.value = {
            ...chatStreamingMessage.value,
            content: (chatStreamingMessage.value.content || '') + chunk
          }
        }
      },
      onDone: () => {
        chatStreaming.value = false
        chatStreamingMessage.value = null
        // P1-3 fix: trigger TrailingChat reload so just-finished message stays visible
        chatReloadTrigger.value++
      },
      onError: (msg) => {
        chatStreaming.value = false
        chatStreamingMessage.value = null
        notifications.error(msg)
      }
    }
  )
}

function handleChatStop() {
  sseStream.abort()
  chatStreaming.value = false
  chatStreamingMessage.value = null
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
    if (newTid === oldTid && newRid === oldRid) return

    // 特例：ensureRun 内 router.replace 写入 runId 时，store 已是最新，
    // 不应 reset + initialize（会清掉正在进行的上传 / 流式执行）。
    if (
      newTid === oldTid &&
      oldRid === null &&
      newRid !== null &&
      store.currentRun?.id === newRid
    ) {
      return
    }

    sseStream.abort()
    store.reset()
    initialize()
  }
)

// ===== 生命周期 =====

onMounted(async () => {
  await initialize()
})

onBeforeUnmount(() => {
  if (store.isDraftRun && store.currentRun) {
    draft.cleanupDraft(store.currentRun.id)
  }
  sseStream.abort()
  store.reset()
})
</script>

<style scoped>
/* ==================== sop-run-view-v2 scoped tokens (F0) ====================
 *
 * 本 block 为 SOP 运行页视觉重设计（feature: sop-runtime-visual-redesign）的 token 基建。
 * Token 值从 mockup 01-active-and-history.html :root 段严格提取，不污染全局 :root。
 * 后续 F1–F11 task 的组件 CSS 从这里读变量。
 *
 * 每个 token 标注与根目录 DESIGN.md 的对齐关系（P2-3 review 修复）。
 * ============================================================================ */
.sop-run-view-v2 {
  /* --- background & surface (ALL WHITE，mockup γ v2 决策) --- */
  --bg: #ffffff; /* scope-only: DESIGN --bg=#F7F8FB，mockup 改为纯白 */
  --surface: #ffffff; /* 对齐 DESIGN --surface */
  --surface-hover: #f4f5f8; /* scope-only: DESIGN --surface-hover=#F3F4F8，差 1 位 */

  /* --- text --- */
  --text: #1a1d26; /* 对齐 DESIGN --text */
  --text-secondary: #5f6577; /* 对齐 DESIGN --text-secondary */
  --text-muted: #8b90a0; /* 对齐 DESIGN --text-muted */

  /* --- brand / accent --- */
  --accent: hsl(160, 75%, 44%); /* 对齐 DESIGN --accent */
  --accent-hover: hsl(160, 75%, 38%); /* 对齐 DESIGN --accent-hover */
  --accent-soft: hsl(160, 60%, 93%); /* 对齐 DESIGN --accent-soft */
  --accent-light: hsl(160, 70%, 68%); /* 对齐 DESIGN --accent-light */
  --accent-link: hsl(160, 75%, 38%); /* 对齐 DESIGN --accent-link */
  --accent-ultra-soft: hsl(160, 60%, 95%); /* 对齐 DESIGN --accent-ultra-soft */
  --primary: hsl(160, 72%, 40%); /* 对齐 DESIGN --primary */
  --primary-hover: hsl(160, 72%, 34%); /* 对齐 DESIGN --primary-hover */
  --primary-foreground: #ffffff; /* 对齐 DESIGN --primary-foreground */

  /* --- borders --- */
  --border: #e2e4ea; /* 对齐 DESIGN --border */
  --border-light: #eeeff3; /* 对齐 DESIGN --border-light */
  --divider: #f0f1f5; /* 对齐 DESIGN --divider */

  /* --- spacing (T-shirt size) --- */
  --space-xs: 4px; /* 对齐 DESIGN --space-xs */
  --space-sm: 8px; /* 对齐 DESIGN --space-sm */
  --space-md: 12px; /* 对齐 DESIGN --space-md */
  --space-lg: 16px; /* 对齐 DESIGN --space-lg */
  --space-xl: 24px; /* 对齐 DESIGN --space-xl */
  --space-2xl: 32px; /* 对齐 DESIGN --space-2xl */
  --space-3xl: 40px; /* 对齐 DESIGN --space-3xl */
  --space-4xl: 48px; /* 对齐 DESIGN --space-4xl */

  /* --- radius --- */
  --radius-sm: 6px; /* 对齐 DESIGN --radius-sm */
  --radius-md: 12px; /* 对齐 DESIGN --radius-md */
  --radius-lg: 16px; /* 对齐 DESIGN --radius-lg */
  --radius-xl: 20px; /* 对齐 DESIGN --radius-xl */
  --radius-pill: 999px; /* 对齐 DESIGN --radius-pill */

  /* --- shadow --- */
  --shadow-sm:
    0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.03); /* 对齐 DESIGN --shadow-sm */
  --shadow-md:
    0 2px 8px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04); /* 对齐 DESIGN --shadow-md */
  --shadow-lg:
    0 8px 24px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.03); /* 对齐 DESIGN --shadow-lg */
  --shadow-focus: 0 0 0 4px hsl(158 50% 92% / 0.5); /* 对齐 DESIGN --shadow-focus */

  /* --- font (sans only — mockup γ v2 去掉 serif；mono 用于 MetaFooter 元信息) --- */
  --font-sans:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', 'Helvetica Neue', sans-serif; /* 对齐 DESIGN --font-sans */
  --font-mono:
    'JetBrains Mono', SFMono-Regular, Menlo, Monaco, Consolas, monospace; /* 对齐 DESIGN --font-mono — MetaFooter 元信息（耗时 / token / 时间戳）使用 */

  /* --- transitions --- */
  --transition-fast: 150ms ease; /* 对齐 DESIGN --transition-fast */
  --transition-base: 250ms ease; /* 对齐 DESIGN --transition-base */

  /* ==================== v2 三栏布局 ==================== */
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
}

/* scope-local reset，仅作用于 sop-run-view-v2 子树，避免污染全局 */
.sop-run-view-v2 *,
.sop-run-view-v2 *::before,
.sop-run-view-v2 *::after {
  box-sizing: border-box;
}

.body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
