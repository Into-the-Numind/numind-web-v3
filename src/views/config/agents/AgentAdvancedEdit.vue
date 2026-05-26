<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import { useAgentBuilderStore } from '@/stores/agentBuilder'
import { useNotificationsStore } from '@/stores/notifications'

import ConfirmModal from '@/components/common/ConfirmModal.vue'
import AppButton from '@/components/common/AppButton.vue'
import type { ToolFlags } from '@/types/agentBuilder'

interface Props {
  agentId: number
}

const props = defineProps<Props>()

const store = useAgentBuilderStore()
const router = useRouter()
const notifications = useNotificationsStore()

// --- Local state ---
const toolFlags = ref<ToolFlags>({
  code_sandbox: false,
  media: false,
  dangerous: false
})
const localBody = ref('')
const dangerousConfirmVisible = ref(false)
const leavingConfirmVisible = ref(false)
// Tracks the intended navigation destination when the route guard fires
let pendingNavigation: (() => void) | null = null

// Track previous dangerous value for revert
let prevDangerous = false

// --- Computed ---
const agent = computed(() => store.current)



const charCount = computed(() => localBody.value.length)

const isDirty = computed(() => {
  if (!agent.value) return false
  const original = agent.value.tool_flags ?? {}
  const originalBody = agent.value.custom_skill_body || agent.value.generated_skill_body || ''
  return (
    !!toolFlags.value.code_sandbox !== !!original.code_sandbox ||
    !!toolFlags.value.media !== !!original.media ||
    !!toolFlags.value.dangerous !== !!original.dangerous ||
    localBody.value !== originalBody
  )
})

// --- Sync toolFlags and localBody when agent loads or changes ---
watch(
  () => store.current,
  (a) => {
    if (a && a.id === props.agentId) {
      toolFlags.value = {
        code_sandbox: !!a.tool_flags?.code_sandbox,
        media: !!a.tool_flags?.media,
        dangerous: !!a.tool_flags?.dangerous
      }
      prevDangerous = !!a.tool_flags?.dangerous
      localBody.value = a.custom_skill_body || a.generated_skill_body || ''
    }
  },
  { immediate: true }
)

// --- Lifecycle ---
onMounted(async () => {
  if (!store.current || store.current.id !== props.agentId) {
    await store.fetchOne(props.agentId)
  }
})

// beforeunload browser guard
function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (isDirty.value) {
    e.preventDefault()
    e.returnValue = '您有未保存的更改'
  }
}
onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))

// vue-router guard
onBeforeRouteLeave((_to, _from, next) => {
  if (isDirty.value) {
    pendingNavigation = () => next()
    leavingConfirmVisible.value = true
    next(false) // pause navigation
  } else {
    next()
  }
})

// --- Dangerous toggle ---
function onDangerousChange() {
  if (toolFlags.value.dangerous && !prevDangerous) {
    // User just checked dangerous
    dangerousConfirmVisible.value = true
  } else {
    prevDangerous = !!toolFlags.value.dangerous
  }
}

function confirmDangerous() {
  prevDangerous = true
  dangerousConfirmVisible.value = false
}

function cancelDangerous() {
  toolFlags.value.dangerous = false
  prevDangerous = false
  dangerousConfirmVisible.value = false
}

// --- Leave guard confirm/cancel ---
function confirmLeave() {
  leavingConfirmVisible.value = false
  if (pendingNavigation) {
    pendingNavigation()
    pendingNavigation = null
  }
}

function cancelLeave() {
  leavingConfirmVisible.value = false
  pendingNavigation = null
}

// --- Save ---
async function handleSave() {
  try {
    await store.update(props.agentId, {
      tool_flags: { ...toolFlags.value },
      custom_skill_body: localBody.value
    })
    // Sync local prevDangerous from fresh store data
    if (store.current) {
      prevDangerous = !!store.current.tool_flags?.dangerous
    }
    notifications.success('已保存')
  } catch (e) {
    notifications.error((e as Error).message || '保存失败')
  }
}

// --- Navigation ---
function goBack() {
  router.back()
}
</script>

<template>
  <div class="advanced-editor">

    <!-- Loading state -->
    <div v-if="store.currentLoading" class="advanced-editor__loading">加载中…</div>

    <!-- Error state -->
    <div v-else-if="store.currentError" class="advanced-editor__error">
      <p>{{ store.currentError }}</p>
      <AppButton variant="secondary" size="sm" @click="store.fetchOne(agentId)"> 重试 </AppButton>
    </div>

    <!-- Not found state -->
    <div v-else-if="!agent" class="advanced-editor__empty">未找到对应 Agent。</div>

    <!-- Main content -->
    <template v-else>
      <header class="advanced-editor__header">
        <h2 class="advanced-editor__title">{{ agent.name }} · 高级模式</h2>
        <span class="advanced-editor__char-count" :class="{ 'char-count--warn': charCount > 8000 }">
          {{ charCount }} / 建议 ≤ 8000
        </span>
      </header>

      <!-- Edit body textarea -->
      <textarea
        v-model="localBody"
        class="advanced-textarea"
        rows="30"
        spellcheck="false"
        placeholder="请输入系统提示词（Prompt）..."
      />

      <!-- Tool flags section -->
      <section class="tool-flags">
        <h3 class="tool-flags__title">工具开关</h3>
        <label class="tool-flags__item">
          <input type="checkbox" v-model="toolFlags.code_sandbox" />
          沙箱代码执行
        </label>
        <label class="tool-flags__item">
          <input type="checkbox" v-model="toolFlags.media" />
          多媒体处理
        </label>
        <label class="tool-flags__item tool-flags__item--dangerous">
          <input type="checkbox" v-model="toolFlags.dangerous" @change="onDangerousChange" />
          高危工具（谨慎开启）
        </label>
      </section>

      <footer class="advanced-editor__footer">
        <AppButton @click="handleSave" :loading="store.saving">保存</AppButton>
        <AppButton variant="secondary" @click="goBack">返回</AppButton>
      </footer>
    </template>

    <!-- Dangerous confirmation modal -->
    <ConfirmModal
      :model-value="dangerousConfirmVisible"
      title="开启高危工具"
      message="高危工具可能造成不可逆操作（如发送邮件、修改学员数据），仅在你充分理解后果时启用。"
      variant="danger"
      confirm-text="确认开启"
      cancel-text="取消"
      @confirm="confirmDangerous"
      @cancel="cancelDangerous"
    />

    <!-- Route leave confirmation modal -->
    <ConfirmModal
      :model-value="leavingConfirmVisible"
      title="您有未保存的更改"
      message="确认离开？未保存的更改将丢失。"
      confirm-text="离开"
      cancel-text="继续编辑"
      @confirm="confirmLeave"
      @cancel="cancelLeave"
    />
  </div>
</template>

<style scoped>
.advanced-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
  padding: var(--space-6, 24px);
  max-width: 900px;
}

.advanced-editor__loading,
.advanced-editor__error,
.advanced-editor__empty {
  padding: var(--space-6, 24px);
  color: var(--on-surface-variant, #6b7280);
  font-size: 14px;
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  align-items: flex-start;
}

.advanced-editor__error {
  color: var(--danger, #9f403d);
}

.advanced-editor__header {
  display: flex;
  align-items: center;
  gap: var(--space-4, 16px);
  flex-wrap: wrap;
}

.advanced-editor__title {
  font-family: var(--font-headline, inherit);
  font-size: 20px;
  font-weight: 700;
  color: var(--on-surface, #111827);
  margin: 0;
  flex: 1;
}

.advanced-editor__char-count {
  font-size: 12px;
  color: var(--on-surface-variant, #6b7280);
  white-space: nowrap;
}

.char-count--warn {
  color: var(--danger, #dc2626);
  font-weight: 600;
}

.advanced-textarea {
  width: 100%;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  padding: var(--space-4, 16px);
  border: 1px solid rgba(169, 180, 185, 0.25);
  border-radius: var(--radius-sm, 6px);
  background: var(--surface-lowest, #ffffff);
  color: var(--on-surface, #111827);
  resize: vertical;
  box-sizing: border-box;
}

.advanced-textarea:disabled {
  opacity: 0.85;
}

.tool-flags {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  padding: var(--space-4, 16px);
  border: 1px solid rgba(169, 180, 185, 0.2);
  border-radius: var(--radius-sm, 6px);
  background: var(--surface-lowest, #fff);
}

.tool-flags__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--on-surface, #111827);
  margin: 0 0 var(--space-2, 8px);
}

.tool-flags__item {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  font-size: 14px;
  color: var(--on-surface, #111827);
  cursor: pointer;
  user-select: none;
}

.tool-flags__item input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.tool-flags__item--dangerous {
  color: var(--danger, #dc2626);
}

.advanced-editor__footer {
  display: flex;
  gap: var(--space-3, 12px);
  align-items: center;
}
</style>
