<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { SALES_STAGES } from '@/api/sales'
import { useSalesStore } from '@/stores/sales'

const store = useSalesStore()
const isOpen = ref(false)

const currentStageLabel = computed(() => {
  const stage = SALES_STAGES.find((s) => s.id === store.salesStage)
  return stage ? stage.label : '未设置阶段'
})

function selectStage(stageId: string) {
  store.setSalesStage(stageId)
  isOpen.value = false
}

function onClickOutside(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest('.stage-pill')
  if (!el) isOpen.value = false
}

onMounted(() => document.addEventListener('click', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside))
</script>

<template>
  <div class="stage-pill" :class="{ active: isOpen }" @click.stop="isOpen = !isOpen">
    <div class="stage-dot"></div>
    <span>{{ currentStageLabel }}</span>
    <ChevronDown :size="14" style="opacity: 0.5" />
    <div class="stage-dropdown" v-show="isOpen">
      <div
        v-for="stage in SALES_STAGES"
        :key="stage.id"
        class="stage-option"
        :class="{ selected: stage.id === store.salesStage }"
        @click.stop="selectStage(stage.id)"
      >
        <span>{{ stage.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 32px;
  background: rgba(255, 255, 255, 0.4);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  font-size: 13px;
  color: var(--text);
  font-weight: 500;
  margin-left: 8px;
}

.stage-pill:hover {
  background: white;
  border-color: var(--primary);
  box-shadow: 0 2px 8px rgba(37, 167, 105, 0.1);
  color: var(--primary);
}

.stage-pill.active {
  border-color: var(--primary);
  background: white;
}

.stage-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #10b981;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}

.stage-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  background: white;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  padding: 6px;
  min-width: 100%;
  width: max-content;
  transform: translateX(-50%);
  z-index: 100;
}

.stage-option {
  padding: 8px 12px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
}

.stage-option:hover {
  background: rgba(0, 0, 0, 0.04);
}

.stage-option.selected {
  background: rgba(37, 167, 105, 0.08);
  color: var(--primary);
  font-weight: 600;
}
</style>
