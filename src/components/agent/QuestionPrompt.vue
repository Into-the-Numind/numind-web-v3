<script setup lang="ts">
/**
 * QuestionPrompt.vue — Renders an ask_user_question yield as an interactive card.
 *
 * agent-multi-question: a single yield may pose 1-4 independent questions
 * (Claude Code's AskUserQuestion model). The card shows one question at a time
 * with a tab bar to flip between / revise them, and a Review step before submit.
 * A single question collapses to a simple form (no tabs, direct submit).
 *
 * Each question carries its own options + an always-present free-text box (the
 * options are suggestions, not exhaustive). The user can skip a question by
 * leaving it blank; at least one must be answered to submit.
 *
 * Props:
 *   runId     — agent_run.id to POST the answer to
 *   questions — QuestionPromptItem[] (1-4): { question, options, header?, multi_select? }
 *   answered  — if true, render in read-only answered state
 *
 * Emits:
 *   answer-submitted — after a successful POST
 */
import { ref, reactive, computed } from 'vue'
import { postAgentAnswer, type AnswerItemPayload } from '@/api/agent'
import { useNotificationsStore } from '@/stores/notifications'
import type { QuestionPromptItem } from '@/types/agent'

interface Props {
  runId: number
  questions: QuestionPromptItem[]
  answered?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  answered: false
})

const emit = defineEmits<{
  'answer-submitted': []
}>()

const notifications = useNotificationsStore()

interface PerQuestion {
  selected: string[]
  freeText: string
}

// Per-question answer state, indexed 1:1 with props.questions. Initialized once:
// each yield is a distinct question_prompt message keyed by id in the list, so a
// new prompt mounts a fresh component — props.questions never mutates in place.
const state = reactive<PerQuestion[]>(props.questions.map(() => ({ selected: [], freeText: '' })))

const currentIndex = ref(0)
const reviewing = ref(false)
const submitting = ref(false)

const total = computed(() => props.questions.length)
const isMulti = computed(() => total.value > 1)
const current = computed(() => props.questions[currentIndex.value])
// Wire tolerance: the backend contract is "options is always an array", but a
// missing/null options must never blank the whole card (dev run 147 — an
// omitted key crashed render on options.length). Normalize once here; the
// template only reads currentOptions.
const currentOptions = computed(() => current.value?.options ?? [])
const currentState = computed(() => state[currentIndex.value])
const isFirst = computed(() => currentIndex.value === 0)
const isLast = computed(() => currentIndex.value === total.value - 1)

const isQuestionAnswered = (i: number): boolean => {
  const s = state[i]
  return s.selected.length > 0 || s.freeText.trim().length > 0
}
const answeredCount = computed(() => props.questions.filter((_, i) => isQuestionAnswered(i)).length)
const canSubmit = computed(() => answeredCount.value > 0)

const isSelected = (label: string): boolean => currentState.value.selected.includes(label)

const toggleOption = (label: string): void => {
  const s = currentState.value
  if (current.value.multi_select) {
    s.selected = s.selected.includes(label)
      ? s.selected.filter((x) => x !== label)
      : [...s.selected, label]
  } else {
    // Single-select: clicking toggles selection (no auto-submit; the user may
    // still add free text or move to the next question).
    s.selected = s.selected[0] === label ? [] : [label]
  }
}

const goTo = (i: number): void => {
  if (i >= 0 && i < total.value) {
    reviewing.value = false
    currentIndex.value = i
  }
}
const goNext = (): void => {
  if (isLast.value) {
    reviewing.value = true
  } else {
    currentIndex.value++
  }
}
const goPrev = (): void => {
  if (reviewing.value) {
    reviewing.value = false
  } else if (!isFirst.value) {
    currentIndex.value--
  }
}

const resolvedAnswer = (i: number): string => {
  const s = state[i]
  const parts: string[] = []
  if (s.selected.length > 0) parts.push(s.selected.join('、'))
  const ft = s.freeText.trim()
  if (ft) parts.push(ft)
  return parts.join('；')
}

const buildAnswers = (): Record<string, AnswerItemPayload> => {
  // Keyed by question text (Claude Code's model). The backend guarantees unique
  // question texts (ask_user_question Execute rejects duplicates), so keys never
  // collide here.
  const out: Record<string, AnswerItemPayload> = {}
  props.questions.forEach((q, i) => {
    if (!isQuestionAnswered(i)) return // skipping = omit the key
    const ft = state[i].freeText.trim()
    out[q.question] = {
      selected: [...state[i].selected],
      free_text: ft || undefined
    }
  })
  return out
}

const submitAnswers = async (): Promise<void> => {
  if (submitting.value || !canSubmit.value) return
  submitting.value = true
  try {
    await postAgentAnswer(props.runId, { answers: buildAnswers() })
    emit('answer-submitted')
  } catch (err) {
    const msg = (err as Error)?.message ?? '提交失败，请重试'
    notifications.error(`提交回答失败：${msg}`)
  } finally {
    submitting.value = false
  }
}

const handleKeydown = (event: KeyboardEvent, label: string): void => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggleOption(label)
  }
}
</script>

<template>
  <div
    class="question-prompt"
    :class="{ 'question-prompt--answered': answered }"
    role="group"
    :aria-label="isMulti ? `${total} 个问题` : questions[0]?.question"
  >
    <!-- Question navigator (multi-question only): one chip per question showing
         answered (☑) / pending (☐) status; click to revisit. A stepper, not an
         ARIA tab widget, so role=group + aria-current rather than tablist/tab. -->
    <div
      v-if="isMulti && !answered"
      class="question-prompt__tabs"
      role="group"
      aria-label="问题导航"
    >
      <button
        v-for="(q, i) in questions"
        :key="i"
        type="button"
        class="question-prompt__tab"
        :class="{
          'is-current': !reviewing && i === currentIndex,
          'is-answered': isQuestionAnswered(i)
        }"
        :data-index="i"
        :disabled="submitting"
        :aria-current="!reviewing && i === currentIndex ? 'true' : undefined"
        :aria-label="`第 ${i + 1} 题${isQuestionAnswered(i) ? '（已答）' : '（待答）'}`"
        @click="goTo(i)"
      >
        <span class="question-prompt__tab-status" aria-hidden="true">{{
          isQuestionAnswered(i) ? '☑' : '☐'
        }}</span>
        <span class="question-prompt__tab-index">Q{{ i + 1 }}</span>
      </button>
      <span class="question-prompt__progress">{{ answeredCount }}/{{ total }}</span>
    </div>

    <!-- Review panel (multi-question, last step): all Q&A with edit links -->
    <div v-if="reviewing && !answered" class="question-prompt__review">
      <p class="question-prompt__review-title">确认你的回答</p>
      <ul class="question-prompt__review-list">
        <li
          v-for="(q, i) in questions"
          :key="i"
          class="question-prompt__review-item"
          :class="{ 'is-empty': !isQuestionAnswered(i) }"
        >
          <div class="question-prompt__review-q">{{ q.question }}</div>
          <div class="question-prompt__review-a">
            {{ isQuestionAnswered(i) ? resolvedAnswer(i) : '（未回答）' }}
          </div>
          <button
            type="button"
            class="question-prompt__edit"
            :disabled="submitting"
            @click="goTo(i)"
          >
            修改
          </button>
        </li>
      </ul>
    </div>

    <!-- Current question view (current is guaranteed defined by the v-else-if) -->
    <template v-else-if="!answered && current">
      <div v-if="current.header" class="question-prompt__header">{{ current.header }}</div>
      <p class="question-prompt__question">{{ current.question }}</p>

      <!-- Multi-select: checkboxes (button-based; see jsdom note below) -->
      <div
        v-if="current.multi_select"
        class="question-prompt__options question-prompt__options--multi"
      >
        <!-- 多选用 <button>（非 <label><input>）：jsdom 不实现 label-click，button @click 可靠；
             aria-pressed 表达已选语义；视觉用 ☑/☐ 占位。 -->
        <button
          v-for="opt in currentOptions"
          :key="opt.label"
          type="button"
          class="question-prompt__option question-prompt__option--checkbox"
          :class="{ 'is-selected': isSelected(opt.label), 'is-disabled': submitting }"
          :disabled="submitting"
          :aria-pressed="isSelected(opt.label)"
          @click="toggleOption(opt.label)"
          @keydown="handleKeydown($event, opt.label)"
        >
          <span class="question-prompt__checkbox-visual" aria-hidden="true">{{
            isSelected(opt.label) ? '☑' : '☐'
          }}</span>
          <span class="question-prompt__option-label">{{ opt.label }}</span>
          <span v-if="opt.description" class="question-prompt__option-desc">{{
            opt.description
          }}</span>
        </button>
      </div>

      <!-- Single-select: click selects (no auto-submit) -->
      <div v-else class="question-prompt__options question-prompt__options--single">
        <button
          v-for="opt in currentOptions"
          :key="opt.label"
          type="button"
          class="question-prompt__option question-prompt__option--btn"
          :class="{ 'is-selected': isSelected(opt.label), 'is-disabled': submitting }"
          :disabled="submitting"
          :aria-pressed="isSelected(opt.label)"
          :aria-label="opt.description ? `${opt.label}: ${opt.description}` : opt.label"
          @click="toggleOption(opt.label)"
          @keydown="handleKeydown($event, opt.label)"
        >
          <span class="question-prompt__option-label">{{ opt.label }}</span>
          <span v-if="opt.description" class="question-prompt__option-desc">{{
            opt.description
          }}</span>
        </button>
      </div>

      <!-- Free-text box — always present; the options are suggestions only. -->
      <div class="question-prompt__free-text">
        <textarea
          v-model="currentState.freeText"
          :placeholder="
            currentOptions.length ? '没有合适的选项？在此自由填写你的答案' : '在此输入你的回答'
          "
          rows="2"
          :disabled="submitting"
          class="question-prompt__textarea"
          aria-label="自由填写你的回答"
        />
      </div>
    </template>

    <!-- Defensive: a question_prompt with no questions (should not happen — the
         backend never yields zero questions) renders a quiet note, not a crash. -->
    <p v-else-if="!answered" class="question-prompt__answered-note">暂无需要回答的问题。</p>

    <!-- Footer nav / submit -->
    <div v-if="!answered && (current || reviewing)" class="question-prompt__nav">
      <button
        v-if="isMulti && (!isFirst || reviewing)"
        type="button"
        class="question-prompt__prev"
        :disabled="submitting"
        @click="goPrev"
      >
        ← {{ reviewing ? '返回修改' : '上一题' }}
      </button>
      <span class="question-prompt__nav-spacer" />

      <!-- Review-step submit -->
      <button
        v-if="reviewing"
        type="button"
        class="question-prompt__submit"
        :disabled="!canSubmit || submitting"
        :aria-busy="submitting"
        aria-label="提交回答"
        @click="submitAnswers"
      >
        <span v-if="submitting" class="question-prompt__spinner" aria-hidden="true">⏳</span>
        <span>{{ submitting ? '提交中...' : '提交' }}</span>
      </button>

      <!-- Multi-question: advance to next question / review -->
      <button
        v-else-if="isMulti"
        type="button"
        class="question-prompt__next"
        :disabled="submitting"
        @click="goNext"
      >
        {{ isLast ? '检查并提交' : '下一题' }} →
      </button>

      <!-- Single question: submit directly -->
      <button
        v-else
        type="button"
        class="question-prompt__submit"
        :disabled="!canSubmit || submitting"
        :aria-busy="submitting"
        aria-label="提交回答"
        @click="submitAnswers"
      >
        <span v-if="submitting" class="question-prompt__spinner" aria-hidden="true">⏳</span>
        <span>{{ submitting ? '提交中...' : '提交' }}</span>
      </button>
    </div>

    <!-- Answered: read-only recap of the questions + the user's answers. The
         card stays visible (was previously hidden behind a one-line note) so the
         user can always look back at what was asked and what they replied — just
         can't edit it. resolvedAnswer(i) reads the live `state`; on a reloaded
         session `state` is empty (the answer rides in a separate user bubble),
         so we show the questions with a neutral "已回答" marker. -->
    <div v-if="answered" class="question-prompt__answered">
      <span class="question-prompt__answered-badge">✓ 已回答</span>
      <ul class="question-prompt__answered-list">
        <li v-for="(q, i) in questions" :key="i" class="question-prompt__answered-item">
          <p class="question-prompt__answered-q">{{ q.question }}</p>
          <p class="question-prompt__answered-a" :class="{ 'is-empty': !resolvedAnswer(i) }">
            {{ resolvedAnswer(i) || '已回答' }}
          </p>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.question-prompt {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
  padding: 16px;
  max-width: 480px;
  width: 100%;
}

/* Answered card is a readable read-only recap, not a greyed-out husk. A soft
   tint + muted border signals "locked" without the 0.65 opacity that made the
   recap hard to read. No pointer-events:none — the recap has no controls, and
   the user may want to select the text. */
.question-prompt--answered {
  background: var(--color-surface-tint, #f9fafb);
  border-color: var(--color-border, #e5e7eb);
}

.question-prompt__answered-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary, #2563eb);
  margin-bottom: 10px;
}

.question-prompt__answered-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.question-prompt__answered-item {
  padding: 10px 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
}

.question-prompt__answered-q {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text, #1f2937);
  line-height: 1.4;
}

.question-prompt__answered-a {
  margin: 0;
  font-size: 13px;
  /* Plain text colour, not --color-primary: this is a read-only recap value, it
     should not compete visually with the primary-blue "✓ 已回答" badge or look
     clickable. */
  color: var(--color-text, #1f2937);
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

.question-prompt__answered-a.is-empty {
  color: var(--color-text-muted, #6b7280);
  font-style: italic;
}

/* ── Tab bar ── */
.question-prompt__tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}

.question-prompt__tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-family: inherit;
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 999px;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s,
    color 0.12s;
}

.question-prompt__tab:hover:not(:disabled) {
  border-color: var(--color-primary, #2563eb);
}

.question-prompt__tab.is-answered {
  color: var(--color-primary, #2563eb);
}

.question-prompt__tab.is-current {
  background: var(--color-primary-ultra-soft, #eff6ff);
  border-color: var(--color-primary, #2563eb);
  color: var(--color-primary, #2563eb);
  font-weight: 600;
}

.question-prompt__tab:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.question-prompt__tab-status {
  font-size: 13px;
  line-height: 1;
}

.question-prompt__progress {
  margin-left: auto;
  font-size: 11px;
  color: var(--color-text-muted, #6b7280);
}

.question-prompt__header {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted, #6b7280);
  margin-bottom: 8px;
}

.question-prompt__question {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text, #1f2937);
  margin: 0 0 14px;
  line-height: 1.5;
}

/* ── Options ── */
.question-prompt__options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.question-prompt__option--btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 14px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition:
    background 0.12s,
    border-color 0.12s;
  width: 100%;
}

.question-prompt__option--btn:hover:not(:disabled) {
  background: var(--color-surface-hover, #f9fafb);
  border-color: var(--color-primary, #2563eb);
}

.question-prompt__option--btn.is-selected {
  background: var(--color-primary-ultra-soft, #eff6ff);
  border-color: var(--color-primary, #2563eb);
}

.question-prompt__option--btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.question-prompt__option--checkbox {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  width: 100%;
  transition:
    background 0.12s,
    border-color 0.12s;
}

.question-prompt__option--checkbox:hover:not(:disabled):not(.is-disabled) {
  background: var(--color-surface-hover, #f9fafb);
}

.question-prompt__option--checkbox.is-selected {
  background: var(--color-primary-ultra-soft, #eff6ff);
  border-color: var(--color-primary, #2563eb);
}

.question-prompt__option--checkbox:disabled,
.question-prompt__option--checkbox.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.question-prompt__checkbox-visual {
  margin-top: 1px;
  flex-shrink: 0;
  font-size: 16px;
  line-height: 1;
  color: var(--color-primary, #2563eb);
}

.question-prompt__option-label {
  font-size: 14px;
  color: var(--color-text, #1f2937);
  font-weight: 500;
  line-height: 1.4;
}

.question-prompt__option-desc {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
  line-height: 1.4;
}

/* Free text */
.question-prompt__free-text {
  margin-top: 8px;
}

.question-prompt__textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  color: var(--color-text, #1f2937);
  background: var(--color-surface, #fff);
  resize: vertical;
  box-sizing: border-box;
  transition: border-color 0.12s;
}

.question-prompt__textarea:focus {
  outline: none;
  border-color: var(--color-primary, #2563eb);
}

.question-prompt__textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── Review panel ── */
.question-prompt__review-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0 0 12px;
}

.question-prompt__review-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.question-prompt__review-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 8px;
  padding: 10px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
}

.question-prompt__review-item.is-empty {
  opacity: 0.7;
}

.question-prompt__review-q {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text, #1f2937);
}

.question-prompt__review-a {
  grid-column: 1;
  font-size: 13px;
  color: var(--color-primary, #2563eb);
}

.question-prompt__review-item.is-empty .question-prompt__review-a {
  color: var(--color-text-muted, #6b7280);
}

.question-prompt__edit {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
  padding: 4px 10px;
  font-family: inherit;
  font-size: 12px;
  color: var(--color-primary, #2563eb);
  background: transparent;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  cursor: pointer;
}

.question-prompt__edit:hover:not(:disabled) {
  border-color: var(--color-primary, #2563eb);
}

/* ── Footer nav ── */
.question-prompt__nav {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}

.question-prompt__nav-spacer {
  flex: 1;
}

.question-prompt__prev,
.question-prompt__next {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s;
}

.question-prompt__prev {
  background: transparent;
  color: var(--color-text-muted, #6b7280);
  border: 1px solid var(--color-border, #e5e7eb);
}

.question-prompt__prev:hover:not(:disabled) {
  background: var(--color-surface-hover, #f9fafb);
}

.question-prompt__next {
  background: var(--color-surface, #fff);
  color: var(--color-primary, #2563eb);
  border: 1px solid var(--color-primary, #2563eb);
}

.question-prompt__next:hover:not(:disabled) {
  background: var(--color-primary-ultra-soft, #eff6ff);
}

.question-prompt__submit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  background: var(--color-primary, #2563eb);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s;
}

.question-prompt__submit:hover:not(:disabled) {
  background: var(--color-primary-hover, #1d4ed8);
}

.question-prompt__prev:disabled,
.question-prompt__next:disabled,
.question-prompt__submit:disabled,
.question-prompt__edit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.question-prompt__spinner {
  animation: spin 1s linear infinite;
  display: inline-block;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Answered note */
.question-prompt__answered-note {
  margin: 10px 0 0;
  font-size: 12px;
  font-style: italic;
  color: var(--color-text-muted, #6b7280);
}
</style>
