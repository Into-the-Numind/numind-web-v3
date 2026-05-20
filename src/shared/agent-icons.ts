import type { NarrationState } from '@/types/agent'

/**
 * 6 态 → unicode icon 映射（蓝本 §4.7.4 / §4.7.6）。
 * backend 已映射 icon 时前端优先使用 event.icon；空时 fallback 到此映射。
 */
export const STATE_ICON: Record<NarrationState, string> = {
  queued: '⋯',
  use: '⋯',
  progress: '⋯',
  result: '✓',
  error: '⚠️',
  rejected: '✕'
}

/**
 * 渲染时的颜色类名映射（CSS class，不直接含颜色值）。
 * 实际颜色 token 在 .vue scoped style 内定义。
 */
export const STATE_COLOR_CLASS: Record<NarrationState, string> = {
  queued: 'narration-state-queued',
  use: 'narration-state-use',
  progress: 'narration-state-progress',
  result: 'narration-state-result',
  error: 'narration-state-error',
  rejected: 'narration-state-rejected'
}
