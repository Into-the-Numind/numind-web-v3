<!--
  CodeMirrorEditor — CodeMirror 6 的 Vue 3 薄封装

  设计要点（避免双向 reactivity 死循环）：
    - props.modelValue 流入 → 仅当与编辑器内 doc 不一致时 dispatch（避免 echo）
    - 编辑器内 change → emit('update:modelValue') 让父组件作 sob
    - 用 internalUpdate flag 阻断 watch → editor → emit → watch 的回环

  agent-mode-v2-skill-as-artifact (S4 T11)
  Refs: docs/superpowers/specs/2026-05-24-agent-mode-v2-skill-as-artifact-design.md ADR-3, §5.3
-->
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { bracketMatching, indentOnInput, foldGutter, foldKeymap } from '@codemirror/language'

interface Props {
  modelValue: string
  /** 编辑器是否只读（详情页用） */
  readonly?: boolean
  /** 高度（CSS 值） */
  height?: string
  /** 占位提示（modelValue 为空时） */
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
  height: '500px',
  placeholder: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
let view: EditorView | null = null
let internalUpdate = false // 防回环 guard
const readonlyCompartment = new Compartment()

onMounted(() => {
  if (!containerRef.value) return

  const updateListener = EditorView.updateListener.of((vu) => {
    if (vu.docChanged && !internalUpdate) {
      const newDoc = vu.state.doc.toString()
      emit('update:modelValue', newDoc)
    }
  })

  const state = EditorState.create({
    doc: props.modelValue || '',
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      foldGutter(),
      bracketMatching(),
      indentOnInput(),
      history(),
      // markdown 主语言（含 fenced code 高亮 + YAML frontmatter 由 lang-markdown 内部识别）
      markdown(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
      readonlyCompartment.of(EditorState.readOnly.of(props.readonly)),
      EditorView.lineWrapping,
      updateListener,
      EditorView.theme({
        '&': { height: props.height, fontSize: '13px' },
        '.cm-content': { fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo)' },
        '.cm-scroller': { overflow: 'auto' }
      })
    ]
  })

  view = new EditorView({ state, parent: containerRef.value })
})

onBeforeUnmount(() => {
  if (view) {
    view.destroy()
    view = null
  }
})

// 父组件传入 modelValue 变化 → 同步到 editor
watch(
  () => props.modelValue,
  (newVal) => {
    if (!view) return
    const currentDoc = view.state.doc.toString()
    if (currentDoc === newVal) return
    internalUpdate = true
    view.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: newVal }
    })
    // 下一 tick 复位 flag
    queueMicrotask(() => {
      internalUpdate = false
    })
  }
)

// readonly 变化时切换
watch(
  () => props.readonly,
  (newVal) => {
    if (!view) return
    view.dispatch({
      effects: readonlyCompartment.reconfigure(EditorState.readOnly.of(newVal))
    })
  }
)

defineExpose({
  focus() {
    view?.focus()
  }
})
</script>

<template>
  <div ref="containerRef" class="codemirror-host">
    <div v-if="!modelValue && placeholder" class="codemirror-placeholder">
      {{ placeholder }}
    </div>
  </div>
</template>

<style scoped>
.codemirror-host {
  position: relative;
  border: 1px solid rgba(169, 180, 185, 0.2);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--surface);
}

.codemirror-host:focus-within {
  border-color: var(--primary);
}

.codemirror-placeholder {
  position: absolute;
  top: 12px;
  left: 56px;
  color: var(--text-muted);
  font-size: 0.8125rem;
  pointer-events: none;
  z-index: 1;
}

:deep(.cm-editor) {
  outline: none;
}

:deep(.cm-focused) {
  outline: none;
}

:deep(.cm-gutters) {
  background: var(--surface-tint);
  border-right: 1px solid rgba(169, 180, 185, 0.1);
}
</style>
