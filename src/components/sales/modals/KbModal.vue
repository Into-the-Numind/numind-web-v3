<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  X,
  ArrowLeft,
  Info,
  Check,
  Pencil,
  FileText,
  Compass,
  FilePlus,
  Inbox,
  HardDrive,
  Layers,
  Package,
  Briefcase,
  HelpCircle,
  Lightbulb
} from 'lucide-vue-next'
import { useSalesStore } from '@/stores/sales'
import type { KbSelection } from '@/api/sales'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useSalesStore()

// ==================== Constants ====================
const KB_CATEGORIES: (keyof KbSelection)[] = ['product', 'cases', 'faq', 'opinion']
const KB_CATEGORY_LABELS: Record<keyof KbSelection, string> = {
  product: '产品文档',
  cases: '成功案例',
  faq: '百问百答',
  opinion: '观点库'
}
const KB_WIZARD_HINTS: Record<keyof KbSelection, string> = {
  product: '请选择产品知识库（最多 3 个）',
  cases: '请选择案例知识库（最多 3 个）',
  faq: '请选择百问百答知识库（最多 3 个）',
  opinion: '系统赛道与自定义赛道合计最多选择 2 个'
}
const KB_CATEGORY_COLORS: Record<keyof KbSelection, string> = {
  product: '#3b82f6',
  cases: '#10b981',
  faq: '#f59e0b',
  opinion: '#8b5cf6'
}

// ==================== State ====================
type KbView = 'overview' | 'wizard' | 'categoryEdit'
const currentView = ref<KbView>('overview')
const wizardStep = ref(0) // 0=product, 1=cases, 2=faq, 3=opinion
const activeCategory = ref<keyof KbSelection>('product')
const isLoading = ref(false)

// Snapshot for rollback on save failure
let selectionSnapshot: { kb: KbSelection; tracks: number[] } | null = null

// ==================== Open/Close ====================
watch(() => props.open, async (show) => {
  if (show) {
    isLoading.value = true
    await store.loadKnowledgeDocuments()
    isLoading.value = false

    // Decide initial view
    const hasSelection = KB_CATEGORIES.some(c => (store.kbSelection[c] || []).length > 0)
      || (store.opinionTrackSelection || []).length > 0
    if (hasSelection) {
      showView('overview')
    } else {
      wizardStep.value = 0
      showView('wizard')
    }
  }
})

// ==================== View Switching ====================
function showView(view: KbView) {
  currentView.value = view
  if (view === 'wizard') {
    activeCategory.value = KB_CATEGORIES[wizardStep.value]
  }
}

function getTitle(): string {
  if (currentView.value === 'overview') return '知识库配置'
  if (currentView.value === 'wizard') return '配置知识库'
  return KB_CATEGORY_LABELS[activeCategory.value]
}

function showBackBtn(): boolean {
  return currentView.value === 'categoryEdit'
}

function goBack() {
  const hasSelection = KB_CATEGORIES.some(c => (store.kbSelection[c] || []).length > 0)
    || (store.opinionTrackSelection || []).length > 0
  if (currentView.value === 'categoryEdit' && hasSelection) {
    showView('overview')
  } else {
    showView('wizard')
  }
}

// ==================== Category icon component map ====================
const categoryIcons: Record<keyof KbSelection, typeof Package> = {
  product: Package,
  cases: Briefcase,
  faq: HelpCircle,
  opinion: Lightbulb
}

// ==================== Overview ====================
function getCategoryCount(cat: keyof KbSelection): number {
  const docCount = (store.kbSelection[cat] || []).length
  if (cat === 'opinion') return docCount + store.opinionTrackSelection.length
  return docCount
}

function getCategoryMax(cat: keyof KbSelection): number {
  return cat === 'opinion' ? 2 : 3
}

function getCategoryDocs(cat: keyof KbSelection) {
  return (store.kbSelection[cat] || []).map(docId => {
    const doc = store.availableDocuments.find(d => d.id === docId)
    return { id: docId, name: doc ? doc.name : `文档 #${docId}` }
  })
}

function getCategoryTracks() {
  return store.opinionTrackSelection.map(trackId => {
    const track = store.availableOpinionTracks.find(t => t.id === trackId)
    return { id: trackId, name: track ? track.name : `赛道 #${trackId}` }
  })
}

function editCategory(cat: keyof KbSelection) {
  activeCategory.value = cat
  showView('categoryEdit')
}

// ==================== Document list helpers ====================
const otherSelectedIds = computed(() => {
  const ids = new Set<number>()
  for (const cat of KB_CATEGORIES) {
    if (cat !== activeCategory.value) {
      for (const id of store.kbSelection[cat] || []) {
        ids.add(id)
      }
    }
  }
  return ids
})

const filteredDocs = computed(() => {
  return store.availableDocuments.filter(doc => {
    return doc.isEnabled !== false
  })
})

const sortedDocs = computed(() => {
  const currentSelection = store.kbSelection[activeCategory.value] || []
  const other = otherSelectedIds.value
  return [...filteredDocs.value].sort((a, b) => {
    // Selected in current category first, then unselected, then in-other-category last
    const aInCurrent = currentSelection.includes(a.id) ? 0 : 1
    const bInCurrent = currentSelection.includes(b.id) ? 0 : 1
    if (aInCurrent !== bInCurrent) return aInCurrent - bInCurrent
    const aInOther = other.has(a.id) ? 1 : 0
    const bInOther = other.has(b.id) ? 1 : 0
    return aInOther - bInOther
  })
})

function isDocSelected(docId: number): boolean {
  return (store.kbSelection[activeCategory.value] || []).includes(docId)
}

function isDocInOtherCategory(docId: number): boolean {
  return otherSelectedIds.value.has(docId)
}

function getDocOtherCategoryLabel(docId: number): string {
  for (const cat of KB_CATEGORIES) {
    if (cat !== activeCategory.value && (store.kbSelection[cat] || []).includes(docId)) {
      return KB_CATEGORY_LABELS[cat]
    }
  }
  return '其他类别'
}

function toggleDoc(docId: number) {
  // Do not allow toggling if in another category
  if (isDocInOtherCategory(docId)) return
  store.toggleKbDocument(docId, activeCategory.value)
}

function isTrackSelected(trackId: number): boolean {
  return store.opinionTrackSelection.includes(trackId)
}

function toggleTrack(trackId: number) {
  store.toggleOpinionTrack(trackId)
}

function formatFileSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// ==================== Wizard ====================
function wizardPrev() {
  if (wizardStep.value > 0) {
    wizardStep.value--
    activeCategory.value = KB_CATEGORIES[wizardStep.value]
  }
}

function wizardNext() {
  if (wizardStep.value < 3) {
    wizardStep.value++
    activeCategory.value = KB_CATEGORIES[wizardStep.value]
  } else {
    saveAndClose()
  }
}

// ==================== Save with snapshot/rollback ====================
async function saveAndClose() {
  // Snapshot current selection before saving
  selectionSnapshot = {
    kb: {
      product: [...store.kbSelection.product],
      cases: [...store.kbSelection.cases],
      faq: [...store.kbSelection.faq],
      opinion: [...store.kbSelection.opinion]
    },
    tracks: [...store.opinionTrackSelection]
  }

  emit('close')

  const success = await store.saveKbSelection()
  if (!success && selectionSnapshot) {
    // Rollback to snapshot
    store.kbSelection.product = selectionSnapshot.kb.product
    store.kbSelection.cases = selectionSnapshot.kb.cases
    store.kbSelection.faq = selectionSnapshot.kb.faq
    store.kbSelection.opinion = selectionSnapshot.kb.opinion
    store.opinionTrackSelection = selectionSnapshot.tracks
  }
  selectionSnapshot = null
}

function onOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    emit('close')
  }
}

function getCategoryEditHint(): string {
  return activeCategory.value === 'opinion'
    ? '系统赛道与自定义赛道合计最多选择 2 个'
    : '最多选择 3 个文档'
}
</script>

<template>
  <Teleport to="body">
    <div
      class="modal-overlay"
      :class="{ open: props.open }"
      @click="onOverlayClick"
    >
      <div class="modal-card profile-modal-card kb-modal-card">
        <!-- Header -->
        <div class="profile-modal-header">
          <div class="kb-header-left">
            <button
              v-if="showBackBtn()"
              class="kb-back-btn"
              @click="goBack"
            >
              <ArrowLeft :size="16" />
            </button>
            <span class="modal-title">{{ getTitle() }}</span>
          </div>
          <button class="modal-close-btn" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>

        <!-- Loading -->
        <div v-if="isLoading" class="kb-loading">
          <div class="loader-dots">加载中</div>
        </div>

        <!-- ===== View 1: Overview ===== -->
        <div v-show="currentView === 'overview' && !isLoading" class="kb-view">
          <div class="profile-modal-body kb-overview-body">
            <div class="kb-overview-grid">
              <div
                v-for="cat in KB_CATEGORIES"
                :key="cat"
                class="kb-overview-card"
                :class="cat"
              >
                <div class="kb-overview-card-header">
                  <div class="kb-overview-card-title">
                    <component
                      :is="categoryIcons[cat]"
                      :size="16"
                      :style="{ color: KB_CATEGORY_COLORS[cat] }"
                    />
                    {{ KB_CATEGORY_LABELS[cat] }}
                  </div>
                  <span class="kb-overview-card-count">{{ getCategoryCount(cat) }}/{{ getCategoryMax(cat) }}</span>
                </div>
                <div class="kb-overview-doc-list">
                  <!-- Opinion tracks -->
                  <template v-if="cat === 'opinion'">
                    <div
                      v-for="track in getCategoryTracks()"
                      :key="`track-${track.id}`"
                      class="kb-overview-doc-item"
                    >
                      <Compass :size="14" />
                      <span class="kb-overview-doc-name" :title="track.name">{{ track.name }}</span>
                    </div>
                  </template>
                  <!-- Documents -->
                  <div
                    v-for="doc in getCategoryDocs(cat)"
                    :key="`doc-${doc.id}`"
                    class="kb-overview-doc-item"
                  >
                    <FileText :size="14" />
                    <span class="kb-overview-doc-name" :title="doc.name">{{ doc.name }}</span>
                  </div>
                  <!-- Empty state -->
                  <div v-if="getCategoryCount(cat) === 0" class="kb-overview-empty">
                    未选择文档
                  </div>
                </div>
                <button class="kb-overview-edit-btn" @click="editCategory(cat)">
                  <Pencil :size="14" />
                  配置
                </button>
              </div>
            </div>

            <!-- Opinion tracks section -->
            <div
              v-if="store.availableOpinionTracks.length > 0"
              class="kb-overview-tracks-section"
            >
              <div class="kb-opinion-section-title">
                <Compass :size="14" />
                <span>观点赛道</span>
              </div>
              <div class="kb-track-list">
                <div
                  v-for="track in store.availableOpinionTracks"
                  :key="track.id"
                  class="kb-track-item"
                  :class="{ selected: isTrackSelected(track.id) }"
                  @click="toggleTrack(track.id)"
                >
                  <div class="kb-checkbox">
                    <Check :size="14" />
                  </div>
                  <div class="kb-track-info">
                    <div class="kb-track-name">{{ track.name }}</div>
                    <div v-if="track.description" class="kb-track-desc">{{ track.description }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="profile-modal-footer">
            <button class="btn-primary" @click="saveAndClose">
              <span>确定</span>
            </button>
          </div>
        </div>

        <!-- ===== View 2: Wizard ===== -->
        <div v-show="currentView === 'wizard' && !isLoading" class="kb-view">
          <!-- Step indicators -->
          <div class="kb-wizard-steps">
            <template v-for="(cat, i) in KB_CATEGORIES" :key="cat">
              <div
                class="kb-step"
                :class="{ active: i === wizardStep, completed: i < wizardStep }"
              >
                <div class="kb-step-dot">{{ i + 1 }}</div>
                <span>{{ KB_CATEGORY_LABELS[cat] }}</span>
              </div>
              <div
                v-if="i < 3"
                class="kb-step-line"
                :class="{ completed: i < wizardStep }"
              />
            </template>
          </div>

          <!-- Hint -->
          <div class="kb-limit-hint">
            <Info :size="14" />
            <span>{{ KB_WIZARD_HINTS[KB_CATEGORIES[wizardStep]] }}</span>
          </div>

          <div class="profile-modal-body kb-doc-list-body">
            <!-- Document list -->
            <div class="kb-document-list">
              <!-- Opinion step: tracks + docs -->
              <template v-if="activeCategory === 'opinion'">
                <!-- System tracks -->
                <div v-if="store.availableOpinionTracks.length > 0" class="kb-opinion-section">
                  <div class="kb-opinion-section-title">
                    <Compass :size="14" />
                    <span>系统赛道</span>
                  </div>
                  <div class="kb-track-list">
                    <div
                      v-for="track in store.availableOpinionTracks"
                      :key="track.id"
                      class="kb-track-item"
                      :class="{ selected: isTrackSelected(track.id) }"
                      @click="toggleTrack(track.id)"
                    >
                      <div class="kb-checkbox">
                        <Check :size="14" />
                      </div>
                      <div class="kb-track-info">
                        <div class="kb-track-name">{{ track.name }}</div>
                        <div v-if="track.description" class="kb-track-desc">{{ track.description }}</div>
                      </div>
                    </div>
                  </div>
                </div>
                <!-- Custom docs -->
                <div v-if="sortedDocs.length > 0" class="kb-opinion-section" style="margin-top: 16px;">
                  <div class="kb-opinion-section-title">
                    <FilePlus :size="14" />
                    <span>自定义赛道</span>
                  </div>
                  <div
                    v-for="doc in sortedDocs"
                    :key="doc.id"
                    class="kb-document-item"
                    :class="{
                      selected: isDocSelected(doc.id),
                      'disabled-other-category': isDocInOtherCategory(doc.id)
                    }"
                    @click="toggleDoc(doc.id)"
                  >
                    <div class="kb-checkbox">
                      <Check :size="14" />
                    </div>
                    <div class="kb-doc-icon-container">
                      <FileText :size="20" />
                    </div>
                    <div class="kb-document-info">
                      <div class="kb-document-name">
                        {{ doc.name }}
                        <span v-if="isDocInOtherCategory(doc.id)" class="kb-doc-badge">
                          已在{{ getDocOtherCategoryLabel(doc.id) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Non-opinion steps -->
              <template v-else>
                <div v-if="sortedDocs.length === 0" class="kb-empty-state">
                  <Inbox :size="48" style="opacity: 0.3;" />
                  <div style="font-size: 14px; color: var(--text-muted);">暂无可选文档</div>
                </div>
                <div
                  v-for="doc in sortedDocs"
                  v-else
                  :key="doc.id"
                  class="kb-document-item"
                  :class="{
                    selected: isDocSelected(doc.id),
                    'disabled-other-category': isDocInOtherCategory(doc.id)
                  }"
                  @click="toggleDoc(doc.id)"
                >
                  <div class="kb-checkbox">
                    <Check :size="14" />
                  </div>
                  <div class="kb-doc-icon-container">
                    <FileText :size="20" />
                  </div>
                  <div class="kb-document-info">
                    <div class="kb-document-name">
                      {{ doc.name }}
                      <span v-if="isDocInOtherCategory(doc.id)" class="kb-doc-badge">
                        已在{{ getDocOtherCategoryLabel(doc.id) }}
                      </span>
                    </div>
                    <div class="kb-document-meta">
                      <span v-if="doc.fileSize" class="kb-meta-item">
                        <HardDrive :size="14" />
                        {{ formatFileSize(doc.fileSize) }}
                      </span>
                      <span class="kb-meta-item">
                        <Layers :size="14" />
                        {{ doc.chunkCount }} 块
                      </span>
                      <span v-if="doc.createdAt" class="kb-meta-item">
                        {{ new Date(doc.createdAt).toLocaleDateString('zh-CN') }}
                      </span>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Footer -->
          <div class="profile-modal-footer">
            <button
              v-show="wizardStep > 0"
              class="btn-secondary"
              @click="wizardPrev"
            >上一步</button>
            <button class="btn-primary" @click="wizardNext">
              <span>{{ wizardStep === 3 ? '完成' : '下一步' }}</span>
            </button>
          </div>
        </div>

        <!-- ===== View 3: Category Edit ===== -->
        <div v-show="currentView === 'categoryEdit' && !isLoading" class="kb-view">
          <!-- Hint -->
          <div class="kb-limit-hint">
            <Info :size="14" />
            <span>{{ getCategoryEditHint() }}</span>
          </div>

          <div class="profile-modal-body kb-doc-list-body">
            <!-- Document list -->
            <div class="kb-document-list">
              <!-- Opinion category edit -->
              <template v-if="activeCategory === 'opinion'">
                <div v-if="store.availableOpinionTracks.length > 0" class="kb-opinion-section">
                  <div class="kb-opinion-section-title">
                    <Compass :size="14" />
                    <span>系统赛道</span>
                  </div>
                  <div class="kb-track-list">
                    <div
                      v-for="track in store.availableOpinionTracks"
                      :key="track.id"
                      class="kb-track-item"
                      :class="{ selected: isTrackSelected(track.id) }"
                      @click="toggleTrack(track.id)"
                    >
                      <div class="kb-checkbox">
                        <Check :size="14" />
                      </div>
                      <div class="kb-track-info">
                        <div class="kb-track-name">{{ track.name }}</div>
                        <div v-if="track.description" class="kb-track-desc">{{ track.description }}</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="sortedDocs.length > 0" class="kb-opinion-section" style="margin-top: 16px;">
                  <div class="kb-opinion-section-title">
                    <FilePlus :size="14" />
                    <span>自定义赛道</span>
                  </div>
                  <div
                    v-for="doc in sortedDocs"
                    :key="doc.id"
                    class="kb-document-item"
                    :class="{
                      selected: isDocSelected(doc.id),
                      'disabled-other-category': isDocInOtherCategory(doc.id)
                    }"
                    @click="toggleDoc(doc.id)"
                  >
                    <div class="kb-checkbox">
                      <Check :size="14" />
                    </div>
                    <div class="kb-doc-icon-container">
                      <FileText :size="20" />
                    </div>
                    <div class="kb-document-info">
                      <div class="kb-document-name">
                        {{ doc.name }}
                        <span v-if="isDocInOtherCategory(doc.id)" class="kb-doc-badge">
                          已在{{ getDocOtherCategoryLabel(doc.id) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Non-opinion category edit -->
              <template v-else>
                <div v-if="sortedDocs.length === 0" class="kb-empty-state">
                  <Inbox :size="48" style="opacity: 0.3;" />
                  <div style="font-size: 14px; color: var(--text-muted);">暂无可选文档</div>
                </div>
                <div
                  v-for="doc in sortedDocs"
                  v-else
                  :key="doc.id"
                  class="kb-document-item"
                  :class="{
                    selected: isDocSelected(doc.id),
                    'disabled-other-category': isDocInOtherCategory(doc.id)
                  }"
                  @click="toggleDoc(doc.id)"
                >
                  <div class="kb-checkbox">
                    <Check :size="14" />
                  </div>
                  <div class="kb-doc-icon-container">
                    <FileText :size="20" />
                  </div>
                  <div class="kb-document-info">
                    <div class="kb-document-name">
                      {{ doc.name }}
                      <span v-if="isDocInOtherCategory(doc.id)" class="kb-doc-badge">
                        已在{{ getDocOtherCategoryLabel(doc.id) }}
                      </span>
                    </div>
                    <div class="kb-document-meta">
                      <span v-if="doc.fileSize" class="kb-meta-item">
                        <HardDrive :size="14" />
                        {{ formatFileSize(doc.fileSize) }}
                      </span>
                      <span class="kb-meta-item">
                        <Layers :size="14" />
                        {{ doc.chunkCount }} 块
                      </span>
                      <span v-if="doc.createdAt" class="kb-meta-item">
                        {{ new Date(doc.createdAt).toLocaleDateString('zh-CN') }}
                      </span>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Footer -->
          <div class="profile-modal-footer">
            <button class="btn-secondary" @click="goBack">返回概览</button>
            <button class="btn-primary" @click="showView('overview')">
              <span>确认选择</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
@import '@/assets/styles/sales-modal.css';
</style>

<style scoped>
/* ==================== KB Modal Scoped Styles ==================== */

.kb-modal-card {
  width: 720px;
  max-height: 90vh;
  min-height: 420px;
  position: relative;
}

/* Header left group */
.kb-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kb-back-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease-out;
  flex-shrink: 0;
}

.kb-back-btn:hover {
  background: rgba(37, 167, 105, 0.1);
  color: var(--primary);
}

/* View container */
.kb-view {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  animation: kbFadeIn 0.25s ease-out;
}

@keyframes kbFadeIn {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Loading */
.kb-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  inset: 0;
  z-index: 10;
  background: #fff;
  color: var(--text-muted);
  font-size: 14px;
  border-radius: inherit;
}

.loader-dots::after {
  content: '.';
  animation: dots 1.5s steps(5, end) infinite;
}

@keyframes dots {
  0%, 20% { content: '.'; }
  40% { content: '..'; }
  60% { content: '...'; }
  80%, 100% { content: ''; }
}

/* --- Overview body --- */
.kb-overview-body {
  padding: 20px 24px;
  overflow-y: auto;
}

/* --- Overview Grid (2-column) --- */
.kb-overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.kb-overview-card {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.2s ease-out;
  min-height: 160px;
  min-width: 0;
  overflow: hidden;
}

.kb-overview-card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

/* Category color accents (left border) */
.kb-overview-card.product { border-left: 3px solid #3b82f6; }
.kb-overview-card.cases { border-left: 3px solid #10b981; }
.kb-overview-card.faq { border-left: 3px solid #f59e0b; }
.kb-overview-card.opinion { border-left: 3px solid #8b5cf6; }

.kb-overview-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.kb-overview-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  font-weight: 600;
}

.kb-overview-card-count {
  font-size: 0.75rem;
  color: var(--text-light);
  padding: 2px 8px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 10px;
}

.kb-overview-doc-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  max-height: 120px;
  overflow-y: auto;
}

.kb-overview-doc-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 6px;
  font-size: 0.8rem;
  color: var(--text);
  min-width: 0;
}

.kb-overview-doc-item svg {
  color: var(--text-muted);
  flex-shrink: 0;
}

.kb-overview-doc-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.kb-overview-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-light);
  font-size: 0.8rem;
  font-style: italic;
}

.kb-overview-edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border: 1px dashed rgba(0, 0, 0, 0.12);
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease-out;
}

.kb-overview-edit-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: rgba(37, 167, 105, 0.04);
}

/* --- Opinion tracks section in overview --- */
.kb-overview-tracks-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

/* --- Wizard Steps --- */
.kb-wizard-steps {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 20px 24px 12px;
}

.kb-step {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--text-light);
  transition: all 0.2s ease-out;
  user-select: none;
}

.kb-step.active {
  color: var(--primary);
  font-weight: 600;
}

.kb-step.completed {
  color: var(--primary);
}

.kb-step-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: 600;
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-light);
  transition: all 0.2s ease-out;
  flex-shrink: 0;
}

.kb-step.active .kb-step-dot {
  background: var(--primary);
  color: white;
  box-shadow: 0 2px 8px rgba(37, 167, 105, 0.3);
}

.kb-step.completed .kb-step-dot {
  background: rgba(37, 167, 105, 0.15);
  color: var(--primary);
}

.kb-step-line {
  width: 32px;
  height: 2px;
  background: rgba(0, 0, 0, 0.08);
  margin: 0 8px;
  border-radius: 1px;
  transition: background 0.2s ease-out;
}

.kb-step-line.completed {
  background: var(--primary);
}

.kb-limit-hint {
  padding: 8px 20px;
  font-size: 0.8rem;
  color: var(--text-muted);
  background: rgba(37, 167, 105, 0.04);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  gap: 6px;
}

/* --- Document list body --- */
.kb-doc-list-body {
  padding: 0;
}

/* --- Document list --- */
.kb-document-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  min-height: 200px;
}

.kb-document-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 12px;
  background: white;
}

.kb-document-item:hover {
  border-color: var(--primary);
  background: rgba(37, 167, 105, 0.02);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.kb-document-item.selected {
  background: rgba(37, 167, 105, 0.08);
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary) inset;
}

/* Disabled: document in another category */
.kb-document-item.disabled-other-category {
  opacity: 0.5;
  cursor: not-allowed;
  background-color: rgba(0, 0, 0, 0.02);
}

.kb-document-item.disabled-other-category:hover {
  background-color: rgba(0, 0, 0, 0.02);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: none;
}

.kb-document-item.disabled-other-category .kb-checkbox {
  border-color: rgba(0, 0, 0, 0.15);
  background: rgba(0, 0, 0, 0.05);
}

.kb-doc-icon-container {
  width: 40px;
  height: 40px;
  background: rgba(37, 167, 105, 0.08);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--primary);
  flex-shrink: 0;
}

.kb-checkbox {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}

.kb-document-item:hover .kb-checkbox {
  border-color: var(--primary);
}

.kb-document-item.selected .kb-checkbox {
  background: var(--primary);
  border-color: var(--primary);
}

.kb-checkbox svg {
  color: white;
  opacity: 0;
  transition: opacity 0.2s;
}

.kb-document-item.selected .kb-checkbox svg {
  opacity: 1;
}

.kb-document-info {
  flex: 1;
  min-width: 0;
}

.kb-document-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
  word-break: break-word;
  display: flex;
  align-items: center;
  gap: 8px;
}

.kb-doc-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-muted);
  border-radius: 4px;
  line-height: 1.4;
  white-space: nowrap;
  flex-shrink: 0;
}

.kb-document-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
  color: var(--text-muted);
}

.kb-meta-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
}

.kb-meta-item svg {
  color: var(--text-light);
}

.kb-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--text-muted);
  text-align: center;
  padding: 40px 20px;
}

/* --- Opinion section --- */
.kb-opinion-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 12px;
}

.kb-track-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.kb-track-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.2s ease-out;
}

.kb-track-item:hover {
  border-color: var(--primary);
  background: rgba(37, 167, 105, 0.02);
}

.kb-track-item.selected {
  background: rgba(37, 167, 105, 0.08);
  border-color: var(--primary);
  box-shadow: 0 0 0 1px var(--primary) inset;
}

.kb-track-item .kb-checkbox {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 2px solid rgba(0, 0, 0, 0.15);
}

.kb-track-item:hover .kb-checkbox {
  border-color: var(--primary);
}

.kb-track-item.selected .kb-checkbox {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}

.kb-track-item.selected .kb-checkbox svg {
  opacity: 1;
}

.kb-track-info {
  flex: 1;
  min-width: 0;
}

.kb-track-name {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text);
}

.kb-track-desc {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 2px;
}

/* Responsive */
@media (max-width: 640px) {
  .kb-overview-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .kb-modal-card {
    max-width: 95%;
    max-height: 90vh;
  }
}
</style>
