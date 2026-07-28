<!--
  SkillEditor — Skill 资产编辑器（create + edit 模式）

  布局：左侧 CodeMirror 6 markdown 编辑器（含 frontmatter）+ 右侧表单
  双向同步逻辑（spec §5.3）：
    - 编辑器变化 → debounce 300ms → parseFrontmatter → 更新表单
    - 表单变化 → serializeFrontmatter → 更新编辑器
    - isFormDriven flag 防死循环（任一端 emit 时锁定另一端的 watch）
    - 保存时仅发送 { name, description, when_to_use, body_md }
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
import { useUserStore } from '@/stores/user'
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
const userStore = useUserStore()
const notifications = useNotificationsStore()

const skillId = computed(() => (props.mode === 'edit' ? Number(route.params.id) : null))

// ---------- 可见性 (skill-3tier-visibility T4) ----------
// 父账户可选 机构级(institution, 默认) / 个人(sub_user)；子账户强制 sub_user（选择器禁用）。
// 'official' 永不可从前端设置。
type EditableVisibility = 'institution' | 'sub_user'
const isParent = computed(() => userStore.isParentUser)
const visibility = ref<EditableVisibility>('institution')

// 子账户始终 sub_user；编辑已有 official 技能（理论上 can_edit=false 不会进编辑器）不在此可选范围。
watch(
  isParent,
  (parent) => {
    if (!parent) visibility.value = 'sub_user'
  },
  { immediate: true }
)

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

// 同步循环 guard
let isFormDriven = false // 表单 → 编辑器更新中
let isEditorDriven = false // 编辑器 → 表单更新中
let parseTimer: ReturnType<typeof setTimeout> | null = null

// 保存状态
const saving = ref(false)
const initialContent = ref('')
const leaveConfirmVisible = ref(false)
const pendingNavigationPath = ref<string | null>(null)
let forceLeave = false

// ---------- Computed ----------
const bodyBytes = computed(() => new Blob([bodyMd.value]).size)
const exceedsSoftLimit = computed(() => bodyBytes.value > SKILL_BODY_SOFT_LIMIT)
const exceedsHardLimit = computed(() => bodyBytes.value > SKILL_BODY_HARD_LIMIT)

const isDirty = computed(() => rawContent.value !== initialContent.value)

// skill-3tier-visibility T4: 发布按钮按 can_edit gate（仅技能所有者可发布；官方/他人技能不可）。
// 缺省（旧后端未返回 can_edit）回退 true 保持既有行为。
const canPublish = computed(() => store.current?.can_edit !== false)

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
  // 编辑模式：用已有 visibility 预填（official 不在可编辑范围，回退 institution）。
  visibility.value = s.visibility === 'sub_user' ? 'sub_user' : 'institution'
  // 子账户即便编辑机构技能也无权改为非 sub_user（理论上 can_edit gate 已拦），强制兜底。
  if (!isParent.value) visibility.value = 'sub_user'
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
---

# 在这里描述你的 Skill

写清楚 AI 应该如何应用这项技能、有哪些步骤、注意事项等。
`
  rawContent.value = scaffold
  initialContent.value = scaffold
  // 编辑器内容会触发 watch → parse → 填表单
}

onMounted(async () => {
  // 确保 userInfo 就绪，决定可见性选择器显隐（父账户才显示）。
  if (!userStore.userInfo) await userStore.fetchUserInfo()
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
    frontmatterForm.value.when_to_use
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
      body_md: bodyMd.value,
      source_type: 'custom',
      // skill-3tier-visibility T4: 父账户传所选 visibility；子账户恒 'sub_user'（后端也会强制）。
      visibility: isParent.value ? visibility.value : 'sub_user'
    }
    if (props.mode === 'create') {
      await store.create(payload)
      notifications.success('Skill 已创建')
      initialContent.value = rawContent.value // mark clean so navigation 不阻塞
      router.push('/config/skills')
    } else if (skillId.value) {
      await store.update(skillId.value, payload)
      notifications.success('已保存')
      initialContent.value = rawContent.value
      router.push('/config/skills')
    }
  } catch (e) {
    notifications.error((e as Error).message || '保存失败')
  } finally {
    saving.value = false
  }
}

function onCancel() {
  requestNavigate('/config/skills')
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

function requestNavigate(path: string) {
  if (isDirty.value) {
    pendingNavigationPath.value = path
    leaveConfirmVisible.value = true
  } else {
    router.push(path)
  }
}

onBeforeRouteLeave((to) => {
  if (!forceLeave && isDirty.value) {
    pendingNavigationPath.value = to.fullPath
    leaveConfirmVisible.value = true
    return false
  }
  return true
})

function confirmLeave() {
  leaveConfirmVisible.value = false
  const target = pendingNavigationPath.value || '/config/skills'
  pendingNavigationPath.value = null
  forceLeave = true
  router.push(target).finally(() => {
    forceLeave = false
  })
}

function cancelLeave() {
  leaveConfirmVisible.value = false
  pendingNavigationPath.value = null
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
    <!-- Masthead 顶栏（与 agent 配置页统一：默认 sans 标题 + 底部分隔线） -->
    <header class="skill-editor__header">
      <div class="skill-editor__header-inner">
        <div class="header-titles">
          <h1 class="skill-editor__title">
            {{ mode === 'create' ? '新建 Skill' : '编辑 Skill' }}
          </h1>
          <p class="skill-editor__subtitle">
            用 Markdown + frontmatter 定义可复用的技能资产，左侧编辑器与右侧表单实时同步。
          </p>
        </div>
        <div class="skill-editor__actions">
          <!-- 发布到市场：仅 edit 模式可见，跳转 /marketplace/publish/:skill_id 走两步发布 -->
          <AppButton
            v-if="mode === 'edit' && skillId && canPublish"
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
      </div>
    </header>

    <div class="skill-editor__main">
      <!-- 警告条 -->
      <div v-if="parseError" class="editor-alert editor-alert--warn">
        ⚠ frontmatter 解析提示：{{ parseError }}（已保留原内容；可继续编辑直到 YAML 合法）
      </div>
      <div v-if="exceedsSoftLimit && !exceedsHardLimit" class="editor-alert editor-alert--info">
        内容大小 {{ formatBytes(bodyBytes) }} 超过推荐上限 50KB，建议精简（最多
        {{ formatBytes(SKILL_BODY_HARD_LIMIT) }}）
      </div>
      <div v-if="exceedsHardLimit" class="editor-alert editor-alert--error">
        内容大小 {{ formatBytes(bodyBytes) }} 超过硬限
        {{ formatBytes(SKILL_BODY_HARD_LIMIT) }}，无法保存，请精简
      </div>

      <!-- 主体：左编辑器 + 右表单 -->
      <div class="skill-editor__body">
        <section class="card skill-editor__editor">
          <header class="card__head">
            <div class="card__title-row">
              <h2 class="card__title">Skill 内容</h2>
              <span class="card__badge">Markdown</span>
              <span class="card__meta">{{ formatBytes(bodyBytes) }}</span>
            </div>
            <p class="card__desc">
              顶部 YAML frontmatter 定义元信息，正文用 Markdown 写清楚 AI 如何应用这项技能。
            </p>
          </header>
          <CodeMirrorEditor
            v-model="rawContent"
            height="calc(100vh - 300px)"
            placeholder="在这里编辑 Skill 内容（含 YAML frontmatter + Markdown 正文）"
          />
        </section>

        <aside class="card skill-editor__form">
          <header class="card__head">
            <h2 class="card__title">技能信息</h2>
            <p class="card__desc">与左侧编辑器双向同步，改任一边另一边自动更新。</p>
          </header>

          <!-- 可见性 (skill-3tier-visibility T4) -->
          <div class="field">
            <label class="field__label">可见性</label>
            <select
              v-model="visibility"
              class="field__input field__select"
              :disabled="!isParent"
              aria-label="可见性"
            >
              <option value="institution">机构级（本机构所有成员可见）</option>
              <option value="sub_user">个人（仅自己可见）</option>
            </select>
            <p v-if="isParent" class="field__hint">
              机构级技能对父账户及所有子账户可见；个人技能仅你本人可见。
            </p>
            <p v-else class="field__hint">子账户创建的技能为个人技能，仅你本人可见。</p>
          </div>

          <!-- 名称 -->
          <div class="field">
            <label class="field__label">名称<span class="field__req">*</span></label>
            <AppInput
              v-model="frontmatterForm.name"
              placeholder="例：销售数据分析师"
              :error="frontmatterForm.name.length > 100 ? '超出 100 字符' : ''"
            />
          </div>

          <!-- 描述 -->
          <div class="field">
            <label class="field__label">描述<span class="field__optional">（选填）</span></label>
            <textarea
              v-model="frontmatterForm.description"
              class="field__textarea"
              rows="2"
              placeholder="简短一句话描述（最多 300 字符）"
              maxlength="300"
            />
          </div>

          <!-- 何时使用 -->
          <div class="field">
            <label class="field__label"
              >何时使用<span class="field__optional">（选填）</span></label
            >
            <textarea
              v-model="frontmatterForm.when_to_use"
              class="field__textarea"
              rows="3"
              placeholder="描述触发场景，运行时会注入到 system prompt（最多 500 字符）"
              maxlength="500"
            />
          </div>

          <div v-if="validationHints.length > 0" class="field-hints">
            <p v-for="(h, i) in validationHints" :key="i">{{ h }}</p>
          </div>
        </aside>
      </div>
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
  min-height: 100%;
}

/* ── Masthead 顶栏（对齐 agent 配置页：非 sticky、底部分隔线、默认 sans 标题） ── */
.skill-editor__header {
  border-bottom: 1px solid var(--border);
}

.skill-editor__header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-lg);
  padding: 0 var(--space-xl) var(--space-lg);
}

.header-titles {
  min-width: 0;
}

.skill-editor__title {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--text);
  line-height: var(--line-height-tight);
}

.skill-editor__subtitle {
  margin: 2px 0 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.skill-editor__actions {
  display: flex;
  gap: var(--space-sm);
  flex-shrink: 0;
}

/* ── 主体内容区 ── */
.skill-editor__main {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  padding: var(--space-xl);
  flex: 1;
  min-height: 0;
}

/* ── 警告条 ── */
.editor-alert {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  line-height: var(--line-height-normal);
}

.editor-alert--warn {
  background: #fffbeb; /* TODO(admin-rebrand): replace with --warning-soft token */
  border: 1px solid #fde68a;
  color: #b45309;
}

.editor-alert--info {
  background: var(--accent-soft);
  border: 1px solid var(--accent-light);
  color: var(--accent-link);
}

.editor-alert--error {
  background: #fef2f2; /* TODO(admin-rebrand): replace with --danger-soft token */
  border: 1px solid #fecaca;
  color: #dc2626;
  font-weight: 600;
}

/* ── 双栏主体 ── */
.skill-editor__body {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: var(--space-xl);
  flex: 1;
  min-height: 0;
}

/* ── 卡片（对齐 AgentForm .card） ── */
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-xl);
  min-height: 0;
}

.card__head {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.card__title-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.card__title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--text);
}

.card__badge {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--space-sm);
  border-radius: var(--radius-pill);
  background: var(--accent-soft);
  color: var(--accent-link);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.card__meta {
  margin-left: auto;
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.card__desc {
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--line-height-normal);
  color: var(--text-secondary);
}

/* ── 字段（对齐 AgentForm .field） ── */
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.field__label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
}

.field__req {
  margin-left: 2px;
  /* TODO(admin-rebrand): replace with --danger token */
  color: #ef4444;
}

.field__optional {
  margin-left: var(--space-xs);
  font-weight: 400;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.field__textarea,
.field__input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px var(--space-md);
  font-family: inherit;
  font-size: var(--text-sm);
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: none;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.field__textarea {
  resize: vertical;
}

.field__select {
  cursor: pointer;
}

.field__textarea::placeholder {
  color: var(--text-muted);
}

.field__textarea:focus,
.field__input:focus {
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
}

.field__input:disabled {
  background: var(--surface-tint);
  color: var(--text-secondary);
  cursor: not-allowed;
}

.field__hint {
  margin: 0;
  font-size: var(--text-xs);
  line-height: var(--line-height-normal);
  color: var(--text-muted);
}

/* ── 校验提示 ── */
.field-hints {
  padding: var(--space-sm) var(--space-md);
  background: var(--accent-soft);
  border-radius: var(--radius-sm);
}

.field-hints p {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--accent-link);
}

.field-hints p + p {
  margin-top: var(--space-xs);
}

@media (max-width: 900px) {
  .skill-editor__body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .skill-editor__header-inner {
    padding: 0 var(--space-lg) var(--space-md);
  }

  .skill-editor__subtitle {
    display: none;
  }

  .skill-editor__main {
    padding: var(--space-lg);
  }
}
</style>
