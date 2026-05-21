<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import { useAgentBuilderStore } from "@/stores/agentBuilder";
import AgentBuilder from "./AgentBuilder.vue";
import AgentAdvancedEdit from "./AgentAdvancedEdit.vue";

const route = useRoute();
const store = useAgentBuilderStore();
const agentId = computed(() => Number(route.params.id));

// Fetch on mount and whenever the id changes (e.g. router recycles component)
watch(
  agentId,
  (id) => {
    if (id) store.fetchOne(id);
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="store.currentLoading" class="edit-loading">加载中...</div>
  <div v-else-if="store.currentError" class="edit-error">
    {{ store.currentError }}
  </div>
  <AgentAdvancedEdit
    v-else-if="store.current?.advanced_mode"
    :agent-id="agentId"
  />
  <AgentBuilder v-else mode="edit" :agent-id="agentId" />
</template>

<style scoped>
.edit-loading,
.edit-error {
  padding: var(--space-8);
  text-align: center;
  color: var(--on-surface-variant);
}
</style>
