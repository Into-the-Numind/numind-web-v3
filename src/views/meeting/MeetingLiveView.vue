<!--
  MeetingLiveView — 会议「进行中」页 (SPEC §0 / §2 / §5)

  布局 (双栏):
    - 左: 滚动转写稿 (finals 按 seq 正常色 + 末尾 interim 灰/斜体覆盖式更新)
    - 右: 反馈流 (卡片区分 auto/manual; 流式 token 实时显示在临时气泡)

  实时流式 ASR (SPEC §2):
    - 开始录音 → meeting.startAsrStream() 建我方 ws (relay → 阿里 Paraformer-realtime)
      + recorder.start() 持续采集 PCM → 每 ~100ms 经 meeting.sendPcmFrame() 发二进制帧
    - 后端逐句回 interim (灰显, 覆盖式) / final (落 meeting_segment, 追加 store.segments)
    - 计时器 / 暂停 / 结束
    - 「现在给我反馈」按钮 → trigger=manual (总是生成)

  自动反馈定时器:
    - 每 auto_interval_seconds 检查 store.canFeedback (有自上次反馈以来的新转写) →
      若满足则 requestFeedback('auto')。转写现在实时更新, 逻辑不变。
    - auto skip 时静默, 不渲染气泡 (store 已处理 streamingFeedback=null)

  结束 (SPEC §3):
    - recorder.stop() 拿整场 blob → meeting.finishAsrStream() 收尾转写 →
      meeting.uploadRecording(blob) 上传整场录音 → meeting.endMeeting() 生成纪要
    - = 销毁性操作 → ConfirmModal (ui-ux §4)

  4 状态: 加载会话详情 (loadingDetail) / 会话不存在/已结束 (error 跳转) /
           录音运行态 / 反馈空态。错误态: 麦克风 micError + 实时转写断流 asrError 提示。
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
      <!-- 实时转写断流提示 (SPEC §2 error/closed): ws 异常但录音仍在本地继续 -->
      <p v-else-if="asrError" class="mic-error-bar">
        实时转写中断：{{ asrError }}
        <button type="button" class="asr-retry-btn" @click="retryAsrStream">重连</button>
      </p>

      <!-- 双栏 -->
      <div class="live-body">
        <!-- 左: 转写稿 (finals 正常色 + 末尾 interim 灰/斜体覆盖式) -->
        <section class="panel transcript-panel">
          <div class="panel-head">
            <h2 class="panel-title">实时转写</h2>
            <span class="panel-count">{{ spokenSegments.length }} 段</span>
          </div>
          <div ref="transcriptScroll" class="panel-scroll">
            <div v-if="spokenSegments.length === 0 && !interimText" class="panel-empty">
              <p>开始录音后，转写会在这里逐句实时滚动出现。</p>
            </div>
            <ul v-else class="transcript-list">
              <li v-for="seg in spokenSegments" :key="seg.id" class="transcript-seg">
                <span class="seg-time">{{ formatMs(seg.start_ms) }}</span>
                <span class="seg-text">{{ seg.text }}</span>
              </li>
              <!-- 当前句中间结果 (SPEC §2 interim): 灰显斜体, 覆盖式更新, 句末转为 final -->
              <li v-if="interimText" class="transcript-seg transcript-seg--interim">
                <span class="seg-time">···</span>
                <span class="seg-text seg-text--interim">{{ interimText }}</span>
              </li>
            </ul>
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
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { ArrowLeft, Mic, Pause, Play, Square, Sparkles } from 'lucide-vue-next'
import AppButton from '@/components/common/AppButton.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { useMeetingStore } from '@/stores/meeting'
import { useNotificationsStore } from '@/stores/notifications'
import { useMeetingRecorder } from '@/composables/useMeetingRecorder'
import { renderMarkdown } from '@/utils/markdown'

interface Props {
  id: string
}
const props = defineProps<Props>()

const router = useRouter()
const meeting = useMeetingStore()
const notifications = useNotificationsStore()

// Reactive refs off the store for direct template binding (interim tail render).
const { interimText } = storeToRefs(meeting)

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
// Realtime-ASR stream error (ws relay / dashscope). Distinct from micError: the
// local recording keeps running even if the transcript stream drops, so we show
// a non-blocking bar with a reconnect affordance instead of a fatal state.
const asrError = ref('')

const sessionTitle = computed(() => meeting.currentSession?.title || '进行中的会议')

// Only segments that carried transcript text (silent segments still persist but
// are not shown in the transcript list).
const spokenSegments = computed(() =>
  [...meeting.segments].filter((s) => s.text.trim().length > 0).sort((a, b) => a.seq - b.seq)
)

// ── Recorder (realtime PCM streaming + parallel full recording, SPEC §2/§3) ──
// onPcmFrame fires ~every 100ms with one raw PCM 16k mono frame → forward over
// the ASR ws via the store. onRecording delivers the full-session blob on stop()
// (we also receive it as stop()'s resolved value, so this is belt-and-braces).
const recorder = useMeetingRecorder({
  onPcmFrame: (frame: ArrayBuffer) => {
    // Frontend gate (belt-and-braces with the relay's own buffering): only send
    // once the backend signalled `ready` (dashscope task-started). Frames before
    // ready are dropped here so we never push audio into a not-yet-open task.
    if (meeting.asrReady) meeting.sendPcmFrame(frame)
  },
  onError: (err: Error) => {
    notifications.warning(`录音处理异常：${err.message}`)
  }
})

// True while a deliberate end/leave teardown is running. Suppresses the ASR-drop
// watcher below so a clean stream close during stop() doesn't flash a reconnect
// prompt. Distinct from meeting.ending (store flag for the endMeeting API call,
// which only flips later); teardown closes the stream BEFORE that.
const teardownInProgress = ref(false)

// Mirror recorder state into the store so getters (canFeedback) stay consistent.
watch(
  () => [recorder.isRecording.value, recorder.isPaused.value, recorder.elapsedMs.value] as const,
  ([rec, paused, elapsed]) => {
    meeting.setRecordingState(rec, paused, elapsed)
  }
)

// Surface an unexpected ASR ws drop as a non-blocking bar (SPEC §2 error/closed):
// the stream closing while the recorder is still capturing means the transcript
// link broke mid-meeting (relay/dashscope error or network) — show a reconnect
// affordance. A clean close during end/leave (teardownInProgress) is ignored.
watch(
  () => meeting.asrStreaming,
  (streaming, was) => {
    if (was && !streaming && recorder.state.value !== 'idle' && !teardownInProgress.value) {
      asrError.value = meeting.error ?? '连接已断开'
    }
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
  asrError.value = ''
  try {
    // Open the realtime ASR ws FIRST so the relay's dashscope task is starting
    // up while we acquire the mic. PCM frames sent before `ready` are buffered /
    // tolerated by the relay; the store gates nothing on asrReady for sending.
    meeting.startAsrStream()
    // Then start continuous capture — each PCM frame streams via onPcmFrame.
    await recorder.start()
    // Race guard: the ASR ws can fail/close DURING mic acquisition (before the
    // recorder leaves 'idle'), so the asrStreaming watcher's `recorder.state !==
    // 'idle'` guard would miss it and asrError would never set. Now that the
    // recorder is active, if the stream already died, surface the reconnect bar.
    if (!meeting.asrStreaming) {
      asrError.value = meeting.error ?? '实时转写连接失败，请点重连'
    }
  } catch (err) {
    // Mic acquisition failed → tear the ASR stream back down (no audio to send).
    meeting.closeAsrStream()
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

// Reconnect the ASR ws after a drop (recording is still running locally; we just
// rebuild the transcript stream so subsequent speech is captured again).
const retryAsrStream = (): void => {
  asrError.value = ''
  meeting.startAsrStream()
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

// ── Pause-awareness (FEEDBACK_V2 §1) ─────────────────────────────────────────
// Wall-clock (ms) of the last time the live interim sentence changed — i.e. the
// last moment we had evidence someone is mid-sentence. The auto timer uses this
// to DEFER a tick that lands while a speaker is still talking (a fresh interim
// arrived <~1s ago), so feedback never interrupts mid-thought; the next tick
// re-checks. 0 means "no interim seen yet" (never deferred on that basis).
const lastInterimAtMs = ref(0)
// How recently an interim must have updated to count as "still speaking". A
// natural pause (~1s with no new interim) lets the deferred tick proceed.
const INTERIM_ACTIVE_WINDOW_MS = 1000

// Each interim frame overwrites interimText (store onInterim); stamp the time so
// the auto timer can tell "actively speaking" from "settled". A final frame
// clears interimText (empty) — we leave the stamp; the emptiness itself signals
// the sentence settled, so the gate below keys on interimText being non-empty.
watch(interimText, (text) => {
  if (text && text.trim().length > 0) lastInterimAtMs.value = Date.now()
})

const requestAuto = async (): Promise<void> => {
  // Content gate (store.canFeedback): active + not streaming + ENOUGH new
  // transcript since the last feedback (≥2 new finals OR ≥~100 new chars).
  if (!meeting.canFeedback) return
  // Pause-awareness: if a speaker is mid-sentence right now (interim is non-empty
  // AND it last updated <~1s ago), DEFER — don't cut them off. We simply skip
  // this tick; the next auto tick re-evaluates once the interim settles.
  const interim = interimText.value.trim()
  if (interim && Date.now() - lastInterimAtMs.value < INTERIM_ACTIVE_WINDOW_MS) {
    return
  }
  feedbackAbort = new AbortController()
  await meeting.requestFeedback('auto', feedbackAbort.signal)
  feedbackAbort = null
  // auto skip is silent (store sets streamingFeedback=null, no card appended).
  // No cooldown (FEEDBACK_V2 §1): the next tick fires as soon as the content gate
  // is satisfied again — there is no fixed quiet window after giving feedback.
}

const renderFeedback = (content: string): string => renderMarkdown(content)

// ── Auto-feedback timer ─────────────────────────────────────────────────────
let autoTimer: ReturnType<typeof setInterval> | null = null

const startAutoTimer = (): void => {
  stopAutoTimer()
  // User-set base interval, clamped to 5-60s (FEEDBACK_V2 §1: lower bound 15→5,
  // no "克制/适中/积极" tiers — just the number). Default 15 when unset.
  const intervalSec = meeting.currentSession?.auto_interval_seconds ?? 15
  const clamped = Math.min(60, Math.max(5, intervalSec))
  autoTimer = setInterval(() => {
    // Only fire while actively recording — paused/idle should not auto-feedback.
    if (recorder.isRecording.value) {
      void requestAuto()
    }
  }, clamped * 1000)
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
// Hard cap on recorder.stop() before we move on regardless (FEEDBACK_V2 §3.2).
// If the MediaRecorder/AudioContext teardown hangs, we must NOT wedge the whole
// end flow — the session still has to be ended + summarized. We lose the upload
// blob in that case (playback only), but transcript + summary are unaffected.
const RECORDER_STOP_TIMEOUT_MS = 3000

const doEnd = async (): Promise<void> => {
  teardownInProgress.value = true
  stopAutoTimer()
  feedbackAbort?.abort()
  feedbackAbort = null

  // 1) Stop capture → flush trailing PCM + finalize the full-session blob (SPEC §3).
  // Wrap in a timeout race: a hung stop() must never block reaching endMeeting()
  // (the root cause of the "session stuck active / no summary" bug). On timeout or
  // error we proceed with blob=null (recorder cleanup still ran best-effort).
  let blob: Blob | null = null
  // Capture the timeout id so a normal stop() win clears it — otherwise the 3s
  // timer keeps spinning after we've moved on, only to resolve into the void.
  let stopTimeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    blob = await Promise.race<Blob | null>([
      recorder.stop().then((b) => {
        clearTimeout(stopTimeoutId)
        return b
      }),
      new Promise<null>((resolve) => {
        stopTimeoutId = setTimeout(() => resolve(null), RECORDER_STOP_TIMEOUT_MS)
      })
    ])
  } catch (err) {
    // recorder.stop() rejected — non-fatal; keep ending the meeting. Clear the
    // timer too so a reject doesn't leave the 3s fallback running.
    clearTimeout(stopTimeoutId)
    notifications.warning(`停止录音异常：${(err as Error)?.message ?? '未知错误'}`)
  }

  // 2) Drain the ASR relay's trailing finals, then hard-close. Each step is
  // best-effort — a stuck/erroring ASR teardown must not block the end either.
  try {
    meeting.finishAsrStream()
    await meeting.waitForAsrClosed(5000)
  } catch {
    /* ignore — closeAsrStream below is the unconditional fallback */
  }
  meeting.closeAsrStream()

  // 3) Upload the full-session recording for playback (SPEC §3). Non-fatal: a
  // failed/absent upload only loses playback; transcript + summary stand. This
  // runs BEFORE endMeeting but must never gate it (try-catch swallows throws).
  if (blob) {
    try {
      const ok = await meeting.uploadRecording(blob)
      if (!ok && meeting.error) notifications.warning(`录音上传失败：${meeting.error}`)
    } catch (err) {
      notifications.warning(`录音上传失败：${(err as Error)?.message ?? '未知错误'}`)
    }
  }

  // 4) END THE MEETING — ALWAYS, no matter what happened above (FEEDBACK_V2 §3.2).
  // endMeeting is now near-instant (秒回, summary_status=generating); the Summary
  // page polls for the minutes. We jump to it whenever we have a session id so the
  // user sees the generating state — even if a transient end error needs a retry.
  const session = await meeting.endMeeting()
  const targetId = session?.id ?? meeting.currentSession?.id ?? sessionId.value
  if (session) {
    router.push({ name: 'meeting-summary', params: { id: String(session.id) } })
  } else if (Number.isFinite(targetId) && targetId > 0) {
    // End call failed but the session exists — surface the error, still navigate to
    // the summary so the user isn't stranded on a dead live view (it shows the
    // failed/none state + a path forward rather than a frozen recording UI).
    notifications.error(meeting.error ?? '结束会议失败')
    router.push({ name: 'meeting-summary', params: { id: String(targetId) } })
  } else {
    // No valid session id to navigate to — the user is STRANDED on the live view.
    // Reset teardownInProgress so the ASR-drop watcher can fire again (otherwise a
    // subsequent stream drop would be silently swallowed and the reconnect bar
    // would never show). The recorder is already torn down here, so a re-armed
    // watcher only re-surfaces genuine drops on any retry.
    teardownInProgress.value = false
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
  // Scroll on a new final segment OR a live interim update so the latest
  // transcript (incl. the grey in-progress tail) stays in view.
  () => [spokenSegments.value.length, interimText.value] as const,
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
  teardownInProgress.value = true
  stopAutoTimer()
  feedbackAbort?.abort()
  feedbackAbort = null
  // Stop local capture and tear down the ASR ws. Leaving does NOT end the session
  // (SPEC: it only stops local recording), so we don't upload the partial blob —
  // closing the stream just releases the socket + clears interim state.
  await recorder.stop()
  meeting.closeAsrStream()
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
.asr-retry-btn {
  margin-left: 10px;
  padding: 2px 10px;
  border: 1px solid #ef4444;
  border-radius: var(--radius-pill);
  background: transparent;
  color: #ef4444;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-sans);
  cursor: pointer;
  transition: all 0.15s ease;
}
.asr-retry-btn:hover {
  background: rgba(239, 68, 68, 0.1);
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
/* Live interim sentence (SPEC §2): greyed + italic, overwrite-style. */
.transcript-seg--interim {
  opacity: 0.95;
}
.transcript-seg--interim .seg-time {
  color: var(--text-muted);
  letter-spacing: 1px;
}
.seg-text--interim {
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
