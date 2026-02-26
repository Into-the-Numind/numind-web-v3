<template>
  <div class="sales-view">
    <!-- Home button -->
    <a href="/" class="back-to-home-btn" title="返回首页" @click.prevent="goHome">
      <Home :size="18" />
    </a>

    <div class="app-container">
      <!-- Sidebar -->
      <SessionSidebar
        @new-chat="showNewChatModal = true"
        @rename="openRenameModal"
        @delete="openDeleteModal"
      />

      <!-- Sidebar Overlay (Mobile) -->
      <div
        class="sidebar-overlay"
        :class="{ show: sidebarOpen }"
        @click="sidebarOpen = false"
      />

      <!-- Main Stage -->
      <main class="main-stage">
        <MainHeader
          :title="store.currentSession?.title || '新对话'"
          :show-config-buttons="store.hasCurrentSession"
          @open-kb="showKbModal = true"
          @open-profile="showProfileModal = true"
          @open-chat-style="showChatStyleModal = true"
          @toggle-sidebar="sidebarOpen = !sidebarOpen"
        />

        <!-- Chat Area -->
        <ChatArea
          @show-citations="openCitationModal"
          @preview-image="openImagePreview"
        />

        <!-- Input Area -->
        <InputArea
          v-if="store.hasCurrentSession"
          @preview-image="openImagePreview"
        />

        <!-- Start chat prompt when no session -->
        <div v-if="!store.hasCurrentSession && !store.messagesLoading" class="start-chat-container">
          <button class="btn-primary start-chat-btn" @click="showNewChatModal = true">
            <Plus :size="18" />
            <span>创建新对话</span>
          </button>
        </div>
      </main>
    </div>

    <!-- Modals -->
    <NewChatModal
      :open="showNewChatModal"
      @close="showNewChatModal = false"
      @submit="handleNewChat"
    />

    <RenameSessionModal
      :open="showRenameModal"
      :session-id="renameTarget.id"
      :current-title="renameTarget.title"
      @close="showRenameModal = false"
      @confirm="handleRename"
    />

    <DeleteSessionModal
      :open="showDeleteModal"
      :session-id="deleteTargetId"
      @close="showDeleteModal = false"
      @confirm="handleDelete"
    />

    <ProfileModal
      :open="showProfileModal"
      @close="showProfileModal = false"
    />

    <KbModal
      :open="showKbModal"
      @close="showKbModal = false"
    />

    <ChatStyleModal
      :open="showChatStyleModal"
      @close="showChatStyleModal = false"
    />

    <CitationModal
      :open="showCitationModal"
      :citations="citationModalData"
      @close="showCitationModal = false"
    />

    <ImagePreviewModal
      :open="showImagePreview"
      :image-url="imagePreviewUrl"
      @close="showImagePreview = false"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { Home, Plus } from 'lucide-vue-next'
import { useSalesStore } from '@/stores/sales'
import type { Citation } from '@/api/sales'

// Components
import SessionSidebar from '@/components/sales/SessionSidebar.vue'
import MainHeader from '@/components/sales/MainHeader.vue'
import ChatArea from '@/components/sales/ChatArea.vue'
import InputArea from '@/components/sales/InputArea.vue'
import NewChatModal from '@/components/sales/NewChatModal.vue'
import RenameSessionModal from '@/components/sales/RenameSessionModal.vue'
import DeleteSessionModal from '@/components/sales/DeleteSessionModal.vue'
import ProfileModal from '@/components/sales/modals/ProfileModal.vue'
import KbModal from '@/components/sales/modals/KbModal.vue'
import ChatStyleModal from '@/components/sales/modals/ChatStyleModal.vue'
import CitationModal from '@/components/sales/CitationModal.vue'
import ImagePreviewModal from '@/components/sales/ImagePreviewModal.vue'

const router = useRouter()
const store = useSalesStore()

// ==================== Sidebar ====================
const sidebarOpen = ref(false)

// ==================== Modal State ====================
const showNewChatModal = ref(false)
const showRenameModal = ref(false)
const showDeleteModal = ref(false)
const showProfileModal = ref(false)
const showKbModal = ref(false)
const showChatStyleModal = ref(false)
const showCitationModal = ref(false)
const showImagePreview = ref(false)

const renameTarget = reactive({ id: null as number | null, title: '' })
const deleteTargetId = ref<number | null>(null)
const citationModalData = ref<Citation[]>([])
const imagePreviewUrl = ref('')

// ==================== Navigation ====================
function goHome() {
  router.push('/')
}

// ==================== Modal Handlers ====================
function openRenameModal(id: number, title: string) {
  renameTarget.id = id
  renameTarget.title = title
  showRenameModal.value = true
}

function openDeleteModal(id: number) {
  deleteTargetId.value = id
  showDeleteModal.value = true
}

function openCitationModal(citations: Citation[]) {
  citationModalData.value = citations
  showCitationModal.value = true
}

function openImagePreview(url: string) {
  imagePreviewUrl.value = url
  showImagePreview.value = true
}

// ==================== Session Actions ====================
async function handleNewChat(name: string) {
  showNewChatModal.value = false
  const sessionId = await store.createSession(name)
  if (sessionId) {
    await store.switchSession(sessionId, true)
  }
}

async function handleRename(id: number, newTitle: string) {
  showRenameModal.value = false
  await store.renameSession(id, newTitle)
}

async function handleDelete(id: number) {
  showDeleteModal.value = false
  await store.deleteSession(id)
}

// ==================== Lifecycle ====================
onMounted(async () => {
  document.body.classList.add('sales-agent-route')

  // Load sessions
  await store.loadSessions()

  // Restore session from URL
  const urlParams = new URLSearchParams(window.location.search)
  const sessionIdParam = urlParams.get('session_id')

  if (sessionIdParam) {
    const sessionId = parseInt(sessionIdParam, 10)
    if (!isNaN(sessionId) && store.sessions.some((s) => s.id === sessionId)) {
      await store.switchSession(sessionId)
    } else if (store.sortedSessions.length > 0) {
      // If session_id in URL is invalid, switch to first available session
      await store.switchSession(store.sortedSessions[0].id)
    }
  } else if (store.sortedSessions.length > 0) {
    // Auto-select the first session that has messages (or first available)
    const sessionsWithMessages = store.sortedSessions.filter((s) => s.messageCount > 0)
    const targetSession = sessionsWithMessages[0] || store.sortedSessions[0]
    await store.switchSession(targetSession.id)
  }
})

onBeforeUnmount(() => {
  document.body.classList.remove('sales-agent-route')
  store.cleanup()
})
</script>

<!-- Unscoped: CSS variables that all child components need -->
<style>
.sales-view {
  /* --- Palette --- */
  --c-primary: 158, 64%, 40%;
  --c-primary-rich: 160, 85%, 35%;
  --c-accent: 158, 80%, 45%;

  --c-bg-base: 150, 20%, 98%;
  --c-bg-grad-start: 150, 30%, 96%;
  --c-bg-grad-end: 160, 30%, 99%;

  --c-text-main: 150, 20%, 15%;
  --c-text-muted: 150, 10%, 45%;
  --c-text-light: 150, 10%, 65%;

  --c-surface: 0, 0%, 100%;

  /* --- Tokens --- */
  --primary: hsl(var(--c-primary));
  --accent: hsl(var(--c-accent));
  --text: hsl(var(--c-text-main));
  --text-muted: hsl(var(--c-text-muted));

  --glass-border: rgba(255, 255, 255, 0.4);
  --glass-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.07);
  --glass-bg: rgba(255, 255, 255, 0.75);

  --radius-sm: 8px;
  --radius-md: 16px;
  --radius-lg: 24px;

  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-serif: Georgia, serif;
  --font-mono: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, monospace;

  --sidebar-width: 280px;
}

body.sales-agent-route {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background: radial-gradient(circle at top left, hsl(150, 30%, 96%), hsl(160, 30%, 99%));
  color: hsl(150, 20%, 15%);
}

body.sales-agent-route #app {
  height: 100%;
}
</style>

<style scoped>
.sales-view {
  width: 100%;
  height: 100%;
}

.app-container {
  display: flex;
  width: 100%;
  height: 100%;
  position: relative;
  background-image:
    radial-gradient(at 0% 0%, rgba(37, 167, 105, 0.08) 0px, transparent 50%),
    radial-gradient(at 100% 0%, rgba(37, 167, 105, 0.04) 0px, transparent 50%);
}

.app-container *,
.app-container *::before,
.app-container *::after {
  box-sizing: border-box;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

/* Home button */
.back-to-home-btn {
  position: fixed;
  top: 24px;
  left: 24px;
  z-index: 100;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  text-decoration: none;
  transition: all 0.2s;
}

.back-to-home-btn:hover {
  background: white;
  color: var(--primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

/* Main stage */
.main-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* Sidebar overlay (mobile) */
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
}

/* Start chat container */
.start-chat-container {
  display: flex;
  justify-content: center;
  padding: 24px;
}

.start-chat-btn {
  padding: 14px 28px;
  border-radius: 14px;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: var(--primary);
  color: white;
  box-shadow: 0 2px 8px rgba(37, 167, 105, 0.2);
}

.start-chat-btn:hover {
  background: hsl(var(--c-primary-rich));
  box-shadow: 0 4px 12px rgba(37, 167, 105, 0.3);
  transform: translateY(-1px);
}

@media (max-width: 768px) {
  .back-to-home-btn {
    top: 12px;
    left: 12px;
    width: 36px;
    height: 36px;
    border-radius: 10px;
  }
}
</style>
