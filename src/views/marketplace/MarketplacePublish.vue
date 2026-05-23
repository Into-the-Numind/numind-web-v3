<!--
  MarketplacePublish — 发布页 (T9).
  agent-mode-v2-skill-marketplace spec §8.3:
    - Side-by-side preview: 左原 body / 右脱敏 body
    - 分类多选 (CategoryMultiSelect)
    - "我已确认脱敏内容无敏感信息" checkbox gate
    - 4 states (loading 脱敏中 / error LLM 不可用 / success diff / empty 重置)

  Spec §8.3 提到 vue-diff，但本实现用 side-by-side <pre> 简化:
  - Vue3 兼容性 + 包体考虑 (S4-T9-D1)
  - "diff view" 语义保留: 用户能逐行对比 + 看出差异
  - 后续可按需升级到 diff 高亮库

  Router: /marketplace/publish/:skill_id
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { AlertTriangle, RefreshCcw } from 'lucide-vue-next'

import { useMarketplaceStore } from '@/stores/marketplace'
import { useSkillStore } from '@/stores/skill'
import { useNotificationsStore } from '@/stores/notifications'
import AppButton from '@/components/common/AppButton.vue'
import CategoryMultiSelect from './CategoryMultiSelect.vue'

const route = useRoute()
const router = useRouter()
const store = useMarketplaceStore()
const skillStore = useSkillStore()
const notifications = useNotificationsStore()

const skillID = computed(() => Number(route.params.skill_id))
const selectedCategories = ref<string[]>([])
const confirmed = ref(false)

const canPublish = computed(
  () =>
    !!store.sanitizePreviewResult &&
    confirmed.value &&
    selectedCategories.value.length > 0 &&
    !store.publishing
)

async function preview() {
  if (!skillID.value) return
  try {
    await store.sanitizePreview(skillID.value)
  } catch {
    /* error 已在 store.sanitizePreviewError */
  }
}

onMounted(async () => {
  // 加载原 skill（用于左侧 body 展示）+ 跑脱敏预览
  if (skillID.value) {
    await skillStore.fetchOne(skillID.value)
    await preview()
  }
})

watch(skillID, async (id) => {
  if (id) {
    await skillStore.fetchOne(id)
    await preview()
  }
})

async function publish() {
  if (!canPublish.value || !store.sanitizePreviewResult) return
  try {
    const mp = await store.publish({
      skill_id: skillID.value,
      category_tags: selectedCategories.value,
      confirmed_sanitized_body: store.sanitizePreviewResult.sanitized_body_md
    })
    notifications.success(`发布成功：「${mp.name}」已上架到市场`)
    router.push(`/marketplace/${mp.id}`)
  } catch (e) {
    notifications.error(`发布失败：${(e as Error).message || '请稍后重试'}`)
  }
}

function goBack() {
  router.push(`/config/skills/${skillID.value}`)
}
</script>

<template>
  <div class="marketplace-publish">
    <header class="page-header">
      <h1>发布到技能市场</h1>
      <p class="subtitle">脱敏后的技能将对所有父账户可见。请仔细核对脱敏内容。</p>
    </header>

    <!-- Skill 不存在 -->
    <div
      v-if="!skillStore.current && !skillStore.currentLoading"
      class="state-msg state-msg--error"
    >
      <p>技能不存在或无权访问</p>
      <AppButton @click="goBack">返回</AppButton>
    </div>

    <template v-else-if="skillStore.current">
      <!-- 元信息 -->
      <section class="meta">
        <div><strong>技能名称：</strong>{{ skillStore.current.name }}</div>
        <div><strong>当前版本：</strong>v{{ skillStore.current.version }}</div>
      </section>

      <!-- 分类多选 -->
      <section class="categories">
        <h3>选择分类（必选）</h3>
        <CategoryMultiSelect v-model="selectedCategories" :max="5" />
      </section>

      <!-- Diff (loading / error / result) -->
      <section class="diff-section">
        <header class="diff-header">
          <h3>脱敏预览</h3>
          <AppButton
            v-if="store.sanitizePreviewResult || store.sanitizePreviewError"
            size="sm"
            :loading="store.sanitizePreviewLoading"
            @click="preview"
          >
            <RefreshCcw :size="14" /> 重新生成
          </AppButton>
        </header>

        <div v-if="store.sanitizePreviewLoading" class="state-msg">
          <p>正在脱敏中... (调 qwen-turbo, 通常 1-2 秒)</p>
        </div>

        <div v-else-if="store.sanitizePreviewError" class="state-msg state-msg--error">
          <AlertTriangle :size="20" />
          <p>{{ store.sanitizePreviewError }}</p>
          <p class="hint">脱敏服务暂不可用，发布功能已禁用。</p>
          <AppButton @click="preview"><RefreshCcw :size="14" /> 重试</AppButton>
        </div>

        <div v-else-if="store.sanitizePreviewResult" class="diff">
          <div class="diff__pane">
            <header>原文（含敏感信息）</header>
            <pre class="diff__body">{{ skillStore.current.body_md }}</pre>
          </div>
          <div class="diff__pane diff__pane--sanitized">
            <header>脱敏后（将上架）</header>
            <pre class="diff__body">{{ store.sanitizePreviewResult.sanitized_body_md }}</pre>
          </div>
        </div>

        <p v-if="store.sanitizePreviewResult" class="tokens">
          脱敏 token 用量: prompt {{ store.sanitizePreviewResult.llm_tokens.prompt }} + completion
          {{ store.sanitizePreviewResult.llm_tokens.completion }} （阶段：{{
            store.sanitizePreviewResult.stages_applied.join(' → ')
          }}）
        </p>
      </section>

      <!-- Confirmation gate -->
      <section class="confirm-gate">
        <label>
          <input v-model="confirmed" type="checkbox" />
          我已确认脱敏内容无敏感信息（人名 / 机构名 / 产品名 / 客户隐私等）
        </label>
      </section>

      <!-- Actions -->
      <footer class="actions">
        <AppButton @click="goBack">取消</AppButton>
        <AppButton
          variant="primary"
          :disabled="!canPublish"
          :loading="store.publishing"
          @click="publish"
        >
          发布到市场
        </AppButton>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.marketplace-publish {
  padding: 24px 32px;
  max-width: 1280px;
  margin: 0 auto;
}
.page-header h1 {
  margin: 0 0 4px;
  font-size: 22px;
}
.subtitle {
  margin: 0 0 24px;
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
}
.meta {
  background: var(--color-bg-secondary, #f9fafb);
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  font-size: 14px;
}
.categories,
.diff-section,
.confirm-gate {
  margin-bottom: 24px;
}
.categories h3,
.diff-section h3 {
  margin: 0 0 12px;
  font-size: 15px;
}
.diff-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.diff {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 12px;
}
.diff__pane {
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
}
.diff__pane header {
  background: var(--color-bg-secondary, #f3f4f6);
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.diff__pane--sanitized header {
  background: #ecfdf5;
  color: #047857;
}
.diff__body {
  margin: 0;
  padding: 12px;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  max-height: 480px;
  overflow-y: auto;
}
.tokens {
  font-size: 12px;
  color: var(--color-text-secondary, #9ca3af);
  margin-top: 8px;
}
.confirm-gate label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
  padding: 12px 16px;
  background: #fef3c7;
  border-radius: 8px;
  border: 1px solid #fde68a;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border, #e5e7eb);
}
.state-msg {
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-secondary, #6b7280);
}
.state-msg--error {
  color: var(--color-danger, #dc2626);
}
.state-msg .hint {
  font-size: 13px;
  color: var(--color-text-secondary, #9ca3af);
  margin: 4px 0 12px;
}
</style>
