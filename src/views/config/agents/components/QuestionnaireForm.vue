<script setup lang="ts">
import { computed } from "vue";
import type { AgentFormState, Q9WebSearch, Q12Style } from "@/types/agentBuilder";
import CheckboxGroup from "@/components/common/CheckboxGroup.vue";
import ChipInput from "./ChipInput.vue";
import CreditSlider from "./CreditSlider.vue";
import AvatarPicker from "./AvatarPicker.vue";

interface Props {
  modelValue: AgentFormState;
  readonly?: boolean;
  errors?: Record<string, string>;
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
  errors: () => ({}),
});

const emit = defineEmits<{
  "update:modelValue": [value: AgentFormState];
}>();

/** Helper: patch a top-level field */
function patchField<K extends keyof AgentFormState>(
  key: K,
  value: AgentFormState[K],
): void {
  emit("update:modelValue", { ...props.modelValue, [key]: value });
}

/** Helper: patch a questionnaire_answers field */
function patchQA<K extends keyof AgentFormState["questionnaire_answers"]>(
  key: K,
  value: AgentFormState["questionnaire_answers"][K],
): void {
  emit("update:modelValue", {
    ...props.modelValue,
    questionnaire_answers: {
      ...props.modelValue.questionnaire_answers,
      [key]: value,
    },
  });
}

// Computed proxies for top-level fields
const name = computed({
  get: () => props.modelValue.name,
  set: (v) => patchField("name", v),
});

const iconUrl = computed({
  get: () => props.modelValue.icon_url,
  set: (v) => patchField("icon_url", v),
});

const description = computed({
  get: () => props.modelValue.description,
  set: (v) => patchField("description", v),
});

const welcomeMessage = computed({
  get: () => props.modelValue.welcome_message,
  set: (v) => patchField("welcome_message", v),
});

const starters = computed({
  get: () => props.modelValue.starters,
  set: (v) => patchField("starters", v),
});

// Computed proxies for questionnaire_answers
const q6 = computed({
  get: () => props.modelValue.questionnaire_answers.q6 ?? [],
  set: (v) => patchQA("q6", v),
});

const q7 = computed({
  get: () => props.modelValue.questionnaire_answers.q7 ?? [],
  set: (v) => patchQA("q7", v as AgentFormState["questionnaire_answers"]["q7"]),
});

const q8 = computed({
  get: () => props.modelValue.questionnaire_answers.q8 ?? 800,
  set: (v) => patchQA("q8", v),
});

const q9 = computed({
  get: () => props.modelValue.questionnaire_answers.q9 ?? "no_web_search",
  set: (v) => patchQA("q9", v),
});

const q10 = computed({
  get: () => props.modelValue.questionnaire_answers.q10 ?? "",
  set: (v) => patchQA("q10", v),
});

const q11 = computed({
  get: () => props.modelValue.questionnaire_answers.q11 ?? "",
  set: (v) => patchQA("q11", v),
});

const q12 = computed({
  get: () => props.modelValue.questionnaire_answers.q12 ?? "friendly",
  set: (v) => patchQA("q12", v),
});

const Q6_OPTIONS = [
  { value: "analyze_data", label: "数据分析" },
  { value: "generate_content", label: "内容生成" },
  { value: "answer_questions", label: "答题解惑" },
  { value: "make_plan", label: "制定计划" },
  { value: "grade_assignment", label: "批改作业" },
];

const Q7_OPTIONS = [
  { value: "text", label: "文本" },
  { value: "csv", label: "表格（CSV）" },
  { value: "image", label: "图片" },
  { value: "none", label: "不需要材料" },
];

function onQ9Change(event: Event): void {
  q9.value = (event.target as HTMLInputElement).value as Q9WebSearch;
}

function onQ12Change(event: Event): void {
  q12.value = (event.target as HTMLInputElement).value as Q12Style;
}
</script>

<template>
  <div
    class="questionnaire-form"
    :class="{ 'questionnaire-form--readonly': readonly }"
  >
    <!-- Q1: 助手名字 -->
    <div class="questionnaire-form__question" data-question="name">
      <label
        class="questionnaire-form__label questionnaire-form__label--required"
      >
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
        {{ errors["name"] }}
      </p>
    </div>

    <!-- Q2: 头像 -->
    <div class="questionnaire-form__question" data-question="icon_url">
      <label class="questionnaire-form__label">头像</label>
      <AvatarPicker v-model="iconUrl" :readonly="readonly" />
    </div>

    <!-- Q3: 一句话描述 -->
    <div class="questionnaire-form__question" data-question="description">
      <label
        class="questionnaire-form__label questionnaire-form__label--required"
      >
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
        {{ errors["description"] }}
      </p>
    </div>

    <!-- Q4: 欢迎语 -->
    <div class="questionnaire-form__question" data-question="welcome_message">
      <label
        class="questionnaire-form__label questionnaire-form__label--required"
      >
        欢迎语
      </label>
      <textarea
        class="questionnaire-form__textarea"
        :class="{
          'questionnaire-form__input--error': errors['welcome_message'],
        }"
        :value="welcomeMessage"
        :disabled="readonly"
        rows="4"
        placeholder="20-500 字，用户打开助手时看到的第一句话"
        @input="welcomeMessage = ($event.target as HTMLTextAreaElement).value"
      />
      <p v-if="errors['welcome_message']" class="questionnaire-form__error">
        {{ errors["welcome_message"] }}
      </p>
    </div>

    <!-- Q5: 引导问题 -->
    <div class="questionnaire-form__question" data-question="starters">
      <label class="questionnaire-form__label">引导问题（最多 4 条）</label>
      <ChipInput
        v-model="starters"
        :max="4"
        :min-len="5"
        :max-len="50"
        :readonly="readonly"
      />
      <p v-if="errors['starters']" class="questionnaire-form__error">
        {{ errors["starters"] }}
      </p>
    </div>

    <!-- Q6: 任务类型 -->
    <div class="questionnaire-form__question" data-question="q6">
      <label
        class="questionnaire-form__label questionnaire-form__label--required"
      >
        主要任务类型
      </label>
      <CheckboxGroup
        v-model="q6"
        :options="Q6_OPTIONS"
        :allow-other="true"
        :readonly="readonly"
      />
      <p v-if="errors['q6']" class="questionnaire-form__error">
        {{ errors["q6"] }}
      </p>
    </div>

    <!-- Q7: 材料类型 -->
    <div class="questionnaire-form__question" data-question="q7">
      <label
        class="questionnaire-form__label questionnaire-form__label--required"
      >
        用户通常提供的材料类型
      </label>
      <CheckboxGroup v-model="q7" :options="Q7_OPTIONS" :readonly="readonly" />
      <p v-if="errors['q7']" class="questionnaire-form__error">
        {{ errors["q7"] }}
      </p>
    </div>

    <!-- Q8: 积分上限 -->
    <div class="questionnaire-form__question" data-question="q8">
      <label class="questionnaire-form__label">单次会话积分上限</label>
      <CreditSlider v-model="q8" :readonly="readonly" />
      <p v-if="errors['q8']" class="questionnaire-form__error">
        {{ errors["q8"] }}
      </p>
    </div>

    <!-- Q9: 网络搜索 -->
    <div class="questionnaire-form__question" data-question="q9">
      <label
        class="questionnaire-form__label questionnaire-form__label--required"
      >
        是否允许网络搜索
      </label>
      <div class="questionnaire-form__radio-group">
        <label class="questionnaire-form__radio-label">
          <input
            type="radio"
            :value="'no_web_search'"
            :checked="q9 === 'no_web_search'"
            :disabled="readonly"
            @change="onQ9Change"
          />
          <span>不使用网络搜索</span>
        </label>
        <label class="questionnaire-form__radio-label">
          <input
            type="radio"
            :value="'allow_search'"
            :checked="q9 === 'allow_search'"
            :disabled="readonly"
            @change="onQ9Change"
          />
          <span>允许搜索</span>
        </label>
      </div>
      <p v-if="errors['q9']" class="questionnaire-form__error">
        {{ errors["q9"] }}
      </p>
    </div>

    <!-- Q10: 额外 prompt -->
    <div class="questionnaire-form__question" data-question="q10">
      <label class="questionnaire-form__label">额外系统提示词（可选）</label>
      <textarea
        class="questionnaire-form__textarea"
        :class="{ 'questionnaire-form__input--error': errors['q10'] }"
        :value="q10"
        :disabled="readonly"
        rows="3"
        placeholder="最多 500 字，补充你对助手行为的特殊要求"
        @input="q10 = ($event.target as HTMLTextAreaElement).value"
      />
      <p v-if="errors['q10']" class="questionnaire-form__error">
        {{ errors["q10"] }}
      </p>
    </div>

    <!-- Q11: 兜底话术 -->
    <div class="questionnaire-form__question" data-question="q11">
      <label class="questionnaire-form__label">超出能力时的兜底回复</label>
      <textarea
        class="questionnaire-form__textarea"
        :class="{ 'questionnaire-form__input--error': errors['q11'] }"
        :value="q11"
        :disabled="readonly"
        rows="3"
        placeholder="5-200 字，当助手遇到超出能力的问题时返回的话术"
        @input="q11 = ($event.target as HTMLTextAreaElement).value"
      />
      <p v-if="errors['q11']" class="questionnaire-form__error">
        {{ errors["q11"] }}
      </p>
    </div>

    <!-- Q12: 说话风格 -->
    <div class="questionnaire-form__question" data-question="q12">
      <label
        class="questionnaire-form__label questionnaire-form__label--required"
      >
        说话风格
      </label>
      <div class="questionnaire-form__radio-group">
        <label class="questionnaire-form__radio-label">
          <input
            type="radio"
            :value="'friendly'"
            :checked="q12 === 'friendly'"
            :disabled="readonly"
            @change="onQ12Change"
          />
          <span>亲切友好</span>
        </label>
        <label class="questionnaire-form__radio-label">
          <input
            type="radio"
            :value="'professional'"
            :checked="q12 === 'professional'"
            :disabled="readonly"
            @change="onQ12Change"
          />
          <span>专业严谨</span>
        </label>
        <label class="questionnaire-form__radio-label">
          <input
            type="radio"
            :value="'encouraging'"
            :checked="q12 === 'encouraging'"
            :disabled="readonly"
            @change="onQ12Change"
          />
          <span>激励鼓舞</span>
        </label>
      </div>
      <p v-if="errors['q12']" class="questionnaire-form__error">
        {{ errors["q12"] }}
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
  content: "* ";
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

.questionnaire-form__radio-label input[type="radio"] {
  width: 16px;
  height: 16px;
  accent-color: var(--tertiary, #005eb6);
  cursor: pointer;
}

.questionnaire-form__radio-label input[type="radio"]:disabled {
  cursor: not-allowed;
}
</style>
