<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AgentBuilder from './AgentBuilder.vue'

// 薄壳：把路由参数转成 agentId 交给 AgentBuilder（编辑态）。
// 加载/错误态、表单填充、以及「装载 skill」面板都由 AgentBuilder 自己拥有
// （agent-builder-refine：技能装载内嵌创建/编辑页，不再由本壳单独渲染）。
const route = useRoute()
const agentId = computed(() => Number(route.params.id))
</script>

<template>
  <AgentBuilder mode="edit" :agent-id="agentId" />
</template>
