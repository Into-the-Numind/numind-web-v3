<script setup lang="ts">
import ConfirmModal from '@/components/common/ConfirmModal.vue'

interface Props {
  visible: boolean
}

defineProps<Props>()

defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <ConfirmModal
    :model-value="visible"
    title="⚠️ 切换到高级模式"
    message="高级模式允许你直接编写系统提示词，适合有 AI 使用经验的配置者。注意：切换后，当前问卷内容会转换为 Prompt 文本，无法切回问卷模式（问卷结构会丢失）。写错了可以从历史版本回滚。"
    confirm-text="切换到高级模式"
    cancel-text="取消"
    variant="danger"
    @confirm="$emit('confirm')"
    @cancel="$emit('cancel')"
  />
</template>
