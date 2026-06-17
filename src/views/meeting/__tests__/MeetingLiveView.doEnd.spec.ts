/**
 * MeetingLiveView — doEnd 硬化回归测试 (FEEDBACK_V2 §3.2, NDF Rule 11 Bug-from-Customer)
 *
 * 复现的线上 bug：结束会议时 doEnd 先 `await recorder.stop()`，若 stop() 卡住/抛错就
 * 永远到不了 endMeeting()，导致 session 卡在 status=active / summary_status=none、纪要从不生成。
 *
 * 本测试断言「无论 recorder.stop() 抛错还是超时，endMeeting() 仍被调用，且页面跳转到 summary」：
 *   case 1: recorder.stop() reject → endMeeting 仍调用 + router.push 到 meeting-summary
 *   case 2: recorder.stop() 永不 resolve（挂死）→ 3s 超时后 endMeeting 仍调用 + 跳转
 *
 * 策略（重度 stub，避免拉起真 ws / 麦克风 / 路由）：
 *   - useMeetingRecorder：stop() 按用例 reject / hang；其余 ref 给最小实现
 *   - vue-router：useRouter().push 为 spy
 *   - @/api/meeting：getSession 返回 active session；endMeeting 为可断言 spy
 *   - ConfirmModal：stub 成按 title 暴露 confirm 触发按钮
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'

// vi.mock factories are hoisted above all top-level vars, so anything they
// reference must come from vi.hoisted (also hoisted, and runs first).
const h = vi.hoisted(() => {
  const ACTIVE_SESSION = {
    id: 42,
    user_id: 1,
    title: '回归测试会议',
    role_prompt: '',
    auto_interval_seconds: 15,
    status: 'active',
    summary: '',
    summary_status: 'none',
    recording_url: null,
    duration_seconds: 0,
    started_at: '2026-06-18T00:00:00Z',
    ended_at: null,
    created_at: '2026-06-18T00:00:00Z',
    updated_at: '2026-06-18T00:00:00Z'
  }
  return {
    pushSpy: vi.fn(),
    endMeetingSpy: vi.fn(),
    ACTIVE_SESSION,
    // stop() behaviour swapped per test (a holder object so the hoisted ref is stable).
    recorderStop: { fn: (): Promise<Blob | null> => Promise.resolve(null) }
  }
})

// ── router stub ──────────────────────────────────────────────────────────────
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: h.pushSpy, replace: vi.fn() })
}))

// ── recorder stub (the variable behaviour under test) ─────────────────────────
vi.mock('@/composables/useMeetingRecorder', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue')
  return {
    useMeetingRecorder: () => ({
      state: ref('recording'),
      isRecording: ref(true),
      isPaused: ref(false),
      elapsedMs: ref(1000),
      start: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      resume: vi.fn(),
      stop: vi.fn(() => h.recorderStop.fn())
    })
  }
})

// ── ConfirmModal stub: expose a confirm trigger button keyed by title ─────────
vi.mock('@/components/common/ConfirmModal.vue', () => ({
  default: {
    name: 'ConfirmModalStub',
    props: ['modelValue', 'title', 'message', 'variant', 'confirmText'],
    emits: ['confirm', 'cancel', 'update:modelValue'],
    template: '<button :data-confirm="title" @click="$emit(\'confirm\')">{{ title }}</button>'
  }
}))

// ── notifications store stub (avoid pulling its real impl) ────────────────────
vi.mock('@/stores/notifications', () => ({
  useNotificationsStore: () => ({
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn()
  })
}))

// ── meeting API mock: getSession (load) + endMeeting (assertion target) ───────
vi.mock('@/api/meeting', () => ({
  getSession: vi.fn().mockResolvedValue({
    session: h.ACTIVE_SESSION,
    segments: [],
    feedbacks: []
  }),
  endMeeting: (...args: unknown[]) => {
    h.endMeetingSpy(...args)
    // /end is now 秒回 with summary_status='generating' (FEEDBACK_V2 §3.1).
    return Promise.resolve({
      ...h.ACTIVE_SESSION,
      status: 'ended',
      summary_status: 'generating'
    })
  },
  // ASR ws + recording upload: inert so doEnd's middle steps are no-ops here.
  openAsrStream: () => ({ sendPCM: vi.fn(), finish: vi.fn(), close: vi.fn() }),
  uploadRecording: vi.fn().mockResolvedValue(h.ACTIVE_SESSION),
  // unused by this flow but imported by the store module
  createSession: vi.fn(),
  listSessions: vi.fn(),
  ingestSegment: vi.fn(),
  listPresets: vi.fn(),
  savePreset: vi.fn(),
  deletePreset: vi.fn(),
  streamFeedback: vi.fn()
}))

import MeetingLiveView from '../MeetingLiveView.vue'

const mountLive = async () => {
  const wrapper = mount(MeetingLiveView, {
    props: { id: '42' },
    global: {
      stubs: {
        // lucide icons + AppButton → inert (template references them)
        ArrowLeft: true,
        Mic: true,
        Pause: true,
        Play: true,
        Square: true,
        Sparkles: true,
        AppButton: true
      }
    }
  })
  await flushPromises()
  return wrapper
}

// Click the end-confirm modal's confirm trigger → runs doEnd().
const triggerEnd = async (wrapper: Awaited<ReturnType<typeof mountLive>>) => {
  const btn = wrapper.find('[data-confirm="结束会议"]')
  expect(btn.exists()).toBe(true)
  await btn.trigger('click')
}

beforeEach(() => {
  setActivePinia(createPinia())
  h.pushSpy.mockClear()
  h.endMeetingSpy.mockClear()
  h.recorderStop.fn = () => Promise.resolve(null)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MeetingLiveView.doEnd — 录音停止失败/超时仍结束会议 (Rule 11 回归)', () => {
  it('recorder.stop() reject 时，endMeeting() 仍被调用并跳转 summary', async () => {
    h.recorderStop.fn = () => Promise.reject(new Error('boom: MediaRecorder teardown failed'))
    const wrapper = await mountLive()

    await triggerEnd(wrapper)
    // Let the doEnd promise chain settle (stop reject → finish → end → push).
    await vi.runAllTimersAsync()
    await flushPromises()

    expect(h.endMeetingSpy).toHaveBeenCalledTimes(1)
    expect(h.pushSpy).toHaveBeenCalledWith({
      name: 'meeting-summary',
      params: { id: '42' }
    })
  })

  it('recorder.stop() 永不 resolve（挂死）时，3s 超时后 endMeeting() 仍被调用并跳转', async () => {
    // Never resolves — exercises the Promise.race timeout fallback.
    h.recorderStop.fn = () => new Promise<Blob | null>(() => {})
    const wrapper = await mountLive()

    await triggerEnd(wrapper)
    // Advance past the 3s recorder-stop timeout + the ASR-close wait, draining
    // every pending timer/promise so the end flow reaches endMeeting().
    await vi.runAllTimersAsync()
    await flushPromises()

    expect(h.endMeetingSpy).toHaveBeenCalledTimes(1)
    expect(h.pushSpy).toHaveBeenCalledWith({
      name: 'meeting-summary',
      params: { id: '42' }
    })
  })
})
