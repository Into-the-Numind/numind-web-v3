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
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import AppButton from '@/components/common/AppButton.vue'
// 装载 skill 面板内嵌本页：创建态锁定提示，保存后（或编辑态）就地激活。
import SkillBindingPanel from '@/views/config/skills/components/SkillBindingPanel.vue'

function goBack() {
  if (props.mode === 'edit' && props.agentId != null) {
    router.push(`/config/agents/${props.agentId}`)
  } else {
    // 创建态返回到助手列表（旧实现误指向本页自身）
    router.push('/config/agents')
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

// ── Skill 装载 ──────────────────────────────────────────────────────────────

// 已存在的 agent id 才能装载 skill（接口按 :id 操作）。编辑态 = props.agentId；
// 创建态保存后会 router.replace 到 /:id/edit，由编辑态重新挂载激活面板。
const effectiveAgentId = computed<number | null>(() =>
  props.mode === 'edit' && Number.isFinite(props.agentId) ? (props.agentId as number) : null
)

// Marketplace 装载闭环：/:id/edit?attach_skill=N 进来时自动装载该 skill。
const autoAttachSkillId = computed<number | null>(() => {
  const v = Number(route.query.attach_skill)
  return Number.isFinite(v) && v > 0 ? v : null
})

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
    if (props.mode === 'create') {
      const templateId = resolvedFromTemplateId()
      const payload: CreateAgentPayload = {
        ...formToPayload(),
        source_template_id: templateId ?? null
      }
      const saved = await store.create(payload)
      // Reset dirty snapshot BEFORE navigating so the leave-guard doesn't fire.
      initialFormSnapshot.value = JSON.stringify(form)
      notifications.success('助手已创建，下面可以装载 skill 了')
      // 留在同一形态的页面（编辑态），并就地激活「装载 skill」面板。
      router.replace(`/config/agents/${saved.id}/edit`)
    } else if (props.mode === 'edit' && props.agentId != null) {
      // Edit mode (defensive: explicit mode check + agentId guard prevents
      // route misconfigs from PATCHing /v1/agent/skills/undefined → 400)
      const payload: PatchAgentPayload = formToPayload()
      await store.update(props.agentId, payload)
      initialFormSnapshot.value = JSON.stringify(form)
      notifications.success('已保存')
    } else {
      throw new Error(
        `AgentBuilder misconfigured: mode=${String(props.mode)}, agentId=${String(props.agentId)}; ` +
          `route must pass props { mode: 'create' } or wrap with AgentEdit (which passes mode="edit" + agent-id)`
      )
    }
  } catch (e) {
    const msg = (e as Error).message || '保存失败，请重试'
    notifications.error(msg)
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
    <!-- Header（非 sticky，透明，背景交给 ConfigLayout —— 修复浮动方块接缝） -->
    <header class="agent-builder__header">
      <div class="agent-builder__header-inner">
        <div class="header-left">
          <button class="back-btn" @click="goBack" title="返回">
            <ArrowLeft :size="18" />
          </button>
          <div class="header-titles">
            <h1 class="agent-builder__title">
              <template v-if="mode === 'edit'">编辑：{{ form.name || '...' }}</template>
              <template v-else>创建新助手</template>
            </h1>
            <p class="agent-builder__subtitle">
              <template v-if="mode === 'edit'">调整助手，保存即生效</template>
              <template v-else>填好基本信息与行为指引，保存后即可装载 skill</template>
            </p>
          </div>
        </div>
        <AppButton variant="primary" :loading="store.saving" @click="handleSave"> 保存 </AppButton>
      </div>
    </header>

    <div class="agent-builder__main">
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

      <!-- Form + 装载 skill -->
      <div v-else class="agent-builder__body">
        <AgentForm
          :model-value="form"
          :errors="errors"
          @update:model-value="Object.assign(form, $event)"
        />

        <!-- 装载 skill：已保存（编辑态）→ 激活面板；未保存（创建态）→ 锁定提示 -->
        <SkillBindingPanel
          v-if="effectiveAgentId != null"
          :agent-id="effectiveAgentId"
          :auto-attach-skill-id="autoAttachSkillId"
        />
        <section v-else class="skill-locked">
          <div class="skill-locked__head">
            <h2 class="skill-locked__title">装载 skill</h2>
            <span class="skill-locked__lock">保存后可用</span>
          </div>
          <p class="skill-locked__desc">
            先保存助手，这里就能装载
            skill——独立、可复用的能力包，可跨助手复用，拖拽排序决定调用优先级。
          </p>
        </section>
      </div>
    </div>

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
  /* 背景交给 ConfigLayout / MainLayout；本页不再叠加渐变方块（修复接缝） */
  display: flex;
  flex-direction: column;
}

/* ── 顶栏：非 sticky、透明、底部分隔线 ─────────────────────────────────── */
.agent-builder__header {
  border-bottom: 1px solid var(--border);
}

.agent-builder__header-inner {
  max-width: 820px;
  margin: 0 auto;
  padding: 0 var(--space-xl) var(--space-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-lg);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  min-width: 0;
  flex: 1;
}

.header-titles {
  min-width: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    color var(--transition-fast),
    border-color var(--transition-fast),
    background var(--transition-fast);
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--accent-soft);
  color: var(--primary-hover);
  border-color: var(--accent-light);
}

.agent-builder__title {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--text);
  margin: 0;
  line-height: var(--line-height-tight);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-builder__subtitle {
  margin: 2px 0 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 主体内容区 ────────────────────────────────────────────────────────── */
.agent-builder__main {
  max-width: 820px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  padding: var(--space-2xl) var(--space-xl) var(--space-4xl);
}

.agent-builder__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

/* ── 装载 skill 锁定态（创建未保存时） ─────────────────────────────────── */
.skill-locked {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-xl);
  background: var(--surface-tint);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
}

.skill-locked__head {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.skill-locked__title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--text-secondary);
}

.skill-locked__lock {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--space-sm);
  border-radius: var(--radius-pill);
  background: var(--surface-hover);
  color: var(--text-muted);
  font-size: var(--text-xs);
  font-weight: 600;
}

.skill-locked__desc {
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--line-height-normal);
  color: var(--text-muted);
}

.agent-builder__feedback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-lg);
  padding: var(--space-4xl) var(--space-xl);
  text-align: center;
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.agent-builder__feedback--error {
  /* TODO(admin-rebrand): replace with --danger token */
  color: #ef4444;
}

.agent-builder__spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--primary);
  border-radius: var(--radius-pill);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 560px) {
  .agent-builder__header-inner {
    padding: 0 var(--space-lg) var(--space-md);
  }

  .agent-builder__subtitle {
    display: none;
  }

  .agent-builder__main {
    padding: var(--space-xl) var(--space-lg) var(--space-3xl);
  }
}
</style>
