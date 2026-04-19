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
 *
 * credits-system Track E.6：dialog.show() 接受结构化 payload（{message, reason}），
 * 这里把 store 的 creditsMessage + creditsReason 打包传入，让 reason 文案能落到
 * dialog 的 `.modal-reason` 区域。若都为空，则传 undefined 走 dialog 默认文案。
 */
watch(
  () => uiDialogs.showCreditsDialog,
  (show) => {
    if (show) {
      const msg = uiDialogs.creditsMessage
      const reason = uiDialogs.creditsReason
      if (msg || reason) {
        insufficientCreditsDialog.value?.show({
          message: msg || undefined,
          reason: reason || undefined
        })
      } else {
        insufficientCreditsDialog.value?.show()
      }
      uiDialogs.closeCreditsDialog()
    }
  }
)

/**
 * 向后兼容 + credits-system Track E.1 拦截器：src/api/request.ts 的 axios
 * 拦截器派发 `insufficient-credits` CustomEvent。detail 可能是两种形态：
 *   - string（旧路径 / 403 "额度不足"兜底）
 *   - { message, reason }（新路径 / 402 Credits.Insufficient）
 *
 * 统一路由到 uiDialogs store，由 store 内部分发两种形态。
 *
 * 未来重构可以让 request.ts 直接调用 store.openCreditsDialog，届时可以
 * 删除本 handler。当前保留以确保零破坏。
 */
const handleInsufficientCredits = (e: Event) => {
  const detail = (e as CustomEvent).detail as
    | string
    | { message?: string; reason?: string }
    | undefined
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
