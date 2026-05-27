<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AgentFormState } from '@/types/agentBuilder'
import ChipInput from './ChipInput.vue'
import CreditSlider from './CreditSlider.vue'
import AvatarPicker from './AvatarPicker.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

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

// Computed proxies for tool_flags
const codeSandbox = computed({
  get: () => !!props.modelValue.tool_flags?.code_sandbox,
  set: (v) => patchToolFlag('code_sandbox', v)
})

const media = computed({
  get: () => !!props.modelValue.tool_flags?.media,
  set: (v) => patchToolFlag('media', v)
})

const dangerous = computed({
  get: () => !!props.modelValue.tool_flags?.dangerous,
  set: (v) => patchToolFlag('dangerous', v)
})

function patchToolFlag(key: string, value: boolean) {
  emit('update:modelValue', {
    ...props.modelValue,
    tool_flags: {
      ...props.modelValue.tool_flags,
      [key]: value
    }
  })
}

const dangerousConfirmVisible = ref(false)
let prevDangerous = false

watch(
  () => props.modelValue.tool_flags?.dangerous,
  (newVal) => {
    prevDangerous = !!newVal
  },
  { immediate: true }
)

function onDangerousChange() {
  if (dangerous.value && !prevDangerous) {
    dangerousConfirmVisible.value = true
  } else {
    prevDangerous = dangerous.value
  }
}

function confirmDangerous() {
  prevDangerous = true
  dangerousConfirmVisible.value = false
}

function cancelDangerous() {
  patchToolFlag('dangerous', false)
  prevDangerous = false
  dangerousConfirmVisible.value = false
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
        placeholder="10-100 字，描述助手的核心功能"
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

    <!-- Q8: 积分上限 -->
    <div class="questionnaire-form__question" data-question="q8">
      <label class="questionnaire-form__label">单次会话积分上限</label>
      <CreditSlider v-model="q8" :readonly="readonly" />
      <p v-if="errors['q8']" class="questionnaire-form__error">
        {{ errors['q8'] }}
      </p>
    </div>

    <!-- 工具开关 -->
    <div class="questionnaire-form__question" data-question="tool_flags">
      <label class="questionnaire-form__label">工具开关</label>
      <div class="tool-flags">
        <label class="tool-flags__item">
          <input
            type="checkbox"
            :checked="codeSandbox"
            :disabled="readonly"
            @change="codeSandbox = ($event.target as HTMLInputElement).checked"
          />
          <span>沙箱代码执行（允许执行 Python 等沙箱代码）</span>
        </label>
        <label class="tool-flags__item">
          <input
            type="checkbox"
            :checked="media"
            :disabled="readonly"
            @change="media = ($event.target as HTMLInputElement).checked"
          />
          <span>多媒体处理（包含图像生成工具，如 Nano Banana 2）</span>
        </label>
        <label class="tool-flags__item tool-flags__item--dangerous">
          <input
            type="checkbox"
            :checked="dangerous"
            :disabled="readonly"
            @change="
              dangerous = ($event.target as HTMLInputElement).checked
              onDangerousChange()
            "
          />
          <span>高危工具（谨慎开启）</span>
        </label>
      </div>
    </div>

    <!-- 高危确认弹窗 -->
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

.tool-flags {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  padding: var(--space-4, 16px);
  border: 1px solid var(--outline-variant, rgba(169, 180, 185, 0.2));
  border-radius: var(--radius-sm, 8px);
  background: var(--surface-lowest, #fff);
}

.tool-flags__item {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  font-size: 14px;
  color: var(--on-surface, #2a3439);
  cursor: pointer;
  user-select: none;
}

.tool-flags__item input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--tertiary, #005eb6);
}

.tool-flags__item input[type='checkbox']:disabled {
  cursor: not-allowed;
}

.tool-flags__item--dangerous {
  color: var(--danger, #9f403d);
}
</style>
