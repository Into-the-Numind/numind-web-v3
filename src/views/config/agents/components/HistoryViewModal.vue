<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import type { Agent, AgentFormState } from '@/types/agentBuilder'
import QuestionnaireForm from './QuestionnaireForm.vue'

// ── Props / Emits ──────────────────────────────────────────────────────────

interface Props {
  visible: boolean
  snapshot: Agent
}

const props = defineProps<Props>()

defineEmits<{
  close: []
}>()

// ── Computed ───────────────────────────────────────────────────────────────

const form = computed<AgentFormState>(() => ({
  name: props.snapshot.name,
  description: props.snapshot.description,
  icon_url: props.snapshot.icon_url,
  welcome_message: props.snapshot.welcome_message,
  system_prompt: props.snapshot.system_prompt ?? '',
  starters: props.snapshot.starters ?? [],
  questionnaire_answers: props.snapshot.questionnaire_answers,
  tool_flags: props.snapshot.tool_flags ?? {},
  credit_cap_per_session: props.snapshot.credit_cap_per_session,
  daily_credit_cap: props.snapshot.daily_credit_cap
}))
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="modal-overlay"
        @click.self="$emit('close')"
        @keydown.esc="$emit('close')"
      >
        <div class="modal-card" role="dialog" aria-modal="true">
          <header class="modal-header">
            <h3 class="modal-title">查看版本 v{{ snapshot.version }}</h3>
            <button class="close-btn" aria-label="关闭" @click="$emit('close')">
              <X :size="18" />
            </button>
          </header>

          <div class="modal-body">
            <QuestionnaireForm :model-value="form" readonly />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.modal-card {
  background: var(--surface-lowest);
  border-radius: var(--radius-sm);
  width: 90%;
  max-width: 680px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5) var(--space-6);
  border-bottom: 1px solid rgba(169, 180, 185, 0.1);
  flex-shrink: 0;
}

.modal-title {
  font-family: var(--font-headline);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--on-surface);
}

.close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--on-surface-variant);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.close-btn:hover {
  background: var(--surface-low);
  color: var(--on-surface);
}

.modal-body {
  overflow-y: auto;
  padding: var(--space-6);
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 200ms ease;
}

.modal-enter-active .modal-card,
.modal-leave-active .modal-card {
  transition: transform 200ms ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-card {
  transform: scale(0.95);
}

.modal-leave-to .modal-card {
  transform: scale(0.95);
}
</style>
