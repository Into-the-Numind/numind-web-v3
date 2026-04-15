<script setup lang="ts">
defineProps<{
  status: string
}>()
</script>

<template>
  <div v-if="status" class="global-loading-status">
    <div class="loading-status-animation">
      <div class="loading-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
    <div class="loading-status-text">{{ status }}</div>
  </div>
</template>

<style scoped>
.global-loading-status {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  margin: 10px 0;
  animation: fadeIn 0.3s ease-out;
  color: var(--text-muted);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.loading-status-animation {
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-dots {
  display: flex;
  align-items: center;
  gap: 6px;
}

.loading-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: loadingBounce 1.4s infinite ease-in-out both;
}

.loading-dots span:nth-child(1) {
  animation-delay: -0.32s;
}

.loading-dots span:nth-child(2) {
  animation-delay: -0.16s;
}

.loading-dots span:nth-child(3) {
  animation-delay: 0s;
}

@keyframes loadingBounce {
  0%,
  80%,
  100% {
    transform: scale(0.6);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.loading-status-text {
  font-size: 0.9rem;
  color: var(--text-muted);
  font-weight: 500;
  animation: statusTextPulse 2s infinite ease-in-out;
}

@keyframes statusTextPulse {
  0%,
  100% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
}
</style>
