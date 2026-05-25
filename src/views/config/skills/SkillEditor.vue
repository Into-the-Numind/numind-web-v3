<!--
  SkillEditor — Skill 资产编辑器（create + edit 模式）

  布局：左侧 CodeMirror 6 markdown 编辑器（含 frontmatter）+ 右侧表单
  双向同步逻辑（spec §5.3）：
    - 编辑器变化 → debounce 300ms → parseFrontmatter → 更新表单
    - 表单变化 → serializeFrontmatter → 更新编辑器
    - isFormDriven flag 防死循环（任一端 emit 时锁定另一端的 watch）
    - 保存时仅发送 { name, description, when_to_use, allowed_tools, body_md }
      —— 不发 frontmatter 原始 YAML（后端单列存）

  ADR-2 大小限制：
    - 50KB → 显示软警告
    - 200KB → 阻止保存

  agent-mode-v2-skill-as-artifact (S4 T11)
  Refs: docs/superpowers/specs/2026-05-24-agent-mode-v2-skill-as-artifact-design.md §5.3, ADR-2/3/11
-->
<script setup lang="ts">
import { ref, computed, onMounted, watch, onBeforeUnmount } from 'vue'
import { useRouter, useRoute, onBeforeRouteLeave } from 'vue-router'
import { useSkillStore } from '@/stores/skill'
import { useNotificationsStore } from '@/stores/notifications'
import {
  parseFrontmatter,
  serializeFrontmatter,
  frontmatterEqual
} from './composables/useFrontmatterSync'
import CodeMirrorEditor from './components/CodeMirrorEditor.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import {
  SKILL_BODY_SOFT_LIMIT,
  SKILL_BODY_HARD_LIMIT,
  type Frontmatter,
  type CreateSkillRequest
} from '@/types/skill'

interface Props {
  mode: 'create' | 'edit'
}

const props = defineProps<Props>()

const router = useRouter()
const route = useRoute()
const store = useSkillStore()
const notifications = useNotificationsStore()

const skillId = computed(() => (props.mode === 'edit' ? Number(route.params.id) : null))

// ---------- 编辑器与表单 state ----------
const rawContent = ref('') // 编辑器原始字符串（含 frontmatter）
const frontmatterForm = ref<Frontmatter>({
  name: '',
  description: '',
  when_to_use: '',
  allowed_tools: []
})
const bodyMd = ref('')
const parseError = ref<string | null>(null)
// 工具白名单文本（逗号分隔）便于表单输入
const allowedToolsText = ref('')

// 同步循环 guard
let isFormDriven = false // 表单 → 编辑器更新中
let isEditorDriven = false // 编辑器 → 表单更新中
let parseTimer: ReturnType<typeof setTimeout> | null = null

// 保存状态
const saving = ref(false)
const initialContent = ref('')
const leaveConfirmVisible = ref(false)
let pendingNavigation: (() => void) | null = null

// ---------- Computed ----------
const bodyBytes = computed(() => new Blob([bodyMd.value]).size)
const exceedsSoftLimit = computed(() => bodyBytes.value > SKILL_BODY_SOFT_LIMIT)
const exceedsHardLimit = computed(() => bodyBytes.value > SKILL_BODY_HARD_LIMIT)

const isDirty = computed(() => rawContent.value !== initialContent.value)

const canSave = computed(() => {
  return (
    !!frontmatterForm.value.name.trim() &&
    !!bodyMd.value.trim() &&
    !exceedsHardLimit.value &&
    !saving.value
  )
})

const validationHints = computed<string[]>(() => {
  const hints: string[] = []
  if (!frontmatterForm.value.name.trim()) hints.push('name 必填')
  if (frontmatterForm.value.name.length > 100) hints.push('name 不能超过 100 字符')
  if ((frontmatterForm.value.description || '').length > 300)
    hints.push('description 不能超过 300 字符')
  if ((frontmatterForm.value.when_to_use || '').length > 500)
    hints.push('when_to_use 不能超过 500 字符')
  if (!bodyMd.value.trim()) hints.push('body 不能为空')
  if (exceedsHardLimit.value) hints.push(`内容超过硬限 ${SKILL_BODY_HARD_LIMIT / 1024}KB，无法保存`)
  return hints
})

// ---------- 数据初始化 ----------
async function loadForEdit() {
  if (!skillId.value) return
  await store.fetchOne(skillId.value)
  const s = store.current
  if (!s) return

  // 从 store skill 重构 frontmatter + body
  frontmatterForm.value = {
    name: s.name,
    description: s.description,
    when_to_use: s.when_to_use,
    allowed_tools: s.allowed_tools || []
  }
  bodyMd.value = s.body_md
  allowedToolsText.value = (s.allowed_tools || []).join(', ')
  // 初始内容写编辑器（form-driven 防回环）
  isFormDriven = true
  rawContent.value = serializeFrontmatter(frontmatterForm.value, bodyMd.value)
  initialContent.value = rawContent.value
  queueMicrotask(() => {
    isFormDriven = false
  })
}

function initEmpty() {
  // 给一个简单的脚手架，让用户秒上手
  const scaffold = `---
name:
description:
when_to_use:
allowed_tools: []
---

# 在这里描述你的 Skill

写清楚 AI 应该如何应用这项技能、有哪些步骤、注意事项等。
`
  rawContent.value = scaffold
  initialContent.value = scaffold
  // 编辑器内容会触发 watch → parse → 填表单
}

onMounted(async () => {
  if (props.mode === 'edit') {
    await loadForEdit()
  } else {
    initEmpty()
  }
})

// ---------- 编辑器 → 表单（debounce 300ms） ----------
watch(rawContent, () => {
  if (isFormDriven) return
  if (parseTimer) clearTimeout(parseTimer)
  parseTimer = setTimeout(() => {
    const parsed = parseFrontmatter(rawContent.value)
    if (parsed.ok) {
      parseError.value = null
      // 仅当字段真的变化才更新表单（避免无意义 dom 重渲染）
      if (!frontmatterEqual(parsed.frontmatter, frontmatterForm.value)) {
        isEditorDriven = true
        frontmatterForm.value = {
          name: parsed.frontmatter.name || '',
          description: parsed.frontmatter.description || '',
          when_to_use: parsed.frontmatter.when_to_use || '',
          allowed_tools: parsed.frontmatter.allowed_tools || []
        }
        allowedToolsText.value = (parsed.frontmatter.allowed_tools || []).join(', ')
        queueMicrotask(() => {
          isEditorDriven = false
        })
      }
      if (bodyMd.value !== parsed.body) {
        isEditorDriven = true
        bodyMd.value = parsed.body
        queueMicrotask(() => {
          isEditorDriven = false
        })
      }
    } else {
      parseError.value = parsed.error || 'frontmatter 解析失败'
      // ADR-11 fallback: 保留 raw，不擦表单
    }
  }, 300)
})

// ---------- 表单 → 编辑器 ----------
function onFormChange() {
  if (isEditorDriven) return
  // allowedToolsText → frontmatterForm.allowed_tools
  frontmatterForm.value.allowed_tools = allowedToolsText.value
    .split(',')
    .map((t) => t.trim())
    .filter((t) => !!t)
  isFormDriven = true
  rawContent.value = serializeFrontmatter(frontmatterForm.value, bodyMd.value)
  queueMicrotask(() => {
    isFormDriven = false
  })
}

watch(
  () => [
    frontmatterForm.value.name,
    frontmatterForm.value.description,
    frontmatterForm.value.when_to_use,
    allowedToolsText.value
  ],
  onFormChange
)

// ---------- 保存 ----------
async function onSave() {
  if (!canSave.value) {
    notifications.error(validationHints.value[0] || '请检查表单')
    return
  }
  saving.value = true
  try {
    const payload: CreateSkillRequest = {
      name: frontmatterForm.value.name.trim(),
      description: frontmatterForm.value.description?.trim() || '',
      when_to_use: frontmatterForm.value.when_to_use?.trim() || '',
      allowed_tools: frontmatterForm.value.allowed_tools || [],
      body_md: bodyMd.value,
      source_type: 'custom'
    }
    if (props.mode === 'create') {
      const created = await store.create(payload)
      notifications.success('Skill 已创建')
      initialContent.value = rawContent.value // mark clean so navigation 不阻塞
      router.replace(`/config/skills/${created.id}`)
    } else if (skillId.value) {
      const updated = await store.update(skillId.value, payload)
      notifications.success(`已保存（v${updated.version}）`)
      initialContent.value = rawContent.value
      router.push(`/config/skills/${skillId.value}`)
    }
  } catch (e) {
    notifications.error((e as Error).message || '保存失败')
  } finally {
    saving.value = false
  }
}

function onCancel() {
  if (props.mode === 'edit' && skillId.value) {
    router.push(`/config/skills/${skillId.value}`)
  } else {
    router.push('/config/skills')
  }
}

// 跳转到发布页 (agent-mode-v2-skill-marketplace T10).
// 仅 edit 模式调用 (button v-if 已守卫); skillId 非 null 时安全.
function onPublishToMarketplace() {
  if (!skillId.value) return
  router.push(`/marketplace/publish/${skillId.value}`)
}

// ---------- Dirty guard（离开前确认） ----------
function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (isDirty.value) {
    e.preventDefault()
    e.returnValue = '您有未保存的更改'
  }
}
onMounted(() => window.addEventListener('beforeunload', handleBeforeUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))

onBeforeRouteLeave((_to, _from, next) => {
  if (isDirty.value) {
    pendingNavigation = () => next()
    leaveConfirmVisible.value = true
    next(false)
  } else {
    next()
  }
})

function confirmLeave() {
  leaveConfirmVisible.value = false
  if (pendingNavigation) {
    const fn = pendingNavigation
    pendingNavigation = null
    fn()
  }
}

function cancelLeave() {
  leaveConfirmVisible.value = false
  pendingNavigation = null
}

// 格式化 KB 显示
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
</script>

<template>
  <div class="skill-editor">
    <!-- 顶部栏 -->
    <header class="skill-editor__header">
      <div class="skill-editor__title">
        <h2>{{ mode === 'create' ? '新建 Skill' : '编辑 Skill' }}</h2>
        <span v-if="mode === 'edit' && store.current" class="skill-editor__version">
          当前版本 v{{ store.current.version }}
        </span>
      </div>
      <div class="skill-editor__actions">
        <!-- 发布到市场 (agent-mode-v2-skill-marketplace T10, spec §8.4) -->
        <!-- 仅 edit 模式可见 (创建模式 skill 还未保存, 无法 publish). -->
        <!-- 跳转到 /marketplace/publish/:skill_id 走完整两步发布 flow. -->
        <AppButton
          v-if="mode === 'edit' && skillId"
          variant="text"
          :disabled="saving"
          @click="onPublishToMarketplace"
        >
          发布到市场
        </AppButton>
        <AppButton variant="secondary" :disabled="saving" @click="onCancel">取消</AppButton>
        <AppButton variant="primary" :disabled="!canSave" @click="onSave">
          {{ saving ? '保存中…' : '保存' }}
        </AppButton>
      </div>
    </header>

    <!-- 警告条 -->
    <div v-if="parseError" class="skill-editor__warning warning--parse">
      <span
        >⚠ frontmatter 解析提示：{{ parseError }}（已保留原内容；可继续编辑直到 YAML 合法）</span
      >
    </div>
    <div v-if="exceedsSoftLimit && !exceedsHardLimit" class="skill-editor__warning warning--soft">
      <span>
        内容大小 {{ formatBytes(bodyBytes) }} 超过推荐上限 50KB，建议精简（最多
        {{ formatBytes(SKILL_BODY_HARD_LIMIT) }}）
      </span>
    </div>
    <div v-if="exceedsHardLimit" class="skill-editor__warning warning--hard">
      <span>
        内容大小 {{ formatBytes(bodyBytes) }} 超过硬限
        {{ formatBytes(SKILL_BODY_HARD_LIMIT) }}，无法保存，请精简
      </span>
    </div>

    <!-- 主体：左编辑器 + 右表单 -->
    <div class="skill-editor__body">
      <section class="skill-editor__editor">
        <header class="panel-header">
          <h3>Markdown 编辑器</h3>
          <span class="panel-meta">
            {{ formatBytes(bodyBytes) }}
          </span>
        </header>
        <CodeMirrorEditor
          v-model="rawContent"
          height="calc(100vh - 280px)"
          placeholder="在这里编辑 Skill 内容（含 YAML frontmatter + Markdown 正文）"
        />
      </section>

      <aside class="skill-editor__form">
        <header class="panel-header">
          <h3>表单（与编辑器双向同步）</h3>
        </header>

        <div class="form-field">
          <label class="form-label">名称 <span class="required">*</span></label>
          <AppInput
            v-model="frontmatterForm.name"
            placeholder="例：销售数据分析师"
            :error="frontmatterForm.name.length > 100 ? '超出 100 字符' : ''"
          />
        </div>

        <div class="form-field">
          <label class="form-label">描述</label>
          <textarea
            v-model="frontmatterForm.description"
            class="form-textarea"
            rows="2"
            placeholder="简短一句话描述（最多 300 字符）"
            maxlength="300"
          />
        </div>

        <div class="form-field">
          <label class="form-label">何时使用 (when_to_use)</label>
          <textarea
            v-model="frontmatterForm.when_to_use"
            class="form-textarea"
            rows="3"
            placeholder="描述触发场景，v2 Runtime 会注入到 system prompt（最多 500 字符）"
            maxlength="500"
          />
        </div>

        <div class="form-field">
          <label class="form-label">允许的工具 (逗号分隔)</label>
          <AppInput
            v-model="allowedToolsText"
            placeholder="例：web_search, bash_exec, code_sandbox"
          />
          <p class="form-hint">v2 Runtime 调用时会临时合并到 Agent 工具白名单</p>
        </div>

        <div v-if="validationHints.length > 0" class="form-hints-list">
          <p v-for="(h, i) in validationHints" :key="i">{{ h }}</p>
        </div>
      </aside>
    </div>

    <!-- 离开确认 -->
    <ConfirmModal
      :model-value="leaveConfirmVisible"
      title="未保存的更改"
      message="离开会丢失编辑内容，确认离开？"
      variant="danger"
      confirm-text="确认离开"
      cancel-text="留在此页"
      @confirm="confirmLeave"
      @cancel="cancelLeave"
    />
  </div>
</template>

<style scoped>
.skill-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-6);
  height: 100%;
}

.skill-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.skill-editor__title {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}

.skill-editor__title h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.skill-editor__version {
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.skill-editor__actions {
  display: flex;
  gap: var(--space-2);
}

.skill-editor__warning {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
}

.warning--parse {
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  color: #b45309;
}

.warning--soft {
  background: rgba(96, 165, 250, 0.1);
  border: 1px solid rgba(96, 165, 250, 0.3);
  color: #1d4ed8;
}

.warning--hard {
  background: var(--danger-surface, #fef2f2);
  border: 1px solid var(--danger-border, #fca5a5);
  color: var(--danger, #dc2626);
  font-weight: 600;
}

.skill-editor__body {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: var(--space-4);
  flex: 1;
  min-height: 0;
}

.skill-editor__editor,
.skill-editor__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  background: var(--surface);
  border-radius: var(--radius-md);
  border: 1px solid rgba(169, 180, 185, 0.1);
  padding: var(--space-4);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}

.panel-header h3 {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.panel-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.form-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text);
}

.required {
  color: var(--danger, #dc2626);
}

.form-textarea {
  padding: var(--space-2) var(--space-3);
  border: 1px solid rgba(169, 180, 185, 0.2);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
  font-family: inherit;
  font-size: 0.875rem;
  resize: vertical;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--primary);
}

.form-hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.form-hints-list {
  padding: var(--space-2) var(--space-3);
  background: rgba(251, 191, 36, 0.05);
  border-radius: var(--radius-sm);
}

.form-hints-list p {
  margin: 0;
  font-size: 0.75rem;
  color: #b45309;
}

.form-hints-list p + p {
  margin-top: var(--space-1);
}

@media (max-width: 900px) {
  .skill-editor__body {
    grid-template-columns: 1fr;
  }
}
</style>
