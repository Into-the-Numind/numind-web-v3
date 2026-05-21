<script setup lang="ts">
import { computed } from "vue";
import { Info, AlertTriangle, AlertCircle } from "lucide-vue-next";

interface Props {
  type?: "info" | "warn" | "error";
}

const props = withDefaults(defineProps<Props>(), {
  type: "info",
});

const icon = computed(() => {
  if (props.type === "warn") return AlertTriangle;
  if (props.type === "error") return AlertCircle;
  return Info;
});
</script>

<template>
  <div class="notice-banner" :class="`notice-banner--${type}`">
    <component :is="icon" class="notice-banner__icon" :size="16" />
    <div class="notice-banner__content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.notice-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.notice-banner__icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.notice-banner__content {
  flex: 1;
  min-width: 0;
}

/* Info */
.notice-banner--info {
  background: var(--info-soft, #eff6ff);
  color: var(--info, #005eb6);
  border: 1px solid color-mix(in srgb, var(--info, #005eb6) 20%, transparent);
}

.notice-banner--info .notice-banner__icon {
  color: var(--info, #005eb6);
}

/* Warn */
.notice-banner--warn {
  background: var(--warning-soft, #fffbeb);
  color: #92400e;
  border: 1px solid color-mix(in srgb, var(--warning, #f59e0b) 35%, transparent);
}

.notice-banner--warn .notice-banner__icon {
  color: var(--warning, #f59e0b);
}

/* Error */
.notice-banner--error {
  background: var(--danger-soft, #fef2f2);
  color: var(--danger, #9f403d);
  border: 1px solid color-mix(in srgb, var(--danger, #9f403d) 25%, transparent);
}

.notice-banner--error .notice-banner__icon {
  color: var(--danger, #9f403d);
}
</style>
