<script setup lang="ts">
import { BarChart3 } from "lucide-vue-next";
</script>

<template>
  <div class="stats-placeholder">
    <BarChart3 :size="48" />
    <p>使用数据将于下次迭代上线</p>
  </div>
</template>

<style scoped>
.stats-placeholder {
  padding: var(--space-10);
  text-align: center;
  color: var(--on-surface-variant);
}

.stats-placeholder p {
  margin-top: var(--space-4);
}
</style>
