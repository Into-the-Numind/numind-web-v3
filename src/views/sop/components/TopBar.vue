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
    <!-- 移动端汉堡按钮：≤768px 显示，负责唤起 StepNav 抽屉 -->
    <button
      type="button"
      class="icon-btn icon-btn--mobile-only"
      title="打开步骤导航"
      aria-label="打开步骤导航"
      data-testid="topbar-mobile-nav-toggle"
      @click="emit('toggleNav')"
    >
      <Menu :size="20" aria-hidden="true" />
    </button>

    <h1 class="header__title" data-testid="topbar-title">{{ templateName }}</h1>

    <div class="header__right">
      <ModelSelector feature="sop" />
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
import { History, Menu } from 'lucide-vue-next'
import ModelSelector from '@/components/common/ModelSelector.vue'

interface Props {
  templateName: string
}

defineProps<Props>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'openHistory'): void
  (e: 'toggleNav'): void
}>()
</script>

<style scoped>
.header {
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 var(--space-xl);
  border-bottom: 1px solid transparent;
  background: var(--surface);
  gap: var(--space-xl);
  /* sticky 顶栏：body 滚动时保持可见；z-index 压在内容之上 */
  position: sticky;
  top: 0;
  z-index: 10;
}

.header__title {
  margin: 0;
  font-family: var(--font-sans);
  /* 上下文锚点：需要比右侧控件 chrome 更有视觉分量 */
  font-size: 17px;
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

/* 桌面端隐藏移动端专属按钮（汉堡）。移动端断点下覆盖。 */
.icon-btn--mobile-only {
  display: none;
}

@media (max-width: 768px) {
  .header {
    /* 移动端：缩减外边距，让汉堡按钮和标题贴边 */
    padding: 0 var(--space-md);
    gap: var(--space-md);
  }

  .header__title {
    /* 移动端：略缩字号，留更多横向空间给右侧控件 */
    font-size: 15px;
  }

  .icon-btn--mobile-only {
    display: inline-flex;
    /* iOS HIG 44pt / Android 48dp 触摸目标 */
    width: 44px;
    height: 44px;
    margin-left: calc(var(--space-md) * -1);
  }

  .icon-btn--mobile-only svg {
    width: 22px;
    height: 22px;
  }
}
</style>
