<!--
  MembershipBadge — 会员状态徽章

  Props:
    - state: 'free' | 'trial' | 'pro'

  Plan §Task 18 / Spec §8.1
-->
<script setup lang="ts">
defineProps<{
  state: 'free' | 'trial' | 'pro'
}>()

const labels: Record<string, string> = {
  free: '免费用户',
  trial: '试用中',
  pro: 'Pro 会员'
}
</script>

<template>
  <span :class="['membership-badge', `badge--${state}`]">
    {{ labels[state] }}
  </span>
</template>

<style scoped>
.membership-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  line-height: 20px;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.badge--free {
  background-color: var(--color-surface-muted, #f4f4f5);
  color: var(--color-text-secondary, #71717a);
  border: 1px solid var(--color-border-muted, #e4e4e7);
}

.badge--trial {
  background-color: var(--color-accent-info-subtle, #eff6ff);
  color: var(--color-accent-info, #2563eb);
  border: 1px solid var(--color-accent-info-border, #bfdbfe);
}

.badge--pro {
  background-color: var(--color-accent-premium-subtle, #fefce8);
  color: var(--color-accent-premium, #b45309);
  border: 1px solid var(--color-accent-premium-border, #fde68a);
}
</style>
