<script setup lang="ts">
import { computed } from 'vue'
import type { AgentFormState, Q6TaskType, Q7MaterialType } from '@/types/agentBuilder'
import ChipInput from './ChipInput.vue'
import CreditSlider from './CreditSlider.vue'
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

/** Helper: patch a questionnaire_answers field */
function patchQA<K extends keyof AgentFormState['questionnaire_answers']>(
  key: K,
  value: AgentFormState['questionnaire_answers'][K]
): void {
  emit('update:modelValue', {
    ...props.modelValue,
    questionnaire_answers: {
      ...props.modelValue.questionnaire_answers,
      [key]: value
    }
  })
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

const MAX_SYSTEM_PROMPT_LEN = 16384

const systemPrompt = computed({
  get: () => props.modelValue.system_prompt,
  set: (v) => patchField('system_prompt', v)
})

const starters = computed({
  get: () => props.modelValue.starters,
  set: (v) => patchField('starters', v)
})

// Computed proxies for questionnaire_answers
const q8 = computed({
  get: () => props.modelValue.questionnaire_answers.q8 ?? 800,
  set: (v) => patchQA('q8', v)
})

// ── Q6 任务类型（多选：5 个内置 code + 自由文本透传） ──────────────────────────
const Q6_OPTIONS: { value: Q6TaskType; label: string }[] = [
  { value: 'analyze_data', label: '分析数据 / 报表' },
  { value: 'generate_content', label: '生成文字内容' },
  { value: 'answer_questions', label: '回答问题 / 答疑' },
  { value: 'make_plan', label: '帮助制定计划' },
  { value: 'grade_assignment', label: '批改 / 评分学员作业' }
]
const Q6_CODES: string[] = Q6_OPTIONS.map((o) => o.value)

function currentQ6(): string[] {
  return props.modelValue.questionnaire_answers.q6 ?? []
}
function isQ6Checked(code: Q6TaskType): boolean {
  return currentQ6().includes(code)
}
/** Toggle a built-in task-type code, preserving any free-text entries. */
function toggleQ6(code: Q6TaskType, checked: boolean): void {
  const cur = currentQ6()
  const codes = Q6_CODES.filter((c) => (c === code ? checked : cur.includes(c)))
  const custom = cur.filter((v) => !Q6_CODES.includes(v))
  patchQA('q6', [...codes, ...custom])
}
/** Free-text q6 entries = items not matching a built-in code. */
const q6Custom = computed<string[]>({
  get: () => currentQ6().filter((v) => !Q6_CODES.includes(v)),
  set: (chips) => {
    const codes = currentQ6().filter((v) => Q6_CODES.includes(v))
    // Drop free-text that collides with a built-in code, so it can't be stored
    // as "custom" then silently reclassified as the checkbox option on re-render.
    const custom = chips.filter((v) => !Q6_CODES.includes(v))
    patchQA('q6', [...codes, ...custom])
  }
})

// ── Q7 材料类型（多选：4 个内置 code） ─────────────────────────────────────────
const Q7_OPTIONS: { value: Q7MaterialType; label: string }[] = [
  { value: 'text', label: '文字（笔记、日报、复盘）' },
  { value: 'csv', label: 'Excel / CSV 数据表格' },
  { value: 'image', label: '图片（截图、海报）' },
  { value: 'none', label: '不需要上传' }
]
const Q7_CODES = Q7_OPTIONS.map((o) => o.value)

function currentQ7(): Q7MaterialType[] {
  return props.modelValue.questionnaire_answers.q7 ?? []
}
function isQ7Checked(code: Q7MaterialType): boolean {
  return currentQ7().includes(code)
}
function toggleQ7(code: Q7MaterialType, checked: boolean): void {
  const cur = currentQ7()
  const codes = Q7_CODES.filter((c) => (c === code ? checked : cur.includes(c)))
  patchQA('q7', codes)
}
</script>

<template>
  <div class="questionnaire-form" :class="{ 'questionnaire-form--readonly': readonly }">
    <!-- Q1: 助手名字 -->
    <div class="questionnaire-form__question" data-question="name">
      <label class="questionnaire-form__label questionnaire-form__label--required">
        助手名字
      </label>
      <input
        type="text"
        class="questionnaire-form__input"
        :class="{ 'questionnaire-form__input--error': errors['name'] }"
        :value="name"
        :disabled="readonly"
        placeholder="2-20 字，不能全是数字"
        @input="name = ($event.target as HTMLInputElement).value"
      />
      <p v-if="errors['name']" class="questionnaire-form__error">
        {{ errors['name'] }}
      </p>
    </div>

    <!-- Q2: 头像 -->
    <div class="questionnaire-form__question" data-question="icon_url">
      <label class="questionnaire-form__label">头像</label>
      <AvatarPicker v-model="iconUrl" :readonly="readonly" />
    </div>

    <!-- Q3: 一句话描述 -->
    <div class="questionnaire-form__question" data-question="description">
      <label class="questionnaire-form__label questionnaire-form__label--required">
        一句话描述
      </label>
      <input
        type="text"
        class="questionnaire-form__input"
        :class="{ 'questionnaire-form__input--error': errors['description'] }"
        :value="description"
        :disabled="readonly"
        maxlength="20"
        placeholder="10-20 字，描述助手的核心功能"
        @input="description = ($event.target as HTMLInputElement).value"
      />
      <p v-if="errors['description']" class="questionnaire-form__error">
        {{ errors['description'] }}
      </p>
    </div>

    <!-- Q4: 欢迎语 -->
    <div class="questionnaire-form__question" data-question="welcome_message">
      <label class="questionnaire-form__label questionnaire-form__label--required"> 欢迎语 </label>
      <textarea
        class="questionnaire-form__textarea"
        :class="{
          'questionnaire-form__input--error': errors['welcome_message']
        }"
        :value="welcomeMessage"
        :disabled="readonly"
        rows="4"
        placeholder="20-500 字，用户打开助手时看到的第一句话"
        @input="welcomeMessage = ($event.target as HTMLTextAreaElement).value"
      />
      <p v-if="errors['welcome_message']" class="questionnaire-form__error">
        {{ errors['welcome_message'] }}
      </p>
    </div>

    <!-- 行为指引 -->
    <div class="questionnaire-form__question" data-question="system_prompt">
      <label class="questionnaire-form__label">行为指引</label>
      <textarea
        class="questionnaire-form__textarea"
        :value="systemPrompt"
        :disabled="readonly"
        :maxlength="MAX_SYSTEM_PROMPT_LEN"
        rows="12"
        placeholder="例：你是【XX 公司】的销售助手。
职责：帮销售应对客户异议、提供推单话术。
规则：聊到价格永远不报具体数字、涉及投诉转人工、用专业但亲和的语气。"
        @input="systemPrompt = ($event.target as HTMLTextAreaElement).value"
      />
      <p class="questionnaire-form__char-count">
        {{ (systemPrompt ?? '').length }} / {{ MAX_SYSTEM_PROMPT_LEN }}
      </p>
    </div>

    <!-- Q5: 引导问题 -->
    <div class="questionnaire-form__question" data-question="starters">
      <label class="questionnaire-form__label">引导问题（最多 4 条）</label>
      <ChipInput v-model="starters" :max="4" :min-len="5" :max-len="50" :readonly="readonly" />
      <p v-if="errors['starters']" class="questionnaire-form__error">
        {{ errors['starters'] }}
      </p>
    </div>

    <!-- Q6: 任务类型 -->
    <div class="questionnaire-form__question" data-question="q6">
      <label class="questionnaire-form__label questionnaire-form__label--required">
        任务类型（可多选）
      </label>
      <p class="questionnaire-form__hint">这个助手主要帮学员做什么？至少选一项</p>
      <div class="questionnaire-form__checkbox-group">
        <label
          v-for="opt in Q6_OPTIONS"
          :key="opt.value"
          class="questionnaire-form__checkbox-label"
        >
          <input
            type="checkbox"
            :checked="isQ6Checked(opt.value)"
            :disabled="readonly"
            @change="toggleQ6(opt.value, ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ opt.label }}</span>
        </label>
      </div>
      <ChipInput
        v-model="q6Custom"
        :max="5"
        :min-len="2"
        :max-len="20"
        :readonly="readonly"
        placeholder="其他任务类型，回车添加"
      />
      <p v-if="errors['q6']" class="questionnaire-form__error">
        {{ errors['q6'] }}
      </p>
    </div>

    <!-- Q7: 材料类型 -->
    <div class="questionnaire-form__question" data-question="q7">
      <label class="questionnaire-form__label questionnaire-form__label--required">
        材料类型（可多选）
      </label>
      <p class="questionnaire-form__hint">学员会给助手提供什么材料？至少选一项</p>
      <div class="questionnaire-form__checkbox-group">
        <label
          v-for="opt in Q7_OPTIONS"
          :key="opt.value"
          class="questionnaire-form__checkbox-label"
        >
          <input
            type="checkbox"
            :checked="isQ7Checked(opt.value)"
            :disabled="readonly"
            @change="toggleQ7(opt.value, ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ opt.label }}</span>
        </label>
      </div>
      <p v-if="errors['q7']" class="questionnaire-form__error">
        {{ errors['q7'] }}
      </p>
    </div>

    <!-- Q8: 积分上限 -->
    <div class="questionnaire-form__question" data-question="q8">
      <label class="questionnaire-form__label">单次会话积分上限</label>
      <CreditSlider v-model="q8" :readonly="readonly" />
      <p v-if="errors['q8']" class="questionnaire-form__error">
        {{ errors['q8'] }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.questionnaire-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.questionnaire-form--readonly {
  background: var(--surface-low, #f0f4f7);
  border-radius: 10px;
  padding: 20px;
}

.questionnaire-form__question {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.questionnaire-form__label {
  font-size: 14px;
  font-weight: 500;
  color: var(--on-surface, #2a3439);
}

.questionnaire-form__label--required::before {
  content: '* ';
  color: var(--danger, #9f403d);
}

.questionnaire-form__input,
.questionnaire-form__textarea {
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

.questionnaire-form__input:focus,
.questionnaire-form__textarea:focus {
  border-color: var(--tertiary, #005eb6);
}

.questionnaire-form__input:disabled,
.questionnaire-form__textarea:disabled {
  background: var(--surface-low, #f0f4f7);
  cursor: not-allowed;
  color: var(--on-surface-variant, #566166);
}

.questionnaire-form__input--error {
  border-color: var(--danger, #9f403d) !important;
}

.questionnaire-form__error {
  margin: 0;
  font-size: 12px;
  color: var(--danger, #9f403d);
}

.questionnaire-form__char-count {
  margin: 0;
  font-size: 12px;
  color: var(--on-surface-variant, #566166);
  text-align: right;
}

.questionnaire-form__radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.questionnaire-form__radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--on-surface, #2a3439);
  cursor: pointer;
  user-select: none;
}

.questionnaire-form__radio-label input[type='radio'] {
  width: 16px;
  height: 16px;
  accent-color: var(--tertiary, #005eb6);
  cursor: pointer;
}

.questionnaire-form__radio-label input[type='radio']:disabled {
  cursor: not-allowed;
}

.questionnaire-form__hint {
  margin: 0;
  font-size: 12px;
  color: var(--on-surface-variant, #566166);
}

.questionnaire-form__checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.questionnaire-form__checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--on-surface, #2a3439);
  cursor: pointer;
  user-select: none;
}

.questionnaire-form__checkbox-label input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--tertiary, #005eb6);
  cursor: pointer;
  flex-shrink: 0;
}

.questionnaire-form__checkbox-label input[type='checkbox']:disabled {
  cursor: not-allowed;
}
</style>
