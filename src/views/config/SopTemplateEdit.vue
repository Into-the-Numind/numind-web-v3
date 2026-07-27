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
      <button class="back-link" @click="router.push('/config/sop-templates')">
        &larr; 返回列表
      </button>

      <div class="content-center">
        <div class="page-header">
          <h2 class="page-title">{{ isCreate ? '新建 AI 工作流' : '编辑 AI 工作流' }}</h2>
        </div>

        <!-- 基本信息卡片 -->
        <div class="meta-card">
          <h3 class="section-title">基本信息</h3>
          <div class="meta-fields">
            <AppInput
              v-model="form.name"
              label="工作流名称"
              placeholder="请输入 AI 工作流名称"
              :error="errors.name"
              @blur="validateName"
            />
            <div class="form-group">
              <label class="form-label">描述</label>
              <textarea
                v-model="form.description"
                class="form-textarea"
                placeholder="请输入模板描述（20 字以内，可选）"
                maxlength="20"
                rows="2"
              ></textarea>
            </div>
          </div>
        </div>

        <!-- 步骤编辑区（分栏） -->
        <div class="section-title">步骤配置</div>
        <div class="split-layout">
          <!-- 左侧：步骤列表 -->
          <div class="step-panel">
            <div class="panel-header">
              <span class="panel-title">步骤列表</span>
              <span class="panel-count">{{ nodes.length }}/20</span>
            </div>
            <div class="step-list-wrapper">
              <div v-if="nodes.length === 0" class="step-empty">
                <span class="empty-icon">&#9776;</span>
                <span class="empty-text">暂无步骤</span>
              </div>
              <div v-else class="step-list">
                <div
                  v-for="(node, idx) in nodes"
                  :key="node.localId"
                  class="step-item"
                  :class="{ active: selectedIndex === idx }"
                  @click="selectedIndex = idx"
                >
                  <span class="step-number">{{ idx + 1 }}</span>
                  <span class="step-preview">{{ node.name || '未命名步骤' }}</span>
                  <div class="step-actions">
                    <button
                      class="step-action-btn"
                      :disabled="idx === 0"
                      title="上移"
                      @click.stop="moveStep(idx, -1)"
                    >
                      &#9650;
                    </button>
                    <button
                      class="step-action-btn"
                      :disabled="idx === nodes.length - 1"
                      title="下移"
                      @click.stop="moveStep(idx, 1)"
                    >
                      &#9660;
                    </button>
                    <button
                      class="step-action-btn step-action-btn--danger"
                      title="删除"
                      @click.stop="removeStep(idx)"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="panel-footer">
              <button class="add-step-btn" :disabled="nodes.length >= 20" @click="addStep">
                + 添加步骤
              </button>
              <label class="trailing-chat-toggle">
                <input
                  v-model="form.trailingChatEnabled"
                  type="checkbox"
                  class="trailing-chat-checkbox"
                />
                <span class="trailing-chat-label">
                  <span class="trailing-chat-title">在流程末尾追加 AI 聊天</span>
                  <span class="trailing-chat-hint">开启后，用户完成所有步骤后可与 AI 继续对话</span>
                </span>
              </label>
            </div>
          </div>

          <!-- 右侧：步骤详情编辑 -->
          <div class="detail-panel">
            <div v-if="selectedIndex < 0 || selectedIndex >= nodes.length" class="detail-empty">
              <span class="empty-icon-lg">&#9998;</span>
              <span class="empty-title">选择步骤以编辑</span>
              <span class="empty-hint">点击左侧步骤查看和编辑详情</span>
            </div>
            <template v-else>
              <div class="detail-header">
                <span class="detail-badge">步骤 {{ selectedIndex + 1 }}</span>
              </div>
              <div class="detail-form">
                <div class="form-group">
                  <label class="form-label">步骤名称</label>
                  <input
                    v-model="nodes[selectedIndex].name"
                    class="form-input"
                    placeholder="请输入步骤名称，如：AI 拆解产品"
                  />
                </div>
                <div class="form-group">
                  <label class="form-label">步骤说明</label>
                  <textarea
                    v-model="nodes[selectedIndex].description"
                    class="form-textarea"
                    placeholder="用户在该步骤中会看到的说明文字（可选）"
                    rows="2"
                  ></textarea>
                  <span class="form-hint">此说明将展示在用户端对应步骤的顶部</span>
                </div>
                <div class="form-group form-group--flex">
                  <label class="form-label">
                    提示词（Prompt）
                    <span class="label-required">*</span>
                  </label>
                  <textarea
                    v-model="nodes[selectedIndex].prompt"
                    class="form-textarea prompt-textarea"
                    placeholder="请输入该步骤的 AI 提示词"
                    rows="10"
                  ></textarea>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- 可见范围权限 (sop-chatbot-visibility-scope) -->
        <div class="visibility-section">
          <VisibilityScopeCard
            v-model="visibilityValue"
            entity-type="sop"
            :loading="visibilityLoading"
            :dirty="visibilityDirty"
            :disabled="saving"
            @retry="retryVisibility"
          />
        </div>

        <div class="page-footer">
          <AppButton variant="secondary" @click="router.push('/config/sop-templates')">
            取消
          </AppButton>
          <AppButton :loading="saving" :disabled="!isFormValid || saving" @click="handleSave">
            {{ saving ? '保存中...' : '保存' }}
          </AppButton>
        </div>
      </div>
    </template>

    <ConfirmModal
      v-model="confirmVisible"
      :title="confirmAction?.title ?? ''"
      :message="confirmAction?.message ?? ''"
      :variant="confirmAction?.variant ?? 'default'"
      :confirm-text="confirmAction?.confirmText ?? '确认'"
      @confirm="onConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { useNotificationsStore } from '@/stores/notifications'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import VisibilityScopeCard from '@/components/VisibilityScopeCard.vue'
import { getSopVisibility, putSopVisibility, type VisibilityValue } from '@/api/visibility'

interface LocalNode {
  localId: number
  serverId: number | null
  name: string
  description: string
  prompt: string
  sort: number
}

const route = useRoute()
const router = useRouter()
const store = useConfigStore()
const notifications = useNotificationsStore()

const paramId = route.params.id as string
const isCreate = ref(paramId === 'new')
const editId = ref(isCreate.value ? 0 : Number(paramId))

const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const selectedIndex = ref(0)
const initialFormState = ref('')
let localIdCounter = 0

const form = reactive({
  name: '',
  description: '',
  trailingChatEnabled: true
})

const errors = reactive({
  name: ''
})

const nodes = ref<LocalNode[]>([])

// Visibility 可见范围状态 (sop-chatbot-visibility-scope)
// 两层 gate 串行: visibility 过滤 → run-permission. 此处只管 visibility 配置.
const visibilityValue = ref<VisibilityValue>({ restricted: false, subUserIDs: [] })
const visibilityLoaded = ref(false)
const visibilityLoading = ref(false)
const visibilityOriginal = ref<VisibilityValue>({ restricted: false, subUserIDs: [] })
const visibilityDirty = ref(false)

function visibilityChanged(): boolean {
  if (visibilityValue.value.restricted !== visibilityOriginal.value.restricted) return true
  const a = [...visibilityValue.value.subUserIDs].sort()
  const b = [...visibilityOriginal.value.subUserIDs].sort()
  if (a.length !== b.length) return true
  return a.some((v, i) => v !== b[i])
}

function validateName() {
  errors.name = form.name.trim() ? '' : '模板名称不能为空'
}

const isFormValid = computed(() => form.name.trim().length > 0)

const isDirty = computed(() => {
  const current = JSON.stringify({
    ...form,
    nodes: nodes.value.map((n) => ({
      name: n.name,
      description: n.description,
      prompt: n.prompt,
      sort: n.sort
    }))
  })
  return current !== initialFormState.value
})

function addStep() {
  if (nodes.value.length >= 20) return
  localIdCounter++
  nodes.value.push({
    localId: localIdCounter,
    serverId: null,
    name: '',
    description: '',
    prompt: '',
    sort: nodes.value.length
  })
  selectedIndex.value = nodes.value.length - 1
}

const confirmVisible = ref(false)
const confirmAction = ref<{
  title: string
  message: string
  variant: 'default' | 'danger'
  confirmText: string
  action: () => Promise<unknown>
} | null>(null)

async function onConfirm() {
  if (confirmAction.value) {
    await confirmAction.value.action()
  }
}

function removeStep(idx: number) {
  confirmAction.value = {
    title: '确认删除',
    message: '确认删除该步骤？',
    variant: 'danger',
    confirmText: '删除',
    action: async () => {
      nodes.value.splice(idx, 1)
      if (selectedIndex.value >= nodes.value.length) {
        selectedIndex.value = Math.max(0, nodes.value.length - 1)
      }
      notifications.success('步骤已删除')
    }
  }
  confirmVisible.value = true
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
  if (isCreate.value) return
  loading.value = true
  loadError.value = ''
  try {
    const detail = await store.fetchSopTemplateDetail(editId.value)
    if (!detail) {
      loadError.value = 'AI 工作流不存在'
      return
    }
    form.name = detail.name
    form.description = detail.description ?? ''
    form.trailingChatEnabled = detail.trailing_chat_enabled !== false
    if (detail.nodes) {
      nodes.value = detail.nodes
        .sort((a, b) => a.sort - b.sort)
        .map((n) => {
          localIdCounter++
          return {
            localId: localIdCounter,
            serverId: n.id,
            name: n.name ?? '',
            description: n.description ?? '',
            prompt: n.prompt,
            sort: n.sort
          }
        })
    }
    selectedIndex.value = nodes.value.length > 0 ? 0 : -1
    initialFormState.value = JSON.stringify({
      ...form,
      nodes: nodes.value.map((n) => ({
        name: n.name,
        description: n.description,
        prompt: n.prompt,
        sort: n.sort
      }))
    })
  } catch {
    loadError.value = '加载失败，请重试'
  } finally {
    loading.value = false
  }
}

// 加载 visibility 配置 (仅 edit 模式; create 模式 visibility 默认 false/[]).
async function loadVisibility() {
  if (isCreate.value) {
    visibilityLoaded.value = true
    return
  }
  visibilityLoading.value = true
  try {
    const res = await getSopVisibility(editId.value)
    const data = res.data
    const next: VisibilityValue = {
      restricted: !!data.restricted,
      subUserIDs: Array.isArray(data.sub_user_ids) ? data.sub_user_ids : []
    }
    visibilityValue.value = next
    visibilityOriginal.value = { restricted: next.restricted, subUserIDs: [...next.subUserIDs] }
    visibilityLoaded.value = true
    visibilityDirty.value = false
  } catch {
    // 静默失败: 卡片仍渲染默认值, 用户保存时会再次尝试 PUT
    visibilityLoaded.value = true
  } finally {
    visibilityLoading.value = false
  }
}

// 单独保存 visibility (用于重试入口 + handleSave 第二阶段).
// 成功后更新 original/dirty 状态; 失败 throw 上抛.
async function saveVisibility(templateId: number): Promise<void> {
  await putSopVisibility(templateId, {
    restricted: visibilityValue.value.restricted,
    sub_user_ids: visibilityValue.value.restricted ? visibilityValue.value.subUserIDs : undefined
  })
  visibilityOriginal.value = {
    restricted: visibilityValue.value.restricted,
    subUserIDs: [...visibilityValue.value.subUserIDs]
  }
  visibilityDirty.value = false
}

async function retryVisibility() {
  if (isCreate.value || !visibilityLoaded.value) return
  try {
    await saveVisibility(editId.value)
    notifications.success('可见范围已保存')
  } catch {
    visibilityDirty.value = true
    notifications.error('可见范围保存失败，请重试')
  }
}

async function handleSave() {
  validateName()
  if (errors.name) return

  saving.value = true
  try {
    let templateId = editId.value

    if (isCreate.value) {
      const created = await store.addSopTemplate({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        trailing_chat_enabled: form.trailingChatEnabled
      })
      if (!created) return
      templateId = created.id
      // 切换到编辑模式，避免后续步骤保存失败时重试又重复创建模板
      editId.value = templateId
      isCreate.value = false
      router.replace(`/config/sop-templates/${templateId}/edit`)
    } else {
      const ok = await store.editSopTemplate(editId.value, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        trailing_chat_enabled: form.trailingChatEnabled
      })
      if (!ok) return
    }

    // Sync nodes: delete removed server nodes, create/update others
    {
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
        const ok = await store.editNode(templateId, node.serverId, {
          name: node.name || `步骤 ${i + 1}`,
          description: node.description || undefined,
          prompt: node.prompt,
          sort: i
        })
        if (!ok) {
          notifications.error(`步骤 ${i + 1} 保存失败，请重试`)
          return
        }
      } else {
        const created = await store.addNode(templateId, {
          name: node.name || `步骤 ${i + 1}`,
          description: node.description || undefined,
          prompt: node.prompt,
          sort: i
        })
        if (!created) {
          notifications.error(`步骤 ${i + 1} 保存失败，请重试`)
          return
        }
        // 回填 serverId，避免保存失败重试时重复创建
        node.serverId = created.id
      }
    }

    // Batch sort for consistency
    const freshDetail = await store.fetchSopTemplateDetail(templateId)
    if (freshDetail?.nodes?.length) {
      const sortItems = freshDetail.nodes.map((n, i) => ({ id: n.id, sort: i }))
      await store.sortNodes(templateId, sortItems)
    }

    initialFormState.value = JSON.stringify({
      ...form,
      nodes: nodes.value.map((n) => ({
        name: n.name,
        description: n.description,
        prompt: n.prompt,
        sort: n.sort
      }))
    })

    // 第二阶段: 可见范围保存 (visibility 独立端点, 错误隔离不回滚模板)
    // 触发条件: visibility 配置发生变化 OR 之前保存失败遗留 dirty=true
    if (visibilityLoaded.value && (visibilityChanged() || visibilityDirty.value)) {
      try {
        await saveVisibility(templateId)
      } catch {
        // 模板已保存, visibility 失败 → 标记 dirty 留页面让用户重试, 不跳转
        visibilityDirty.value = true
        notifications.error('模板已保存, 但可见范围更新失败. 请检查后重试')
        return
      }
    }

    notifications.success(isCreate.value ? 'AI 工作流已创建' : '已保存')
    router.push('/config/sop-templates')
  } catch {
    notifications.error('保存失败，请重试')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadDetail()
  await loadVisibility()
  if (isCreate.value) {
    initialFormState.value = JSON.stringify({
      ...form,
      nodes: nodes.value.map((n) => ({
        name: n.name,
        description: n.description,
        prompt: n.prompt,
        sort: n.sort
      }))
    })
  }
})

onBeforeRouteLeave(() => {
  if (isDirty.value) {
    return window.confirm('有未保存的改动，确定离开？')
  }
  return true
})
</script>

<style scoped>
.sop-edit {
  width: 100%;
}

.visibility-section {
  margin-top: var(--space-xl);
}

.content-center {
  max-width: 960px;
  margin: 0 auto;
}

/* ── Loading & Error ── */

.loading-state {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px 0;
}

.skeleton-row {
  height: 48px;
  background: var(--surface-tint);
  border-radius: var(--radius-md);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.error-state {
  text-align: center;
  padding: 64px 0;
}

.error-text {
  color: #ef4444; /* TODO(admin-rebrand): replace with --danger token */
  margin-bottom: 16px;
  font-size: 0.875rem;
}

/* ── Page Header ── */

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--border-light);
}

.back-link {
  background: none;
  border: none;
  color: var(--accent-link);
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0;
  margin-bottom: 8px;
  display: inline-block;
  text-align: left;
  transition: color var(--transition-fast);
}

.back-link:hover {
  color: var(--accent-hover);
}

.page-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
}

/* ── Meta Card ── */

.meta-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 20px 24px;
  margin-bottom: 24px;
  box-shadow: var(--shadow-card);
}

.section-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 16px;
}

.meta-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 480px;
}

/* ── Form Elements ── */

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-group--flex {
  flex: 1;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text);
  display: flex;
  align-items: center;
  gap: 4px;
}

.label-required {
  color: #ef4444; /* TODO(admin-rebrand): replace with --danger token */
  font-weight: 400;
}

.form-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.form-textarea {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  line-height: 1.5;
  background: var(--surface);
  color: var(--text);
  resize: vertical;
  font-family: inherit;
  transition: all var(--transition-fast);
}

.form-textarea::placeholder {
  color: var(--text-muted);
}

.form-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--shadow-focus);
}

.form-input {
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  transition: all var(--transition-fast);
}

.form-input::placeholder {
  color: var(--text-muted);
}

.form-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--shadow-focus);
}

/* ── Split Layout ── */

.split-layout {
  display: flex;
  gap: 20px;
  min-height: 480px;
}

/* ── Step Panel (Left) ── */

.step-panel {
  width: 280px;
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  box-shadow: var(--shadow-card);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  background: var(--surface-tint);
}

.panel-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text);
}

.panel-count {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 500;
}

.panel-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border-light);
  background: var(--surface-tint);
}

.add-step-btn {
  background: none;
  border: 1px dashed var(--border);
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--accent-link);
  padding: 8px 0;
  width: 100%;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.add-step-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.add-step-btn:hover:not(:disabled) {
  color: var(--accent-hover);
  border-color: var(--accent-link);
  background: var(--accent-ultra-soft);
}

.trailing-chat-toggle {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  background: var(--surface);
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.trailing-chat-toggle:hover {
  border-color: var(--accent-link);
}

.trailing-chat-checkbox {
  margin-top: 2px;
  flex-shrink: 0;
  accent-color: var(--accent-link);
  cursor: pointer;
}

.trailing-chat-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.8125rem;
  line-height: 1.4;
}

.trailing-chat-title {
  color: var(--text);
  font-weight: 500;
}

.trailing-chat-hint {
  color: var(--text-muted);
  font-size: 0.75rem;
}

/* ── Step List ── */

.step-list-wrapper {
  flex: 1;
  overflow-y: auto;
}

.step-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  gap: 8px;
}

.empty-icon {
  font-size: 1.5rem;
  opacity: 0.3;
}

.empty-text {
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.step-list {
  display: flex;
  flex-direction: column;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-light);
  transition: all var(--transition-fast);
}

.step-item:last-child {
  border-bottom: none;
}

.step-item:hover {
  background: var(--surface-hover);
}

.step-item.active {
  background: var(--accent-ultra-soft);
  box-shadow: inset 3px 0 0 var(--primary);
}

.step-number {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--surface-tint);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  transition: all var(--transition-fast);
}

.step-item.active .step-number {
  background: var(--primary);
  color: #fff;
}

.step-preview {
  flex: 1;
  font-size: 0.8125rem;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.step-item.active .step-preview {
  font-weight: 500;
}

.step-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.step-item:hover .step-actions {
  opacity: 1;
}

.step-action-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.75rem;
  color: var(--text-muted);
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  line-height: 1;
  transition: all var(--transition-fast);
}

.step-action-btn:hover:not(:disabled) {
  background: var(--surface-tint);
  color: var(--text);
}

.step-action-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

.step-action-btn--danger {
  font-size: 1rem;
}

.step-action-btn--danger:hover {
  color: #ef4444; /* TODO(admin-rebrand): replace with --danger token */
  background: #fef2f2; /* TODO(admin-rebrand): replace with --danger token */
}

/* ── Detail Panel (Right) ── */

.detail-panel {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  box-shadow: var(--shadow-card);
}

.detail-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  padding: 48px;
}

.empty-icon-lg {
  font-size: 2rem;
  opacity: 0.2;
}

.empty-title {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.empty-hint {
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.detail-header {
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-light);
  background: var(--surface-tint);
}

.detail-badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--primary);
  background: var(--accent-soft);
  padding: 3px 10px;
  border-radius: var(--radius-pill);
}

.detail-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  flex: 1;
}

.prompt-textarea {
  flex: 1;
  min-height: 240px;
}
</style>
