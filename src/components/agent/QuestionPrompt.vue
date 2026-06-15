<script setup lang="ts">
/**
 * QuestionPrompt.vue — Renders an ask_user_question yield as an interactive card.
 *
 * agent-multi-question: a single yield may pose 1-4 independent questions
 * (Claude Code's AskUserQuestion model). The card shows one question at a time
 * with a tab bar to flip between / revise them; the last question submits
 * directly (no separate review/confirmation step — agent-output-polish #1).
 * A single question collapses to a simple form (no tabs, direct submit).
 *
 * Each question carries its own options + an always-present free-text box (the
 * options are suggestions, not exhaustive). The user can skip a question by
 * leaving it blank; at least one must be answered to submit.
 *
 * Props:
 *   runId     — agent_run.id this answer belongs to (carried up on submit)
 *   questions — QuestionPromptItem[] (1-4): { question, options, header?, multi_select? }
 *   answered  — if true, render in read-only answered state
 *
 * Emits:
 *   answer-submitted — emits the answers up for the parent to resume the run
 *                      (the parent owns persistence + resume; issue4)
 */
import { ref, reactive, computed } from 'vue'
import type { AnswerItemPayload } from '@/api/agent'
import type { QuestionPromptItem } from '@/types/agent'
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-vue-next'

// Answered card is collapsed by default — click to expand and review the
// questions + answers (keeps the transcript clean while staying revisitable).
const answeredExpanded = ref(false)

interface Props {
  runId: number
  questions: QuestionPromptItem[]
  answered?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  answered: false
})

const emit = defineEmits<{
  'answer-submitted': [answers: Record<string, AnswerItemPayload>]
}>()

interface PerQuestion {
  selected: string[]
  freeText: string
}

// Per-question answer state, indexed 1:1 with props.questions. Initialized once:
// each yield is a distinct question_prompt message keyed by id in the list, so a
// new prompt mounts a fresh component — props.questions never mutates in place.
const state = reactive<PerQuestion[]>(props.questions.map(() => ({ selected: [], freeText: '' })))

const currentIndex = ref(0)
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
    currentIndex.value = i
  }
}
// On the last question goNext submits directly (no review step — #1); otherwise
// it advances to the next question.
const goNext = (): void => {
  if (isLast.value) {
    submitAnswers()
  } else {
    currentIndex.value++
  }
}
const goPrev = (): void => {
  if (!isFirst.value) {
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

// displayAnswer feeds the answered (read-only) recap. On a RELOADED session the
// live `state` is empty, but the backend reconstructs the card with each
// question's actual answer (issue1: questions[i].answer); prefer it. In-session
// (just answered, no reload) questions[i].answer is absent so the live state applies.
// Returns '' when neither is available (a legacy pre-issue1 reloaded card) so the
// template can fall back to a neutral "已回答" marker.
const displayAnswer = (i: number): string => props.questions[i]?.answer?.trim() || resolvedAnswer(i)

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

const submitAnswers = (): void => {
  if (submitting.value || !canSubmit.value) return
  // Stays true: the parent persists + resumes, then markQuestionAnswered flips
  // this card to its read-only answered state (re-rendering the footer away). No
  // local POST anymore — the parent owns it (issue4: streamed resume).
  submitting.value = true
  emit('answer-submitted', buildAnswers())
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
    <!-- C3 conversational header: a friendly "the assistant is asking" lead-in so
         the card reads like a colleague checking in, not a form. Hidden in the
         read-only answered recap. -->
    <div v-if="!answered" class="question-prompt__who">
      <span class="question-prompt__avatar" aria-hidden="true">
        <Sparkles :size="15" />
      </span>
      <span class="question-prompt__who-text">助手想跟你确认一下</span>
    </div>

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
          'is-current': i === currentIndex,
          'is-answered': isQuestionAnswered(i)
        }"
        :data-index="i"
        :disabled="submitting"
        :aria-current="i === currentIndex ? 'true' : undefined"
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

    <!-- Current question view -->
    <template v-if="!answered && current">
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
          class="question-prompt__option question-prompt__option--checkbox question-prompt__chip"
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
          class="question-prompt__option question-prompt__option--btn question-prompt__chip"
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
    <div v-if="!answered && current" class="question-prompt__nav">
      <button
        v-if="isMulti && !isFirst"
        type="button"
        class="question-prompt__prev"
        :disabled="submitting"
        @click="goPrev"
      >
        ← 上一题
      </button>
      <span class="question-prompt__nav-spacer" />

      <!-- Multi-question, not the last: advance to the next question -->
      <button
        v-if="isMulti && !isLast"
        type="button"
        class="question-prompt__next"
        :disabled="submitting"
        @click="goNext"
      >
        下一题 →
      </button>

      <!-- Last question (multi) or single question: submit directly (#1) -->
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
         can't edit it. displayAnswer(i) prefers the backend-reconstructed
         answer (issue1: a reloaded session rebuilds the card with each
         question's actual answer) and falls back to the live `state` in-session,
         or a neutral "已回答" marker for a legacy pre-issue1 reloaded card. -->
    <div v-if="answered" class="question-prompt__answered">
      <button
        type="button"
        class="question-prompt__answered-toggle"
        :aria-expanded="answeredExpanded"
        @click="answeredExpanded = !answeredExpanded"
      >
        <span class="question-prompt__answered-badge">✓ 已回答</span>
        <span class="question-prompt__answered-peek">{{
          answeredExpanded ? '收起' : '查看问题与回答'
        }}</span>
        <component
          :is="answeredExpanded ? ChevronUp : ChevronDown"
          :size="15"
          class="question-prompt__answered-chev"
        />
      </button>
      <ul v-show="answeredExpanded" class="question-prompt__answered-list">
        <li v-for="(q, i) in questions" :key="i" class="question-prompt__answered-item">
          <p class="question-prompt__answered-q">{{ q.question }}</p>
          <p class="question-prompt__answered-a" :class="{ 'is-empty': !displayAnswer(i) }">
            {{ displayAnswer(i) || '已回答' }}
          </p>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
/* C3 conversational soft card: a gentle emerald wash fading to white + a soft
   emerald border so the prompt reads as a warm "checking in", not a cold form. */
.question-prompt {
  background: linear-gradient(
    180deg,
    var(--color-accent-ultra-soft, hsl(160, 60%, 95%)),
    var(--color-surface, #fff) 42%
  );
  border: 1px solid var(--color-accent-soft, hsl(160, 60%, 93%));
  border-radius: var(--radius-lg, 16px);
  padding: 18px;
  max-width: 480px;
  width: 100%;
}

/* Answered card is a readable read-only recap, not a greyed-out husk. Drop the
   emerald wash for a neutral tint + muted border to signal "locked" without the
   0.65 opacity that made the recap hard to read. No pointer-events:none — the
   recap has no controls, and the user may want to select the text. */
.question-prompt--answered {
  background: var(--color-surface-tint, #f9fafb);
  border-color: var(--color-border, #e5e7eb);
}

/* C3 header: avatar + "the assistant is asking" lead-in. */
.question-prompt__who {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--color-text-secondary, #5f6577);
  font-size: 13px;
}

.question-prompt__avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--color-primary, hsl(160, 72%, 40%));
  color: #fff;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.question-prompt__answered-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  color: var(--color-text-muted, #6b7280);
}
.question-prompt__answered-badge {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary, #2563eb);
}
.question-prompt__answered-peek {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}
.question-prompt__answered-chev {
  margin-left: auto;
  color: var(--color-text-muted, #6b7280);
}

.question-prompt__answered-list {
  list-style: none;
  margin: 12px 0 0;
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
  background: var(--color-accent-ultra-soft, hsl(160, 60%, 95%));
  border-color: var(--color-primary, hsl(160, 72%, 40%));
  color: var(--color-primary, hsl(160, 72%, 40%));
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

/* Serif question — gives the prompt a calm, considered "a person is asking" tone
   (matches the brand's serif headings). */
.question-prompt__question {
  font-family: var(--font-heading, Georgia, 'Songti SC', serif);
  font-size: 15.5px;
  font-weight: 600;
  color: var(--color-text, #1a1d26);
  margin: 0 0 14px;
  line-height: 1.5;
}

/* ── Options as chips (C3) ── chips wrap horizontally; selected = emerald solid. */
.question-prompt__options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* Chip look shared by single-select and multi-select option buttons. */
.question-prompt__chip {
  border-radius: var(--radius-pill, 999px);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e4ea);
  transition:
    background 0.13s,
    border-color 0.13s,
    color 0.13s;
}

.question-prompt__chip:hover:not(:disabled):not(.is-disabled):not(.is-selected) {
  border-color: var(--color-accent-light, hsl(160, 70%, 68%));
}

/* Selected chip → emerald solid, white text (playground .c3 .chip.sel). */
.question-prompt__chip.is-selected {
  background: var(--color-primary, hsl(160, 72%, 40%));
  border-color: var(--color-primary, hsl(160, 72%, 40%));
}

.question-prompt__chip.is-selected .question-prompt__option-label,
.question-prompt__chip.is-selected .question-prompt__option-desc,
.question-prompt__chip.is-selected .question-prompt__checkbox-visual {
  color: #fff;
}

/* Single-select chip: label (+ optional sub-line description) in a pill. Visual
   bg/border/radius come from .question-prompt__chip; this only sets the layout. */
.question-prompt__option--btn {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 8px 15px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
}

.question-prompt__option--btn:disabled,
.question-prompt__option--btn.is-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* Multi-select chip: a ☑/☐ glyph + label in a pill. */
.question-prompt__option--checkbox {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 15px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}

.question-prompt__option--checkbox:disabled,
.question-prompt__option--checkbox.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.question-prompt__checkbox-visual {
  flex-shrink: 0;
  font-size: 15px;
  line-height: 1;
  color: var(--color-primary, hsl(160, 72%, 40%));
}

.question-prompt__option-label {
  font-size: 13.5px;
  color: var(--color-text, #1a1d26);
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
  padding: 10px 14px;
  border: 1px solid var(--color-border, #e2e4ea);
  border-radius: var(--radius-md, 12px);
  font-family: inherit;
  font-size: 13.5px;
  color: var(--color-text, #1a1d26);
  background: var(--color-surface, #fff);
  resize: vertical;
  box-sizing: border-box;
  transition: border-color 0.12s;
}

.question-prompt__textarea:focus {
  outline: none;
  border-color: var(--color-primary, hsl(160, 72%, 40%));
}

.question-prompt__textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
  border-radius: var(--radius-pill, 999px);
  cursor: pointer;
  transition: background 0.12s;
}

.question-prompt__prev {
  background: transparent;
  color: var(--color-text-muted, #8b90a0);
  border: 1px solid var(--color-border, #e2e4ea);
}

.question-prompt__prev:hover:not(:disabled) {
  background: var(--color-surface-hover, #f3f4f8);
}

.question-prompt__next {
  background: var(--color-surface, #fff);
  color: var(--color-primary, hsl(160, 72%, 40%));
  border: 1px solid var(--color-primary, hsl(160, 72%, 40%));
}

.question-prompt__next:hover:not(:disabled) {
  background: var(--color-accent-ultra-soft, hsl(160, 60%, 95%));
}

.question-prompt__submit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 22px;
  background: var(--color-primary, hsl(160, 72%, 40%));
  color: #fff;
  border: none;
  border-radius: var(--radius-pill, 999px);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s;
}

.question-prompt__submit:hover:not(:disabled) {
  background: var(--color-primary-hover, hsl(160, 72%, 34%));
}

.question-prompt__prev:disabled,
.question-prompt__next:disabled,
.question-prompt__submit:disabled {
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
