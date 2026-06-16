<!--
  MeetingLiveView — 会议「进行中」页 (SPEC §0.2 / §5)

  布局 (双栏):
    - 左: 滚动转写稿 (segments 按 seq, 新内容自动滚到底)
    - 右: 反馈流 (卡片区分 auto/manual; 流式 token 实时显示在临时气泡)

  录音控制:
    - useMeetingRecorder 持续采集 → 每 ~auto_interval/recorder-interval 吐出 WAV →
      ingestSegment → 追加 store.segments
    - 计时器 / 暂停 / 结束
    - 「现在给我反馈」按钮 → trigger=manual (总是生成)

  自动反馈定时器:
    - 每 auto_interval_seconds 检查 store.canFeedback (有自上次反馈以来的新转写) →
      若满足则 requestFeedback('auto')
    - auto skip 时静默, 不渲染气泡 (store 已处理 streamingFeedback=null)

  结束 = 销毁性操作 → ConfirmModal (ui-ux §4)

  4 状态: 加载会话详情 (loadingDetail) / 会话不存在/已结束 (error 跳转) /
           录音运行态 / 反馈空态。
-->
<template>
  <div class="live-route">
    <!-- 加载会话 (initializing 覆盖首帧: onMounted 前 loadingDetail 还是 false 且
         currentSession 为 null, 不加这个 gate 会先闪一帧空 UI 再显 spinner) -->
    <div
      v-if="initializing || (meeting.loadingDetail && !meeting.currentSession)"
      class="page-loading"
    >
      <div class="loading-spinner" />
      <div class="loading-text">加载会议…</div>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="loadError" class="state-error">
      <div class="error-icon">😢</div>
      <h2 class="error-title">无法进入会议</h2>
      <p class="error-msg">{{ loadError }}</p>
      <div class="error-actions">
        <AppButton @click="retryLoad">重试</AppButton>
        <AppButton variant="secondary" @click="goSetup">返回</AppButton>
      </div>
    </div>

    <template v-else>
      <!-- 顶栏: 标题 + 录音控制 + 计时器 + 结束 -->
      <header class="live-head">
        <div class="head-left">
          <button type="button" class="back-btn" @click="confirmLeave">
            <ArrowLeft :size="16" />
          </button>
          <div class="head-titles">
            <h1 class="live-title">{{ sessionTitle }}</h1>
            <span class="live-status" :class="recStatusClass">{{ recStatusLabel }}</span>
          </div>
        </div>

        <div class="head-controls">
          <span class="timer" :class="{ 'timer--live': recorder.isRecording.value }">
            {{ formattedElapsed }}
          </span>

          <button
            v-if="recorder.state.value === 'idle'"
            type="button"
            class="ctrl-btn ctrl-btn--primary"
            :disabled="starting || !meeting.isActive"
            @click="startRecording"
          >
            <Mic :size="16" />
            <span>{{ starting ? '启动中…' : '开始录音' }}</span>
          </button>

          <template v-else>
            <button
              v-if="recorder.isRecording.value"
              type="button"
              class="ctrl-btn"
              @click="pauseRecording"
            >
              <Pause :size="16" />
              <span>暂停</span>
            </button>
            <button
              v-else
              type="button"
              class="ctrl-btn ctrl-btn--primary"
              @click="resumeRecording"
            >
              <Play :size="16" />
              <span>继续</span>
            </button>
          </template>

          <button
            type="button"
            class="ctrl-btn ctrl-btn--danger"
            :disabled="meeting.ending"
            @click="askEnd"
          >
            <Square :size="14" />
            <span>{{ meeting.ending ? '结束中…' : '结束会议' }}</span>
          </button>
        </div>
      </header>

      <p v-if="micError" class="mic-error-bar">{{ micError }}</p>

      <!-- 双栏 -->
      <div class="live-body">
        <!-- 左: 转写稿 -->
        <section class="panel transcript-panel">
          <div class="panel-head">
            <h2 class="panel-title">实时转写</h2>
            <span class="panel-count">{{ spokenSegments.length }} 段</span>
          </div>
          <div ref="transcriptScroll" class="panel-scroll">
            <div v-if="spokenSegments.length === 0" class="panel-empty">
              <p>开始录音后，转写会在这里实时滚动出现。</p>
            </div>
            <ul v-else class="transcript-list">
              <li v-for="seg in spokenSegments" :key="seg.id" class="transcript-seg">
                <span class="seg-time">{{ formatMs(seg.start_ms) }}</span>
                <span class="seg-text">{{ seg.text }}</span>
              </li>
            </ul>
            <p v-if="meeting.ingesting" class="ingesting-hint">转写中…</p>
          </div>
        </section>

        <!-- 右: 反馈流 -->
        <section class="panel feedback-panel">
          <div class="panel-head">
            <h2 class="panel-title">AI 反馈</h2>
            <button
              type="button"
              class="feedback-now-btn"
              :disabled="!canManualFeedback"
              @click="requestManual"
            >
              <Sparkles :size="14" />
              <span>现在给我反馈</span>
            </button>
          </div>
          <div ref="feedbackScroll" class="panel-scroll">
            <div
              v-if="meeting.feedbacks.length === 0 && !meeting.feedbackStreaming"
              class="panel-empty"
            >
              <p>
                AI 会按你设定的角色，在合适的时机自动提示；<br />
                你也可以随时点「现在给我反馈」。
              </p>
            </div>

            <ul v-else class="feedback-list">
              <li
                v-for="fb in meeting.feedbacks"
                :key="fb.id"
                class="feedback-card"
                :class="`feedback-card--${fb.trigger}`"
              >
                <div class="fb-head">
                  <span class="fb-badge" :class="`fb-badge--${fb.trigger}`">
                    {{ fb.trigger === 'manual' ? '手动' : '自动' }}
                  </span>
                  <span class="fb-time">{{ formatClock(fb.created_at) }}</span>
                </div>
                <!-- markdown 反馈正文 (renderMarkdown 已 DOMPurify 清洗) -->
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div class="fb-body markdown-body" v-html="renderFeedback(fb.content)" />
              </li>

              <!-- 流式临时气泡: token 累积中 (done 后清空, 由上面列表接管) -->
              <li
                v-if="meeting.feedbackStreaming && meeting.streamingFeedback"
                class="feedback-card feedback-card--streaming"
              >
                <div class="fb-head">
                  <span class="fb-badge fb-badge--streaming">生成中</span>
                </div>
                <!-- eslint-disable-next-line vue/no-v-html -->
                <div
                  class="fb-body markdown-body"
                  v-html="renderFeedback(meeting.streamingFeedback)"
                />
              </li>
            </ul>

            <!-- 流式启动但还没 token: 占位 -->
            <div
              v-if="meeting.feedbackStreaming && !meeting.streamingFeedback"
              class="streaming-dots"
            >
              <span /><span /><span />
            </div>
          </div>
        </section>
      </div>
    </template>

    <ConfirmModal
      v-model="endConfirmOpen"
      title="结束会议"
      message="结束后将停止录音并生成 AI 纪要，无法继续录制。确定结束吗？"
      variant="danger"
      confirm-text="结束并生成纪要"
      @confirm="doEnd"
    />

    <ConfirmModal
      v-model="leaveConfirmOpen"
      title="离开会议"
      message="会议仍在进行中。离开页面会停止本地录音（会话不会自动结束）。确定离开吗？"
      variant="danger"
      confirm-text="离开"
      @confirm="doLeave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Mic, Pause, Play, Square, Sparkles } from 'lucide-vue-next'
import AppButton from '@/components/common/AppButton.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { useMeetingStore } from '@/stores/meeting'
import { useNotificationsStore } from '@/stores/notifications'
import { useMeetingRecorder, type RecorderSegment } from '@/composables/useMeetingRecorder'
import { renderMarkdown } from '@/utils/markdown'

interface Props {
  id: string
}
const props = defineProps<Props>()

const router = useRouter()
const meeting = useMeetingStore()
const notifications = useNotificationsStore()

const sessionId = computed(() => Number(props.id))

// ── Load state ───────────────────────────────────────────────────────────
// True until the first loadAndInit() settles. Covers the initial render frame
// where loadingDetail is still false and currentSession is null — without it the
// template would briefly fall through to the live body (empty UI) before the
// spinner shows.
const initializing = ref(true)
const loadError = ref('')
const starting = ref(false)
const micError = ref('')

const sessionTitle = computed(() => meeting.currentSession?.title || '进行中的会议')

// Only segments that carried transcript text (silent segments still persist but
// are not shown in the transcript list).
const spokenSegments = computed(() =>
  [...meeting.segments].filter((s) => s.text.trim().length > 0).sort((a, b) => a.seq - b.seq)
)

// ── Recorder ───────────────────────────────────────────────────────────────
// onSegment fires once per recorder window with a WAV blob → upload via store.
const recorder = useMeetingRecorder({
  intervalMs: 10000,
  onSegment: (seg: RecorderSegment) => {
    void handleRecorderSegment(seg)
  },
  onError: (err: Error) => {
    notifications.warning(`录音窗口异常：${err.message}`)
  }
})

const handleRecorderSegment = async (seg: RecorderSegment): Promise<void> => {
  await meeting.ingestSegment({
    audio: seg.blob,
    seq: seg.seq,
    start_ms: seg.startMs
  })
}

// Mirror recorder state into the store so getters (canFeedback) stay consistent.
watch(
  () => [recorder.isRecording.value, recorder.isPaused.value, recorder.elapsedMs.value] as const,
  ([rec, paused, elapsed]) => {
    meeting.setRecordingState(rec, paused, elapsed)
  }
)

const formattedElapsed = computed(() => {
  const totalSec = Math.floor(recorder.elapsedMs.value / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const recStatusClass = computed(() => {
  if (recorder.isRecording.value) return 'live-status--recording'
  if (recorder.isPaused.value) return 'live-status--paused'
  return 'live-status--idle'
})
const recStatusLabel = computed(() => {
  if (recorder.isRecording.value) return '● 录音中'
  if (recorder.isPaused.value) return '⏸ 已暂停'
  return '未录音'
})

const startRecording = async (): Promise<void> => {
  starting.value = true
  micError.value = ''
  try {
    await recorder.start()
  } catch (err) {
    micError.value =
      (err as Error)?.name === 'NotAllowedError'
        ? '麦克风权限被拒绝，请在浏览器允许后重试'
        : `无法开始录音：${(err as Error)?.message ?? '未知错误'}`
  } finally {
    starting.value = false
  }
}

const pauseRecording = (): void => {
  recorder.pause()
}
const resumeRecording = (): void => {
  recorder.resume()
}

// ── Feedback ─────────────────────────────────────────────────────────────
let feedbackAbort: AbortController | null = null

const canManualFeedback = computed(() => meeting.isActive && !meeting.feedbackStreaming)

const requestManual = async (): Promise<void> => {
  if (!canManualFeedback.value) return
  feedbackAbort = new AbortController()
  const fb = await meeting.requestFeedback('manual', feedbackAbort.signal)
  feedbackAbort = null
  if (!fb && meeting.error) {
    notifications.error(meeting.error)
  }
}

const requestAuto = async (): Promise<void> => {
  // canFeedback gate: active + not streaming + new transcript since last feedback.
  if (!meeting.canFeedback) return
  feedbackAbort = new AbortController()
  await meeting.requestFeedback('auto', feedbackAbort.signal)
  feedbackAbort = null
  // auto skip is silent (store sets streamingFeedback=null, no card appended).
}

const renderFeedback = (content: string): string => renderMarkdown(content)

// ── Auto-feedback timer ─────────────────────────────────────────────────────
let autoTimer: ReturnType<typeof setInterval> | null = null

const startAutoTimer = (): void => {
  stopAutoTimer()
  const intervalSec = meeting.currentSession?.auto_interval_seconds ?? 60
  autoTimer = setInterval(
    () => {
      // Only fire while actively recording — paused/idle should not auto-feedback.
      if (recorder.isRecording.value) {
        void requestAuto()
      }
    },
    Math.max(15, intervalSec) * 1000
  )
}
const stopAutoTimer = (): void => {
  if (autoTimer) {
    clearInterval(autoTimer)
    autoTimer = null
  }
}

// ── End (destructive) ──────────────────────────────────────────────────────
const endConfirmOpen = ref(false)
const askEnd = (): void => {
  endConfirmOpen.value = true
}
const doEnd = async (): Promise<void> => {
  stopAutoTimer()
  feedbackAbort?.abort()
  await recorder.stop()
  const session = await meeting.endMeeting()
  if (session) {
    router.push({ name: 'meeting-summary', params: { id: String(session.id) } })
  } else {
    notifications.error(meeting.error ?? '结束会议失败')
  }
}

// ── Leave guard ──────────────────────────────────────────────────────────
const leaveConfirmOpen = ref(false)
const confirmLeave = (): void => {
  if (recorder.state.value !== 'idle' || meeting.feedbackStreaming) {
    leaveConfirmOpen.value = true
  } else {
    void doLeave()
  }
}
const doLeave = async (): Promise<void> => {
  await teardown()
  router.push({ name: 'meeting-setup' })
}
const goSetup = (): void => {
  router.push({ name: 'meeting-setup' })
}

// ── Auto-scroll ─────────────────────────────────────────────────────────────
const transcriptScroll = ref<HTMLElement | null>(null)
const feedbackScroll = ref<HTMLElement | null>(null)

watch(
  () => spokenSegments.value.length,
  () => {
    nextTick(() => {
      if (transcriptScroll.value)
        transcriptScroll.value.scrollTop = transcriptScroll.value.scrollHeight
    })
  }
)
watch(
  () => [meeting.feedbacks.length, meeting.streamingFeedback] as const,
  () => {
    nextTick(() => {
      if (feedbackScroll.value) feedbackScroll.value.scrollTop = feedbackScroll.value.scrollHeight
    })
  }
)

// ── Time formatting ──────────────────────────────────────────────────────
const formatMs = (ms: number): string => {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
const formatClock = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
const retryLoad = async (): Promise<void> => {
  loadError.value = ''
  await loadAndInit()
}

const loadAndInit = async (): Promise<void> => {
  if (!Number.isFinite(sessionId.value) || sessionId.value <= 0) {
    loadError.value = '无效的会议 ID'
    return
  }
  await meeting.loadSession(sessionId.value)
  if (!meeting.currentSession) {
    loadError.value = meeting.error ?? '会议不存在'
    return
  }
  if (meeting.currentSession.status === 'ended') {
    // Already ended — send the user to the summary instead of the live view.
    router.replace({ name: 'meeting-summary', params: { id: String(sessionId.value) } })
    return
  }
  startAutoTimer()
}

const teardown = async (): Promise<void> => {
  stopAutoTimer()
  feedbackAbort?.abort()
  feedbackAbort = null
  await recorder.stop()
}

onMounted(() => {
  void loadAndInit().finally(() => {
    initializing.value = false
  })
})

onUnmounted(() => {
  void teardown()
})
</script>

<style scoped>
.live-route {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  font-family: var(--font-sans);
  overflow: hidden;
}

/* ===== Loading / Error ===== */
.page-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.loading-text {
  font-size: 14px;
}
.state-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
}
.error-icon {
  font-size: 56px;
  margin-bottom: 16px;
}
.error-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 8px;
}
.error-msg {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 24px;
}
.error-actions {
  display: flex;
  gap: 8px;
}

/* ===== Head ===== */
.live-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 24px;
  background: var(--surface);
  border-bottom: 1px solid var(--border-light);
}
.head-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.back-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}
.back-btn:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.head-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.live-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}
.live-status {
  font-size: 12px;
  font-weight: 500;
}
.live-status--recording {
  color: #ef4444;
}
.live-status--paused {
  color: hsl(35, 80%, 45%);
}
.live-status--idle {
  color: var(--text-muted);
}

.head-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.timer {
  font-variant-numeric: tabular-nums;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 52px;
  text-align: center;
}
.timer--live {
  color: #ef4444;
}

.ctrl-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all 0.15s ease;
}
.ctrl-btn:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text);
}
.ctrl-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ctrl-btn--primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.ctrl-btn--primary:hover:not(:disabled) {
  background: var(--accent-hover);
  color: #fff;
}
.ctrl-btn--danger {
  border-color: rgba(239, 68, 68, 0.4);
  color: #ef4444;
}
.ctrl-btn--danger:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
}

.mic-error-bar {
  flex-shrink: 0;
  margin: 0;
  padding: 8px 24px;
  font-size: 13px;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.06);
  border-bottom: 1px solid rgba(239, 68, 68, 0.15);
}

/* ===== Body (two columns) ===== */
.live-body {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 16px 24px 24px;
  min-height: 0;
}
.panel {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  min-height: 0;
  overflow: hidden;
}
.panel-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-light);
}
.panel-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.panel-count {
  font-size: 12px;
  color: var(--text-muted);
}
.panel-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  min-height: 0;
}
.panel-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-muted);
  font-size: 13.5px;
  line-height: 1.7;
}

/* ===== Transcript ===== */
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
  gap: 10px;
  font-size: 14px;
  line-height: 1.65;
}
.seg-time {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
  color: var(--text-muted);
  padding-top: 3px;
  width: 40px;
}
.seg-text {
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}
.ingesting-hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

/* ===== Feedback ===== */
.feedback-now-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-pill);
  background: var(--accent-ultra-soft);
  color: var(--color-primary);
  font-size: 12.5px;
  font-weight: 600;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all 0.15s ease;
}
.feedback-now-btn:hover:not(:disabled) {
  background: var(--accent);
  color: #fff;
}
.feedback-now-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.feedback-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.feedback-card {
  border-radius: var(--radius-md);
  padding: 14px 16px;
  border: 1px solid var(--border-light);
}
.feedback-card--manual {
  background: var(--accent-ultra-soft);
  border-color: hsl(160, 50%, 85%);
}
.feedback-card--auto {
  background: var(--surface-tint);
}
.feedback-card--streaming {
  background: var(--surface-tint);
  border-style: dashed;
}
.fb-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.fb-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
}
.fb-badge--manual {
  background: var(--accent);
  color: #fff;
}
.fb-badge--auto {
  background: hsl(220, 15%, 90%);
  color: var(--text-secondary);
}
.fb-badge--streaming {
  background: hsl(40, 90%, 92%);
  color: hsl(35, 80%, 40%);
}
.fb-time {
  font-size: 11.5px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.fb-body {
  font-size: 14px;
  line-height: 1.65;
  color: var(--text);
}

.streaming-dots {
  display: flex;
  gap: 5px;
  padding: 12px 0 0;
}
.streaming-dots span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  animation: dot-pulse 1.2s ease-in-out infinite;
}
.streaming-dots span:nth-child(2) {
  animation-delay: 0.2s;
}
.streaming-dots span:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes dot-pulse {
  0%,
  60%,
  100% {
    opacity: 0.25;
    transform: scale(0.85);
  }
  30% {
    opacity: 1;
    transform: scale(1);
  }
}

/* ===== markdown body (minimal, inherits global if any) ===== */
.markdown-body :deep(p) {
  margin: 0 0 8px;
}
.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0 0 8px;
  padding-left: 20px;
}
.markdown-body :deep(strong) {
  font-weight: 700;
}
.markdown-body :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: rgba(0, 0, 0, 0.05);
  padding: 1px 5px;
  border-radius: 4px;
}

/* ===== Responsive ===== */
@media (max-width: 900px) {
  .live-body {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }
  .live-title {
    max-width: 160px;
  }
}
</style>
