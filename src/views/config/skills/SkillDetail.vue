<!--
  SkillDetail — Skill 资产详情页（只读展示）

  上方：元数据卡片（name + version + 装载 Agent 标签 + 时间）
  下方：marked 渲染 body_md + DOMPurify 防 XSS（ADR-12 复用 v1 marked@17.0.3）

  agent-mode-v2-skill-as-artifact (S4 T12)
  Refs: docs/superpowers/specs/2026-05-24-agent-mode-v2-skill-as-artifact-design.md ADR-12
-->
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useSkillStore } from '@/stores/skill'
import { useNotificationsStore } from '@/stores/notifications'
import AppButton from '@/components/common/AppButton.vue'
import { formatDateTime } from '@/utils/datetime'

const route = useRoute()
const router = useRouter()
const store = useSkillStore()
const notifications = useNotificationsStore()

const skillId = computed(() => Number(route.params.id))

onMounted(async () => {
  try {
    await store.fetchOne(skillId.value)
    await store.fetchBoundAgents(skillId.value)
  } catch (e) {
    notifications.error((e as Error).message || '加载失败')
  }
})

watch(skillId, async (newId) => {
  if (newId) {
    await store.fetchOne(newId)
    await store.fetchBoundAgents(newId)
  }
})

const renderedHtml = computed(() => {
  const body = store.current?.body_md || ''
  // marked 17 同步模式
  const raw = marked.parse(body, { async: false }) as string
  // DOMPurify 防 XSS（允许常见的 markdown 输出标签）
  return DOMPurify.sanitize(raw)
})

function goEdit() {
  if (skillId.value) router.push(`/config/skills/${skillId.value}/edit`)
}

function goHistory() {
  if (skillId.value) router.push(`/config/skills/${skillId.value}/history`)
}

function goBack() {
  router.push('/config/skills')
}
</script>

<template>
  <div class="skill-detail">
    <!-- 加载/错误状态 -->
    <div v-if="store.currentLoading" class="skill-detail__state">加载中...</div>
    <div v-else-if="store.currentError" class="skill-detail__state error">
      {{ store.currentError }}
      <AppButton variant="text" size="sm" @click="store.fetchOne(skillId)">重试</AppButton>
    </div>
    <div v-else-if="!store.current" class="skill-detail__state">Skill 不存在或已删除</div>

    <template v-else>
      <!-- 顶部操作栏 -->
      <header class="skill-detail__header">
        <div class="skill-detail__title-block">
          <AppButton variant="text" size="sm" @click="goBack">← 返回列表</AppButton>
          <h2>{{ store.current.name }}</h2>
          <span class="skill-detail__version">v{{ store.current.version }}</span>
        </div>
        <div class="skill-detail__actions">
          <AppButton variant="secondary" @click="goHistory">版本历史</AppButton>
          <AppButton variant="primary" @click="goEdit">编辑</AppButton>
        </div>
      </header>

      <!-- 元数据卡片 -->
      <section class="skill-detail__meta">
        <div class="meta-row">
          <span class="meta-label">描述</span>
          <span class="meta-value">{{ store.current.description || '—' }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">何时使用</span>
          <span class="meta-value">{{ store.current.when_to_use || '—' }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">允许的工具</span>
          <div class="meta-value tags">
            <span v-if="store.current.allowed_tools.length === 0" class="meta-empty">未配置</span>
            <span v-for="tool in store.current.allowed_tools" :key="tool" class="tag tag--tool">
              {{ tool }}
            </span>
          </div>
        </div>
        <div class="meta-row">
          <span class="meta-label">装载到的 Agent</span>
          <div class="meta-value tags">
            <span
              v-if="!store.boundAgentsLoading && store.boundAgents.length === 0"
              class="meta-empty"
            >
              暂未装载到任何 Agent
            </span>
            <span v-if="store.boundAgentsLoading" class="meta-empty">加载中...</span>
            <span
              v-for="ag in store.boundAgents"
              :key="ag.id"
              class="tag tag--agent"
              :title="ag.name"
            >
              {{ ag.name }}
            </span>
          </div>
        </div>
        <div class="meta-row">
          <span class="meta-label">来源</span>
          <span class="meta-value">{{ store.current.source_type }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">最近修改</span>
          <span class="meta-value">{{ formatDateTime(store.current.updated_at) }}</span>
        </div>
      </section>

      <!-- 主体 markdown 渲染 -->
      <section class="skill-detail__body">
        <header class="panel-header">
          <h3>Skill 内容</h3>
        </header>
        <article class="markdown-body" v-html="renderedHtml" />
      </section>
    </template>
  </div>
</template>

<style scoped>
.skill-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.skill-detail__state {
  padding: var(--space-8);
  text-align: center;
  color: var(--text-muted);
}

.skill-detail__state.error {
  color: var(--danger, #dc2626);
}

.skill-detail__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.skill-detail__title-block {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.skill-detail__title-block h2 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.skill-detail__version {
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.skill-detail__actions {
  display: flex;
  gap: var(--space-2);
}

.skill-detail__meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  background: var(--surface);
  border-radius: var(--radius-md);
  border: 1px solid rgba(169, 180, 185, 0.1);
}

.meta-row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: var(--space-3);
  font-size: 0.875rem;
}

.meta-label {
  color: var(--text-muted);
  font-weight: 500;
}

.meta-value {
  color: var(--text);
  word-break: break-word;
}

.meta-value.tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.meta-empty {
  color: var(--text-muted);
  font-style: italic;
  font-size: 0.8125rem;
}

.tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 11px;
  font-size: 0.75rem;
  font-weight: 600;
}

.tag--tool {
  background: var(--surface-tint);
  color: var(--text);
}

.tag--agent {
  background: rgba(34, 197, 94, 0.1);
  color: #15803d;
}

.skill-detail__body {
  padding: var(--space-4);
  background: var(--surface);
  border-radius: var(--radius-md);
  border: 1px solid rgba(169, 180, 185, 0.1);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.panel-header h3 {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

/* markdown-body — 复用项目级 markdown 样式（项目可能已有全局 .markdown-body） */
.markdown-body {
  font-size: 0.9375rem;
  line-height: 1.7;
  color: var(--text);
}

:deep(.markdown-body h1),
:deep(.markdown-body h2),
:deep(.markdown-body h3) {
  margin-top: 1.4em;
  margin-bottom: 0.6em;
  font-weight: 600;
}

:deep(.markdown-body p) {
  margin: 0.8em 0;
}

:deep(.markdown-body code) {
  padding: 0.15em 0.4em;
  background: var(--surface-tint);
  border-radius: 3px;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo);
  font-size: 0.875em;
}

:deep(.markdown-body pre) {
  padding: var(--space-3);
  background: var(--surface-tint);
  border-radius: var(--radius-sm);
  overflow-x: auto;
}

:deep(.markdown-body pre code) {
  background: transparent;
  padding: 0;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  padding-left: 1.5em;
}

:deep(.markdown-body blockquote) {
  padding: 0.5em 1em;
  margin: 0.8em 0;
  border-left: 3px solid var(--primary);
  background: var(--surface-tint);
  color: var(--text-secondary);
}
</style>
