<script setup lang="ts">
// MilkdownEditor —— 文档系统 v1 的 WYSIWYG 所见即所得编辑器（document-system）。
// 基于 @milkdown/crepe（ProseMirror 内核，markdown 原生序列化）。底层存 markdown。
//
// 单向数据流：挂载时以 modelValue 为初值；用户编辑 → markdownUpdated → emit update:modelValue。
// 不反向 watch modelValue→编辑器（避免 emit↔watch 环；v1 内容仅在打开时设一次）。
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { Crepe } from '@milkdown/crepe'

import '@milkdown/crepe/theme/common/style.css'
import '@milkdown/crepe/theme/frame.css'

const props = withDefaults(defineProps<{ modelValue: string; readonly?: boolean }>(), {
  readonly: false
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const container = ref<HTMLDivElement | null>(null)
let crepe: Crepe | null = null

onMounted(async () => {
  if (!container.value) {
    return
  }
  const instance = new Crepe({ root: container.value, defaultValue: props.modelValue })
  instance.on((listener) => {
    listener.markdownUpdated((_ctx, markdown) => {
      emit('update:modelValue', markdown)
    })
  })
  crepe = instance
  await instance.create()
  // 若 create 期间组件已卸载（crepe 被 onBeforeUnmount 置 null）→ 销毁刚建好的实例并退出，
  // 避免对 null 调 setReadonly（空引用）及实例泄漏。
  if (crepe !== instance) {
    void instance.destroy()
    return
  }
  if (props.readonly) {
    instance.setReadonly(true)
  }
})

onBeforeUnmount(() => {
  void crepe?.destroy() // 异步 teardown，fire-and-forget（Vue onBeforeUnmount 不支持 async）
  crepe = null
})
</script>

<template>
  <div ref="container" class="milkdown-editor" :class="{ 'is-readonly': readonly }" />
</template>

<style scoped>
.milkdown-editor {
  height: 100%;
  overflow-y: auto;
  /* 容器自身铺白：内容短时 Crepe 编辑面积不满高，原本露出灰底（用户反馈"下半截灰色"）。 */
  background: #fff;
}
/* Crepe 编辑器根（.milkdown）默认只占内容高度，下方留白会显容器/主题灰底。
   min-height:100% 让其撑满可视区并随内容增长，配合白底消除灰块；外层负责滚动。 */
.milkdown-editor :deep(.milkdown) {
  min-height: 100%;
  background: #fff;
}
.milkdown-editor :deep(.milkdown .ProseMirror) {
  min-height: 100%;
  box-sizing: border-box;
}
</style>
