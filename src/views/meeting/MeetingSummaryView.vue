<!--
  MeetingSummaryView — 会议「会后」页 (SPEC §0 / §3 / §5)

  内容:
    - AI 纪要 (markdown 渲染, summary_status 反映 none/generating/done/failed)
    - 完整转写稿 (segments 按 seq)
    - 录音回放 (SPEC §3: 单个 <audio :src="recording_url"> 整场录音, 浏览器原生控件)
    - 导出 (纪要 .md / 转写 .txt 下载, 纯前端 Blob)

  4 状态:
    - loadingDetail: skeleton/spinner
    - error: 提示 + retry
    - empty: summary 还在生成 / 无转写时的友好提示
    - success: 正常渲染
-->
<template>
  <MainLayout>
    <div class="summary-view">
      <!-- 加载 -->
      <div v-if="meeting.loadingDetail && !meeting.currentSession" class="state-block">
        <div class="loading-spinner" />
        <p class="state-text">加载会议纪要…</p>
      </div>

      <!-- 错误 -->
      <div v-else-if="loadError" class="state-block">
        <div class="error-icon">😢</div>
        <h2 class="state-title">加载失败</h2>
        <p class="state-text">{{ loadError }}</p>
        <div class="state-actions">
          <AppButton @click="retryLoad">重试</AppButton>
          <AppButton variant="secondary" @click="goHistory">返回历史</AppButton>
        </div>
      </div>

      <template v-else-if="meeting.currentSession">
        <!-- Header -->
        <header class="summary-head">
          <button type="button" class="back-link" @click="goHistory">
            <ArrowLeft :size="16" />
            <span>历史会议</span>
          </button>
          <h1 class="summary-title">{{ meeting.currentSession.title || '会议纪要' }}</h1>
          <div class="summary-meta">
            <span>{{ formatDate(meeting.currentSession.started_at) }}</span>
            <span class="meta-dot">·</span>
            <span>时长 {{ formatDuration(meeting.currentSession.duration_seconds) }}</span>
            <span class="meta-dot">·</span>
            <span>{{ spokenSegments.length }} 段转写</span>
          </div>
        </header>

        <!-- AI 纪要 -->
        <section class="block">
          <div class="block-head">
            <h2 class="block-title">AI 纪要</h2>
            <button type="button" class="export-btn" :disabled="!hasSummary" @click="exportSummary">
              <Download :size="14" />
              <span>导出纪要</span>
            </button>
          </div>

          <div
            v-if="meeting.currentSession.summary_status === 'generating'"
            class="block-body block-empty"
          >
            <div class="loading-spinner loading-spinner--sm" />
            <p>纪要正在生成中，请稍候…</p>
          </div>
          <div
            v-else-if="meeting.currentSession.summary_status === 'failed'"
            class="block-body block-empty"
          >
            <p>纪要生成失败。你仍可查看下方完整转写。</p>
            <AppButton variant="secondary" :loading="retrying" @click="retrySummary">
              重新检查
            </AppButton>
          </div>
          <div
            v-else-if="meeting.currentSession.summary_status === 'skipped'"
            class="block-body block-empty"
          >
            <p>本次会议结束时未生成 AI 纪要。下方完整转写仍可查看与复制。</p>
          </div>
          <div v-else-if="hasSummary" class="block-body">
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="markdown-body summary-md" v-html="renderedSummary" />
          </div>
          <div v-else class="block-body block-empty">
            <p>暂无纪要。</p>
          </div>
        </section>

        <!-- 录音回放 (SPEC §3: 整场单文件录音, 原生 audio 控件) -->
        <section v-if="recordingUrl" class="block">
          <div class="block-head">
            <h2 class="block-title">录音回放</h2>
            <span class="block-sub">整场录音</span>
          </div>
          <div class="block-body">
            <!-- eslint-disable-next-line vuejs-accessibility/media-has-caption -->
            <audio
              class="full-audio"
              controls
              preload="metadata"
              :src="recordingUrl"
              @error="onAudioError"
            />
            <p v-if="playError" class="audio-error">{{ playError }}</p>
          </div>
        </section>

        <!-- 完整转写 -->
        <section class="block">
          <div class="block-head">
            <h2 class="block-title">完整转写</h2>
            <button
              type="button"
              class="export-btn"
              :disabled="spokenSegments.length === 0"
              @click="exportTranscript"
            >
              <Download :size="14" />
              <span>导出转写</span>
            </button>
          </div>
          <div v-if="spokenSegments.length === 0" class="block-body block-empty">
            <p>本次会议没有可显示的转写内容。</p>
          </div>
          <div v-else class="block-body">
            <ul class="transcript-list">
              <li v-for="seg in spokenSegments" :key="seg.id" class="transcript-seg">
                <span class="seg-time">{{ formatMs(seg.start_ms) }}</span>
                <span class="seg-text">{{ seg.text }}</span>
              </li>
            </ul>
          </div>
        </section>
      </template>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Download } from 'lucide-vue-next'
import MainLayout from '@/components/layout/MainLayout.vue'
import AppButton from '@/components/common/AppButton.vue'
import { useMeetingStore } from '@/stores/meeting'
import { useNotificationsStore } from '@/stores/notifications'
import { renderMarkdown, stripCodeFence } from '@/utils/markdown'

interface Props {
  id: string
}
const props = defineProps<Props>()

const router = useRouter()
const meeting = useMeetingStore()
const notifications = useNotificationsStore()

const sessionId = computed(() => Number(props.id))
const loadError = ref('')

const spokenSegments = computed(() =>
  [...meeting.segments].filter((s) => s.text.trim().length > 0).sort((a, b) => a.seq - b.seq)
)

// Full-session recording URL (SPEC §3). Empty string when no recording was
// uploaded (e.g. upload failed or a legacy per-segment session); the playback
// block is hidden in that case.
const recordingUrl = computed(() => (meeting.currentSession?.recording_url ?? '').trim())

const hasSummary = computed(
  () =>
    meeting.currentSession?.summary_status === 'done' &&
    (meeting.currentSession?.summary ?? '').trim().length > 0
)
const renderedSummary = computed(() =>
  renderMarkdown(stripCodeFence(meeting.currentSession?.summary ?? ''))
)

// ── Full-session audio playback (SPEC §3) ──────────────────────────────────
// A single native <audio> plays the whole-meeting recording (recording_url).
// We only surface load/playback failures; the browser's built-in controls drive
// play/pause/seek.
const playError = ref('')

const onAudioError = (): void => {
  playError.value = '录音加载失败，链接可能已过期，请稍后重试。'
}

// ── Export (front-end Blob download) ───────────────────────────────────────
const downloadText = (text: string, filename: string, mime: string): void => {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const safeName = computed(() => {
  const t = (meeting.currentSession?.title || '会议').replace(/[\\/:*?"<>|]/g, '_').trim()
  return t || '会议'
})

const exportSummary = (): void => {
  if (!hasSummary.value) return
  const content = stripCodeFence(meeting.currentSession?.summary ?? '')
  downloadText(
    `# ${safeName.value} · 会议纪要\n\n${content}\n`,
    `${safeName.value}-纪要.md`,
    'text/markdown;charset=utf-8'
  )
  notifications.success('纪要已导出')
}

const exportTranscript = (): void => {
  if (spokenSegments.value.length === 0) return
  const lines = spokenSegments.value.map((s) => `[${formatMs(s.start_ms)}] ${s.text}`)
  downloadText(
    `${safeName.value} · 完整转写\n\n${lines.join('\n')}\n`,
    `${safeName.value}-转写.txt`,
    'text/plain;charset=utf-8'
  )
  notifications.success('转写已导出')
}

// ── Formatting ──────────────────────────────────────────────────────────────
const formatMs = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
const formatDuration = (sec: number): string => {
  if (!sec || sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s} 秒`
  return `${m} 分 ${s} 秒`
}
const formatDate = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// ── Summary polling (FEEDBACK_V2 §3.2) ──────────────────────────────────────
// /end is now async (秒回 with summary_status='generating'); the minutes are
// produced by a backend goroutine. While the status is 'generating' we poll
// GET /v1/meetings/:id every ~2.5s (refreshSession — no full-page skeleton flash)
// until it settles to 'done' (render the minutes) or 'failed' (show the failure +
// a re-check affordance). The poll is torn down on unmount and whenever the status
// settles, so it never leaks across navigation.
const POLL_INTERVAL_MS = 2500
let pollTimer: ReturnType<typeof setInterval> | null = null
const retrying = ref(false)

const stopPolling = (): void => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

const startPolling = (): void => {
  stopPolling()
  if (meeting.currentSession?.summary_status !== 'generating') return
  pollTimer = setInterval(() => {
    void (async () => {
      const status = await meeting.refreshSession(sessionId.value)
      // Stop once it settles (done/failed) or the fetch failed (null). A null
      // here surfaced an error via the store; we don't hammer the endpoint on a
      // persistent failure — the user can re-check manually.
      if (status === null || status !== 'generating') stopPolling()
    })()
  }, POLL_INTERVAL_MS)
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
const goHistory = (): void => {
  router.push({ name: 'meeting-history' })
}

const retryLoad = async (): Promise<void> => {
  loadError.value = ''
  await load()
}

// Manual re-check from the 'failed' state: re-fetch once; if the backend goroutine
// is in fact still generating (status flipped back), resume polling.
const retrySummary = async (): Promise<void> => {
  if (retrying.value) return
  retrying.value = true
  try {
    await meeting.refreshSession(sessionId.value)
    if (meeting.currentSession?.summary_status === 'generating') startPolling()
  } finally {
    retrying.value = false
  }
}

const load = async (): Promise<void> => {
  if (!Number.isFinite(sessionId.value) || sessionId.value <= 0) {
    loadError.value = '无效的会议 ID'
    return
  }
  await meeting.loadSession(sessionId.value)
  if (!meeting.currentSession) {
    loadError.value = meeting.error ?? '会议不存在'
    return
  }
  // Kick off polling if the summary is still being generated.
  startPolling()
}

onMounted(() => {
  void load()
})

onUnmounted(() => {
  stopPolling()
})
</script>

<style scoped>
.summary-view {
  max-width: 820px;
  margin: 0 auto;
  padding: 8px 0 56px;
}

/* ===== state blocks ===== */
.state-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 20px;
  text-align: center;
  color: var(--text-muted);
}
.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-light);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 16px;
}
.loading-spinner--sm {
  width: 22px;
  height: 22px;
  border-width: 2px;
  margin-bottom: 10px;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.state-text {
  font-size: 14px;
  margin: 0;
}
.error-icon {
  font-size: 48px;
  margin-bottom: 12px;
}
.state-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 8px;
}
.state-actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
}

/* ===== head ===== */
.summary-head {
  margin-bottom: 28px;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font-sans);
  cursor: pointer;
  padding: 0;
  margin-bottom: 14px;
  transition: color 0.15s ease;
}
.back-link:hover {
  color: var(--color-primary);
}
.summary-title {
  font-family: var(--font-heading);
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 8px;
  line-height: 1.3;
}
.summary-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
}
.meta-dot {
  color: var(--border);
}

/* ===== block ===== */
.block {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  margin-bottom: 20px;
  overflow: hidden;
}
.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
}
.block-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.block-sub {
  font-size: 12px;
  color: var(--text-muted);
}
.block-body {
  padding: 20px;
}
.block-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  color: var(--text-muted);
  font-size: 13.5px;
  line-height: 1.7;
  padding: 32px 20px;
}

.export-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all 0.15s ease;
}
.export-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--color-primary);
}
.export-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== summary markdown ===== */
.summary-md {
  font-size: 15px;
  line-height: 1.75;
  color: var(--text);
}
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  font-weight: 700;
  margin: 18px 0 10px;
  color: var(--text);
}
.markdown-body :deep(h2) {
  font-size: 18px;
}
.markdown-body :deep(h3) {
  font-size: 16px;
}
.markdown-body :deep(p) {
  margin: 0 0 10px;
}
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0 0 10px;
  padding-left: 22px;
}
.markdown-body :deep(li) {
  margin-bottom: 4px;
}
.markdown-body :deep(strong) {
  font-weight: 700;
}
.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 0 0 12px;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid var(--border-light);
  padding: 6px 10px;
  text-align: left;
  font-size: 14px;
}
.markdown-body :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: rgba(0, 0, 0, 0.05);
  padding: 1px 5px;
  border-radius: 4px;
}

/* ===== player (full-session native audio) ===== */
.full-audio {
  width: 100%;
  height: 40px;
  display: block;
}
.audio-error {
  margin: 12px 0 0;
  font-size: 13px;
  color: #ef4444;
}

/* ===== transcript ===== */
.transcript-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.transcript-seg {
  display: flex;
  gap: 12px;
  font-size: 14px;
  line-height: 1.65;
}
.seg-time {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
  color: var(--text-muted);
  padding-top: 3px;
  width: 42px;
}
.seg-text {
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 768px) {
  .summary-title {
    font-size: 22px;
  }
  .summary-meta {
    flex-wrap: wrap;
  }
}
</style>
