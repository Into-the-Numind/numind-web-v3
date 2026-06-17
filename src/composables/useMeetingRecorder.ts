/**
 * useMeetingRecorder.ts — core recording engine for the Meeting Copilot.
 *
 * Contract: 详见 numind-server 分支 docs/meeting-copilot/REALTIME_ASR_SPEC.md §3 + §5
 * (cross-repo reference — the spec lives in the numind-server repo, not here).
 * The transcription link is now TRUE realtime streaming ASR (Ali Paraformer-
 * realtime over WebSocket, relayed by our backend), so the recorder no longer
 * slices WAV windows and POSTs them. Instead it does TWO things in parallel:
 *
 *   1. STREAMING PCM (for live ASR): continuous Web Audio capture →
 *      downsample to 16kHz mono → encode to raw PCM 16-bit little-endian →
 *      emit one ~`frameMs` (default 100ms = 3200 bytes) ArrayBuffer per frame
 *      through `onPcmFrame`. The view forwards each frame over the ASR ws
 *      (SPEC §2 binary frames).
 *
 *   2. FULL RECORDING (for playback): a parallel MediaRecorder records the
 *      whole session (webm/opus by default). On stop() the assembled Blob is
 *      handed back via `onRecording` AND via stop()'s resolved value, so the
 *      view can upload it (SPEC §3 → POST /recording → COS → recording_url).
 *
 * Design goals (unchanged where they still apply):
 *  - CONTINUOUS capture — never stop/start the audio graph between frames (a
 *    stop/start gap drops words). The graph + MediaRecorder run the whole
 *    session; frames are emitted as samples accumulate past the frame size.
 *  - 16kHz / mono / 16-bit PCM. AudioContext runs at the device's native
 *    sampleRate; we linearly downsample to 16000 at frame time.
 *  - Prefer AudioWorklet (off the main thread, no deprecation warnings); fall
 *    back to ScriptProcessorNode where AudioWorklet is unavailable.
 *  - stop() fully releases the MediaStream tracks AND closes the AudioContext,
 *    AND stops the MediaRecorder.
 *
 * This is a framework-agnostic engine returning Vue refs for status; the store /
 * view drives the ws send of each PCM frame and the upload of the final Blob.
 */

import { ref, readonly, type Ref } from 'vue'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MeetingRecorderOptions {
  /**
   * PCM frame cadence in ms (one ArrayBuffer emitted per frame). Default 100
   * (≈3200 bytes @ 16kHz mono 16-bit), matching SPEC §1/§3 recommended frame.
   */
  frameMs?: number
  /** Target PCM sample rate. Fixed at 16000 for Paraformer; exposed for testing. */
  targetSampleRate?: number
  /**
   * Emitted once per ~`frameMs` window with one raw PCM 16-bit LE 16kHz mono
   * frame as an ArrayBuffer. The view forwards each frame over the ASR ws.
   */
  onPcmFrame: (frame: ArrayBuffer) => void
  /**
   * Optional: receives the FULL-session recording Blob when stop() completes
   * (also returned by stop()). May be null if MediaRecorder produced no data.
   */
  onRecording?: (blob: Blob | null) => void
  /**
   * Optional MIME type for the full-session MediaRecorder. Defaults to the first
   * supported of audio/webm;codecs=opus → audio/webm → audio/mp4 → browser
   * default. Exposed for testing / forcing a container.
   */
  recordingMimeType?: string
  /** Optional non-fatal error sink (e.g. a frame's encode failed). */
  onError?: (err: Error) => void
}

export type RecorderState = 'idle' | 'recording' | 'paused'

export interface MeetingRecorder {
  /** Reactive recorder state. */
  state: Readonly<Ref<RecorderState>>
  /** True while actively capturing (state === 'recording'). */
  isRecording: Readonly<Ref<boolean>>
  /** True while paused. */
  isPaused: Readonly<Ref<boolean>>
  /** Elapsed recording time in ms (excludes paused spans), updated ~4x/sec. */
  elapsedMs: Readonly<Ref<number>>
  /** Request mic + start continuous capture. Throws on getUserMedia denial. */
  start: () => Promise<void>
  /** Pause capture (samples during pause are discarded; the graph keeps running). */
  pause: () => void
  /** Resume after pause. */
  resume: () => void
  /**
   * Stop capture: flush the trailing partial PCM frame, stop + finalize the
   * full-session MediaRecorder, release MediaStream tracks, disconnect + close
   * the AudioContext. Resolves with the full-session Blob (or null). Idempotent
   * (a second call resolves null).
   */
  stop: () => Promise<Blob | null>
}

// ---------------------------------------------------------------------------
// AudioWorklet processor source (inlined; registered via a Blob URL so we ship
// no extra static asset). It forwards every 128-frame render quantum's channel-0
// Float32 samples to the main thread, which buffers + downsamples them.
// ---------------------------------------------------------------------------

const WORKLET_SRC = `
class MeetingPCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input[0] && input[0].length > 0) {
      // Copy: the render buffer is reused across quanta.
      this.port.postMessage(input[0].slice(0))
    }
    return true
  }
}
registerProcessor('meeting-pcm-processor', MeetingPCMProcessor)
`

// ---------------------------------------------------------------------------
// PCM helpers — 16kHz mono 16-bit. Linear downsample from `srcRate` to
// `targetRate`, then pack Float32 [-1,1] into little-endian Int16.
// ---------------------------------------------------------------------------

/**
 * downsampleTo — linear-interpolation resample of mono Float32 samples from
 * `srcRate` to `targetRate`. When srcRate === targetRate, returns the input as-is.
 * Linear interpolation is adequate for speech ASR and avoids pulling in a
 * heavyweight resampler. Devices are virtually always >= 16kHz so this is a
 * downsample.
 */
export function downsampleTo(
  samples: Float32Array,
  srcRate: number,
  targetRate: number
): Float32Array {
  if (srcRate === targetRate || samples.length === 0) {
    return samples
  }
  const ratio = srcRate / targetRate
  const outLength = Math.max(1, Math.round(samples.length / ratio))
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio
    const idx = Math.floor(srcPos)
    const frac = srcPos - idx
    const a = samples[idx] ?? 0
    const b = samples[idx + 1] ?? a
    out[i] = a + (b - a) * frac
  }
  return out
}

/**
 * encodePcm16 — pack Float32 mono samples (already at the target rate) into raw
 * PCM 16-bit little-endian bytes (no WAV header). Float [-1,1] is clamped and
 * scaled to int16. Returns the backing ArrayBuffer (exactly samples*2 bytes).
 */
export function encodePcm16(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2)
  const view = new DataView(buffer)
  let offset = 0
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i]
    if (s > 1) s = 1
    else if (s < -1) s = -1
    // Asymmetric int16 range: negative scales by 0x8000, positive by 0x7FFF.
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return buffer
}

/** Concatenate a list of Float32Array chunks into one contiguous buffer. */
function concatFloat32(chunks: Float32Array[]): Float32Array {
  let total = 0
  for (const c of chunks) total += c.length
  const out = new Float32Array(total)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.length
  }
  return out
}

/** Pick the first supported MediaRecorder MIME type for the full recording. */
function resolveRecordingMime(preferred?: string): string | undefined {
  const candidates = [
    preferred,
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ].filter((m): m is string => typeof m === 'string' && m.length > 0)

  const supported =
    typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'

  for (const m of candidates) {
    if (!supported || MediaRecorder.isTypeSupported(m)) {
      return m
    }
  }
  // Let the browser pick its default container if none matched.
  return undefined
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useMeetingRecorder(options: MeetingRecorderOptions): MeetingRecorder {
  const frameMs = options.frameMs ?? 100
  const targetSampleRate = options.targetSampleRate ?? 16000
  // Samples per emitted PCM frame at the target rate (e.g. 16000 * 0.1 = 1600).
  const frameSampleCount = Math.max(1, Math.round((targetSampleRate * frameMs) / 1000))

  const state = ref<RecorderState>('idle')
  const isRecording = ref(false)
  const isPaused = ref(false)
  const elapsedMs = ref(0)

  // Audio graph handles (kept closure-local for cleanup).
  let mediaStream: MediaStream | null = null
  let audioContext: AudioContext | null = null
  let sourceNode: MediaStreamAudioSourceNode | null = null
  let workletNode: AudioWorkletNode | null = null
  let scriptNode: ScriptProcessorNode | null = null
  let workletUrl: string | null = null

  // Full-session recorder (parallel webm/opus capture for playback, SPEC §3).
  let mediaRecorder: MediaRecorder | null = null
  let recordedChunks: BlobPart[] = []
  let recordedMime = 'audio/webm'

  // Continuous PCM accumulation at the native sample rate. We accumulate raw
  // native-rate samples and, each time we have enough for one target frame
  // (`nativeFrameSampleCount`), splice off exactly that many, downsample, and emit.
  let pcmChunks: Float32Array[] = []
  let pcmBufferedLen = 0
  let nativeSampleRate = targetSampleRate
  // Native-rate samples that downsample to ~`frameSampleCount` target samples.
  let nativeFrameSampleCount = frameSampleCount

  // Timing.
  let elapsedTimer: ReturnType<typeof setInterval> | null = null
  let startedAt = 0
  let pausedAccumMs = 0
  let pausedSince = 0

  /** Elapsed recording ms excluding paused spans. */
  const currentElapsedMs = (): number => {
    if (startedAt === 0) return 0
    const base = performance.now() - startedAt - pausedAccumMs
    const livePause =
      state.value === 'paused' && pausedSince > 0 ? performance.now() - pausedSince : 0
    return Math.max(0, base - livePause)
  }

  /**
   * emitReadyFrames — while we have at least one full native frame buffered,
   * splice it off, downsample to the target rate, encode PCM16, and emit. Leaves
   * the remainder buffered for the next quantum (no sample loss at frame seams).
   */
  const emitReadyFrames = (): void => {
    while (pcmBufferedLen >= nativeFrameSampleCount) {
      const merged = concatFloat32(pcmChunks)
      const frameSamples = merged.subarray(0, nativeFrameSampleCount)
      const remainder = merged.subarray(nativeFrameSampleCount)
      // Re-seed the buffer with the leftover (copy so the subarray view doesn't
      // pin the larger backing buffer).
      pcmChunks = remainder.length > 0 ? [remainder.slice(0)] : []
      pcmBufferedLen = remainder.length

      try {
        const resampled = downsampleTo(frameSamples, nativeSampleRate, targetSampleRate)
        options.onPcmFrame(encodePcm16(resampled))
      } catch (err) {
        options.onError?.(err instanceof Error ? err : new Error(String(err)))
      }
    }
  }

  /** Append a render-quantum's samples (ignored while paused) and emit frames. */
  const ingestSamples = (samples: Float32Array): void => {
    if (state.value !== 'recording') return
    // Copy defensively — ScriptProcessor reuses its buffer; Worklet messages are
    // already copies but a uniform copy keeps invariants simple.
    const copy = samples.slice(0)
    pcmChunks.push(copy)
    pcmBufferedLen += copy.length
    emitReadyFrames()
  }

  const startTimers = (): void => {
    if (!elapsedTimer) {
      elapsedTimer = setInterval(() => {
        elapsedMs.value = currentElapsedMs()
      }, 250)
    }
  }

  const stopTimers = (): void => {
    if (elapsedTimer) {
      clearInterval(elapsedTimer)
      elapsedTimer = null
    }
  }

  /** Wire the capture node (Worklet preferred, ScriptProcessor fallback). */
  const attachCaptureNode = async (): Promise<void> => {
    if (!audioContext || !sourceNode) return

    // Prefer AudioWorklet — off-thread, no deprecation warnings.
    if (audioContext.audioWorklet) {
      try {
        const blob = new Blob([WORKLET_SRC], { type: 'application/javascript' })
        workletUrl = URL.createObjectURL(blob)
        await audioContext.audioWorklet.addModule(workletUrl)
        workletNode = new AudioWorkletNode(audioContext, 'meeting-pcm-processor')
        workletNode.port.onmessage = (ev: MessageEvent) => {
          const data = ev.data
          if (data instanceof Float32Array) ingestSamples(data)
        }
        sourceNode.connect(workletNode)
        // Worklet has no audible output; connecting to destination would echo.
        return
      } catch {
        // Fall through to ScriptProcessorNode if Worklet registration fails.
        if (workletUrl) {
          URL.revokeObjectURL(workletUrl)
          workletUrl = null
        }
        workletNode = null
      }
    }

    // Fallback: ScriptProcessorNode (deprecated but universally available).
    const bufferSize = 4096
    scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1)
    scriptNode.onaudioprocess = (ev: AudioProcessingEvent) => {
      const channel = ev.inputBuffer.getChannelData(0)
      ingestSamples(channel)
    }
    sourceNode.connect(scriptNode)
    // ScriptProcessorNode only fires onaudioprocess when connected to a
    // destination. Connect to destination so events fire; we never write the
    // output buffer so it stays silent (no echo).
    scriptNode.connect(audioContext.destination)
  }

  /** Start the parallel full-session MediaRecorder (best-effort, non-fatal). */
  const startFullRecorder = (): void => {
    if (!mediaStream) return
    try {
      recordedChunks = []
      const mime = resolveRecordingMime(options.recordingMimeType)
      mediaRecorder = mime
        ? new MediaRecorder(mediaStream, { mimeType: mime })
        : new MediaRecorder(mediaStream)
      recordedMime = mediaRecorder.mimeType || mime || 'audio/webm'
      mediaRecorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data && ev.data.size > 0) recordedChunks.push(ev.data)
      }
      // Timeslice so data flushes periodically (resilient to a crash mid-session).
      mediaRecorder.start(1000)
    } catch (err) {
      // Recording is for playback only — a failure must not break live ASR.
      mediaRecorder = null
      options.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }

  /**
   * stopFullRecorder — stop the MediaRecorder and resolve with the assembled
   * Blob (or null if it never produced data / wasn't running). Waits for the
   * final dataavailable + stop events.
   */
  const stopFullRecorder = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mr = mediaRecorder
      if (!mr) {
        resolve(recordedChunks.length > 0 ? new Blob(recordedChunks, { type: recordedMime }) : null)
        return
      }
      if (mr.state === 'inactive') {
        resolve(recordedChunks.length > 0 ? new Blob(recordedChunks, { type: recordedMime }) : null)
        return
      }
      mr.onstop = () => {
        const blob =
          recordedChunks.length > 0 ? new Blob(recordedChunks, { type: recordedMime }) : null
        resolve(blob)
      }
      try {
        mr.stop()
      } catch {
        const blob =
          recordedChunks.length > 0 ? new Blob(recordedChunks, { type: recordedMime }) : null
        resolve(blob)
      }
    })
  }

  /**
   * teardownGraph — disconnect + release every audio-graph handle and the
   * MediaStream tracks, then close the AudioContext. Shared by stop() and by
   * start()'s failure path so a partially-initialized graph never leaks the mic
   * (indicator stays lit) or an open AudioContext. The MediaRecorder is stopped
   * by stop() BEFORE this (it needs the live stream); here we only null it.
   * Best-effort: every step is guarded so one failure doesn't strand the rest.
   */
  const teardownGraph = async (): Promise<void> => {
    if (workletNode) {
      try {
        workletNode.port.onmessage = null
        workletNode.disconnect()
      } catch {
        /* ignore */
      }
      workletNode = null
    }
    if (scriptNode) {
      try {
        scriptNode.onaudioprocess = null
        scriptNode.disconnect()
      } catch {
        /* ignore */
      }
      scriptNode = null
    }
    if (sourceNode) {
      try {
        sourceNode.disconnect()
      } catch {
        /* ignore */
      }
      sourceNode = null
    }
    if (workletUrl) {
      URL.revokeObjectURL(workletUrl)
      workletUrl = null
    }

    // Defensive: if a recorder is still live (e.g. teardown via start() failure
    // path before stop() ran), stop it so the stream can release.
    if (mediaRecorder) {
      try {
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
      } catch {
        /* ignore */
      }
      mediaRecorder.ondataavailable = null
      mediaRecorder.onstop = null
      mediaRecorder = null
    }

    // Release every MediaStream track so the OS mic indicator clears.
    if (mediaStream) {
      for (const track of mediaStream.getTracks()) {
        try {
          track.stop()
        } catch {
          /* ignore */
        }
      }
      mediaStream = null
    }

    // Close the AudioContext fully.
    if (audioContext) {
      try {
        if (audioContext.state !== 'closed') {
          await audioContext.close()
        }
      } catch {
        /* ignore */
      }
      audioContext = null
    }
  }

  const start = async (): Promise<void> => {
    if (state.value !== 'idle') return

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前浏览器不支持麦克风录音')
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })

    // From here the MediaStream is live; any failure must release it (and any
    // AudioContext we open) before re-throwing, or the mic indicator stays lit
    // and the AudioContext leaks while state is still 'idle' (stop() would no-op).
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioContext = new Ctor()
      nativeSampleRate = audioContext.sampleRate || targetSampleRate
      // Native-rate samples per emitted target frame (downsample collapses these
      // to ~frameSampleCount). Keeps frame cadence ≈frameMs regardless of device rate.
      nativeFrameSampleCount = Math.max(1, Math.round((nativeSampleRate * frameMs) / 1000))
      // Some browsers start the context suspended until a user gesture; resume.
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      sourceNode = audioContext.createMediaStreamSource(mediaStream)

      await attachCaptureNode()
      // Start the parallel full-session recorder (best-effort).
      startFullRecorder()
    } catch (err) {
      await teardownGraph()
      throw err
    }

    pcmChunks = []
    pcmBufferedLen = 0
    startedAt = performance.now()
    pausedAccumMs = 0
    pausedSince = 0
    elapsedMs.value = 0

    state.value = 'recording'
    isRecording.value = true
    isPaused.value = false
    startTimers()
  }

  const pause = (): void => {
    if (state.value !== 'recording') return
    // Drop any partial buffered PCM (avoid a discontinuity glitch at resume).
    pcmChunks = []
    pcmBufferedLen = 0
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try {
        mediaRecorder.pause()
      } catch {
        /* ignore */
      }
    }
    pausedSince = performance.now()
    state.value = 'paused'
    isRecording.value = false
    isPaused.value = true
  }

  const resume = (): void => {
    if (state.value !== 'paused') return
    if (pausedSince > 0) {
      pausedAccumMs += performance.now() - pausedSince
      pausedSince = 0
    }
    if (mediaRecorder && mediaRecorder.state === 'paused') {
      try {
        mediaRecorder.resume()
      } catch {
        /* ignore */
      }
    }
    state.value = 'recording'
    isRecording.value = true
    isPaused.value = false
  }

  const stop = async (): Promise<Blob | null> => {
    if (state.value === 'idle') return null

    stopTimers()

    // Flush the trailing partial PCM frame (whatever was captured, not paused
    // tail) so the last words reach ASR before we close.
    if (state.value === 'recording' && pcmBufferedLen > 0) {
      const merged = concatFloat32(pcmChunks)
      pcmChunks = []
      pcmBufferedLen = 0
      try {
        const resampled = downsampleTo(merged, nativeSampleRate, targetSampleRate)
        if (resampled.length > 0) options.onPcmFrame(encodePcm16(resampled))
      } catch (err) {
        options.onError?.(err instanceof Error ? err : new Error(String(err)))
      }
    } else {
      pcmChunks = []
      pcmBufferedLen = 0
    }

    // Stop + finalize the full-session recorder BEFORE releasing the stream.
    const blob = await stopFullRecorder()

    // Disconnect + release the audio graph, MediaStream tracks, and AudioContext.
    await teardownGraph()

    state.value = 'idle'
    isRecording.value = false
    isPaused.value = false
    startedAt = 0
    pausedAccumMs = 0
    pausedSince = 0

    options.onRecording?.(blob)
    return blob
  }

  return {
    state: readonly(state),
    isRecording: readonly(isRecording),
    isPaused: readonly(isPaused),
    elapsedMs: readonly(elapsedMs),
    start,
    pause,
    resume,
    stop
  }
}
