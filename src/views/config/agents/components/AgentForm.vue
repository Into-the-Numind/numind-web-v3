<script setup lang="ts">
import { computed } from 'vue'
import type { AgentFormState } from '@/types/agentBuilder'

interface Props {
  modelValue: AgentFormState
  readonly?: boolean
  errors?: Record<string, string>
  showStatus?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
  showStatus: false,
  errors: () => ({})
})

const emit = defineEmits<{
  'update:modelValue': [value: AgentFormState]
}>()

/** Helper: patch a top-level field */
function patchField<K extends keyof AgentFormState>(key: K, value: AgentFormState[K]): void {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

// Computed proxies for top-level fields
const name = computed({
  get: () => props.modelValue.name,
  set: (v) => patchField('name', v)
})

const description = computed({
  get: () => props.modelValue.description,
  set: (v) => patchField('description', v)
})

const welcomeMessage = computed({
  get: () => props.modelValue.welcome_message,
  set: (v) => patchField('welcome_message', v)
})

const isActive = computed({
  get: () => props.modelValue.is_active,
  set: (v) => patchField('is_active', v)
})

const MAX_NAME_LEN = 20
const MAX_DESCRIPTION_LEN = 20
const MAX_WELCOME_LEN = 500
// 与后端 SystemPromptMaxLen 对齐（64KB）— biz/skill/service.go SystemPromptMaxLen。
const MAX_SYSTEM_PROMPT_LEN = 65536

const systemPrompt = computed({
  get: () => props.modelValue.system_prompt,
  set: (v) => patchField('system_prompt', v)
})
</script>

<template>
  <div class="agent-form" :class="{ 'agent-form--readonly': readonly }">
    <section v-if="showStatus" class="card">
      <header class="card__head">
        <h2 class="card__title">发布状态</h2>
        <p class="card__desc">控制这个 AI 智能体是否出现在用户首页。</p>
      </header>

      <div class="status-options" role="radiogroup" aria-label="AI 智能体发布状态">
        <button
          type="button"
          class="status-option"
          :class="{ 'status-option--active': isActive }"
          :disabled="readonly"
          role="radio"
          :aria-checked="isActive"
          @click="isActive = true"
        >
          <span class="status-option__title">已发布</span>
          <span class="status-option__desc">用户首页可见，可被使用</span>
        </button>
        <button
          type="button"
          class="status-option"
          :class="{ 'status-option--active': !isActive }"
          :disabled="readonly"
          role="radio"
          :aria-checked="!isActive"
          @click="isActive = false"
        >
          <span class="status-option__title">未发布</span>
          <span class="status-option__desc">暂不展示在用户首页</span>
        </button>
      </div>
    </section>

    <!-- ── 区块 1：基本信息 ─────────────────────────────────────────────── -->
    <section class="card">
      <header class="card__head">
        <h2 class="card__title">基本信息</h2>
        <p class="card__desc">给助手取个名字。描述和欢迎语可留空，之后随时补。</p>
      </header>

      <!-- 助手名字 -->
      <div class="field" data-question="name">
        <div class="field__head">
          <label class="field__label">助手名字<span class="field__req">*</span></label>
          <span class="field__limit">{{ (name ?? '').length }} / {{ MAX_NAME_LEN }}</span>
        </div>
        <input
          type="text"
          class="field__input"
          :class="{ 'field__input--error': errors['name'] }"
          :value="name"
          :disabled="readonly"
          :maxlength="MAX_NAME_LEN"
          placeholder="2-20 字，不能全是数字"
          @input="name = ($event.target as HTMLInputElement).value"
        />
        <p v-if="errors['name']" class="field__error">{{ errors['name'] }}</p>
      </div>

      <!-- 一句话描述（选填） -->
      <div class="field" data-question="description">
        <div class="field__head">
          <label class="field__label">一句话描述<span class="field__optional">（选填）</span></label>
          <span class="field__limit">
            {{ (description ?? '').length }} / {{ MAX_DESCRIPTION_LEN }}
          </span>
        </div>
        <input
          type="text"
          class="field__input"
          :class="{ 'field__input--error': errors['description'] }"
          :value="description"
          :disabled="readonly"
          :maxlength="MAX_DESCRIPTION_LEN"
          placeholder="最多 20 字，描述助手的核心功能"
          @input="description = ($event.target as HTMLInputElement).value"
        />
        <p v-if="errors['description']" class="field__error">{{ errors['description'] }}</p>
      </div>

      <!-- 欢迎语（选填） -->
      <div class="field" data-question="welcome_message">
        <div class="field__head">
          <label class="field__label">欢迎语<span class="field__optional">（选填）</span></label>
          <span class="field__limit">
            {{ (welcomeMessage ?? '').length }} / {{ MAX_WELCOME_LEN }}
          </span>
        </div>
        <textarea
          class="field__textarea"
          :class="{ 'field__input--error': errors['welcome_message'] }"
          :value="welcomeMessage"
          :disabled="readonly"
          :maxlength="MAX_WELCOME_LEN"
          rows="3"
          placeholder="最多 500 字，用户打开助手时看到的第一句话"
          @input="welcomeMessage = ($event.target as HTMLTextAreaElement).value"
        />
        <p v-if="errors['welcome_message']" class="field__error">
          {{ errors['welcome_message'] }}
        </p>
      </div>
    </section>

    <!-- ── 区块 2：行为指引 ─────────────────────────────────────────────── -->
    <section class="card" data-question="system_prompt">
      <header class="card__head">
        <h2 class="card__title">行为指引</h2>
        <p class="card__desc">
          定义助手的身份、职责与规则——这是助手的灵魂。写得越具体，表现越稳定。
        </p>
      </header>

      <label class="field__label field__label--sr">提示词<span class="field__req">*</span></label>
      <textarea
        class="field__textarea field__textarea--prompt"
        :class="{ 'field__input--error': errors['system_prompt'] }"
        :value="systemPrompt"
        :disabled="readonly"
        :maxlength="MAX_SYSTEM_PROMPT_LEN"
        rows="16"
        placeholder="例：你是【XX 公司】的销售助手。
职责：帮销售应对客户异议、提供推单话术。
规则：聊到价格永远不报具体数字、涉及投诉转人工、用专业但亲和的语气。"
        @input="systemPrompt = ($event.target as HTMLTextAreaElement).value"
      />
      <div class="card__footer">
        <p v-if="errors['system_prompt']" class="field__error">{{ errors['system_prompt'] }}</p>
        <p class="card__count">{{ (systemPrompt ?? '').length }} / {{ MAX_SYSTEM_PROMPT_LEN }}</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.agent-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

/* ── 区块卡片 ─────────────────────────────────────────────────────────── */
.card {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-xl);
}

.card__head {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.card__title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--text);
}

.card__desc {
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--line-height-normal);
  color: var(--text-secondary);
}

.card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.card__count {
  margin: 0 0 0 auto;
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

/* ── 字段 ─────────────────────────────────────────────────────────────── */
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.field__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.field__label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text);
}

.field__limit {
  flex: 0 0 auto;
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.field__label--sr {
  /* 提示词区块标题已在 card__head 表达，此 label 仅为可访问性保留 */
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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

.field__input,
.field__textarea {
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
  resize: vertical;
}

.field__input::placeholder,
.field__textarea::placeholder {
  color: var(--text-muted);
}

.field__input:focus,
.field__textarea:focus {
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
}

.field__input:disabled,
.field__textarea:disabled {
  background: var(--surface-tint);
  color: var(--text-secondary);
  cursor: not-allowed;
}

.field__textarea--prompt {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: var(--line-height-relaxed);
  min-height: 300px;
}

.field__input--error {
  /* TODO(admin-rebrand): replace with --danger token */
  border-color: #ef4444 !important;
}

.field__error {
  margin: 0;
  font-size: var(--text-xs);
  /* TODO(admin-rebrand): replace with --danger token */
  color: #ef4444;
}

.status-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-md);
}

.status-option {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-height: 72px;
  padding: var(--space-md);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast),
    color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.status-option:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text);
}

.status-option--active {
  border-color: hsl(160 55% 82%);
  background: var(--accent-soft);
  color: var(--primary-hover);
  box-shadow: 0 0 0 1px hsl(160 50% 88% / 0.8);
}

.status-option:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.status-option__title {
  font-size: var(--text-sm);
  font-weight: 700;
}

.status-option__desc {
  font-size: var(--text-xs);
  line-height: var(--line-height-normal);
}

/* ── 只读态：弱化阴影，卡片骨架保持一致 ─────────────────────────────── */
.agent-form--readonly .card {
  box-shadow: var(--shadow-sm);
}

@media (max-width: 560px) {
  .card {
    padding: var(--space-lg);
  }

  .status-options {
    grid-template-columns: 1fr;
  }
}
</style>
