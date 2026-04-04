<script setup lang="ts">
import { onMounted } from 'vue'
import { useMonitorStore } from '@/stores/monitor'

const store = useMonitorStore()

onMounted(() => {
  store.checkPermission()
})
</script>

<template>
  <div class="monitor-view">
    <h1>竞品监控</h1>
    <p v-if="!store.hasPermission">您没有访问此功能的权限</p>
    <p v-else>功能开发中...</p>
  </div>
</template>
