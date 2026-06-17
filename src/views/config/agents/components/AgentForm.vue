<script setup lang="ts">
import { computed } from 'vue'
import type { AgentFormState } from '@/types/agentBuilder'
import ChipInput from './ChipInput.vue'
import AvatarPicker from './AvatarPicker.vue'

interface Props {
  modelValue: AgentFormState
  readonly?: boolean
  errors?: Record<string, string>
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
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

const iconUrl = computed({
  get: () => props.modelValue.icon_url,
  set: (v) => patchField('icon_url', v)
})

const description = computed({
  get: () => props.modelValue.description,
  set: (v) => patchField('description', v)
})

const welcomeMessage = computed({
  get: () => props.modelValue.welcome_message,
  set: (v) => patchField('welcome_message', v)
})

// 与后端 SystemPromptMaxLen 对齐（64KB）— biz/skill/service.go SystemPromptMaxLen。
const MAX_SYSTEM_PROMPT_LEN = 65536

const systemPrompt = computed({
  get: () => props.modelValue.system_prompt,
  set: (v) => patchField('system_prompt', v)
})

const starters = computed({
  get: () => props.modelValue.starters,
  set: (v) => patchField('starters', v)
})
</script>

<template>
  <div class="agent-form" :class="{ 'agent-form--readonly': readonly }">
    <!-- 助手名字 -->
    <div class="agent-form__question" data-question="name">
      <label class="agent-form__label agent-form__label--required"> 助手名字 </label>
      <input
        type="text"
        class="agent-form__input"
        :class="{ 'agent-form__input--error': errors['name'] }"
        :value="name"
        :disabled="readonly"
        placeholder="2-20 字，不能全是数字"
        @input="name = ($event.target as HTMLInputElement).value"
      />
      <p v-if="errors['name']" class="agent-form__error">
        {{ errors['name'] }}
      </p>
    </div>

    <!-- 头像 -->
    <div class="agent-form__question" data-question="icon_url">
      <label class="agent-form__label">头像</label>
      <AvatarPicker v-model="iconUrl" :readonly="readonly" />
    </div>

    <!-- 一句话描述 -->
    <div class="agent-form__question" data-question="description">
      <label class="agent-form__label agent-form__label--required"> 一句话描述 </label>
      <input
        type="text"
        class="agent-form__input"
        :class="{ 'agent-form__input--error': errors['description'] }"
        :value="description"
        :disabled="readonly"
        maxlength="20"
        placeholder="10-20 字，描述助手的核心功能"
        @input="description = ($event.target as HTMLInputElement).value"
      />
      <p v-if="errors['description']" class="agent-form__error">
        {{ errors['description'] }}
      </p>
    </div>

    <!-- 欢迎语 -->
    <div class="agent-form__question" data-question="welcome_message">
      <label class="agent-form__label agent-form__label--required"> 欢迎语 </label>
      <textarea
        class="agent-form__textarea"
        :class="{ 'agent-form__input--error': errors['welcome_message'] }"
        :value="welcomeMessage"
        :disabled="readonly"
        rows="4"
        placeholder="20-500 字，用户打开助手时看到的第一句话"
        @input="welcomeMessage = ($event.target as HTMLTextAreaElement).value"
      />
      <p v-if="errors['welcome_message']" class="agent-form__error">
        {{ errors['welcome_message'] }}
      </p>
    </div>

    <!-- 引导问题 -->
    <div class="agent-form__question" data-question="starters">
      <label class="agent-form__label">引导问题（最多 4 条）</label>
      <ChipInput v-model="starters" :max="4" :min-len="5" :max-len="50" :readonly="readonly" />
      <p v-if="errors['starters']" class="agent-form__error">
        {{ errors['starters'] }}
      </p>
    </div>

    <!-- 提示词（行为指引）—— 核心字段 -->
    <div class="agent-form__question agent-form__question--prompt" data-question="system_prompt">
      <label class="agent-form__label agent-form__label--required agent-form__label--prompt">
        提示词（行为指引）
      </label>
      <p class="agent-form__hint">
        定义助手的身份、职责与规则——这是助手的核心。写得越具体，助手表现越稳定。
      </p>
      <textarea
        class="agent-form__textarea agent-form__textarea--prompt"
        :class="{ 'agent-form__input--error': errors['system_prompt'] }"
        :value="systemPrompt"
        :disabled="readonly"
        :maxlength="MAX_SYSTEM_PROMPT_LEN"
        rows="16"
        placeholder="例：你是【XX 公司】的销售助手。
职责：帮销售应对客户异议、提供推单话术。
规则：聊到价格永远不报具体数字、涉及投诉转人工、用专业但亲和的语气。"
        @input="systemPrompt = ($event.target as HTMLTextAreaElement).value"
      />
      <div class="agent-form__prompt-footer">
        <p v-if="errors['system_prompt']" class="agent-form__error">
          {{ errors['system_prompt'] }}
        </p>
        <p class="agent-form__char-count">
          {{ (systemPrompt ?? '').length }} / {{ MAX_SYSTEM_PROMPT_LEN }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.agent-form--readonly {
  background: var(--surface-low, #f0f4f7);
  border-radius: 10px;
  padding: 20px;
}

.agent-form__question {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-form__label {
  font-size: 14px;
  font-weight: 500;
  color: var(--on-surface, #2a3439);
}

.agent-form__label--required::before {
  content: '* ';
  color: var(--danger, #9f403d);
}

.agent-form__label--prompt {
  font-size: 16px;
  font-weight: 700;
}

.agent-form__input,
.agent-form__textarea {
  padding: 8px 12px;
  font-size: 14px;
  border: 1px solid var(--outline-variant, #a9b4b9);
  border-radius: 8px;
  background: var(--surface-lowest, #ffffff);
  color: var(--on-surface, #2a3439);
  outline: none;
  transition: border-color 0.15s;
  resize: vertical;
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
}

.agent-form__textarea--prompt {
  font-family: var(--font-mono, ui-monospace, 'SF Mono', Menlo, monospace);
  font-size: 13px;
  line-height: 1.6;
  min-height: 280px;
}

.agent-form__input:focus,
.agent-form__textarea:focus {
  border-color: var(--tertiary, #005eb6);
}

.agent-form__input:disabled,
.agent-form__textarea:disabled {
  background: var(--surface-low, #f0f4f7);
  cursor: not-allowed;
  color: var(--on-surface-variant, #566166);
}

.agent-form__input--error {
  border-color: var(--danger, #9f403d) !important;
}

.agent-form__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger, #9f403d);
}

.agent-form__char-count {
  margin: 0;
  font-size: 12px;
  color: var(--on-surface-variant, #566166);
  text-align: right;
}

.agent-form__prompt-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.agent-form__prompt-footer .agent-form__char-count {
  margin-left: auto;
}

.agent-form__hint {
  margin: 0;
  font-size: 12px;
  color: var(--on-surface-variant, #566166);
}
</style>
