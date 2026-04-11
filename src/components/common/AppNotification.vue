<!--
  AppNotification — 全局 toast 通知容器

  配合 `useNotificationsStore()` 使用。挂载在 App.vue 顶层，监听 store 的
  messages 列表自动渲染。

  ## 使用

  在 App.vue 中放置一次：
  ```vue
  <AppNotification />
  ```

  在任何地方触发：
  ```ts
  import { useNotificationsStore } from '@/stores/notifications'
  const notifications = useNotificationsStore()
  notifications.success('复制成功')
  ```

  ## 设计

  - Teleport 到 body，避免 z-index 冲突
  - 右上角固定定位，向下堆叠
  - 每条消息可点 × 手动关闭
  - 4 种类型（success/error/info/warning）各有颜色
  - 进入动画：从右滑入 + 淡入
  - 离开动画：淡出
-->
<template>
  <Teleport to="body">
    <div class="notification-container" role="status" aria-live="polite">
      <TransitionGroup name="notification">
        <div
          v-for="item in notifications.messages"
          :key="item.id"
          class="notification-item"
          :class="`notification-item--${item.type}`"
        >
          <span class="notification-icon">{{ iconFor(item.type) }}</span>
          <span class="notification-content">{{ item.content }}</span>
          <button
            type="button"
            class="notification-close"
            aria-label="关闭通知"
            @click="notifications.dismiss(item.id)"
          >
            ×
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useNotificationsStore, type NotificationType } from '@/stores/notifications'

const notifications = useNotificationsStore()

function iconFor(type: NotificationType): string {
  switch (type) {
    case 'success':
      return '✓'
    case 'error':
      return '✕'
    case 'warning':
      return '⚠'
    case 'info':
    default:
      return 'ℹ'
  }
}
</script>

<style scoped>
.notification-container {
  position: fixed;
  top: var(--space-4, 20px);
  right: var(--space-4, 20px);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 12px);
  pointer-events: none;
  max-width: calc(100vw - var(--space-4, 20px) * 2);
}

.notification-item {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2, 12px);
  min-width: 280px;
  max-width: 420px;
  padding: var(--space-3, 14px) var(--space-4, 18px);
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e8e9ee);
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-md, 0 10px 25px -5px rgba(0, 0, 0, 0.08));
  font-size: var(--text-sm, 14px);
  color: var(--color-text, #1a1d26);
}

.notification-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  color: #ffffff;
}

.notification-content {
  flex: 1;
  line-height: 1.5;
  word-break: break-word;
}

.notification-close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--color-text-tertiary, #9ca3af);
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
  padding: 0;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all var(--transition-fast, 0.15s);
}

.notification-close:hover {
  color: var(--color-text, #1a1d26);
  background: var(--color-surface-hover, #f6f7fb);
}

/* Type variants — 只染色 icon，卡片本身保持白色以符合 DESIGN.md 克制美学 */
.notification-item--success .notification-icon {
  background: var(--color-success, #10b981);
}

.notification-item--error .notification-icon {
  background: var(--color-danger, #ef4444);
}

.notification-item--warning .notification-icon {
  background: var(--color-warning, #f59e0b);
}

.notification-item--info .notification-icon {
  background: var(--color-info, #6b7280);
}

/* Transition animations */
.notification-enter-active,
.notification-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.notification-leave-active {
  position: absolute;
  right: 0;
}
</style>
