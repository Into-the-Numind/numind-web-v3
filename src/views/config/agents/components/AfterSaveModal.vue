<script setup lang="ts">
import ConfirmModal from '@/components/common/ConfirmModal.vue'

interface Props {
  visible: boolean
  agentName: string
}
defineProps<Props>()
defineEmits<{ 'configure-skills': []; skip: [] }>()
</script>

<template>
  <ConfirmModal
    :model-value="visible"
    title="✅ 助手已发布！"
    :message="`「${agentName}」已经可以让学员使用了。要现在为它装载技能吗？`"
    confirm-text="去装载技能"
    cancel-text="稍后"
    @confirm="$emit('configure-skills')"
    @cancel="$emit('skip')"
  />
</template>
