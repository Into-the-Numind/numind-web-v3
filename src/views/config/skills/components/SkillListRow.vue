<!--
  SkillListRow — 单行操作按钮组（供 SkillList 表格用）

  纯展示组件，emit 父组件处理跳转/删除等动作。
  抽出独立文件是为了让 SkillList.vue 的模板更聚焦布局。

  agent-mode-v2-skill-as-artifact (S4 T10)
  Refs: docs/superpowers/specs/2026-05-24-agent-mode-v2-skill-as-artifact-design.md §5
-->
<script setup lang="ts">
import AppButton from '@/components/common/AppButton.vue'
import type { Skill } from '@/types/skill'

interface Props {
  skill: Skill
}

defineProps<Props>()

const emit = defineEmits<{
  edit: [skill: Skill]
  view: [skill: Skill]
  history: [skill: Skill]
  delete: [skill: Skill]
}>()
</script>

<template>
  <div class="skill-row-actions">
    <AppButton size="sm" variant="secondary" @click="emit('edit', skill)">编辑</AppButton>
    <AppButton size="sm" variant="secondary" @click="emit('view', skill)">详情</AppButton>
    <AppButton size="sm" variant="secondary" @click="emit('history', skill)">版本</AppButton>
    <AppButton size="sm" variant="secondary" @click="emit('delete', skill)">删除</AppButton>
  </div>
</template>

<style scoped>
.skill-row-actions {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
  justify-content: center;
}
</style>
