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
      <!-- 头部 -->
      <div class="page-header">
        <button class="back-link" @click="router.push('/config/chatbots')">&larr; 返回列表</button>
        <h2 class="page-title">{{ isCreate ? '新建智能体' : '编辑智能体' }}</h2>
      </div>

      <form class="edit-form" @submit.prevent="handleSubmit">
        <!-- 名称 -->
        <AppInput
          v-model="form.name"
          label="名称"
          placeholder="请输入智能体名称"
          :error="errors.name"
          @blur="validateName"
        />

        <!-- 描述 -->
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea
            v-model="form.description"
            class="form-textarea"
            placeholder="请输入描述（可选）"
            rows="3"
          ></textarea>
        </div>

        <!-- 系统提示词 -->
        <div class="form-group">
          <label class="form-label"> 系统提示词 <span class="required">*</span> </label>
          <textarea
            v-model="form.system_prompt"
            class="form-textarea form-textarea--lg"
            placeholder="请输入系统提示词，定义智能体的角色和行为"
            rows="8"
            @blur="validatePrompt"
          ></textarea>
          <span v-if="errors.system_prompt" class="field-error">{{ errors.system_prompt }}</span>
        </div>

        <!-- 打招呼 -->
        <div class="form-group">
          <label class="greeting-toggle">
            <input v-model="form.greeting_enabled" type="checkbox" class="greeting-checkbox" />
            <span class="greeting-label">打招呼</span>
            <span class="greeting-hint">开启后，用户首次打开会话时智能体将主动发送这句话</span>
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
import type { KnowledgeBase } from '@/types/config'

const route = useRoute()
const router = useRouter()
const store = useConfigStore()
const notifications = useNotificationsStore()

const paramId = route.params.id as string
const isCreate = paramId === 'new'
const editId = isCreate ? 0 : Number(paramId)

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

async function loadDetail() {
  if (isCreate) return
  loading.value = true
  loadError.value = ''
  try {
    const detail = await store.fetchChatbotDetail(editId)
    if (!detail) {
      loadError.value = '智能体不存在'
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

    let ok: boolean
    if (isCreate) {
      ok = await store.addChatbot(payload)
    } else {
      ok = await store.editChatbot(editId, payload)
    }

    if (ok) {
      initialFormState.value = JSON.stringify({ ...form, kbs: [...selectedKbIds.value] })
      notifications.success(isCreate ? '智能体已创建' : '已保存')
      router.push('/config/chatbots')
    }
  } catch {
    notifications.error('保存失败，请重试')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadDetail()
  loadKbs()
  if (isCreate) {
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
  max-width: 720px;
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
  margin-bottom: 24px;
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
  font-family: var(--font-heading);
  color: var(--text);
  letter-spacing: -0.01em;
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

.greeting-checkbox {
  accent-color: var(--primary);
  width: 16px;
  height: 16px;
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

/* ── Form Actions ── */

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 8px;
}
</style>
