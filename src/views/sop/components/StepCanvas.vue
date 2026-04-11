<script setup lang="ts">
/**
 * StepCanvas — SOP 运行页主区路由器（F4）
 *
 * 职责：根据 store.viewingStepStatus 决定渲染 SopStepView（SOP 节点视图）
 * 还是 TrailingChat 占位（F10 task 实现）。
 *
 * 不接受 props，直接从 useSopRunStore() 读取响应式 state。
 *
 * 结构对应 mockup 01-active-and-history.html 的 .main / .canvas。
 * 详见 spec §5.2 + plan F4。
 */
import { computed } from 'vue'
import { useSopRunStore } from '@/stores/sopRun'
import SopStepView from './SopStepView.vue'

const store = useSopRunStore()

const isViewingTrailingChat = computed(() => store.isViewingTrailingChat)
const viewingNode = computed(() => store.viewingNode)
const viewingStepStatus = computed(() => store.viewingStepStatus)

/**
 * Emits（F9 新增 stop）：
 *   - stop: 来自 SopStepView → OutputCard 的"停止生成"事件透传。
 *     F11 主容器会绑定到 `useSSEStream.abort()`，实现前端立即停止接收
 *     SSE 流；后端 stream 继续跑完（不动后端）；已接收的 partial content
 *     保留在 `store.streamingContent`，不落 `nodeRuns`，不调 `markNodeComplete`。
 *     详见 spec §5.6 + D11 + plan F9。
 */
defineEmits<{
  stop: []
}>()
</script>

<template>
  <section class="main">
    <div class="canvas">
      <SopStepView
        v-if="!isViewingTrailingChat"
        :node="viewingNode"
        :status="viewingStepStatus"
        @stop="$emit('stop')"
      />
      <div v-else class="canvas__placeholder">
        <p>追问区域加载中...</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* 主区容器 —— 对齐 mockup 01 .main / .canvas
 * 说明：间距使用 .sop-run-view-v2 scope 内暴露的 --space-* token。
 * mockup 中的 .canvas padding 为 40px 56px 48px，这里映射到
 * --space-3xl(40) / ~--space-4xl(48) / 56px 用 calc 叠加保持同构。
 */
.main {
  display: flex;
  flex-direction: column;
  background: var(--bg);
  flex: 1;
  min-height: 0;
}

.canvas {
  flex: 1;
  min-height: 0;
  padding: var(--space-3xl) calc(var(--space-4xl) + var(--space-sm)) var(--space-4xl);
  font-family: var(--font-sans);
  color: var(--text);
}

.canvas__placeholder {
  max-width: 980px;
  padding: var(--space-2xl);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 14px;
}

.canvas__placeholder p {
  margin: 0;
}
</style>
