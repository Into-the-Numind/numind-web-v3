<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAgentBuilderStore } from '@/stores/agentBuilder'
import AgentBuilder from './AgentBuilder.vue'
import AgentAdvancedEdit from './AgentAdvancedEdit.vue'
// v2 #1 agent-mode-v2-skill-as-artifact — Skill 装载面板嵌入 Agent 编辑页
import SkillBindingPanel from '@/views/config/skills/components/SkillBindingPanel.vue'

const route = useRoute()
const store = useAgentBuilderStore()
const agentId = computed(() => Number(route.params.id))

// Marketplace 装载闭环：从 AgentList(?attach_skill) 进来时，把要装载的 skill 传给
// SkillBindingPanel，由它自动装载（用户无需再手动在选择器里找）。
const attachSkillId = computed(() => {
  const v = Number(route.query.attach_skill)
  return Number.isFinite(v) && v > 0 ? v : null
})

// Fetch on mount and whenever the id changes (e.g. router recycles component)
watch(
  agentId,
  (id) => {
    if (id) store.fetchOne(id)
  },
  { immediate: true }
)
</script>

<template>
  <div v-if="store.currentLoading" class="edit-loading">加载中...</div>
  <div v-else-if="store.currentError" class="edit-error">
    {{ store.currentError }}
  </div>
  <div v-else class="agent-edit-with-skills">
    <!--
      Skill 装载面板：v2 #1 资产化技能装载/排序/卸载入口。
      显示在工具开关区块上方，让"装载哪些技能"成为配置助手的核心动作。
      Refs: docs/superpowers/specs/2026-05-24-agent-mode-v2-skill-as-artifact-design.md §5.4
    -->
    <SkillBindingPanel :agent-id="agentId" :auto-attach-skill-id="attachSkillId" />

    <!-- 原有的工具开关 / 问卷编辑（根据 advanced_mode 分支） -->
    <AgentAdvancedEdit v-if="store.current?.advanced_mode" :agent-id="agentId" />
    <AgentBuilder v-else mode="edit" :agent-id="agentId" />
  </div>
</template>

<style scoped>
.edit-loading,
.edit-error {
  padding: var(--space-8);
  text-align: center;
  color: var(--on-surface-variant);
}

.agent-edit-with-skills {
  display: flex;
  flex-direction: column;
  padding: var(--space-4) var(--space-4) 0;
}
</style>
