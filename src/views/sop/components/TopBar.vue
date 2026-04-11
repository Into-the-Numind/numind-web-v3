<!--
  TopBar.vue — SOP 运行页 slim 顶栏（F3 task）

  56px 高，三段：
    左：[← 返回首页] 文本+icon 按钮
    中：模板名标题（与左块通过 divider 分隔）
    右：[历史 icon] icon button

  所有视觉从 `.sop-run-view-v2` scope 的 CSS 变量读（F0 落地）。
  严格对齐 mockup 01 的 .header / .header__back / .header__divider /
  .header__title / .header__right / .icon-btn 类结构。

  Spec 引用：§5.2 TopBar.vue
  Mockup 引用：01-active-and-history.html 行 717-730
-->
<template>
  <header class="header">
    <button
      type="button"
      class="header__back"
      :aria-label="'返回首页'"
      data-testid="topbar-back"
      @click="emit('back')"
    >
      <ArrowLeft :size="16" aria-hidden="true" />
      <span>返回首页</span>
    </button>

    <div class="header__divider" aria-hidden="true"></div>

    <h1 class="header__title" data-testid="topbar-title">{{ templateName }}</h1>

    <div class="header__right">
      <button
        type="button"
        class="icon-btn"
        title="运行历史"
        aria-label="查看运行历史"
        data-testid="topbar-history"
        @click="emit('openHistory')"
      >
        <History :size="16" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ArrowLeft, History } from 'lucide-vue-next'

interface Props {
  templateName: string
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'openHistory'): void
}>()
</script>

<style scoped>
.header {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 var(--space-xl);
  border-bottom: 1px solid var(--border-light);
  background: var(--surface);
  gap: var(--space-xl);
}

.header__back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--text-secondary);
  font-size: 13px;
  padding: var(--space-xs) var(--space-sm) var(--space-xs) var(--space-xs);
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.header__back:hover {
  background: var(--surface-hover);
  color: var(--text);
}

.header__divider {
  width: 1px;
  height: 18px;
  background: var(--divider);
}

.header__title {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header__right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.icon-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.icon-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
}
</style>
