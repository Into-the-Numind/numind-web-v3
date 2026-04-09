<template>
  <div class="sop-edit">
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
      <div v-for="i in 3" :key="i" class="skeleton-row"></div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="loadError" class="error-state">
      <p class="error-text">{{ loadError }}</p>
      <AppButton variant="secondary" size="sm" @click="loadDetail">重试</AppButton>
    </div>

    <template v-else>
      <!-- 头部 -->
      <div class="page-header">
        <div class="header-left">
          <button class="back-link" @click="router.push('/config/sop-templates')">
            &larr; 返回列表
          </button>
          <h2 class="page-title">{{ isCreate ? '新建SOP模板' : '编辑SOP模板' }}</h2>
        </div>
        <AppButton
          :loading="saving"
          :disabled="!isFormValid || saving"
          size="sm"
          @click="handleSave"
        >
          {{ saving ? '保存中...' : '保存' }}
        </AppButton>
      </div>

      <!-- 基本信息 -->
      <div class="meta-section">
        <AppInput
          v-model="form.name"
          label="模板名称"
          placeholder="请输入SOP模板名称"
          :error="errors.name"
          @blur="validateName"
        />
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea
            v-model="form.description"
            class="form-textarea"
            placeholder="请输入模板描述（可选）"
            rows="2"
          ></textarea>
        </div>
      </div>

      <!-- 步骤编辑区（分栏） -->
      <div class="split-layout">
        <!-- 左侧：步骤列表 -->
        <div class="step-panel">
          <div class="panel-header">
            <span class="panel-title">步骤列表（{{ nodes.length }}/20）</span>
            <button class="add-step-btn" :disabled="nodes.length >= 20" @click="addStep">
              + 添加步骤
            </button>
          </div>
          <div v-if="nodes.length === 0" class="step-empty">暂无步骤，点击上方按钮添加</div>
          <div v-else class="step-list">
            <div
              v-for="(node, idx) in nodes"
              :key="node.localId"
              class="step-item"
              :class="{ active: selectedIndex === idx }"
              @click="selectedIndex = idx"
            >
              <span class="step-number">{{ idx + 1 }}</span>
              <span class="step-preview">{{ node.prompt || '(空步骤)' }}</span>
              <div class="step-actions">
                <button
                  class="step-arrow"
                  :disabled="idx === 0"
                  title="上移"
                  @click.stop="moveStep(idx, -1)"
                >
                  &#9650;
                </button>
                <button
                  class="step-arrow"
                  :disabled="idx === nodes.length - 1"
                  title="下移"
                  @click.stop="moveStep(idx, 1)"
                >
                  &#9660;
                </button>
                <button class="step-delete" title="删除" @click.stop="removeStep(idx)">
                  &times;
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧：提示词编辑 -->
        <div class="prompt-panel">
          <div v-if="selectedIndex < 0 || selectedIndex >= nodes.length" class="prompt-empty">
            选择左侧步骤以编辑提示词
          </div>
          <template v-else>
            <label class="form-label">步骤 {{ selectedIndex + 1 }} 提示词</label>
            <textarea
              v-model="nodes[selectedIndex].prompt"
              class="form-textarea prompt-textarea"
              placeholder="请输入该步骤的提示词"
              rows="12"
            ></textarea>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'

interface LocalNode {
  localId: number
  serverId: number | null
  prompt: string
  sort: number
}

const route = useRoute()
const router = useRouter()
const store = useConfigStore()

const paramId = route.params.id as string
const isCreate = paramId === 'new'
const editId = isCreate ? 0 : Number(paramId)

const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const selectedIndex = ref(0)
let localIdCounter = 0

const form = reactive({
  name: '',
  description: ''
})

const errors = reactive({
  name: ''
})

const nodes = ref<LocalNode[]>([])

function validateName() {
  errors.name = form.name.trim() ? '' : '模板名称不能为空'
}

const isFormValid = computed(() => form.name.trim().length > 0)

function addStep() {
  if (nodes.value.length >= 20) return
  localIdCounter++
  nodes.value.push({
    localId: localIdCounter,
    serverId: null,
    prompt: '',
    sort: nodes.value.length
  })
  selectedIndex.value = nodes.value.length - 1
}

function removeStep(idx: number) {
  if (!confirm('确认删除该步骤？')) return
  nodes.value.splice(idx, 1)
  if (selectedIndex.value >= nodes.value.length) {
    selectedIndex.value = Math.max(0, nodes.value.length - 1)
  }
}

function moveStep(idx: number, direction: number) {
  const target = idx + direction
  if (target < 0 || target >= nodes.value.length) return
  const tmp = nodes.value[idx]
  nodes.value[idx] = nodes.value[target]
  nodes.value[target] = tmp
  selectedIndex.value = target
}

async function loadDetail() {
  if (isCreate) return
  loading.value = true
  loadError.value = ''
  try {
    const detail = await store.fetchSopTemplateDetail(editId)
    if (!detail) {
      loadError.value = 'SOP模板不存在'
      return
    }
    form.name = detail.name
    form.description = detail.description ?? ''
    if (detail.nodes) {
      nodes.value = detail.nodes
        .sort((a, b) => a.sort - b.sort)
        .map((n) => {
          localIdCounter++
          return {
            localId: localIdCounter,
            serverId: n.id,
            prompt: n.prompt,
            sort: n.sort
          }
        })
    }
    selectedIndex.value = nodes.value.length > 0 ? 0 : -1
  } catch {
    loadError.value = '加载失败，请重试'
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  validateName()
  if (errors.name) return

  saving.value = true
  try {
    let templateId = editId

    if (isCreate) {
      const ok = await store.addSopTemplate({
        name: form.name.trim(),
        description: form.description.trim() || undefined
      })
      if (!ok) return
      // Refresh to get the newly created template ID
      await store.fetchSopTemplates()
      const created = store.sopTemplates.find((t) => t.name === form.name.trim())
      if (!created) return
      templateId = created.id
    } else {
      const ok = await store.editSopTemplate(editId, {
        name: form.name.trim(),
        description: form.description.trim() || undefined
      })
      if (!ok) return
    }

    // Sync nodes: delete removed server nodes, create/update others
    if (!isCreate) {
      const detail = await store.fetchSopTemplateDetail(templateId)
      const existingServerIds = new Set((detail?.nodes ?? []).map((n) => n.id))
      const currentServerIds = new Set(
        nodes.value.filter((n) => n.serverId !== null).map((n) => n.serverId as number)
      )
      // Delete removed nodes
      for (const sId of existingServerIds) {
        if (!currentServerIds.has(sId)) {
          await store.removeNode(templateId, sId)
        }
      }
    }

    // Create or update each node
    for (let i = 0; i < nodes.value.length; i++) {
      const node = nodes.value[i]
      if (node.serverId) {
        await store.editNode(templateId, node.serverId, {
          prompt: node.prompt,
          sort: i
        })
      } else {
        await store.addNode(templateId, {
          prompt: node.prompt,
          sort: i
        })
      }
    }

    // Batch sort for consistency
    const freshDetail = await store.fetchSopTemplateDetail(templateId)
    if (freshDetail?.nodes?.length) {
      const sortItems = freshDetail.nodes.map((n, i) => ({ id: n.id, sort: i }))
      await store.sortNodes(templateId, sortItems)
    }

    router.push('/config/sop-templates')
  } finally {
    saving.value = false
  }
}

onMounted(loadDetail)
</script>

<style scoped>
.sop-edit {
  width: 100%;
}

.loading-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px 0;
}

.skeleton-row {
  height: 48px;
  background: var(--color-surface-tint, #f3f4f6);
  border-radius: 8px;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.error-state {
  text-align: center;
  padding: 48px 0;
}

.error-text {
  color: #ef4444;
  margin-bottom: 16px;
  font-size: 0.875rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  flex-direction: column;
}

.back-link {
  background: none;
  border: none;
  color: var(--color-accent-link, #3b82f6);
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0;
  margin-bottom: 8px;
  display: inline-block;
  text-align: left;
}

.back-link:hover {
  color: var(--color-accent-hover, #2563eb);
}

.page-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text, #111827);
}

.meta-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
  max-width: 480px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text, #111827);
}

.form-textarea {
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  font-size: 0.875rem;
  background: var(--color-surface, #fff);
  color: var(--color-text, #111827);
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.15s;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--color-accent, #3b82f6);
  box-shadow: var(--shadow-focus, 0 0 0 2px rgba(59, 130, 246, 0.15));
}

/* Split layout */
.split-layout {
  display: flex;
  gap: 24px;
  min-height: 400px;
}

.step-panel {
  width: 280px;
  flex-shrink: 0;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-surface-tint, #f9fafb);
}

.panel-title {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text, #111827);
}

.add-step-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--color-accent-link, #3b82f6);
  padding: 2px 4px;
}

.add-step-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.add-step-btn:hover:not(:disabled) {
  color: var(--color-accent-hover, #2563eb);
}

.step-empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 0.8125rem;
  color: var(--color-text-muted, #6b7280);
}

.step-list {
  flex: 1;
  overflow-y: auto;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  transition: background 0.15s;
}

.step-item:hover {
  background: var(--color-surface-hover, #f9fafb);
}

.step-item.active {
  background: var(--color-accent-ultra-soft, #eff6ff);
  border-left: 3px solid var(--color-primary, #3b82f6);
}

.step-number {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-surface-tint, #f3f4f6);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text-muted, #6b7280);
}

.step-item.active .step-number {
  background: var(--color-primary, #3b82f6);
  color: #fff;
}

.step-preview {
  flex: 1;
  font-size: 0.8125rem;
  color: var(--color-text, #111827);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.step-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.step-arrow,
.step-delete {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--color-text-muted, #6b7280);
  padding: 2px 4px;
  border-radius: 4px;
  line-height: 1;
}

.step-arrow:hover:not(:disabled),
.step-delete:hover {
  background: var(--color-surface-tint, #f3f4f6);
}

.step-arrow:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.step-delete {
  color: #ef4444;
  font-size: 1rem;
}

.step-delete:hover {
  background: #fee2e2;
}

/* Prompt panel */
.prompt-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 0.875rem;
  color: var(--color-text-muted, #6b7280);
}

.prompt-textarea {
  flex: 1;
  min-height: 300px;
}
</style>
