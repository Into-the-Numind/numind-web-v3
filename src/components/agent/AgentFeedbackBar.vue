<script setup lang="ts">
import { ref } from 'vue'
import { useAgentChatStore } from '@/stores/agentChat'
import AppButton from '@/components/common/AppButton.vue'
import { ThumbsUp, ThumbsDown } from 'lucide-vue-next'

interface Props {
  runId?: number
  initialFeedback?: 'positive' | 'negative' | null
  initialNote?: string
}

const props = withDefaults(defineProps<Props>(), {
  runId: undefined,
  initialFeedback: null,
  initialNote: ''
})

const store = useAgentChatStore()

const feedback = ref<'positive' | 'negative' | null>(props.initialFeedback)
const showNote = ref(false)
const note = ref(props.initialNote)
const submitting = ref(false)

const handleUp = async (): Promise<void> => {
  if (!props.runId) return
  feedback.value = 'positive'
  showNote.value = false
  submitting.value = true
  try {
    await store.submitFeedback(props.runId, 'positive')
  } finally {
    submitting.value = false
  }
}

const handleDown = (): void => {
  if (!props.runId) return
  feedback.value = 'negative'
  showNote.value = true
}

const handleSubmitNote = async (): Promise<void> => {
  if (!props.runId) return
  submitting.value = true
  try {
    await store.submitFeedback(props.runId, 'negative', note.value.trim() || undefined)
    showNote.value = false
  } finally {
    submitting.value = false
  }
}

const handleSkip = async (): Promise<void> => {
  if (!props.runId) return
  submitting.value = true
  try {
    await store.submitFeedback(props.runId, 'negative')
    showNote.value = false
    note.value = ''
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="feedback-bar">
    <div class="row">
      <span class="prompt">这个回答对你有帮助吗？</span>
      <button
        :class="['fb-btn', { active: feedback === 'positive' }]"
        :disabled="submitting"
        @click="handleUp"
        aria-label="点赞"
      >
        <ThumbsUp :size="16" />
      </button>
      <button
        :class="['fb-btn', { 'active negative': feedback === 'negative' }]"
        :disabled="submitting"
        @click="handleDown"
        aria-label="点踩"
      >
        <ThumbsDown :size="16" />
      </button>
    </div>

    <div v-if="showNote" class="note-section">
      <p class="note-prompt">可以告诉我哪里不好吗？（选填）</p>
      <textarea v-model="note" rows="2" class="note-input" placeholder="可选..." />
      <div class="note-actions">
        <AppButton variant="secondary" :disabled="submitting" @click="handleSkip">跳过</AppButton>
        <AppButton :disabled="submitting" @click="handleSubmitNote">提交</AppButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.feedback-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
}

.prompt {
  margin-right: 8px;
}

.fb-btn {
  background: none;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 14px;
  padding: 4px 8px;
  cursor: pointer;
  color: var(--color-text-muted, #6b7280);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.fb-btn:hover {
  background: #f3f4f6;
}

.fb-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fb-btn.active {
  background: var(--color-primary, #2563eb);
  color: #fff;
  border-color: var(--color-primary, #2563eb);
}

.fb-btn.active.negative {
  background: #f97316;
  border-color: #f97316;
}

.note-section {
  background: #f9fafb;
  border-radius: 8px;
  padding: 12px;
  margin-top: 8px;
}

.note-prompt {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
  margin: 0 0 8px;
}

.note-input {
  width: 100%;
  resize: none;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  padding: 6px 10px;
  font-family: inherit;
  font-size: 13px;
  outline: none;
}

.note-input:focus {
  border-color: var(--color-primary, #2563eb);
}

.note-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
