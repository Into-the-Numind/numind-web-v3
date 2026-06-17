<script setup lang="ts">
import { reactive, ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'
import { useAgentBuilderStore } from '@/stores/agentBuilder'
import { useNotificationsStore } from '@/stores/notifications'
import { validateForm } from './components/validation'
import { initialFormState } from '@/types/agentBuilder'
import type { AgentFormState, CreateAgentPayload, PatchAgentPayload } from '@/types/agentBuilder'
import AgentForm from './components/AgentForm.vue'
import AfterSaveModal from './components/AfterSaveModal.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import AppButton from '@/components/common/AppButton.vue'

function goBack() {
  if (props.mode === 'edit' && props.agentId != null) {
    router.push(`/config/agents/${props.agentId}`)
  } else {
    router.push('/config/agents/new')
  }
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  mode: 'create' | 'edit'
  agentId?: number
  fromTemplateId?: number
  fromCopyId?: number
}

const props = defineProps<Props>()

// ── Composables ────────────────────────────────────────────────────────────

const route = useRoute()
const router = useRouter()
const store = useAgentBuilderStore()
const notifications = useNotificationsStore()

// ── Form state ─────────────────────────────────────────────────────────────

const form = reactive<AgentFormState>(initialFormState())
const errors = ref<Record<string, string>>({})
const initialFormSnapshot = ref<string>('')

// ── Load state ─────────────────────────────────────────────────────────────

const loadingInitial = ref(false)
const initError = ref('')

// ── After-save modal ───────────────────────────────────────────────────────

const afterSaveModalVisible = ref(false)
const afterSavedAgentId = ref<number | null>(null)

// ── Leave-confirm modal ────────────────────────────────────────────────────

const leaveConfirmVisible = ref(false)
const pendingResolve = ref<((value: boolean) => void) | null>(null)

// ── Dirty check ───────────────────────────────────────────────────────────

const isDirty = computed(() => JSON.stringify(form) !== initialFormSnapshot.value)

// ── Resolve `from` query param for create mode ─────────────────────────────

function resolvedFromTemplateId(): number | null {
  // Props take precedence; fall back to route.query.from = "template:N"
  if (props.fromTemplateId != null) return props.fromTemplateId
  const from = route.query.from as string | undefined
  if (from && from.startsWith('template:')) {
    const n = parseInt(from.slice('template:'.length), 10)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function resolvedFromCopyId(): number | null {
  if (props.fromCopyId != null) return props.fromCopyId
  const from = route.query.from as string | undefined
  if (from && from.startsWith('copy:')) {
    const n = parseInt(from.slice('copy:'.length), 10)
    return Number.isFinite(n) ? n : null
  }
  return null
}

// ── Initialization ─────────────────────────────────────────────────────────

async function initForm() {
  loadingInitial.value = true
  initError.value = ''
  try {
    if (props.mode === 'edit' && props.agentId) {
      // Edit mode: fetch current agent and populate form
      if (!store.current || store.current.id !== props.agentId) {
        await store.fetchOne(props.agentId)
      }
      const agent = store.current
      if (agent) {
        Object.assign(form, {
          name: agent.name,
          icon_url: agent.icon_url,
          description: agent.description,
          welcome_message: agent.welcome_message,
          // Seed the prompt editor with the EFFECTIVE prompt. Old questionnaire-mode
          // agents have system_prompt="" with the real prompt in custom_skill_body
          // (advanced) or generated_skill_body — surface it so editing preserves it.
          system_prompt:
            agent.system_prompt || agent.custom_skill_body || agent.generated_skill_body || '',
          starters: [...(agent.starters ?? [])],
          tool_flags: { ...(agent.tool_flags ?? {}) },
          daily_credit_cap: agent.daily_credit_cap
        })
      }
    } else {
      // Create mode
      const templateId = resolvedFromTemplateId()
      const copyId = resolvedFromCopyId()

      if (templateId != null) {
        // From template: prefill all fields from template
        if (store.templates.length === 0) {
          await store.fetchTemplates()
        }
        const template = store.templates.find((t) => t.id === templateId)
        if (template) {
          Object.assign(form, {
            name: template.name,
            icon_url: template.icon_url || 'lucide:Bot',
            description: template.description,
            welcome_message: template.welcome_message,
            system_prompt: '',
            starters: [...(template.starters ?? [])],
            tool_flags: { ...(template.tool_flags ?? {}) },
            daily_credit_cap: template.daily_credit_cap
          })
        }
      } else if (copyId != null) {
        // From copy: fetch source agent, clone with "- 副本" suffix
        await store.fetchOne(copyId)
        const source = store.current
        if (source) {
          Object.assign(form, {
            name: `${source.name} - 副本`,
            icon_url: source.icon_url,
            description: source.description,
            welcome_message: source.welcome_message,
            // Effective prompt for copy too — old agents keep their real prompt.
            system_prompt:
              source.system_prompt || source.custom_skill_body || source.generated_skill_body || '',
            starters: [...(source.starters ?? [])],
            tool_flags: { ...(source.tool_flags ?? {}) },
            daily_credit_cap: source.daily_credit_cap
          })
        }
      } else {
        // Scratch: use initial form state (already done in reactive initializer)
        Object.assign(form, initialFormState())
      }
    }
  } catch (e) {
    initError.value = (e as Error).message || '加载失败，请刷新重试'
  } finally {
    loadingInitial.value = false
    // Snapshot AFTER init for dirty detection
    initialFormSnapshot.value = JSON.stringify(form)
  }
}

// ── Scroll to first error ──────────────────────────────────────────────────

function scrollToFirstError() {
  const firstKey = Object.keys(errors.value)[0]
  if (!firstKey) return
  const el = document.querySelector(`[data-question="${firstKey}"]`)
  // jsdom 不实现 scrollIntoView；浏览器里始终存在。守住 typeof 避免单测里
  // unhandled rejection 污染（同时也兜底极旧浏览器 / WebView 缺失）。
  if (el && typeof (el as Element & { scrollIntoView?: unknown }).scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

// ── formToPayload ──────────────────────────────────────────────────────────

function formToPayload(): CreateAgentPayload {
  return {
    name: form.name,
    description: form.description || undefined,
    icon_url: form.icon_url || undefined,
    welcome_message: form.welcome_message || undefined,
    system_prompt: form.system_prompt || undefined,
    starters: form.starters.length > 0 ? [...form.starters] : undefined,
    tool_flags: Object.keys(form.tool_flags).length > 0 ? { ...form.tool_flags } : undefined,
    daily_credit_cap: form.daily_credit_cap
  }
}

// ── Save handler ───────────────────────────────────────────────────────────

async function handleSave() {
  // Run validation
  const validationErrors = validateForm(form)
  if (Object.keys(validationErrors).length > 0) {
    errors.value = validationErrors
    scrollToFirstError()
    return
  }
  errors.value = {}

  try {
    let saved
    if (props.mode === 'create') {
      const templateId = resolvedFromTemplateId()
      const payload: CreateAgentPayload = {
        ...formToPayload(),
        source_template_id: templateId ?? null
      }
      saved = await store.create(payload)
    } else if (props.mode === 'edit' && props.agentId != null) {
      // Edit mode (defensive: explicit mode check + agentId guard prevents
      // route misconfigs from PATCHing /v1/agent/skills/undefined → 400)
      const payload: PatchAgentPayload = formToPayload()
      saved = await store.update(props.agentId, payload)
    } else {
      throw new Error(
        `AgentBuilder misconfigured: mode=${String(props.mode)}, agentId=${String(props.agentId)}; ` +
          `route must pass props { mode: 'create' } or wrap with AgentEdit (which passes mode="edit" + agent-id)`
      )
    }

    // Reset dirty snapshot after successful save
    initialFormSnapshot.value = JSON.stringify(form)

    // Open after-save modal
    afterSavedAgentId.value = saved.id
    afterSaveModalVisible.value = true
  } catch (e) {
    const msg = (e as Error).message || '保存失败，请重试'
    notifications.error(msg)
  }
}

// ── After-save modal handlers ──────────────────────────────────────────────

// After saving, send the operator to the agent's edit page where the
// SkillBindingPanel lives —装载技能 is the real next configuration step (the old
// "试聊一下" button only fired an "即将上线" toast and went to the detail page).
function onConfigureSkills() {
  afterSaveModalVisible.value = false
  if (afterSavedAgentId.value) {
    router.push(`/config/agents/${afterSavedAgentId.value}/edit`)
  }
}

function onSkip() {
  afterSaveModalVisible.value = false
  if (afterSavedAgentId.value) {
    router.push(`/config/agents/${afterSavedAgentId.value}`)
  }
}

// ── Route leave guard ──────────────────────────────────────────────────────

function confirmLeave() {
  leaveConfirmVisible.value = false
  if (pendingResolve.value) {
    pendingResolve.value(true)
    pendingResolve.value = null
  }
}

function cancelLeave() {
  leaveConfirmVisible.value = false
  if (pendingResolve.value) {
    pendingResolve.value(false)
    pendingResolve.value = null
  }
}

onBeforeRouteLeave(async () => {
  if (!isDirty.value) return true
  leaveConfirmVisible.value = true
  return new Promise<boolean>((resolve) => {
    pendingResolve.value = resolve
  })
})

// ── beforeunload listener ──────────────────────────────────────────────────

function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (isDirty.value) {
    e.preventDefault()
    e.returnValue = '您有未保存的更改'
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

onMounted(async () => {
  await initForm()
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <div class="agent-builder">
    <!-- Header -->
    <header class="agent-builder__header">
      <div class="header-left">
        <button class="back-btn" @click="goBack" title="返回">
          <ArrowLeft :size="18" />
        </button>
        <h1 class="agent-builder__title">
          <template v-if="mode === 'edit'">编辑：{{ form.name || '...' }}</template>
          <template v-else>创建新助手</template>
        </h1>
      </div>
      <AppButton variant="primary" :loading="store.saving" @click="handleSave"> 保存 </AppButton>
    </header>

    <!-- Loading state -->
    <div v-if="loadingInitial" class="agent-builder__feedback">
      <div class="agent-builder__spinner" />
      <p>加载中...</p>
    </div>

    <!-- Error state -->
    <div v-else-if="initError" class="agent-builder__feedback agent-builder__feedback--error">
      <p>{{ initError }}</p>
      <AppButton variant="secondary" @click="initForm">重试</AppButton>
    </div>

    <!-- Form -->
    <div v-else class="agent-builder__body">
      <AgentForm
        :model-value="form"
        :errors="errors"
        @update:model-value="Object.assign(form, $event)"
      />
    </div>

    <!-- After-save modal -->
    <AfterSaveModal
      :visible="afterSaveModalVisible"
      :agent-name="form.name"
      @configure-skills="onConfigureSkills"
      @skip="onSkip"
    />

    <!-- Leave confirm modal -->
    <ConfirmModal
      :model-value="leaveConfirmVisible"
      title="未保存的更改"
      message="您有未保存的更改，确认离开？"
      confirm-text="放弃更改"
      cancel-text="继续编辑"
      variant="danger"
      @confirm="confirmLeave"
      @cancel="cancelLeave"
    />
  </div>
</template>

<style scoped>
.agent-builder {
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-8);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.agent-builder__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--surface-low, #f0f4f7);
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--outline-variant, #a9b4b9);
  margin-bottom: var(--space-2);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--outline-variant, #e5e7eb);
  background: var(--surface-low, #fff);
  color: var(--on-surface-variant, #6b7280);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--surface-high, #f3f4f6);
  color: var(--on-surface, #1f2937);
  border-color: var(--tertiary, #2563eb);
}

.agent-builder__title {
  font-family: var(--font-headline);
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--on-surface);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-builder__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.agent-builder__feedback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-12) var(--space-8);
  text-align: center;
  color: var(--on-surface-variant);
  font-size: var(--text-sm);
}

.agent-builder__feedback--error {
  color: var(--danger);
}

.agent-builder__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--outline-variant);
  border-top-color: var(--tertiary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Advanced mode link */
</style>
