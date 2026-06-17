<!--
  SkillListRow — 单行操作按钮组（供 SkillList 表格用）

  纯展示组件，emit 父组件处理跳转/删除等动作。
  抽出独立文件是为了让 SkillList.vue 的模板更聚焦布局。

  skill-3tier-visibility T4: 编辑 / 删除按 can_edit gate。
    - can_edit=false（官方技能、或非自己有权编辑的机构/他人个人技能）→ 隐藏编辑/删除。
    - 详情 / 版本（只读）对所有可见行始终可用。

  agent-mode-v2-skill-as-artifact (S4 T10)
  Refs: docs/superpowers/specs/2026-05-24-agent-mode-v2-skill-as-artifact-design.md §5
-->
<script setup lang="ts">
import { computed } from 'vue'
import AppButton from '@/components/common/AppButton.vue'
import type { Skill } from '@/types/skill'

interface Props {
  skill: Skill
}

const props = defineProps<Props>()

const emit = defineEmits<{
  edit: [skill: Skill]
  view: [skill: Skill]
  history: [skill: Skill]
  delete: [skill: Skill]
}>()

// can_edit 缺省（旧后端未返回该字段）时回退为 true，保持既有行为不破坏；
// 后端返回 false 时（官方技能 / 跨租户 / 他人个人技能）隐藏编辑+删除。
const canEdit = computed(() => props.skill.can_edit !== false)
</script>

<template>
  <div class="skill-row-actions">
    <AppButton v-if="canEdit" size="sm" variant="secondary" @click="emit('edit', skill)"
      >编辑</AppButton
    >
    <AppButton size="sm" variant="secondary" @click="emit('view', skill)">详情</AppButton>
    <AppButton size="sm" variant="secondary" @click="emit('history', skill)">版本</AppButton>
    <AppButton v-if="canEdit" size="sm" variant="secondary" @click="emit('delete', skill)"
      >删除</AppButton
    >
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
