<template>
  <div class="chatbot-edit">
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
      <button class="back-link" @click="router.push('/config/chatbots')">&larr; 返回列表</button>

      <div class="content-center">
        <h2 class="page-title">{{ paramId === 'new' ? '新建 AI 助手' : '编辑 AI 助手' }}</h2>

        <form class="edit-form" @submit.prevent="handleSubmit">
          <!-- 名称 -->
          <AppInput
            v-model="form.name"
            label="名称"
            placeholder="请输入 AI 助手名称"
            :error="errors.name"
            @blur="validateName"
          />

          <!-- 描述 -->
          <div class="form-group">
            <label class="form-label">描述</label>
            <textarea
              v-model="form.description"
              class="form-textarea"
              placeholder="请输入描述（20 字以内，可选）"
              maxlength="20"
              rows="3"
            ></textarea>
          </div>

          <!-- 系统提示词 -->
          <div class="form-group">
            <label class="form-label"> 系统提示词 <span class="required">*</span> </label>
            <span class="form-hint">
              定义 AI
              助手的身份、能力和行为规则。例如：「你是一名专业的产品顾问，擅长根据客户需求推荐合适的产品方案。请用简洁专业的语气回答。」
            </span>
            <textarea
              v-model="form.system_prompt"
              class="form-textarea form-textarea--lg"
              placeholder="请输入系统提示词..."
              rows="8"
              @blur="validatePrompt"
            ></textarea>
            <span v-if="errors.system_prompt" class="field-error">{{ errors.system_prompt }}</span>
          </div>

          <!-- 打招呼 -->
          <div class="form-group">
            <label class="greeting-toggle">
              <input
                v-model="form.greeting_enabled"
                type="checkbox"
                class="greeting-checkbox-input"
              />
              <span class="greeting-checkbox-box" aria-hidden="true">
                <svg
                  viewBox="0 0 16 16"
                  width="11"
                  height="11"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="3 8.5 6.5 12 13 4.5" />
                </svg>
              </span>
              <span class="greeting-label">打招呼</span>
              <span class="greeting-hint">开启后，用户首次打开会话时 AI 助手将主动发送这句话</span>
            </label>
            <textarea
              v-model="form.greeting_message"
              class="form-textarea"
              :class="{ 'form-textarea--disabled': !form.greeting_enabled }"
              placeholder="请输入打招呼的内容，例如：你好！我是你的智能助手，有什么可以帮你的？"
              rows="3"
              :disabled="!form.greeting_enabled"
            ></textarea>
          </div>

          <!-- 知识库选择 -->
          <div class="form-group">
            <label class="form-label">关联知识库</label>
            <div v-if="kbLoading" class="kb-loading">加载知识库列表中...</div>
            <div v-else-if="allKbs.length === 0" class="kb-empty">暂无可用知识库</div>
            <div v-else class="kb-select-list">
              <label
                v-for="kb in allKbs"
                :key="kb.id"
                class="kb-item"
                :class="{ selected: selectedKbIds.has(kb.id) }"
              >
                <input
                  type="checkbox"
                  :checked="selectedKbIds.has(kb.id)"
                  class="kb-checkbox"
                  @change="toggleKb(kb.id)"
                />
                <span class="kb-name">{{ kb.name }}</span>
              </label>
            </div>
          </div>

          <!-- 可见范围权限 (sop-chatbot-visibility-scope) -->
          <div class="visibility-section">
            <VisibilityScopeCard
              v-model="visibilityValue"
              entity-type="chatbot"
              :loading="visibilityLoading"
              :dirty="visibilityDirty"
              :disabled="saving"
              @retry="retryVisibility"
            />
          </div>

          <!-- 提交 -->
          <div class="form-actions">
            <AppButton variant="secondary" type="button" @click="router.push('/config/chatbots')">
              取消
            </AppButton>
            <AppButton type="submit" :loading="saving" :disabled="!isFormValid || saving">
              {{ saving ? '保存中...' : '保存' }}
            </AppButton>
          </div>
        </form>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { useNotificationsStore } from '@/stores/notifications'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import VisibilityScopeCard from '@/components/VisibilityScopeCard.vue'
import { getChatbotVisibility, putChatbotVisibility, type VisibilityValue } from '@/api/visibility'
import type { KnowledgeBase } from '@/types/config'

const route = useRoute()
const router = useRouter()
const store = useConfigStore()
const notifications = useNotificationsStore()

const paramId = route.params.id as string
// isCreate / editId 设为 ref 以支持 create 成功后状态转换 (visibility 保存需要 ID).
const isCreate = ref(paramId === 'new')
const editId = ref(isCreate.value ? 0 : Number(paramId))

const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const initialFormState = ref('')
const kbLoading = ref(false)
const allKbs = ref<KnowledgeBase[]>([])
const selectedKbIds = ref<Set<number>>(new Set())

const form = reactive({
  name: '',
  description: '',
  system_prompt: '',
  greeting_enabled: false,
  greeting_message: ''
})

const errors = reactive({
  name: '',
  system_prompt: ''
})

function validateName() {
  errors.name = form.name.trim() ? '' : '名称不能为空'
}

function validatePrompt() {
  errors.system_prompt = form.system_prompt.trim() ? '' : '系统提示词不能为空'
}

const isFormValid = computed(() => {
  return form.name.trim().length > 0 && form.system_prompt.trim().length > 0
})

const isDirty = computed(() => {
  const current = JSON.stringify({ ...form, kbs: [...selectedKbIds.value] })
  return current !== initialFormState.value
})

function toggleKb(id: number) {
  const s = new Set(selectedKbIds.value)
  if (s.has(id)) {
    s.delete(id)
  } else {
    s.add(id)
  }
  selectedKbIds.value = s
}

// Visibility 可见范围状态 (sop-chatbot-visibility-scope)
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

async function loadVisibility() {
  if (isCreate.value) {
    visibilityLoaded.value = true
    return
  }
  visibilityLoading.value = true
  try {
    const res = await getChatbotVisibility(editId.value)
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
    visibilityLoaded.value = true
  } finally {
    visibilityLoading.value = false
  }
}

async function saveVisibility(chatbotID: number): Promise<void> {
  await putChatbotVisibility(chatbotID, {
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

async function loadDetail() {
  if (isCreate.value) return
  loading.value = true
  loadError.value = ''
  try {
    const detail = await store.fetchChatbotDetail(editId.value)
    if (!detail) {
      loadError.value = 'AI 助手不存在'
      return
    }
    form.name = detail.name
    form.description = detail.description ?? ''
    form.system_prompt = detail.system_prompt ?? ''
    form.greeting_enabled = detail.greeting_enabled ?? false
    form.greeting_message = detail.greeting_message ?? ''
    if (detail.knowledge_bases) {
      selectedKbIds.value = new Set(detail.knowledge_bases.map((kb) => kb.id))
    }
    initialFormState.value = JSON.stringify({ ...form, kbs: [...selectedKbIds.value] })
  } catch {
    loadError.value = '加载失败，请重试'
  } finally {
    loading.value = false
  }
}

async function loadKbs() {
  kbLoading.value = true
  try {
    await store.fetchKnowledgeBases(0, 100)
    allKbs.value = store.knowledgeBases
  } finally {
    kbLoading.value = false
  }
}

async function handleSubmit() {
  validateName()
  validatePrompt()
  if (errors.name || errors.system_prompt) return

  saving.value = true
  try {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      system_prompt: form.system_prompt.trim(),
      knowledge_base_ids: [...selectedKbIds.value],
      greeting_enabled: form.greeting_enabled,
      greeting_message: form.greeting_enabled ? form.greeting_message.trim() : ''
    }

    let chatbotID = editId.value
    let savedOk = false
    const wasCreate = isCreate.value

    if (isCreate.value) {
      const created = await store.addChatbot(payload)
      if (!created) return
      chatbotID = created.id
      editId.value = chatbotID
      isCreate.value = false
      // 切换到 edit 模式 URL, 避免后续操作 (如 visibility 重试) 再走 create 路径
      router.replace(`/config/chatbots/${chatbotID}/edit`)
      savedOk = true
    } else {
      savedOk = await store.editChatbot(editId.value, payload)
    }

    if (!savedOk) return

    initialFormState.value = JSON.stringify({ ...form, kbs: [...selectedKbIds.value] })

    // 第二阶段: 可见范围保存 (visibility 独立端点, 错误隔离不回滚主体)
    if (visibilityLoaded.value && (visibilityChanged() || visibilityDirty.value)) {
      try {
        await saveVisibility(chatbotID)
      } catch {
        visibilityDirty.value = true
        notifications.error('AI 助手已保存, 但可见范围更新失败. 请检查后重试')
        return
      }
    }

    notifications.success(wasCreate ? 'AI 助手已创建' : '已保存')
    router.push('/config/chatbots')
  } catch {
    notifications.error('保存失败，请重试')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadDetail()
  await loadVisibility()
  loadKbs()
  if (isCreate.value) {
    initialFormState.value = JSON.stringify({ ...form, kbs: [...selectedKbIds.value] })
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
.chatbot-edit {
  width: 100%;
}

.content-center {
  max-width: 720px;
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

.back-link {
  background: none;
  border: none;
  color: var(--accent-link);
  cursor: pointer;
  font-size: 0.875rem;
  padding: 0;
  margin-bottom: 8px;
  display: inline-block;
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
  margin-bottom: 24px;
}

/* ── Form ── */

.edit-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text);
}

.required {
  color: #ef4444; /* TODO(admin-rebrand): replace with --danger token */
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

.form-textarea--lg {
  min-height: 160px;
}

.form-textarea--disabled {
  background: var(--surface-tint);
  color: var(--text-muted);
  cursor: not-allowed;
}

.greeting-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  flex-wrap: wrap;
}

.greeting-checkbox-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
  pointer-events: none;
}

.greeting-checkbox-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: transparent;
  transition: all var(--transition-fast);
  flex-shrink: 0;
}

.greeting-checkbox-input:checked ~ .greeting-checkbox-box {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.greeting-checkbox-input:focus-visible ~ .greeting-checkbox-box {
  box-shadow: var(--shadow-focus);
}

.greeting-toggle:hover .greeting-checkbox-box {
  border-color: var(--primary);
}

.greeting-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text);
}

.greeting-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.form-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.field-error {
  font-size: 0.75rem;
  color: #ef4444; /* TODO(admin-rebrand): replace with --danger token */
}

/* ── Knowledge Base Selection ── */

.kb-loading,
.kb-empty {
  font-size: 0.875rem;
  color: var(--text-muted);
  padding: 8px 0;
}

.kb-select-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px;
}

.kb-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.kb-item:hover {
  background: var(--surface-hover);
}

.kb-item.selected {
  background: var(--accent-ultra-soft);
}

.kb-checkbox {
  accent-color: var(--primary);
}

.kb-name {
  font-size: 0.875rem;
  color: var(--text);
}

/* ── Visibility Section ── */

.visibility-section {
  margin-top: var(--space-xl);
}

/* ── Form Actions ── */

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 8px;
}
</style>
