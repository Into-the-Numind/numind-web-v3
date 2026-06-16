<script setup lang="ts">
/**
 * SopStepView — SOP 节点主区视图（F4 + F8 + F11）
 *
 * 职责（F11 扩展）：根据 `status` 渲染不同子组件组合，覆盖 5 个非 trailing
 * 状态（active / draft-first / executing / done-current / done-history）：
 *
 *   - active / draft-first → step header + InputCard（首次输入）
 *   - executing            → step header + InputCard(isExecuting) + OutputCard(streaming)
 *   - done-current         → step header + OutputCard(read-only) + ActionRow(下一步 + 重新生成)
 *   - done-history         → HistoryViewStrip + step header + OutputCard(read-only)
 *
 * 交互：
 *   - InputCard @execute → emit('execute', text) → 父（SOPRunView）owns SSE
 *   - OutputCard @stop   → emit('stop') → 父 useSSEStream.abort()
 *   - OutputCard @toggle-bookmark → 本组件直接调 saveBookmark / removeBookmark（F8 已接）
 *   - OutputCard @copy / @regenerate → emit 上抛，父处理 clipboard / ConfirmModal
 *   - ActionRow @primary / @secondary → emit 上抛，父路由到对应 handler
 *   - HistoryViewStrip @return → store.returnToCurrentTask()
 *
 * 约束：
 *   - destructive 操作（移除书签）必须经 ConfirmModal 二次确认（ui-ux.md 硬规则 4）
 *   - description 为空字符串时不渲染描述行
 *
 * 详见 spec §5.2 / §5.4 + plan F11。
 */
import { computed, ref, watch } from 'vue'
import type { SopNodePublic, ViewingStepStatus } from '@/views/sop/types'
import InputCard from './InputCard.vue'
import OutputCard from './OutputCard.vue'
import ReplayInputCard from './ReplayInputCard.vue'
import ActionRow from './ActionRow.vue'
import HistoryViewStrip from './HistoryViewStrip.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { useSopRunStore } from '@/stores/sopRun'
import { useBookmarks } from '@/views/sop/composables/useBookmarks'
import {
  useInputPersistence,
  type PersistenceScope
} from '@/views/sop/composables/useInputPersistence'
import { saveBookmark, removeBookmark } from '@/api/sop'

const props = defineProps<{
  node: SopNodePublic | null
  status: ViewingStepStatus
  /** Draft 模式下需要 ensureRun（lazy create run before execute / upload） */
  ensureRun?: () => Promise<number | null>
  /** 标签文案：active/draft-first 为"你的输入" */
  inputLabel?: string
  /** 当前 currentStep 用于 done-history 的"返回步骤 N"按钮 */
  currentStep?: number
  /** 当前任务节点名（用于 HistoryViewStrip 的 aria） */
  currentStepName?: string
}>()

const emit = defineEmits<{
  execute: [text: string]
  copy: []
  regenerate: []
  primary: []
  secondary: []
  'return-current': []
  error: [msg: string]
}>()

const store = useSopRunStore()
const bookmarks = useBookmarks()
const inputPersistence = useInputPersistence()

// ===== 输入文本（每个节点独立 v-model） =====
const inputText = ref<string>('')

/**
 * 当前 persistence scope：run 模式优先（currentRun.id），否则 draft 模式（templateId）。
 * 无 templateId / run 时返回 null —— 不持久化。
 */
function currentScope(): PersistenceScope | null {
  const run = store.currentRun
  if (run) return { kind: 'run', runId: run.id }
  const tid = store.template?.id
  if (tid) return { kind: 'draft', templateId: tid }
  return null
}

/** 当前节点在 persistence 中使用的 inputId（字符串化 node.id） */
function currentInputId(): string | null {
  return props.node ? String(props.node.id) : null
}

// 节点切换时：从 persistence 载入该节点上次的草稿（没有则空字符串）。
// 这确保刷新页面后，未执行节点的 textarea 草稿不丢。
watch(
  () => props.node?.id,
  () => {
    const scope = currentScope()
    const inputId = currentInputId()
    if (scope && inputId) {
      inputText.value = inputPersistence.loadInput(scope, inputId)
    } else {
      inputText.value = ''
    }
  },
  { immediate: true }
)

// 输入变化时：写入 persistence（仅在 input 态有效，executing / done 态也无害）
watch(inputText, (value) => {
  const scope = currentScope()
  const inputId = currentInputId()
  if (scope && inputId) {
    inputPersistence.saveInput(scope, inputId, value)
  }
})

// ===== 节点派生 =====

const currentNodeRun = computed(() => {
  const n = props.node
  if (!n) return null
  return store.nodeRuns[n.id] ?? null
})

const hasOutput = computed(() => Boolean(currentNodeRun.value?.output))

const hasBookmark = computed(() =>
  props.node ? bookmarks.hasBookmarkForNode(props.node.id) : false
)

const isExecuting = computed(() => props.status === 'executing')
const isDoneCurrent = computed(() => props.status === 'done-current')
const isDoneHistory = computed(() => props.status === 'done-history')

/**
 * 是否是 SOP 的最后一步：done-current 态下 currentStep 已到达 totalSteps 时为 true。
 * 此时 advanceCurrentStep 无法再推进，primary 按钮改为"完成"触发完成态处理。
 */
const isFinalStep = computed(() => isDoneCurrent.value && store.currentStep >= store.totalSteps)
const isInputState = computed(() => props.status === 'active' || props.status === 'draft-first')

const showHistoryStrip = computed(() => isDoneHistory.value)

const streamingContent = computed(() => store.streamingContent)
const streamingThinking = computed(() => store.streamingThinking)

// ===== Bookmark 二次确认 =====

const showRemoveConfirm = ref(false)
const pendingRemoveBookmarkId = ref<number | null>(null)

async function handleToggleBookmark() {
  const node = props.node
  const run = store.currentRun
  if (!node || !run) return

  if (hasBookmark.value) {
    const existing = bookmarks.getBookmarksForNode(node.id)[0]
    if (!existing) return
    pendingRemoveBookmarkId.value = existing.id
    showRemoveConfirm.value = true
    return
  }

  try {
    await saveBookmark({ run_id: run.id, node_id: node.id })
    await bookmarks.loadBookmarks(run.template_id)
  } catch (err) {
    console.error('[SopStepView] saveBookmark failed', err)
    emit('error', (err as Error)?.message || '保存书签失败')
  }
}

async function confirmRemoveBookmark() {
  const bookmarkId = pendingRemoveBookmarkId.value
  const run = store.currentRun
  pendingRemoveBookmarkId.value = null
  if (!bookmarkId || !run) return
  try {
    await removeBookmark(bookmarkId)
    await bookmarks.loadBookmarks(run.template_id)
  } catch (err) {
    console.error('[SopStepView] removeBookmark failed', err)
    emit('error', (err as Error)?.message || '移除书签失败')
  }
}

function cancelRemoveBookmark() {
  pendingRemoveBookmarkId.value = null
}

// ===== 子组件事件转发 =====

function handleExecute(text: string) {
  // 提交后清除该节点的 persistence 草稿（已进入后端，无需恢复）
  const scope = currentScope()
  const inputId = currentInputId()
  if (scope && inputId) {
    inputPersistence.removeInput(scope, inputId)
  }
  emit('execute', text)
}

function handleCopy() {
  emit('copy')
}

function handleRegenerate() {
  emit('regenerate')
}

function handlePrimary() {
  emit('primary')
}

function handleSecondary() {
  emit('secondary')
}

function handleInputError(msg: string) {
  emit('error', msg)
}

// ===== 视图外部访问 =====
defineExpose({
  inputText,
  setInputText: (v: string) => {
    inputText.value = v
  }
})
</script>

<template>
  <div class="sop-step-view" data-testid="sop-step-view">
    <HistoryViewStrip v-if="showHistoryStrip" />

    <header v-if="node" class="step-header">
      <h2 class="step-header__title">{{ node.name }}</h2>
      <p v-if="node.description" class="step-header__desc">
        {{ node.description }}
      </p>
    </header>

    <!-- Input / Output 互斥切换，带淡入淡出 -->
    <Transition name="sop-fade" mode="out-in">
      <!-- Input 状态（active / draft-first） -->
      <InputCard
        v-if="isInputState && node"
        key="input"
        v-model="inputText"
        :node-id="node.id"
        :run-id="store.currentRun?.id ?? null"
        :ensure-run="ensureRun"
        :label="inputLabel ?? '你的输入'"
        :is-executing="isExecuting"
        @execute="handleExecute"
        @error="handleInputError"
      />

      <!-- Executing 状态下的 streaming OutputCard -->
      <OutputCard
        v-else-if="isExecuting"
        key="streaming"
        :node-run="null"
        state="streaming"
        :streaming-content="streamingContent"
        :streaming-thinking="streamingThinking"
        :has-output="false"
        :has-bookmark="false"
        @copy="handleCopy"
        @regenerate="handleRegenerate"
        @toggle-bookmark="handleToggleBookmark"
      />

      <!-- Read-only（done-current / done-history）：回看输入卡 + AI 输出，作为一个过渡单元 -->
      <div v-else-if="isDoneCurrent || isDoneHistory" key="readonly" class="readonly-stack">
        <ReplayInputCard
          v-if="currentNodeRun"
          :key="node?.id"
          :input="currentNodeRun.input"
          :files="currentNodeRun.files"
        />
        <OutputCard
          :node-run="currentNodeRun"
          state="read-only"
          :has-output="hasOutput"
          :has-bookmark="hasBookmark"
          @toggle-bookmark="handleToggleBookmark"
          @copy="handleCopy"
          @regenerate="handleRegenerate"
        />
      </div>
    </Transition>

    <!-- Action row：done-current 态才渲染
         最后一步时 primary 变为"完成"（触发 SOP 完成态处理），其它步骤为"下一步" -->
    <ActionRow
      v-if="isDoneCurrent"
      :primary="isFinalStep ? { label: '完成' } : { label: '下一步' }"
      :secondary="{ label: '重新生成' }"
      @primary="handlePrimary"
      @secondary="handleSecondary"
    />

    <!-- 移除书签二次确认（ui-ux.md 硬规则 4） -->
    <ConfirmModal
      v-model="showRemoveConfirm"
      title="移除书签"
      message="将移除此节点的书签 · 是否确认？"
      variant="danger"
      confirm-text="移除"
      @confirm="confirmRemoveBookmark"
      @cancel="cancelRemoveBookmark"
    />
  </div>
</template>

<style scoped>
/* SopStepView —— 对齐 mockup 01 .step-header / step layout
 * 使用 .sop-run-view-v2 scope 内的 --font-sans / --text / --space-* token。
 * 说明：22px / 14px 字号按 mockup 硬编码（scope 内无对应 token 变量），属于语义层级。
 */
.sop-step-view {
  display: flex;
  flex-direction: column;
  gap: 40px; /* 组间呼吸（header ↔ card ↔ action）*/
  font-family: var(--font-sans);
  color: var(--text);
  width: 100%;
  max-width: 980px;
  animation: stepFadeIn 0.5s;
}

@keyframes stepFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.step-header {
  padding-bottom: 0;
}

.step-header__title {
  font-family: var(--font-sans);
  font-size: 28px;
  font-weight: 700;
  /* 与 desc 紧贴（同组），由父 gap 负责与下游内容拉开 */
  margin: 0 0 6px;
  color: var(--text);
  display: flex;
  align-items: center;
}

.step-header__desc {
  font-size: 15px;
  line-height: 1.5;
  color: var(--text-secondary);
  margin: 0;
  max-width: 720px;
}

/* Input ↔ Output 切换过渡 */
.sop-fade-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.sop-fade-leave-active {
  transition: opacity 0.15s ease;
}
.sop-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.sop-fade-leave-to {
  opacity: 0;
}

/* 只读态：回看输入卡 + AI 输出卡纵向堆叠（done-current / done-history） */
.readonly-stack {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

/* ==================== 移动端：≤768px ==================== */
@media (max-width: 768px) {
  .sop-step-view {
    /* 桌面 40px → 移动 24px，让 header / card / action 三段更紧凑 */
    gap: 24px;
  }

  .step-header__title {
    /* 桌面 28px → 移动 22px，避免长标题占满整屏垂直空间 */
    font-size: 22px;
    margin-bottom: 4px;
    /* h2 在 SopStepView 原 CSS 里是 display:flex；移动端窄宽下让标题可以换行 */
    flex-wrap: wrap;
    /* 防极长无空格 token（如英文 URL / 模板编号）撑破容器 */
    overflow-wrap: anywhere;
  }

  .step-header__desc {
    font-size: 14px;
    /* 移除桌面 max-width:720px 限制（移动端容器本就窄） */
    max-width: 100%;
  }
}
</style>
