<script setup lang="ts">
import { computed } from "vue";
import type { Agent, AgentFormState } from "@/types/agentBuilder";
import { formatDate } from "@/utils/datetime";
import QuestionnaireForm from "./QuestionnaireForm.vue";

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  agent: Agent;
}

const props = defineProps<Props>();

// ── Computed ───────────────────────────────────────────────────────────────

/** Map Agent → AgentFormState for QuestionnaireForm (readonly mode) */
const form = computed<AgentFormState>(() => ({
  name: props.agent.name,
  description: props.agent.description,
  icon_url: props.agent.icon_url,
  welcome_message: props.agent.welcome_message,
  starters: props.agent.starters ?? [],
  questionnaire_answers: props.agent.questionnaire_answers,
  tool_flags: props.agent.tool_flags ?? {},
  credit_cap_per_session: props.agent.credit_cap_per_session,
  daily_credit_cap: props.agent.daily_credit_cap,
}));
</script>

<template>
  <div class="agent-config-tab">
    <div class="config-meta">
      <span class="version-badge">版本 v{{ agent.version }}</span>
      <span class="updated-at"
        >最后更新：{{ formatDate(agent.updated_at) }}</span
      >
    </div>

    <QuestionnaireForm :model-value="form" readonly />
  </div>
</template>

<style scoped>
.agent-config-tab {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.config-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid rgba(169, 180, 185, 0.1);
}

.version-badge {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  background: var(--surface-high);
  border-radius: var(--radius-full, 9999px);
  font-family: var(--font-label);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--on-surface-variant);
}

.updated-at {
  font-size: var(--text-xs);
  color: var(--on-surface-variant);
}
</style>
