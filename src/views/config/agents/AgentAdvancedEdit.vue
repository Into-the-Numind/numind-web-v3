<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentBuilderStore } from '@/stores/agentBuilder'

import AppButton from '@/components/common/AppButton.vue'
import NoticeBanner from '@/components/common/NoticeBanner.vue'

interface Props {
  agentId: number
}

const props = defineProps<Props>()

const store = useAgentBuilderStore()
const router = useRouter()

// --- Local state ---
// 只读查看：工具开关已移除（remove-agent-tool-switches）——工具默认全开，
// 安全限制由后端权限门禁负责。Prompt 编辑功能上线前本页仅供查看，已有
// agent 的 tool_flags 配置不在此处展示也不修改（静默保留）。
const localBody = ref('')

// --- Computed ---
const agent = computed(() => store.current)
const charCount = computed(() => localBody.value.length)

// --- Sync body text when agent loads or changes ---
watch(
  () => store.current,
  (a) => {
    if (a && a.id === props.agentId) {
      localBody.value = a.custom_skill_body || a.generated_skill_body || ''
    }
  },
  { immediate: true }
)

// --- Lifecycle ---
onMounted(async () => {
  if (!store.current || store.current.id !== props.agentId) {
    await store.fetchOne(props.agentId)
  }
})

// --- Navigation ---
function goBack() {
  router.back()
}
</script>

<template>
  <div class="advanced-editor">
    <!-- Loading state -->
    <div v-if="store.currentLoading" class="advanced-editor__loading">加载中…</div>

    <!-- Error state -->
    <div v-else-if="store.currentError" class="advanced-editor__error">
      <p>{{ store.currentError }}</p>
      <AppButton variant="secondary" size="sm" @click="store.fetchOne(agentId)"> 重试 </AppButton>
    </div>

    <!-- Not found state -->
    <div v-else-if="!agent" class="advanced-editor__empty">未找到对应 Agent。</div>

    <!-- Main content -->
    <template v-else>
      <header class="advanced-editor__header">
        <h2 class="advanced-editor__title">{{ agent.name }} · 高级模式</h2>
        <span class="advanced-editor__char-count" :class="{ 'char-count--warn': charCount > 8000 }">
          {{ charCount }} / 建议 ≤ 8000
        </span>
      </header>

      <!-- v1 限制提示：当前为只读查看，Prompt 编辑下个版本支持 -->
      <NoticeBanner type="info"> 自定义 Prompt 编辑功能即将上线。当前为只读查看。 </NoticeBanner>

      <!-- Body textarea（v1 disabled，等 Prompt 编辑功能上线后改为可编辑） -->
      <textarea
        v-model="localBody"
        class="advanced-textarea"
        rows="30"
        spellcheck="false"
        disabled
        placeholder="请输入系统提示词（Prompt）..."
      />

      <footer class="advanced-editor__footer">
        <AppButton variant="secondary" @click="goBack">返回</AppButton>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.advanced-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
  padding: var(--space-6, 24px);
  max-width: 900px;
}

.advanced-editor__loading,
.advanced-editor__error,
.advanced-editor__empty {
  padding: var(--space-6, 24px);
  color: var(--on-surface-variant, #6b7280);
  font-size: 14px;
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  align-items: flex-start;
}

.advanced-editor__error {
  color: var(--danger, #9f403d);
}

.advanced-editor__header {
  display: flex;
  align-items: center;
  gap: var(--space-4, 16px);
  flex-wrap: wrap;
}

.advanced-editor__title {
  font-family: var(--font-headline, inherit);
  font-size: 20px;
  font-weight: 700;
  color: var(--on-surface, #111827);
  margin: 0;
  flex: 1;
}

.advanced-editor__char-count {
  font-size: 12px;
  color: var(--on-surface-variant, #6b7280);
  white-space: nowrap;
}

.char-count--warn {
  color: var(--danger, #dc2626);
  font-weight: 600;
}

.advanced-textarea {
  width: 100%;
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  line-height: 1.6;
  padding: var(--space-4, 16px);
  border: 1px solid rgba(169, 180, 185, 0.25);
  border-radius: var(--radius-sm, 6px);
  background: var(--surface-lowest, #ffffff);
  color: var(--on-surface, #111827);
  resize: vertical;
  box-sizing: border-box;
}

.advanced-textarea:disabled {
  opacity: 0.85;
}

.advanced-editor__footer {
  display: flex;
  gap: var(--space-3, 12px);
  align-items: center;
}
</style>
