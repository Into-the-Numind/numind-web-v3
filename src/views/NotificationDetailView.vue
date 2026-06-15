<!--
  NotificationDetailView — 通知/问卷详情（notification-center）

  路由：/notifications/:id（requiresAuth）。

  行为：
    - 挂载 / id 变化时 store.loadDetail(id)，加载成功后 store.markRead(id)（更新铃铛红点）。
    - content 用 useMarkdown().render()（已 DOMPurify 消毒）→ v-html。
    - type=survey：
        · is_survey_submitted=true → 只读「已提交，感谢参与」态；
        · 否则渲染 SurveyFillForm，提交走 store.submitSurvey（try/catch，失败弹 toast）。
  4 态：loading / error(retry) / not-found(空) / success。
-->
<template>
  <div class="detail-view" data-testid="notification-detail">
    <button class="back-btn" type="button" data-testid="detail-back" @click="goBack">
      <ArrowLeft :size="16" :stroke-width="1.8" />
      <span>返回</span>
    </button>

    <!-- loading -->
    <div v-if="store.currentLoading" class="sk-detail" data-testid="detail-loading">
      <div class="sk-line sk-title"></div>
      <div class="sk-line sk-meta"></div>
      <div class="sk-line sk-para"></div>
      <div class="sk-line sk-para"></div>
    </div>

    <!-- error + retry -->
    <div v-else-if="store.error" class="state-block" data-testid="detail-error">
      <p class="state-text">{{ store.error }}</p>
      <AppButton variant="secondary" size="sm" data-testid="detail-retry" @click="reload">
        重试
      </AppButton>
    </div>

    <!-- not found / empty -->
    <div v-else-if="!detail" class="state-block" data-testid="detail-empty">
      <p class="state-text">通知不存在或已下架</p>
    </div>

    <!-- success -->
    <article v-else class="detail-content">
      <header class="detail-header">
        <h1 class="detail-title">{{ detail.title }}</h1>
        <div class="detail-meta">
          <span v-if="detail.type === 'survey'" class="survey-tag" data-testid="detail-survey-tag"
            >问卷</span
          >
          <span class="detail-time">{{ formatTime(detail.published_at) }}</span>
        </div>
      </header>

      <!-- Markdown 正文 -->
      <!-- eslint-disable-next-line vue/no-v-html -- 已经过 useMarkdown() 内 DOMPurify 消毒 -->
      <div class="markdown-body" data-testid="detail-body" v-html="renderedContent"></div>

      <!-- 问卷区 -->
      <section
        v-if="detail.type === 'survey'"
        class="survey-section"
        data-testid="detail-survey-section"
      >
        <div
          v-if="detail.is_survey_submitted"
          class="survey-submitted"
          data-testid="survey-submitted"
        >
          <CheckCircle2 :size="22" :stroke-width="1.8" class="submitted-icon" />
          <span>已提交，感谢参与</span>
        </div>
        <SurveyFillForm
          v-else
          :questions="detail.questions"
          :submitting="store.submitting"
          @submit="handleSubmit"
        />
      </section>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, CheckCircle2 } from 'lucide-vue-next'
import AppButton from '@/components/common/AppButton.vue'
import SurveyFillForm from '@/components/notification/SurveyFillForm.vue'
import { useAnnouncementsStore } from '@/stores/announcements'
import { useNotificationsStore } from '@/stores/notifications'
import { useMarkdown } from '@/composables/useMarkdown'
import type { SubmitAnswer } from '@/api/announcements'

const route = useRoute()
const router = useRouter()
const store = useAnnouncementsStore()
const toast = useNotificationsStore()
const { render, cleanContent } = useMarkdown()

const detail = computed(() => store.current)

const currentId = computed(() => Number(route.params.id))

const renderedContent = computed(() =>
  detail.value ? render(cleanContent(detail.value.content)) : ''
)

async function reload() {
  const id = currentId.value
  if (!id || isNaN(id)) return
  await store.loadDetail(id)
  // 加载成功（拿到详情且 id 一致）后标记已读 —— 更新铃铛红点。
  // 已读项重新打开时跳过 POST /read（服务端幂等，这里省一次无谓请求）。
  if (store.current && store.current.id === id && !store.current.is_read) {
    store.markRead(id)
  }
}

async function handleSubmit(answers: SubmitAnswer[]) {
  const id = currentId.value
  try {
    await store.submitSurvey(id, answers)
    toast.success('问卷提交成功，感谢参与')
  } catch (e) {
    // store.submitSurvey 重新抛出；这里给用户可见反馈（如重复提交 / 校验失败）。
    const msg = e instanceof Error ? e.message : '提交失败，请稍后重试'
    toast.error(msg)
  }
}

function goBack() {
  router.push('/notifications')
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 进入 + id 变化时加载（immediate 覆盖首次挂载）。
watch(currentId, reload, { immediate: true })
</script>

<style scoped>
.detail-view {
  max-width: 760px;
  margin: 0 auto;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  background: none;
  border: none;
  padding: 6px 0;
  margin-bottom: var(--space-4);
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: color var(--transition-fast);
}

.back-btn:hover {
  color: var(--color-accent-link);
}

/* ===== Skeleton ===== */
.sk-detail {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.sk-line {
  height: 14px;
  border-radius: 6px;
  background: linear-gradient(90deg, #eef0f4 25%, #f6f7fa 50%, #eef0f4 75%);
  background-size: 200% 100%;
  animation: sk-shimmer 1.4s ease infinite;
}

.sk-title {
  width: 60%;
  height: 22px;
}

.sk-meta {
  width: 30%;
  height: 10px;
}

.sk-para {
  width: 100%;
}

@keyframes sk-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* ===== State block ===== */
.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-12) var(--space-4);
  text-align: center;
}

.state-text {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

/* ===== Content ===== */
.detail-header {
  margin-bottom: var(--space-5);
  border-bottom: 1px solid var(--color-border-light);
  padding-bottom: var(--space-4);
}

.detail-title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--color-text);
  line-height: var(--line-height-tight);
}

.detail-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.survey-tag {
  padding: 1px 8px;
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent-link);
  font-size: var(--text-xs);
  font-weight: 600;
}

.detail-time {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.markdown-body {
  font-size: var(--text-base);
  line-height: var(--line-height-relaxed);
  color: var(--color-text);
  word-break: break-word;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  margin: var(--space-5) 0 var(--space-2);
  font-weight: 700;
}

.markdown-body :deep(p) {
  margin: 0 0 var(--space-3);
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: var(--space-6);
  margin: 0 0 var(--space-3);
}

.markdown-body :deep(a) {
  color: var(--color-accent-link);
}

.markdown-body :deep(pre) {
  background: var(--color-surface-tint);
  padding: var(--space-3);
  border-radius: var(--radius-md);
  overflow-x: auto;
}

/* ===== Survey section ===== */
.survey-section {
  margin-top: var(--space-8);
  padding-top: var(--space-6);
  border-top: 1px solid var(--color-border-light);
}

.survey-submitted {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
  border-radius: var(--radius-md);
  background: var(--color-accent-soft);
  color: var(--color-accent-link);
  font-size: var(--text-base);
  font-weight: 600;
}

.submitted-icon {
  flex-shrink: 0;
}
</style>
