<script setup lang="ts">
/**
 * QuestionPrompt.vue — Renders ask_user_question yield UI.
 *
 * Single-select: clicking an option immediately submits.
 * Multi-select:  checkboxes + optional free-text + explicit submit button.
 *
 * Props:
 *   runId      — agent_run.id to POST the answer to
 *   question   — main question text shown to user
 *   options    — Array<{ label, description? }>
 *   header     — optional section heading above the options
 *   multiSelect — whether multiple options can be picked
 *   answered   — if true, render in read-only answered state (run_resumed received)
 *
 * Emits:
 *   answer-submitted — after successful POST
 */
import { ref, computed } from 'vue'
import { postAgentAnswer } from '@/api/agent'
import { useNotificationsStore } from '@/stores/notifications'
import type { QuestionPromptOption } from '@/types/agent'

interface Props {
  runId: number
  question: string
  options: QuestionPromptOption[]
  header?: string
  multiSelect?: boolean
  answered?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  header: undefined,
  multiSelect: false,
  answered: false
})

const emit = defineEmits<{
  'answer-submitted': []
}>()

const notifications = useNotificationsStore()

const selected = ref<string[]>([])
const freeText = ref('')
const submitting = ref(false)

const canSubmit = computed(() => selected.value.length > 0 || freeText.value.trim().length > 0)

const isSelected = (label: string): boolean => selected.value.includes(label)

const toggleOption = (label: string): void => {
  if (props.multiSelect) {
    if (selected.value.includes(label)) {
      selected.value = selected.value.filter((s) => s !== label)
    } else {
      selected.value = [...selected.value, label]
    }
  } else {
    selected.value = [label]
    void submitAnswer()
  }
}

const submitAnswer = async (): Promise<void> => {
  if (submitting.value) return
  submitting.value = true
  try {
    await postAgentAnswer(props.runId, {
      selected: selected.value,
      free_text: freeText.value.trim() || undefined
    })
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
    :aria-label="question"
  >
    <div v-if="header" class="question-prompt__header">{{ header }}</div>

    <p class="question-prompt__question">{{ question }}</p>

    <!-- Multi-select: show checkboxes -->
    <div v-if="multiSelect" class="question-prompt__options question-prompt__options--multi">
      <label
        v-for="opt in options"
        :key="opt.label"
        class="question-prompt__option question-prompt__option--checkbox"
        :class="{ 'is-selected': isSelected(opt.label), 'is-disabled': answered || submitting }"
      >
        <input
          type="checkbox"
          :value="opt.label"
          :checked="isSelected(opt.label)"
          :disabled="answered || submitting"
          class="question-prompt__checkbox"
          @change="toggleOption(opt.label)"
        />
        <span class="question-prompt__option-label">{{ opt.label }}</span>
        <span v-if="opt.description" class="question-prompt__option-desc">{{
          opt.description
        }}</span>
      </label>

      <!-- Free text area -->
      <div class="question-prompt__free-text">
        <textarea
          v-model="freeText"
          placeholder="补充说明（可选）"
          rows="2"
          :disabled="answered || submitting"
          class="question-prompt__textarea"
          aria-label="补充说明"
        />
      </div>

      <button
        class="question-prompt__submit"
        :disabled="!canSubmit || answered || submitting"
        :aria-busy="submitting"
        aria-label="提交回答"
        @click="submitAnswer"
      >
        <span v-if="submitting" class="question-prompt__spinner" aria-hidden="true">⏳</span>
        <span>{{ submitting ? '提交中...' : '提交' }}</span>
      </button>
    </div>

    <!-- Single-select: click-to-submit buttons -->
    <div v-else class="question-prompt__options question-prompt__options--single">
      <button
        v-for="opt in options"
        :key="opt.label"
        class="question-prompt__option question-prompt__option--btn"
        :class="{ 'is-selected': isSelected(opt.label), 'is-disabled': answered || submitting }"
        :disabled="answered || submitting"
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

    <!-- Answered overlay -->
    <p v-if="answered" class="question-prompt__answered-note">已回答，等待 agent 继续...</p>
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

.question-prompt--answered {
  opacity: 0.65;
  pointer-events: none;
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

/* Single-select buttons */
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

/* Multi-select checkboxes */
.question-prompt__option--checkbox {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s;
}

.question-prompt__option--checkbox:hover:not(.is-disabled) {
  background: var(--color-surface-hover, #f9fafb);
}

.question-prompt__option--checkbox.is-selected {
  background: var(--color-primary-ultra-soft, #eff6ff);
  border-color: var(--color-primary, #2563eb);
}

.question-prompt__option--checkbox.is-disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.question-prompt__checkbox {
  margin-top: 2px;
  flex-shrink: 0;
  accent-color: var(--color-primary, #2563eb);
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
  margin-top: 4px;
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

/* Submit button */
.question-prompt__submit {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
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
  align-self: flex-end;
}

.question-prompt__submit:hover:not(:disabled) {
  background: var(--color-primary-hover, #1d4ed8);
}

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
