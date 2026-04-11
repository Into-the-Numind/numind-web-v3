<template>
  <div id="app">
    <RouterView />
    <!-- 全局 dialog + toast 挂载点 -->
    <InsufficientCreditsDialog ref="insufficientCreditsDialog" />
    <AppNotification />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { RouterView } from 'vue-router'
import InsufficientCreditsDialog from '@/components/common/InsufficientCreditsDialog.vue'
import AppNotification from '@/components/common/AppNotification.vue'
import { useUiDialogsStore } from '@/stores/uiDialogs'

const uiDialogs = useUiDialogsStore()
const insufficientCreditsDialog = ref<InstanceType<typeof InsufficientCreditsDialog>>()

/**
 * 监听 uiDialogs store 的 showCreditsDialog 状态，为 true 时触发
 * InsufficientCreditsDialog 的 show() 方法。
 *
 * 这是 spec §10.1 要求的"统一通过 Pinia store 触发全局 dialog"机制。
 * 新代码应调用 uiDialogs.openCreditsDialog(msg) 而不是直接 dispatchEvent。
 *
 * 触发后立刻重置 flag，这样下次调用 openCreditsDialog 时 watch 能重新触发。
 */
watch(
  () => uiDialogs.showCreditsDialog,
  (show) => {
    if (show) {
      insufficientCreditsDialog.value?.show(uiDialogs.creditsMessage || undefined)
      uiDialogs.closeCreditsDialog()
    }
  }
)

/**
 * 向后兼容：src/api/request.ts 的 axios 拦截器仍使用 CustomEvent 触发。
 * 此 handler 把 CustomEvent 路径也接入 store，让所有路径通过 store 汇聚。
 *
 * 未来重构可以让 request.ts 直接调用 store.openCreditsDialog，届时可以
 * 删除本 handler。当前保留以确保零破坏。
 */
const handleInsufficientCredits = (e: Event) => {
  const detail = (e as CustomEvent).detail as string | undefined
  uiDialogs.openCreditsDialog(detail)
}

onMounted(() => {
  window.addEventListener('insufficient-credits', handleInsufficientCredits)
})

onUnmounted(() => {
  window.removeEventListener('insufficient-credits', handleInsufficientCredits)
})
</script>

<style>
#app {
  min-height: 100vh;
}
</style>
