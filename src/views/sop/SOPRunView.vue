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
    <!-- 4 态：loading — 生产环境全屏毛玻璃遮罩 + 弹跳点 -->
    <div v-if="store.loading && !store.template" class="page-loading-overlay">
      <div class="page-loading-spinner">
        <span class="page-loading-dot" />
        <span class="page-loading-dot" />
        <span class="page-loading-dot" />
      </div>
      <div class="page-loading-text">正在加载 SOP 模板…</div>
    </div>

    <!-- 4 态：error -->
    <div v-else-if="loadError" class="page-status-screen">
      <div class="page-status-title">加载失败</div>
      <div class="page-status-message">{{ loadError }}</div>
      <button class="page-status-action" @click="initialize">重试</button>
    </div>

    <!-- 4 态：empty -->
    <div v-else-if="store.template && store.nodes.length === 0" class="page-status-screen">
      <div class="page-status-title">该 SOP 暂未配置步骤</div>
      <div class="page-status-message">请联系 SOP 创建者补充步骤</div>
    </div>

    <!-- 4 态：success —— 正常运行页（侧边栏全高 + 右区 header+content） -->
    <template v-else-if="store.template">
      <StepNav
        :nodes="store.nodes"
        :current-step="store.currentStep"
        :viewing-step="store.viewingStep"
        :completed-node-ids="store.completedNodeIds"
        :accessibility="store.nodeAccessibility"
        :trailing-chat-enabled="store.trailingChatEnabled"
        :streaming-node-id="store.streamingNodeId"
        :mobile-open="mobileNavOpen"
        @navigate="handleNavigate"
        @back="handleBackHome"
        @close-mobile="closeMobileNav"
      />

      <!-- 移动端遮罩：仅 ≤768px + 抽屉展开时显示，点击关闭 -->
      <div
        v-if="mobileNavOpen"
        class="mobile-nav-backdrop"
        data-testid="sop-mobile-nav-backdrop"
        aria-hidden="true"
        @click="closeMobileNav"
      />

      <div class="right-area">
        <TopBar
          :template-name="store.template?.name || ''"
          @back="handleBackHome"
          @open-history="showHistory = true"
          @toggle-nav="toggleMobileNav"
        />

        <StepCanvas
          :ensure-run="ensureRun"
          :current-step="store.currentStep"
          :current-step-name="store.currentNode?.name ?? ''"
          :chat-streaming="chatStreaming"
          :chat-streaming-message="chatStreamingMessage"
          :chat-pending-user-message="chatPendingUserMessage"
          :chat-reload-trigger="chatReloadTrigger"
          @execute="handleExecute"
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
import HistoryModal from './components/HistoryModal.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import type { ChatBubbleMessage } from './components/ChatBubble.vue'

import { copyText } from '@/utils/clipboard'
import { useSopRunStore } from '@/stores/sopRun'
import { useLLMModelStore } from '@/stores/llmModel'
import { useNotificationsStore } from '@/stores/notifications'
import { useUiDialogsStore } from '@/stores/uiDialogs'
import { useDraftLifecycle } from './composables/useDraftLifecycle'
import { useBookmarks } from './composables/useBookmarks'
import { useSSEStream } from './composables/useSSEStream'
import { useTypewriterReveal } from '@/composables/useTypewriterReveal'

const route = useRoute()
const router = useRouter()

const store = useSopRunStore()
const llmStore = useLLMModelStore()
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
/** 移动端 StepNav 抽屉是否展开。仅 ≤768px 视口有视觉影响（CSS 控制）。 */
const mobileNavOpen = ref(false)

function toggleMobileNav() {
  mobileNavOpen.value = !mobileNavOpen.value
}
function closeMobileNav() {
  mobileNavOpen.value = false
}

// 抽屉展开时锁 body 滚动（避免抽屉滚到底后透到正文）+ ESC 关闭
watch(mobileNavOpen, (open) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = open ? 'hidden' : ''
})

function handleEscKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && mobileNavOpen.value) {
    e.stopPropagation()
    closeMobileNav()
  }
}

// ===== Trailing chat 流式状态 =====
const chatStreaming = ref(false)
const chatStreamingMessage = ref<ChatBubbleMessage | null>(null)
// 打字机平滑揭示：SSE 追加到 target，UI 读 displayed（通过 watch 同步回 chatStreamingMessage）
// flush: 'sync' 保证 flush() 后的 displayed 能在 message 置 null 前被搬运过去，
// 否则默认 pre-flush 的 watch 会晚于 onDone 里的 null 赋值，用户看不到完整文本的尾巴
const chatThinkingReveal = useTypewriterReveal()
const chatContentReveal = useTypewriterReveal()
watch(
  [chatThinkingReveal.displayed, chatContentReveal.displayed],
  ([thinking, content]) => {
    if (!chatStreamingMessage.value) return
    chatStreamingMessage.value = {
      ...chatStreamingMessage.value,
      thinking,
      content
    }
  },
  { flush: 'sync' }
)
/** 用户刚发送的消息（立即显示，API 持久化前） */
const chatPendingUserMessage = ref<ChatBubbleMessage | null>(null)
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
      } else if (store.completedNodeIds.size > 0) {
        // nextNodeId 为 null → 运行已结束；将 currentStep 设为 totalSteps，
        // 使所有已完成步骤和追问步骤的导航按钮均可点击
        store.setActiveStep(store.totalSteps)
      }
      store.setViewingStep(store.currentStep)
    } else {
      store.enterDraftMode(templateId.value)
      draft.enterDraftMode(templateId.value)

      if (bookmarks.bookmarks.value.length > 0) {
        // 有保存记录 → 提前创建 run，后端自动应用书签
        // ensureRun 内部：创建 run → auto-apply → loadRun 填充 completedNodeIds
        // → setActiveStep 跳转到第一个未完成步骤
        await ensureRun()
      }

      // ensureRun 成功 auto-apply 时已设置步骤位置（completedNodeIds 非空）；
      // 无书签 / auto-apply 未生效 / ensureRun 失败 → 从 step 1 开始
      if (store.completedNodeIds.size === 0) {
        store.setActiveStep(1)
        store.setViewingStep(1)
      }
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
  if (await copyText(text)) {
    notifications.success('已复制到剪贴板')
  } else {
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
  // done-current 态的 primary 按钮：
  //   - 非最后一步 → 推进 currentStep（"下一步"）
  //   - 最后一步 → SOP 完成，返回首页（按钮文案由 SopStepView 的 isFinalStep 切换为"完成"）
  if (store.currentStep >= store.totalSteps) {
    handleBackHome()
    return
  }
  store.advanceCurrentStep()
}

function handleSecondary() {
  // done-current 态的"重新生成" → 走 ConfirmModal
  handleRegenerateClick()
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

  const modelKey = llmStore.getSelectedModelKey('sop')
  const thinking = llmStore.isThinkingEnabled('sop')
  const params = new URLSearchParams()
  if (modelKey) params.set('model_key', modelKey)
  if (thinking) params.set('thinking', '1')
  const qs = params.toString()
  const url = `${resolveApiBaseURL()}/v1/sop/runs/${store.currentRun.id}/nodes/${nodeId}/execute${qs ? '?' + qs : ''}`
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
        // 打字机揭示可能还有尾部未显示，先同步再读取，避免持久化丢尾
        store.flushStreaming()
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
      onError: async (msg) => {
        // 先 flush + 备份 partials（refresh 后 state 可能被改写）
        store.flushStreaming()
        const partialThinking = store.streamingThinking
        const partialContent = store.streamingContent

        // 智能恢复：SSE 流异常终止（useSSEStream 在 reader.read 返回 {done:true}
        // 但未收 event:done 时会触发 onError）的绝大多数情形下，后端其实已经
        // 完成 LLM 调用并 persist 了完整结果。拉 completed_nodes 列表，如果
        // 目标 node 在其中且 output 非空 → 说明后端已成功，静默恢复即可，
        // 不要用错误 toast 吓用户。
        const recovered = await store.recoverNodeRunFromServer(nodeId)
        if (recovered) {
          store.markNodeComplete(nodeId)
          store.clearStreamingState()
          notifications.info('连接中断，已从服务端恢复结果')
          return
        }

        // 后端也没有成功结果——真失败，保存 partial 作为 failed nodeRun 让用户能看到
        if (partialThinking || partialContent) {
          store.setNodeRun(nodeId, {
            id: 0,
            run_id: store.currentRun!.id,
            node_id: nodeId,
            status: 'failed',
            input: text,
            output: partialContent,
            thinking: partialThinking,
            latency_ms: 0,
            started_at: null,
            finished_at: null
          })
        }
        store.clearStreamingState()
        // credits-system Phase 2 Task 2.4：SSE 流 onError 分发积分不足。
        // streamPost 对非 2xx 响应回退到 `HTTP 402: Payment Required`，中文关键字
        // 匹配不到，这里补一条 402 识别规则。真正的 402 body 含 reason 的路径会
        // 走 axios 拦截器（见 App.vue handleInsufficientCredits），SSE 路径只能
        // 拿到 status line，缺失结构化 reason 字段。
        if (
          msg.includes('402') ||
          msg.includes('Payment Required') ||
          msg.includes('Credits.Insufficient') ||
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

  // 立即显示用户消息气泡
  chatPendingUserMessage.value = {
    id: makeTempId(),
    role: 'user',
    content: question
  }

  chatStreaming.value = true
  chatStreamingMessage.value = {
    id: makeTempId(),
    role: 'assistant',
    content: '',
    thinking: ''
  }
  chatThinkingReveal.reset()
  chatContentReveal.reset()

  const body = {
    run_id: store.currentRun.id,
    conversation_id: store.currentRun.conversation_id || '',
    question,
    // 空字符串是合法的 fallback 信号：后端会走"用户偏好 → 系统默认 → 最后一个节点默认配置"
    model_key: llmStore.getSelectedModelKey('sop'),
    deep_thinking: llmStore.isThinkingEnabled('sop'),
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
        chatThinkingReveal.append(chunk)
      },
      onMessage: (chunk) => {
        chatContentReveal.append(chunk)
      },
      onDone: () => {
        // 先 flush 揭示队列尾部，用户短暂看到完整消息再交棒给持久化列表
        chatThinkingReveal.flush()
        chatContentReveal.flush()
        chatStreaming.value = false
        chatStreamingMessage.value = null
        chatPendingUserMessage.value = null
        chatThinkingReveal.reset()
        chatContentReveal.reset()
        // P1-3 fix: trigger TrailingChat reload so just-finished message stays visible
        chatReloadTrigger.value++
      },
      onError: (msg) => {
        chatThinkingReveal.flush()
        chatContentReveal.flush()
        chatStreaming.value = false
        chatStreamingMessage.value = null
        chatPendingUserMessage.value = null
        chatThinkingReveal.reset()
        chatContentReveal.reset()
        notifications.error(msg)
      }
    }
  )
}

function handleChatStop() {
  sseStream.abort()
  chatStreaming.value = false
  chatStreamingMessage.value = null
  chatPendingUserMessage.value = null
  chatThinkingReveal.reset()
  chatContentReveal.reset()
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

  // 进入 SOP 页面时默认开启深度思考
  const modelKey = llmStore.getSelectedModelKey('sop')
  if (!llmStore.isThinkingEnabled('sop')) {
    await llmStore.savePreference('sop', modelKey, true)
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', handleEscKey)
  }
})

onBeforeUnmount(() => {
  if (store.isDraftRun && store.currentRun) {
    draft.cleanupDraft(store.currentRun.id)
  }
  sseStream.abort()
  store.reset()
  if (typeof document !== 'undefined') {
    document.removeEventListener('keydown', handleEscKey)
    // 兜底：组件卸载时强制清掉可能残留的 body lock
    document.body.style.overflow = ''
  }
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
  /* --- background & surface --- */
  --bg: #ffffff; /* 与顶栏一致的纯白底色 */
  --surface: hsl(0, 0%, 100%); /* 生产: 纯白卡片 */
  --surface-hover: hsl(150, 15%, 95%); /* 生产: 悬停态 */
  --surface-tint: hsl(150, 20%, 98%); /* 生产: 淡底色 */

  /* --- text --- */
  --text: hsl(150, 10%, 15%); /* 生产: 深绿近黑 */
  --text-secondary: hsl(150, 10%, 40%); /* 生产: 中灰绿 */
  --text-muted: hsl(150, 10%, 55%); /* 生产: 浅灰绿 */

  /* --- brand / accent (生产 hsl 158 色调) --- */
  --accent: hsl(158, 64%, 50%); /* 生产: 翡翠绿 */
  --accent-hover: hsl(158, 64%, 45%); /* 生产 */
  --accent-soft: hsl(158, 50%, 92%); /* 生产: 浅绿底 */
  --accent-light: hsl(158, 64%, 70%); /* 生产 */
  --accent-link: hsl(158, 64%, 45%); /* 生产 */
  --accent-ultra-soft: hsl(158, 50%, 95%); /* 生产 */
  --primary: hsl(158, 64%, 40%); /* 生产: 主按钮绿 */
  --primary-hover: hsl(158, 64%, 35%); /* 生产 */
  --primary-foreground: hsl(0, 0%, 100%); /* 生产 */

  /* --- borders (生产 hsl 150 灰绿) --- */
  --border: hsl(150, 15%, 85%); /* 生产 */
  --border-light: hsl(150, 15%, 90%); /* 生产 */
  --divider: hsl(150, 10%, 92%); /* 生产 */

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

  /* --- shadow (生产) --- */
  --shadow-sm: 0 1px 3px 0px hsl(150 10% 0% / 0.08), 0 1px 2px -1px hsl(150 10% 0% / 0.08);
  --shadow-md: 0 4px 6px -1px hsl(150 10% 0% / 0.1), 0 2px 4px -1px hsl(150 10% 0% / 0.06);
  --shadow-lg: 0 10px 15px -3px hsl(150 10% 0% / 0.1), 0 4px 6px -2px hsl(150 10% 0% / 0.05);
  --shadow-focus: 0 0 0 4px hsl(158 50% 92% / 0.5);
  --shadow-card: 0 1px 3px 0px hsl(150 10% 0% / 0.08), 0 1px 2px -1px hsl(150 10% 0% / 0.08);

  /* --- font (sans only — mockup γ v2 去掉 serif；mono 用于 MetaFooter 元信息) --- */
  --font-sans:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB',
    'Microsoft YaHei', 'Helvetica Neue', sans-serif; /* 对齐 DESIGN --font-sans */
  --font-mono:
    'JetBrains Mono', SFMono-Regular, Menlo, Monaco, Consolas, monospace; /* 对齐 DESIGN --font-mono — MetaFooter 元信息（耗时 / token / 时间戳）使用 */

  /* --- transitions --- */
  --transition-fast: 150ms ease; /* 对齐 DESIGN --transition-fast */
  --transition-base: 250ms ease; /* 对齐 DESIGN --transition-base */

  /* ==================== v2 布局：body-level 滚动 + sidebar/topbar sticky ====================
   * 从 height:100vh+overflow:hidden（内部 canvas 滚动）改为 min-height:100vh（页面整体滚动）。
   * StepNav 和 TopBar 通过 position:sticky 在 body 滚动时保持可见。
   */
  display: flex;
  flex-direction: row;
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

.right-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

/* ==================== 全屏状态提示（error / empty） ==================== */

.page-status-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
}

.page-status-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary);
}

.page-status-message {
  font-size: 14px;
  color: var(--text-muted);
}

.page-status-action {
  margin-top: 12px;
  padding: 8px 24px;
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s ease;
}

.page-status-action:hover {
  background: var(--primary-hover);
}

/* ==================== 生产环境全屏加载遮罩 ==================== */

.page-loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 20px;
}

.page-loading-spinner {
  display: flex;
  gap: 8px;
}

.page-loading-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: var(--accent);
  animation: page-loading-bounce 1.4s infinite ease-in-out both;
}

.page-loading-dot:nth-child(1) {
  animation-delay: -0.32s;
}

.page-loading-dot:nth-child(2) {
  animation-delay: -0.16s;
}

.page-loading-text {
  font-size: 16px;
  color: var(--text-secondary);
  font-weight: 500;
  font-family: var(--font-sans);
}

@keyframes page-loading-bounce {
  0%,
  80%,
  100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

/* ==================== 移动端：≤768px 适配 ==================== */
/* 桌面端默认隐藏移动端遮罩（mobile-only） */
.mobile-nav-backdrop {
  display: none;
}

@media (max-width: 768px) {
  .sop-run-view-v2 {
    /* StepNav 移动端 position:fixed 已脱离文档流，根容器自然单列 — 但显式声明以提高可读性 */
    flex-direction: column;
    /* 兜底防横向滚动：抽屉滑出时 transform 不应触发 viewport horizontal scroll */
    overflow-x: hidden;
  }

  .right-area {
    /* StepNav 脱离文档流后，right-area 自动 100% */
    width: 100%;
    min-width: 0;
  }

  /* 抽屉打开时的半透明遮罩。点击关抽屉。 */
  .mobile-nav-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: hsl(160 10% 0% / 0.42);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    /* 比 StepNav(z:100) 低一级，但比正文高 */
    z-index: 90;
    animation: mobile-nav-backdrop-in 0.2s ease;
  }

  @keyframes mobile-nav-backdrop-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
}
</style>
