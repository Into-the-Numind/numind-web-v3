<template>
  <div id="app">
    <RouterView />
    <InsufficientCreditsDialog ref="insufficientCreditsDialog" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import InsufficientCreditsDialog from '@/components/common/InsufficientCreditsDialog.vue'

const insufficientCreditsDialog = ref<InstanceType<typeof InsufficientCreditsDialog>>()

const handleInsufficientCredits = (e: Event) => {
  insufficientCreditsDialog.value?.show((e as CustomEvent).detail)
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
