<!--
  NotificationModal — 通知/问卷详情弹窗（notif-dropdown）

  从工作区喇叭下拉点某条通知后弹出。固定高度 + 内部滚动（避免长问卷把弹窗撑到超屏）。

  行为：
    - 打开（modelValue=true 且 announcementId 有值）→ store.loadDetail(id)，加载成功后未读则 markRead（红点/角标随之减少）。
    - 纯公告：useMarkdown() 渲染正文（已 DOMPurify 消毒）→ v-html。
    - 问卷：is_survey_submitted=true → 只读「已提交」态；否则 SurveyFillForm，提交走 store.submitSurvey。
    - Esc / 点遮罩关闭（仿 ConfirmModal）。
-->
<template>
  <Teleport to="body">
    <Transition name="overlay-fade">
      <div
        v-if="modelValue"
        class="nm-overlay"
        @click.self="close"
        data-testid="notification-modal"
      >
        <div class="nm-dialog" role="dialog" aria-modal="true">
          <!-- 头部（固定，不随内容滚动） -->
          <header class="nm-header">
            <div class="nm-header-main">
              <h2 class="nm-title">{{ detail?.title || '通知' }}</h2>
              <div v-if="detail" class="nm-meta">
                <span v-if="detail.type === 'survey'" class="nm-tag" data-testid="modal-survey-tag"
                  >问卷</span
                >
                <span class="nm-time">{{ formatTime(detail.published_at) }}</span>
              </div>
            </div>
            <button
              type="button"
              class="nm-close"
              aria-label="关闭"
              data-testid="modal-close"
              @click="close"
            >
              <X :size="18" :stroke-width="1.8" />
            </button>
          </header>

          <!-- 内容区（固定高度，内部滚动） -->
          <div class="nm-body" data-testid="modal-body">
            <!-- loading -->
            <div v-if="store.currentLoading" class="nm-state" data-testid="modal-loading">
              <div class="sk-line sk-para"></div>
              <div class="sk-line sk-para"></div>
              <div class="sk-line sk-para short"></div>
            </div>

            <!-- error -->
            <div v-else-if="store.error && !detail" class="nm-state" data-testid="modal-error">
              <p class="nm-state-text">{{ store.error }}</p>
              <AppButton variant="secondary" size="sm" @click="reload">重试</AppButton>
            </div>

            <!-- success -->
            <template v-else-if="detail">
              <!-- eslint-disable-next-line vue/no-v-html -- 已经过 useMarkdown() 内 DOMPurify 消毒 -->
              <div class="markdown-body" data-testid="modal-content" v-html="renderedContent"></div>

              <section
                v-if="detail.type === 'survey'"
                class="nm-survey"
                data-testid="modal-survey-section"
              >
                <div
                  v-if="detail.is_survey_submitted"
                  class="nm-submitted"
                  data-testid="modal-survey-submitted"
                >
                  <CheckCircle2 :size="20" :stroke-width="1.8" class="nm-submitted-icon" />
                  <span>已提交，感谢参与</span>
                </div>
                <SurveyFillForm
                  v-else
                  :questions="detail.questions"
                  :submitting="store.submitting"
                  @submit="handleSubmit"
                />
              </section>
            </template>

            <!-- 兜底：非 loading / 非 error 但无详情（罕见，如返回空）→ 不留白屏 -->
            <div v-else class="nm-state" data-testid="modal-empty">
              <p class="nm-state-text">无法显示该通知</p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { X, CheckCircle2 } from 'lucide-vue-next'
import AppButton from '@/components/common/AppButton.vue'
import SurveyFillForm from '@/components/notification/SurveyFillForm.vue'
import { useAnnouncementsStore } from '@/stores/announcements'
import { useNotificationsStore } from '@/stores/notifications'
import { useMarkdown } from '@/composables/useMarkdown'
import type { SubmitAnswer } from '@/api/announcements'

const props = defineProps<{ modelValue: boolean; announcementId: number | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const store = useAnnouncementsStore()
const toast = useNotificationsStore()
const { render, cleanContent } = useMarkdown()

const detail = computed(() => store.current)
const renderedContent = computed(() =>
  detail.value ? render(cleanContent(detail.value.content)) : ''
)

async function reload() {
  const id = props.announcementId
  if (!id) return
  await store.loadDetail(id)
  // 加载成功且 id 一致、未读 → 标记已读（更新红点/角标）。已读则跳过（服务端幂等，省一次请求）。
  if (store.current && store.current.id === id && !store.current.is_read) {
    store.markRead(id)
  }
}

async function handleSubmit(answers: SubmitAnswer[]) {
  const id = props.announcementId
  if (!id) return
  try {
    const ok = await store.submitSurvey(id, answers)
    if (ok) toast.success('问卷提交成功，感谢参与')
    else toast.error('提交未被服务端确认，请重试')
  } catch (e) {
    const msg = e instanceof Error ? e.message : '提交失败，请稍后重试'
    toast.error(msg)
  }
}

function close() {
  emit('update:modelValue', false)
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 打开 + id 变化时加载详情
watch(
  () => [props.modelValue, props.announcementId] as const,
  ([open, id]) => {
    if (open && id) reload()
  },
  { immediate: true }
)

// Esc 关闭（document 级，仿 ConfirmModal）
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) close()
}
onMounted(() => document.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeyDown))
</script>

<style scoped>
.nm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: var(--space-4);
}

.nm-dialog {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e8e9ee);
  border-radius: var(--radius-lg, 16px);
  width: 640px;
  max-width: 100%;
  /* 固定高度 + 内部滚动：长问卷不撑破屏幕（再高一点点） */
  height: 80vh;
  max-height: 800px;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg, 0 25px 50px -12px rgba(0, 0, 0, 0.15));
  animation: nm-pop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  overflow: hidden;
}

@keyframes nm-pop {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.nm-header {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-6);
  border-bottom: 1px solid var(--color-border-light);
}

.nm-header-main {
  min-width: 0;
}

.nm-title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text);
  line-height: var(--line-height-tight);
  word-break: break-word;
}

.nm-meta {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.nm-tag {
  padding: 1px 8px;
  border-radius: var(--radius-full);
  background: var(--color-accent-soft);
  color: var(--color-accent-link);
  font-size: var(--text-xs);
  font-weight: 600;
}

.nm-time {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.nm-close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition:
    color var(--transition-fast),
    background var(--transition-fast);
}

.nm-close:hover {
  color: var(--color-text);
  background: var(--color-surface-hover);
}

.nm-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-5) var(--space-6) var(--space-6);
}

.nm-state {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
  padding: var(--space-8) var(--space-4);
  text-align: center;
}

.nm-state-text {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.sk-line {
  width: 100%;
  height: 14px;
  border-radius: 6px;
  background: linear-gradient(90deg, #eef0f4 25%, #f6f7fa 50%, #eef0f4 75%);
  background-size: 200% 100%;
  animation: sk-shimmer 1.4s ease infinite;
}

.sk-line.sk-para {
  width: 80%;
}

.sk-line.short {
  width: 60%;
}

@keyframes sk-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
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

.nm-survey {
  margin-top: var(--space-6);
  padding-top: var(--space-5);
  border-top: 1px solid var(--color-border-light);
}

.nm-submitted {
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

.nm-submitted-icon {
  flex-shrink: 0;
}

.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.2s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .nm-dialog {
    width: 100%;
    height: 88vh;
    max-height: none;
  }
}
</style>
