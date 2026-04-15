<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft,
  Plus,
  Trash2,
  MessageSquare,
  ArrowUp,
  Send,
  Square,
  Paperclip,
  X,
  FileText,
  Loader2
} from 'lucide-vue-next'
import { useChatbotStore } from '@/stores/chatbot'
import { useLLMModelStore } from '@/stores/llmModel'
import { useAutoScroll } from '@/composables/useAutoScroll'
import { useMarkdown } from '@/composables/useMarkdown'
import { useDocUpload } from '@/composables/useDocUpload'
import { useTypewriterReveal } from '@/composables/useTypewriterReveal'
import ThinkingBlock from '@/components/sales/ThinkingBlock.vue'
import ModelSelector from '@/components/common/ModelSelector.vue'

const route = useRoute()
const router = useRouter()
const store = useChatbotStore()
const { render } = useMarkdown()

// ==================== State ====================
const chatbotId = computed(() => Number(route.params.id))
const draftText = ref('')
const isComposing = ref(false)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const chatContainerRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const sidebarOpen = ref(false)
const pageLoading = ref(true)
const deleteConfirmId = ref<number | null>(null)
const isDragging = ref(false)
const docUpload = useDocUpload()

// ==================== Computed ====================
const chatbotSessions = computed(() =>
  store.sessions.filter((s) => s.chatbot_id === chatbotId.value)
)

const canSend = computed(() => {
  const hasText = draftText.value.trim().length > 0
  const hasSuccessfulUploads = docUpload.items.value.some((i) => i.status === 'success')
  return (hasText || hasSuccessfulUploads) && !store.streaming
})

// ==================== Typewriter Reveal ====================
// 对齐 SOP 的 SSE 渲染方案：后端每 ~250ms burst 推送 ~13 字符，直接渲染会被
// 肉眼感知为掉帧/卡顿。reveal 层由 rAF 驱动以固定 80 cps 搬字，产生连续流动感。
const contentReveal = useTypewriterReveal()
const thinkingReveal = useTypewriterReveal()

watch(
  () => store.streamContent,
  (next, prev) => {
    if (!next) {
      contentReveal.reset()
      return
    }
    if (prev && next.startsWith(prev)) {
      contentReveal.append(next.slice(prev.length))
    } else {
      contentReveal.reset(next)
    }
  }
)

watch(
  () => store.streamThinkingContent,
  (next, prev) => {
    if (!next) {
      thinkingReveal.reset()
      return
    }
    if (prev && next.startsWith(prev)) {
      thinkingReveal.append(next.slice(prev.length))
    } else {
      thinkingReveal.reset(next)
    }
  }
)

watch(
  () => store.streaming,
  (streaming, was) => {
    if (was && !streaming) {
      contentReveal.flush()
      thinkingReveal.flush()
    }
  }
)

// ==================== Auto Scroll ====================
const { smartScrollToBottom, onScroll, showScrollButton, handleScrollToBottomClick } =
  useAutoScroll(chatContainerRef)

watch(
  () =>
    [store.messages.length, contentReveal.displayed.value, thinkingReveal.displayed.value] as const,
  () => {
    requestAnimationFrame(() => smartScrollToBottom())
  }
)

// ==================== Textarea Auto Resize ====================
function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}

watch(draftText, () => nextTick(autoResize))

// ==================== Actions ====================
function goHome() {
  router.push('/')
}

async function createNewSession() {
  const session = await store.createSession(chatbotId.value)
  if (session) {
    sidebarOpen.value = false
    nextTick(() => textareaRef.value?.focus())
  }
}

async function switchToSession(session: (typeof store.sessions)[0]) {
  await store.switchSession(session)
  sidebarOpen.value = false
  nextTick(() => {
    if (chatContainerRef.value) {
      chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight
    }
    textareaRef.value?.focus()
  })
}

function confirmDelete(id: number) {
  deleteConfirmId.value = id
}

async function doDelete(id: number) {
  deleteConfirmId.value = null
  await store.deleteSession(id)
  // If no sessions left for this chatbot, auto-create one
  const remaining = store.sessions.filter((s) => s.chatbot_id === chatbotId.value)
  if (remaining.length === 0) {
    await store.createSession(chatbotId.value)
  } else if (!store.currentSession) {
    await store.switchSession(remaining[0])
  }
}

function cancelDelete() {
  deleteConfirmId.value = null
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

const uploadWarning = ref('')

async function handleFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    const result = await docUpload.handleFiles(input.files)
    showUploadWarning(result)
  }
  // Reset so same file can be re-selected
  input.value = ''
}

function showUploadWarning(result: { rejected: number; reason: 'limit' | null }) {
  if (result.rejected > 0 && result.reason === 'limit') {
    uploadWarning.value = `最多上传 5 个附件，已忽略 ${result.rejected} 个文件`
    setTimeout(() => {
      uploadWarning.value = ''
    }, 3000)
  }
}

async function handleDrop(e: DragEvent) {
  isDragging.value = false
  const droppedFiles = e.dataTransfer?.files
  if (droppedFiles && droppedFiles.length > 0) {
    const result = await docUpload.handleFiles(droppedFiles)
    showUploadWarning(result)
  }
}

function handleSend() {
  if (!canSend.value) return
  const text = docUpload.compose(draftText.value.trim())
  draftText.value = ''
  docUpload.clearItems()
  nextTick(autoResize)
  store.sendMessage(text)
}

function handleKeydown(e: KeyboardEvent) {
  if (isComposing.value) return
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

async function handlePaste(e: ClipboardEvent) {
  const clipboardFiles = e.clipboardData?.files
  if (clipboardFiles && clipboardFiles.length > 0) {
    e.preventDefault()
    const result = await docUpload.handleFiles(clipboardFiles)
    showUploadWarning(result)
  }
}

function handleStopStream() {
  store.cancelStream()
}

// ==================== Attachment display helpers ====================
// compose() 可能产生带或不带前导换行的分隔符，两种情况都要剥离解析正文
const ATTACHMENT_MARKER = '---附件内容---'

function getDisplayText(content: string): string {
  const idx = content.indexOf(ATTACHMENT_MARKER)
  return idx === -1 ? content : content.slice(0, idx).trim()
}

function getAttachmentNames(content: string): string[] {
  const sepIdx = content.indexOf(ATTACHMENT_MARKER)
  if (sepIdx === -1) return []
  const section = content.slice(sepIdx)
  return Array.from(section.matchAll(/【(.+?)】/g), (m) => m[1])
}

// ==================== Lifecycle ====================
onMounted(async () => {
  document.body.classList.add('chatbot-chat-route')

  // 每次进入智能体页面，强制开启深度思考
  const llmStore = useLLMModelStore()
  await llmStore.fetchModels()
  await llmStore.fetchPreferences()
  const modelKey = llmStore.getSelectedModelKey('chatbot')
  if (!llmStore.isThinkingEnabled('chatbot')) {
    await llmStore.savePreference('chatbot', modelKey, true)
  }

  // Fetch all sessions, then filter for this chatbot
  await store.fetchSessions()

  const sessions = store.sessions.filter((s) => s.chatbot_id === chatbotId.value)

  if (sessions.length === 0) {
    // Auto-create first session
    await store.createSession(chatbotId.value)
  } else {
    // Select most recent session
    const sorted = [...sessions].sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
    await store.switchSession(sorted[0])
  }

  pageLoading.value = false

  nextTick(() => {
    if (chatContainerRef.value) {
      chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight
    }
    textareaRef.value?.focus()
  })
})

onBeforeUnmount(() => {
  document.body.classList.remove('chatbot-chat-route')
  contentReveal.dispose()
  thinkingReveal.dispose()
  store.cleanup()
})
</script>

<template>
  <div class="chatbot-view">
    <!-- Loading state -->
    <div v-if="pageLoading" class="page-loading">
      <div class="loading-spinner" />
      <div class="loading-text">加载中...</div>
    </div>

    <div v-else class="app-container">
      <!-- Sidebar -->
      <aside class="sidebar" :class="{ 'mobile-open': sidebarOpen }">
        <!-- 返回首页 -->
        <button type="button" class="nav__back" @click="goHome">
          <ArrowLeft :size="16" aria-hidden="true" />
          <span>返回首页</span>
        </button>

        <button class="new-chat-btn" @click="createNewSession">
          <Plus :size="18" />
          <span>新对话</span>
        </button>
        <div class="sessions-list">
          <div
            v-for="session in chatbotSessions"
            :key="session.id"
            class="session-item"
            :class="{ active: store.currentSession?.id === session.id }"
            @click="switchToSession(session)"
          >
            <MessageSquare :size="16" />
            <span class="session-title">{{ session.title || '新对话' }}</span>
            <button
              class="session-delete-btn"
              title="删除会话"
              @click.stop="confirmDelete(session.id)"
            >
              <Trash2 :size="14" />
            </button>
          </div>
          <div v-if="chatbotSessions.length === 0" class="sessions-empty">暂无对话</div>
        </div>
      </aside>

      <!-- Sidebar Overlay (Mobile) -->
      <div class="sidebar-overlay" :class="{ show: sidebarOpen }" @click="sidebarOpen = false" />

      <!-- Main Chat Area -->
      <main class="main-stage">
        <!-- Header -->
        <div class="chat-header">
          <button class="sidebar-toggle" @click="sidebarOpen = !sidebarOpen">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div class="header-title">{{ store.currentSession?.title || '新对话' }}</div>
        </div>

        <!-- Chat Messages -->
        <div class="chat-wrapper">
          <div ref="chatContainerRef" class="chat-messages" @scroll="onScroll">
            <!-- Messages Loading -->
            <div v-if="store.messagesLoading" class="messages-loading">
              <div class="loading-spinner small" />
            </div>

            <!-- Empty state -->
            <div v-else-if="store.messages.length === 0 && !store.streaming" class="chat-empty">
              <div class="empty-icon">
                <Send :size="32" />
              </div>
              <div class="empty-text">发送消息开始对话</div>
            </div>

            <!-- Messages -->
            <template v-else>
              <div class="messages-container">
                <div v-for="msg in store.messages" :key="msg.id" class="message" :class="msg.role">
                  <div class="message-bubble" :class="msg.role">
                    <!-- Thinking block for assistant messages -->
                    <ThinkingBlock
                      v-if="msg.role === 'assistant' && msg.thinking"
                      :content="msg.thinking"
                      :finished="true"
                    />
                    <div v-if="msg.role === 'assistant'" v-html="render(msg.content)"></div>
                    <template v-else>
                      <span v-if="getDisplayText(msg.content)" class="msg-text">{{
                        getDisplayText(msg.content)
                      }}</span>
                      <div
                        v-if="getAttachmentNames(msg.content).length > 0"
                        class="msg-attachments"
                        :class="{ 'no-text': !getDisplayText(msg.content) }"
                      >
                        <span
                          v-for="name in getAttachmentNames(msg.content)"
                          :key="name"
                          class="msg-attachment-card"
                        >
                          <FileText :size="16" class="msg-attachment-icon" />
                          <span class="msg-attachment-meta">
                            <span class="msg-attachment-name" :title="name">{{ name }}</span>
                            <span class="msg-attachment-kind">附件</span>
                          </span>
                        </span>
                      </div>
                    </template>
                  </div>
                </div>

                <!-- Streaming message -->
                <div v-if="store.streaming" class="message assistant">
                  <!-- Status indicator -->
                  <div
                    v-if="
                      store.streamStatus &&
                      !contentReveal.displayed.value &&
                      !thinkingReveal.displayed.value
                    "
                    class="stream-status"
                  >
                    <div class="status-dot" />
                    <span>{{ store.streamStatus }}</span>
                  </div>

                  <!-- Streaming bubble (thinking + content) -->
                  <div
                    v-if="thinkingReveal.displayed.value || contentReveal.displayed.value"
                    class="message-bubble assistant"
                  >
                    <ThinkingBlock
                      v-if="thinkingReveal.displayed.value"
                      :content="thinkingReveal.displayed.value"
                      :finished="false"
                    />
                    <div
                      v-if="contentReveal.displayed.value"
                      v-html="render(contentReveal.displayed.value)"
                    />
                  </div>

                  <!-- Typing indicator (no content yet, no status) -->
                  <div
                    v-if="
                      !contentReveal.displayed.value &&
                      !thinkingReveal.displayed.value &&
                      !store.streamStatus
                    "
                    class="typing-indicator"
                  >
                    <span class="dot" />
                    <span class="dot" />
                    <span class="dot" />
                  </div>
                </div>

                <!-- Stream error -->
                <div v-if="store.streamError && !store.streaming" class="stream-error">
                  <span>{{ store.streamError }}</span>
                </div>
              </div>
            </template>

            <!-- Scroll to bottom button -->
            <button
              v-if="showScrollButton"
              class="scroll-to-bottom-btn"
              @click="handleScrollToBottomClick"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Input Area -->
        <div v-if="store.currentSession" class="input-stage">
          <div
            class="input-floating-container"
            :class="{ 'drag-over': isDragging }"
            @dragover.prevent="isDragging = true"
            @dragenter.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="handleDrop"
          >
            <!-- Hidden file input -->
            <input
              ref="fileInputRef"
              type="file"
              accept=".txt,.md,.pdf,.doc,.docx"
              multiple
              style="display: none"
              @change="handleFileInputChange"
            />

            <textarea
              ref="textareaRef"
              v-model="draftText"
              class="chat-input"
              placeholder="输入消息..."
              @keydown="handleKeydown"
              @paste="handlePaste"
              @compositionstart="isComposing = true"
              @compositionend="isComposing = false"
              @input="autoResize"
            />

            <!-- Attachment preview strip -->
            <div v-if="docUpload.items.value.length > 0" class="attachment-strip">
              <div
                v-for="item in docUpload.items.value"
                :key="item.localId"
                class="attachment-item"
                :class="item.status"
              >
                <FileText :size="14" class="attachment-icon" />
                <span class="attachment-name" :title="item.error || item.fileName">{{
                  item.fileName
                }}</span>
                <Loader2 v-if="item.status === 'uploading'" :size="14" class="u-spin" />
                <button
                  v-else
                  class="attachment-remove"
                  @click="docUpload.removeItem(item.localId)"
                >
                  <X :size="12" />
                </button>
              </div>
            </div>

            <!-- Upload warning -->
            <div v-if="uploadWarning" class="upload-warning">{{ uploadWarning }}</div>

            <div class="input-toolbar">
              <div class="toolbar-left">
                <button
                  class="toolbar-icon-btn"
                  title="上传附件"
                  :disabled="docUpload.isUploading.value"
                  @click="triggerFileInput"
                >
                  <Paperclip :size="18" />
                </button>
                <ModelSelector feature="chatbot" />
              </div>
              <div class="toolbar-right">
                <button
                  v-if="store.streaming"
                  class="stop-btn"
                  title="停止"
                  @click="handleStopStream"
                >
                  <Square :size="16" />
                </button>
                <button v-else class="send-btn" :disabled="!canSend" @click="handleSend">
                  <ArrowUp :size="20" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <div v-if="deleteConfirmId !== null" class="modal-overlay" @click.self="cancelDelete">
        <div class="modal-dialog">
          <div class="modal-title">删除对话</div>
          <div class="modal-desc">确定删除这个对话吗？删除后无法恢复。</div>
          <div class="modal-actions">
            <button class="modal-btn secondary" @click="cancelDelete">取消</button>
            <button class="modal-btn danger" @click="doDelete(deleteConfirmId!)">删除</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<!-- Unscoped: route-level overrides (use variables.css as base) -->
<style>
body.chatbot-chat-route {
  --sidebar-width: 260px;
  --text-light: var(--text-muted);

  margin: 0;
  padding: 0;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--text);
}

body.chatbot-chat-route #app {
  height: 100%;
}
</style>

<style scoped>
.chatbot-view {
  width: 100%;
  height: 100%;
}

.app-container {
  display: flex;
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--bg);
}

/* ===== Page Loading ===== */
.page-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: var(--text-muted);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-light);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}

.loading-spinner.small {
  width: 24px;
  height: 24px;
  border-width: 2px;
  margin-bottom: 0;
}

.loading-text {
  font-size: 14px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ===== Back Button (in sidebar) ===== */
.nav__back {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px;
  margin: 0 12px 8px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: hsl(160, 18%, 52%);
  font-size: 14px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
  transition:
    color 200ms ease,
    background 200ms ease;
}

.nav__back:hover {
  color: hsl(160, 40%, 36%);
  background: hsla(160, 45%, 50%, 0.1);
}

/* ===== Sidebar ===== */
.sidebar {
  width: var(--sidebar-width);
  height: 100%;
  background: hsla(160, 30%, 96%, 0.65);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  border-right: 1px solid hsla(160, 20%, 88%, 0.5);
  display: flex;
  flex-direction: column;
  z-index: 10;
  padding-top: 16px;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.new-chat-btn {
  margin: 0 12px 12px;
  padding: 12px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  color: var(--primary);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: var(--shadow-sm);
  font-size: 0.9rem;
}

.new-chat-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px;
}

.sessions-empty {
  text-align: center;
  color: var(--text-light);
  font-size: 0.85rem;
  padding: 24px 0;
}

.session-item {
  padding: 12px;
  margin-bottom: 4px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.session-item:hover {
  background: hsla(160, 45%, 50%, 0.1);
  color: var(--text);
}

.session-item.active {
  background: hsla(160, 50%, 50%, 0.14);
  color: var(--primary);
  font-weight: 600;
}

.session-title {
  font-size: 0.9rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.session-delete-btn {
  flex-shrink: 0;
  background: transparent;
  border: none;
  color: var(--text-muted);
  opacity: 0;
  padding: 4px;
  cursor: pointer;
  transition: all 0.2s;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.session-item:hover .session-delete-btn {
  opacity: 1;
}

.session-delete-btn:hover {
  color: #dc2626;
  background: rgba(220, 38, 38, 0.08);
}

/* ===== Sidebar Overlay (Mobile) ===== */
.sidebar-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 5;
}

.sidebar-overlay.show {
  display: block;
  touch-action: none;
}

/* ===== Main Stage ===== */
.main-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* ===== Chat Header ===== */
.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-bottom: 1px solid transparent;
  background: transparent;
}

.sidebar-toggle {
  display: none;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.2s;
}

.sidebar-toggle:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.header-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== Chat Wrapper ===== */
.chat-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 32px;
  scroll-behavior: auto;
  position: relative;
}

.chat-messages::-webkit-scrollbar {
  width: 6px;
}

.chat-messages::-webkit-scrollbar-track {
  background: transparent;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.2);
}

.messages-loading {
  display: flex;
  justify-content: center;
  padding: 40px;
}

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: var(--text-light);
}

.empty-icon {
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-text {
  font-size: 0.95rem;
}

.messages-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-width: 800px;
  margin: 0 auto;
  padding-bottom: 20px;
}

/* ===== Messages ===== */
.message {
  display: flex;
  flex-direction: column;
}

.message.user {
  align-items: flex-end;
}

.message.assistant {
  align-items: flex-start;
}

.message-bubble {
  max-width: 85%;
  padding: 12px 16px;
  border-radius: 16px;
  line-height: 1.6;
  font-size: 0.95rem;
  word-break: break-word;
}

.message-bubble.user {
  background: var(--primary);
  color: white;
  border-bottom-right-radius: 4px;
}

/* ===== User Bubble Attachment Cards ===== */
/* 与 composer 的 .attachment-item 视觉同源：文档图标 + 文件名 + 次级标签
   适配 primary 绿底：用白色半透明卡片承载文本 */
.msg-text {
  white-space: pre-wrap;
}

.msg-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.22);
}

.msg-attachments.no-text {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.msg-attachment-card {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 6px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.28);
  max-width: 220px;
  transition: background 0.15s ease;
}

.msg-attachment-card:hover {
  background: rgba(255, 255, 255, 0.22);
}

.msg-attachment-icon {
  flex-shrink: 0;
  opacity: 0.92;
}

.msg-attachment-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.2;
}

.msg-attachment-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msg-attachment-kind {
  font-size: 11px;
  opacity: 0.72;
  margin-top: 2px;
}

.message-bubble.assistant {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border-light);
  border-bottom-left-radius: 4px;
  box-shadow: var(--shadow-sm);
  font-size: 14px;
  line-height: var(--line-height-relaxed, 1.75);
}

/* Markdown content styling inside assistant bubbles — aligned with SOP prose */
.message-bubble.assistant :deep(h1),
.message-bubble.assistant :deep(h2),
.message-bubble.assistant :deep(h3),
.message-bubble.assistant :deep(h4),
.message-bubble.assistant :deep(h5),
.message-bubble.assistant :deep(h6) {
  font-family: var(--font-sans);
  margin-top: var(--space-xl, 24px);
  margin-bottom: var(--space-md, 12px);
  font-weight: 600;
  color: var(--text);
  line-height: var(--line-height-tight, 1.25);
}

.message-bubble.assistant :deep(h1) {
  font-size: 28px;
}

.message-bubble.assistant :deep(h2) {
  font-size: 22px;
}

.message-bubble.assistant :deep(h3) {
  font-size: 18px;
}

.message-bubble.assistant :deep(h4) {
  font-size: 16px;
}

.message-bubble.assistant :deep(p) {
  margin: var(--space-md, 12px) 0;
}

.message-bubble.assistant :deep(p:last-child) {
  margin-bottom: 0;
}

.message-bubble.assistant :deep(ul),
.message-bubble.assistant :deep(ol) {
  margin: var(--space-md, 12px) 0;
  padding-left: 28px;
}

.message-bubble.assistant :deep(li) {
  margin: var(--space-xs, 4px) 0;
}

.message-bubble.assistant :deep(strong) {
  font-weight: 600;
  color: var(--text);
}

.message-bubble.assistant :deep(em) {
  font-style: italic;
}

.message-bubble.assistant :deep(code) {
  background-color: hsl(150, 10%, 92%);
  padding: 2px 6px;
  border-radius: var(--radius-sm, 4px);
  font-family: var(--font-mono, 'SF Mono', Monaco, Consolas, monospace);
  font-size: 13px;
  color: hsl(158, 64%, 40%);
  border: 1px solid hsl(150, 15%, 90%);
}

.message-bubble.assistant :deep(pre) {
  background-color: hsl(150, 10%, 92%);
  padding: var(--space-lg, 16px);
  border-radius: var(--radius-md, 8px);
  overflow-x: auto;
  margin: var(--space-lg, 16px) 0;
  border: 1px solid hsl(150, 15%, 90%);
}

.message-bubble.assistant :deep(pre code) {
  background-color: transparent;
  padding: 0;
  color: inherit;
  border: none;
}

.message-bubble.assistant :deep(blockquote) {
  border-left: 4px solid hsl(158, 64%, 40%);
  padding-left: var(--space-lg, 16px);
  margin: var(--space-lg, 16px) 0;
  color: hsl(150, 10%, 40%);
  font-style: italic;
}

.message-bubble.assistant :deep(hr) {
  border: none;
  border-top: 1px solid var(--divider, var(--border-light));
  margin: var(--space-xl, 24px) 0;
}

.message-bubble.assistant :deep(a) {
  color: var(--primary);
  text-decoration: none;
}

.message-bubble.assistant :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: var(--space-lg, 16px) 0;
}

.message-bubble.assistant :deep(th),
.message-bubble.assistant :deep(td) {
  border: 1px solid var(--border);
  padding: var(--space-sm, 8px) var(--space-md, 12px);
  text-align: left;
}

.message-bubble.assistant :deep(th) {
  background-color: var(--surface-tint, var(--surface-hover));
  font-weight: 600;
}

/* ===== Streaming States ===== */
.stream-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--surface);
  border-radius: 12px;
  font-size: 0.85rem;
  color: var(--text-muted);
  border: 1px solid var(--border-light);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.4;
  }
  50% {
    opacity: 1;
  }
}

.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: 16px;
  border-bottom-left-radius: 4px;
}

.typing-indicator .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-light);
  animation: typing 1.4s ease-in-out infinite;
}

.typing-indicator .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

.stream-error {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(239, 68, 68, 0.08);
  color: #dc2626;
  padding: 10px 16px;
  border-radius: 12px;
  font-size: 0.9rem;
  border: 1px solid rgba(239, 68, 68, 0.15);
  max-width: 85%;
}

/* ===== Scroll to Bottom ===== */
.scroll-to-bottom-btn {
  position: sticky;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-muted);
  margin: 0 auto;
}

.scroll-to-bottom-btn:hover {
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  color: var(--primary);
}

/* ===== Input Area ===== */
.input-stage {
  padding: 12px 32px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  z-index: 20;
}

.input-floating-container {
  width: 100%;
  max-width: 800px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 20px;
  padding: 16px;
  box-shadow: 0 4px 12px rgba(37, 167, 105, 0.05);
  border: 1px solid rgba(37, 167, 105, 0.3);
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
}

.input-floating-container:focus-within {
  box-shadow:
    0 8px 24px rgba(37, 167, 105, 0.12),
    0 0 0 2px rgba(37, 167, 105, 0.15);
  border-color: rgba(37, 167, 105, 0.6);
}

.chat-input {
  width: 100%;
  border: none;
  background: transparent;
  padding: 10px 0;
  font-size: 1rem;
  resize: none;
  min-height: 44px;
  max-height: 160px;
  color: var(--text);
  line-height: 24px;
  overflow-y: auto;
  font-family: inherit;
}

.chat-input:focus {
  outline: none;
}

.chat-input::placeholder {
  color: var(--text-muted);
}

.input-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.send-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), var(--accent));
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 8px rgba(37, 167, 105, 0.3);
}

.send-btn:hover {
  background: linear-gradient(135deg, var(--accent), var(--primary));
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(37, 167, 105, 0.4);
}

.send-btn:disabled {
  background: #ccc;
  box-shadow: none;
  cursor: not-allowed;
  opacity: 0.6;
}

.stop-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ef4444;
  cursor: pointer;
  transition: all 0.2s;
}

.stop-btn:hover {
  background: rgba(239, 68, 68, 0.15);
}

/* ===== Delete Modal ===== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-dialog {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xl);
  padding: 36px;
  width: 90%;
  max-width: 380px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.12);
  animation: dialog-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dialog-pop {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 8px;
}

.modal-desc {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 24px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.modal-btn {
  padding: 10px 24px;
  border-radius: 12px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.modal-btn.secondary {
  background: var(--surface-hover);
  color: var(--text-secondary);
}

.modal-btn.secondary:hover {
  background: var(--border-light);
}

.modal-btn.danger {
  background: #ef4444;
  color: white;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
}

.modal-btn.danger:hover {
  background: #dc2626;
}

/* ===== Attachments ===== */
.attachment-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  font-size: 13px;
  background: hsla(160, 30%, 96%, 0.8);
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  max-width: 200px;
}

.attachment-item.error {
  background: rgba(239, 68, 68, 0.06);
  border-color: rgba(239, 68, 68, 0.2);
  color: #dc2626;
}

.attachment-item.success {
  background: hsla(160, 40%, 96%, 0.9);
  border-color: hsla(160, 40%, 80%, 0.5);
}

.attachment-icon {
  flex-shrink: 0;
}

.attachment-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.attachment-remove {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  transition: all 0.15s;
}

.attachment-remove:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--text);
}

.toolbar-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s;
}

.toolbar-icon-btn:hover {
  background: hsla(160, 40%, 50%, 0.1);
  color: var(--primary);
}

.toolbar-icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.input-floating-container.drag-over {
  border-color: var(--primary);
  box-shadow:
    0 0 0 2px rgba(37, 167, 105, 0.2),
    0 8px 24px rgba(37, 167, 105, 0.12);
}

.upload-warning {
  font-size: 12px;
  color: #d97706;
  padding: 4px 0;
}

/* ===== Mobile ===== */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 280px;
    transform: translateX(-100%);
    z-index: 25;
    background: hsla(160, 30%, 96%, 0.95);
    backdrop-filter: blur(24px) saturate(1.4);
    -webkit-backdrop-filter: blur(24px) saturate(1.4);
    padding-top: 60px;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.1);
  }

  .sidebar.mobile-open {
    transform: translateX(0);
  }

  .session-delete-btn {
    opacity: 1;
  }

  .sidebar-toggle {
    display: flex;
  }

  .chat-messages {
    padding: 16px;
  }

  .messages-container {
    gap: 16px;
  }

  .input-stage {
    padding: 8px 16px 16px;
  }

  .input-floating-container {
    border-radius: 16px;
    padding: 12px;
  }
}
</style>
