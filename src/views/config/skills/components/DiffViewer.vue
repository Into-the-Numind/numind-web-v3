<!--
  DiffViewer — 行级 diff 展示（极简实现，无外部 diff 库依赖）

  算法：LCS-based 行级 diff（O(M*N) DP，足以应付 200KB 上限的 Skill body）。
  显示 unified diff 风格：
    - 未变化行：灰色（content）
    - 删除行：红色背景 + `-` 前缀
    - 新增行：绿色背景 + `+` 前缀

  agent-mode-v2-skill-as-artifact (S4 T12)
-->
<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  oldText: string
  newText: string
  contextSize?: number // 显示变化前后的上下文行数（默认 3）
}

const props = withDefaults(defineProps<Props>(), {
  contextSize: 3
})

type DiffOp = { type: 'eq' | 'del' | 'ins'; text: string; oldLine?: number; newLine?: number }

function computeDiff(a: string[], b: string[]): DiffOp[] {
  const m = a.length
  const n = b.length

  // LCS DP（int 数组节省内存）
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // 回溯生成 ops
  const out: DiffOp[] = []
  let i = m
  let j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.push({ type: 'eq', text: a[i - 1], oldLine: i, newLine: j })
      i--
      j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      out.push({ type: 'del', text: a[i - 1], oldLine: i })
      i--
    } else {
      out.push({ type: 'ins', text: b[j - 1], newLine: j })
      j--
    }
  }
  while (i > 0) {
    out.push({ type: 'del', text: a[i - 1], oldLine: i })
    i--
  }
  while (j > 0) {
    out.push({ type: 'ins', text: b[j - 1], newLine: j })
    j--
  }
  return out.reverse()
}

const ops = computed(() => {
  const aLines = (props.oldText || '').split('\n')
  const bLines = (props.newText || '').split('\n')
  return computeDiff(aLines, bLines)
})

const stats = computed(() => {
  let add = 0
  let del = 0
  for (const op of ops.value) {
    if (op.type === 'ins') add++
    else if (op.type === 'del') del++
  }
  return { add, del }
})
</script>

<template>
  <div class="diff-viewer">
    <header class="diff-viewer__header">
      <span class="diff-stat add">+{{ stats.add }}</span>
      <span class="diff-stat del">-{{ stats.del }}</span>
      <span v-if="stats.add === 0 && stats.del === 0" class="diff-empty">两个版本内容相同</span>
    </header>

    <div class="diff-body">
      <div v-for="(op, idx) in ops" :key="idx" :class="['diff-line', `diff-line--${op.type}`]">
        <span class="diff-line__num">
          {{ op.type === 'ins' ? '+' : op.type === 'del' ? '-' : ' ' }}
          {{ op.newLine ?? op.oldLine ?? '' }}
        </span>
        <pre class="diff-line__text">{{ op.text }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diff-viewer {
  border: 1px solid rgba(169, 180, 185, 0.2);
  border-radius: var(--radius-sm);
  background: var(--surface);
  overflow: hidden;
}

.diff-viewer__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: var(--surface-tint);
  border-bottom: 1px solid rgba(169, 180, 185, 0.1);
  font-size: 0.8125rem;
}

.diff-stat {
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo);
  font-weight: 600;
}

.diff-stat.add {
  color: #16a34a;
}

.diff-stat.del {
  color: #dc2626;
}

.diff-empty {
  color: var(--text-muted);
}

.diff-body {
  max-height: 480px;
  overflow: auto;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo);
  font-size: 12px;
  line-height: 1.5;
}

.diff-line {
  display: grid;
  grid-template-columns: 60px 1fr;
  gap: var(--space-2);
}

.diff-line--eq {
  background: var(--surface);
  color: var(--text);
}

.diff-line--ins {
  background: rgba(34, 197, 94, 0.08);
  color: #15803d;
}

.diff-line--del {
  background: rgba(239, 68, 68, 0.08);
  color: #b91c1c;
}

.diff-line__num {
  padding: 0 var(--space-2);
  color: var(--text-muted);
  text-align: right;
  user-select: none;
}

.diff-line__text {
  margin: 0;
  padding: 0 var(--space-2) 0 0;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
