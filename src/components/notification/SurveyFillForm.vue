<!--
  SurveyFillForm — 问卷作答表单（notification-center）

  渲染 AnnouncementDetail.questions：
    - single → radio group
    - multi  → checkbox group
    - rating → 星级按钮（rating_style='star'）或 NPS 0..max 按钮（rating_style='nps'）
    - text   → textarea

  校验：required 题在 blur / 提交时校验；不满足显示行内错误。
  提交：构建 SubmitAnswer[] → emit('submit', answers)（由父级调用 store.submitSurvey）。
  已提交（is_survey_submitted=true）：由父级渲染只读态，本组件只在「未提交」时挂载。
-->
<template>
  <form class="survey-form" data-testid="survey-form" @submit.prevent="handleSubmit">
    <div
      v-for="q in sortedQuestions"
      :key="q.id"
      class="survey-question"
      :data-testid="`survey-question-${q.id}`"
    >
      <div class="question-title">
        <span v-if="q.required" class="required-mark" aria-hidden="true">*</span>
        {{ q.title }}
      </div>

      <!-- single：单选 -->
      <div v-if="q.question_type === 'single'" class="options" @blur.capture="touch(q.id)">
        <label v-for="opt in q.options || []" :key="opt" class="option-row">
          <input
            type="radio"
            :name="`q-${q.id}`"
            :value="opt"
            :checked="singleAnswers[q.id] === opt"
            @change="setSingle(q.id, opt)"
          />
          <span>{{ opt }}</span>
        </label>
      </div>

      <!-- multi：多选 -->
      <div v-else-if="q.question_type === 'multi'" class="options" @blur.capture="touch(q.id)">
        <label v-for="opt in q.options || []" :key="opt" class="option-row">
          <input
            type="checkbox"
            :value="opt"
            :checked="(multiAnswers[q.id] || []).includes(opt)"
            @change="toggleMulti(q.id, opt)"
          />
          <span>{{ opt }}</span>
        </label>
      </div>

      <!-- rating：星级 / NPS -->
      <div v-else-if="q.question_type === 'rating'" class="rating-wrap">
        <!-- star 风格 -->
        <div v-if="q.rating_style === 'star'" class="stars">
          <button
            v-for="n in q.rating_max || 5"
            :key="n"
            type="button"
            class="star-btn"
            :class="{ filled: n <= (ratingAnswers[q.id] || 0) }"
            :aria-label="`${n} 星`"
            @click="setRating(q.id, n)"
          >
            <Star
              :size="24"
              :stroke-width="1.6"
              :fill="n <= (ratingAnswers[q.id] || 0) ? 'currentColor' : 'none'"
            />
          </button>
        </div>
        <!-- nps 风格：0..max 数字按钮 -->
        <div v-else class="nps">
          <button
            v-for="n in npsRange(q.rating_max)"
            :key="n"
            type="button"
            class="nps-btn"
            :class="{ selected: ratingAnswers[q.id] === n }"
            @click="setRating(q.id, n)"
          >
            {{ n }}
          </button>
        </div>
      </div>

      <!-- text：开放文本 -->
      <textarea
        v-else-if="q.question_type === 'text'"
        class="text-answer"
        rows="3"
        :placeholder="q.required ? '必填' : '选填'"
        :value="textAnswers[q.id] || ''"
        @input="setText(q.id, ($event.target as HTMLTextAreaElement).value)"
        @blur="touch(q.id)"
      ></textarea>

      <p v-if="errors[q.id]" class="question-error" :data-testid="`survey-error-${q.id}`">
        {{ errors[q.id] }}
      </p>
    </div>

    <div class="survey-actions">
      <AppButton type="submit" variant="primary" :loading="submitting" data-testid="survey-submit">
        提交问卷
      </AppButton>
    </div>
  </form>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue'
import { Star } from 'lucide-vue-next'
import AppButton from '@/components/common/AppButton.vue'
import type { Question, SubmitAnswer } from '@/api/announcements'

const props = defineProps<{
  questions: Question[]
  submitting?: boolean
}>()

const emit = defineEmits<{
  submit: [answers: SubmitAnswer[]]
}>()

const sortedQuestions = computed(() =>
  [...props.questions].sort((a, b) => a.order_index - b.order_index)
)

// 各题型的本地作答状态（按 question_id 索引）。
const singleAnswers = reactive<Record<number, string>>({})
const multiAnswers = reactive<Record<number, string[]>>({})
const ratingAnswers = reactive<Record<number, number>>({})
const textAnswers = reactive<Record<number, string>>({})
const errors = reactive<Record<number, string>>({})
const touched = reactive<Record<number, boolean>>({})

function npsRange(max?: number | null): number[] {
  const m = max && max > 0 ? max : 10
  // NPS 从 0 到 max（含），故长度 m + 1。
  return Array.from({ length: m + 1 }, (_, i) => i)
}

function setSingle(qid: number, opt: string) {
  singleAnswers[qid] = opt
  touch(qid)
}

function toggleMulti(qid: number, opt: string) {
  const arr = multiAnswers[qid] ? [...multiAnswers[qid]] : []
  const idx = arr.indexOf(opt)
  if (idx === -1) arr.push(opt)
  else arr.splice(idx, 1)
  multiAnswers[qid] = arr
  touch(qid)
}

function setRating(qid: number, n: number) {
  ratingAnswers[qid] = n
  touch(qid)
}

function setText(qid: number, val: string) {
  textAnswers[qid] = val
}

/** blur / change 时标记为已触碰并做一次该题校验（仅在已触碰后才显示错误）。 */
function touch(qid: number) {
  touched[qid] = true
  validateOne(qid)
}

function findQuestion(qid: number): Question | undefined {
  return props.questions.find((q) => q.id === qid)
}

/** 校验单题；返回是否通过，并写入/清除 errors[qid]（仅触碰过的题才展示错误）。 */
function validateOne(qid: number, force = false): boolean {
  const q = findQuestion(qid)
  if (!q) return true
  const show = force || touched[qid]
  let msg = ''

  if (q.required) {
    switch (q.question_type) {
      case 'single':
        if (!singleAnswers[qid]) msg = '请选择一个选项'
        break
      case 'multi':
        if (!multiAnswers[qid] || multiAnswers[qid].length === 0) msg = '请至少选择一项'
        break
      case 'rating':
        // rating 必填：未作答（undefined）即不合法。NPS 允许 0，故用 == null 判断。
        if (ratingAnswers[qid] == null) msg = '请评分'
        break
      case 'text':
        if (!textAnswers[qid] || !textAnswers[qid].trim()) msg = '请填写内容'
        break
    }
  }

  if (show) {
    if (msg) errors[qid] = msg
    else delete errors[qid]
  }
  return msg === ''
}

function handleSubmit() {
  // 提交时强制校验全部题目（force=true 让错误立即显示，无视 touched）。
  let ok = true
  for (const q of props.questions) {
    touched[q.id] = true
    if (!validateOne(q.id, true)) ok = false
  }
  if (!ok) return

  const answers: SubmitAnswer[] = props.questions.map((q) => {
    switch (q.question_type) {
      case 'single':
        return { question_id: q.id, options: singleAnswers[q.id] ? [singleAnswers[q.id]] : [] }
      case 'multi':
        return { question_id: q.id, options: multiAnswers[q.id] || [] }
      case 'rating':
        return { question_id: q.id, rating: ratingAnswers[q.id] ?? null }
      case 'text':
      default:
        return { question_id: q.id, text: textAnswers[q.id] || null }
    }
  })

  emit('submit', answers)
}
</script>

<style scoped>
.survey-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.survey-question {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.question-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-text);
  line-height: var(--line-height-normal);
}

.required-mark {
  color: #ef4444;
  margin-right: 2px;
}

.options {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.option-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: var(--text-sm);
  color: var(--color-text);
  transition: border-color var(--transition-fast);
}

.option-row:hover {
  border-color: var(--color-accent-light);
}

.rating-wrap {
  display: flex;
}

.stars {
  display: flex;
  gap: var(--space-1);
}

.star-btn {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: var(--color-text-muted);
  transition: color var(--transition-fast);
}

.star-btn.filled {
  color: var(--color-accent);
}

.star-btn:hover {
  color: var(--color-accent);
}

.nps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.nps-btn {
  min-width: 38px;
  height: 38px;
  padding: 0 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.nps-btn:hover {
  border-color: var(--color-accent-light);
}

.nps-btn.selected {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #fff;
}

.text-answer {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-family: inherit;
  color: var(--color-text);
  resize: vertical;
  box-sizing: border-box;
}

.text-answer:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: var(--shadow-focus);
}

.question-error {
  margin: 0;
  font-size: var(--text-xs);
  color: #ef4444;
}

.survey-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--space-2);
}
</style>
