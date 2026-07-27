<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ChevronDown, ChevronUp, ListChecks } from 'lucide-vue-next'

interface Props {
  steps: string[]
  defaultOpen?: boolean
}

const props = withDefaults(defineProps<Props>(), { defaultOpen: undefined })

const open = ref(false)

onMounted(() => {
  if (props.defaultOpen !== undefined) {
    open.value = props.defaultOpen
    return
  }
  // matchMedia: < 768px 默认折叠
  const isMobile = window.matchMedia('(max-width: 768px)').matches
  open.value = !isMobile
})

const toggle = (): void => {
  open.value = !open.value
}
</script>

<template>
  <div class="plan-card">
    <button class="plan-header" @click="toggle" :aria-expanded="open">
      <span class="plan-title">
        <ListChecks :size="15" aria-hidden="true" />
        我的计划
      </span>
      <component :is="open ? ChevronUp : ChevronDown" :size="16" />
    </button>
    <ol v-if="open" class="plan-steps">
      <li v-for="(step, idx) in steps" :key="idx">{{ step }}</li>
    </ol>
  </div>
</template>

<style scoped>
.plan-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--agent-radius-card, 10px);
  padding: 12px 16px;
}

.plan-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
}

.plan-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.plan-steps {
  margin: 12px 0 0;
  padding-left: 20px;
  font-size: 13px;
  color: var(--color-text-muted, #4b5563);
  line-height: 1.6;
}

.plan-steps li {
  margin-bottom: 4px;
}
</style>
