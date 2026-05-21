<script setup lang="ts">
import ConfirmModal from '@/components/common/ConfirmModal.vue'

interface Props {
  visible: boolean
  agentName: string
}
defineProps<Props>()
defineEmits<{ 'trial-chat': []; skip: [] }>()
</script>

<template>
  <ConfirmModal
    :model-value="visible"
    title="✅ 助手已发布！"
    :message="`「${agentName}」已经可以让学员使用了。要先体验一下，看看效果吗？`"
    confirm-text="试聊一下"
    cancel-text="暂时跳过"
    @confirm="$emit('trial-chat')"
    @cancel="$emit('skip')"
  />
</template>
