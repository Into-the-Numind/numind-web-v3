/**
 * useMeetingRecorder.ts — core recording engine for the Meeting Copilot.
 *
 * Contract: numind-server/docs/meeting-copilot/SPEC.md §1 + §5. The project's ASR
 * (FunASR) is BATCH-only, so "realtime" = near-realtime segments: we capture PCM
 * continuously via Web Audio, buffer it, and every ~`intervalMs` flush one
 * **16kHz mono 16-bit WAV** Blob through `onSegment` for upload.
 *
 * Design goals (SPEC §5):
 *  - CONTINUOUS capture, then slice — never stop/start the stream between windows
 *    (a stop/start gap drops words at the seam). The audio graph runs the whole
 *    session; a timer drains the accumulated samples into a WAV every interval.
 *  - 16kHz / mono / 16-bit PCM WAV (44-byte header + little-endian PCM16). The
 *    AudioContext runs at the device's native sampleRate; we linearly downsample
 *    to 16000 at encode time.
 *  - Prefer AudioWorklet (off the main thread, no deprecation warnings); fall back
 *    to ScriptProcessorNode where AudioWorklet is unavailable.
 *  - stop() fully releases the MediaStream tracks AND closes the AudioContext.
 *
 * This is a framework-agnostic engine returning Vue refs for status; the store /
 * view drives upload of each emitted Blob (SPEC §5 file split).
 */

import { ref, readonly, type Ref } from 'vue'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MeetingRecorderOptions {
  /** Flush cadence in ms (one WAV per window). Default 10000 (~10s, SPEC §1/§5). */
  intervalMs?: number
  /** Target WAV sample rate. Fixed at 16000 for FunASR; exposed for testing. */
  targetSampleRate?: number
  /**
   * Emitted once per window with the encoded WAV Blob and the window's index
   * (0-based seq) plus its start offset in ms relative to recording start —
   * maps directly onto SPEC §3 segments `seq` / `start_ms`.
   */
  onSegment: (segment: RecorderSegment) => void
  /** Optional non-fatal error sink (e.g. a window's encode failed). */
  onError?: (err: Error) => void
}

export interface RecorderSegment {
  blob: Blob
  seq: number
  startMs: number
  /** Window duration in seconds (best-effort, from sample count / targetRate). */
  durationSeconds: number
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
   * Stop capture: flush the trailing partial window, release MediaStream tracks,
   * disconnect + close the AudioContext. Idempotent.
   */
  stop: () => Promise<void>
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
// WAV encoder — 16kHz mono 16-bit PCM. Linear downsample from `srcRate` to
// `targetRate`, then write a 44-byte canonical WAV header + PCM16 LE body.
// ---------------------------------------------------------------------------

/**
 * downsampleTo — linear-interpolation resample of mono Float32 samples from
 * `srcRate` to `targetRate`. When srcRate === targetRate, returns the input as-is.
 * Linear interpolation is adequate for speech ASR (FunASR) and avoids pulling in
 * a heavyweight resampler. If srcRate < targetRate (rare), it upsamples the same
 * way — but devices are virtually always >= 16kHz so this is a downsample.
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
 * encodeWav — produce a 16-bit PCM mono WAV Blob from Float32 samples already at
 * `sampleRate`. 44-byte header + little-endian PCM16 body. Float [-1,1] is clamped
 * and scaled to int16.
 */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length
  const dataSize = numSamples * 2 // 16-bit = 2 bytes/sample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string): void => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  // RIFF header
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true) // ChunkSize
  writeString(8, 'WAVE')
  // fmt subchunk
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // Subchunk1Size (PCM)
  view.setUint16(20, 1, true) // AudioFormat = PCM
  view.setUint16(22, 1, true) // NumChannels = mono
  view.setUint32(24, sampleRate, true) // SampleRate
  view.setUint32(28, sampleRate * 2, true) // ByteRate = SampleRate * NumChannels * BytesPerSample
  view.setUint16(32, 2, true) // BlockAlign = NumChannels * BytesPerSample
  view.setUint16(34, 16, true) // BitsPerSample
  // data subchunk
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  // PCM16 body
  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    let s = samples[i]
    if (s > 1) s = 1
    else if (s < -1) s = -1
    // Asymmetric int16 range: negative scales by 0x8000, positive by 0x7FFF.
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return new Blob([view], { type: 'audio/wav' })
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

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useMeetingRecorder(options: MeetingRecorderOptions): MeetingRecorder {
  const intervalMs = options.intervalMs ?? 10000
  const targetSampleRate = options.targetSampleRate ?? 16000

  const state = ref<RecorderState>('idle')
  const isRecording = ref(false)
  const isPaused = ref(false)
  const elapsedMs = ref(0)

  // Audio graph handles (kept module-local to the closure for cleanup).
  let mediaStream: MediaStream | null = null
  let audioContext: AudioContext | null = null
  let sourceNode: MediaStreamAudioSourceNode | null = null
  let workletNode: AudioWorkletNode | null = null
  let scriptNode: ScriptProcessorNode | null = null
  let workletUrl: string | null = null

  // Continuous PCM accumulation for the CURRENT window (native sample rate).
  let pcmChunks: Float32Array[] = []
  let nativeSampleRate = targetSampleRate

  // Window bookkeeping.
  let seq = 0
  let flushTimer: ReturnType<typeof setInterval> | null = null
  let elapsedTimer: ReturnType<typeof setInterval> | null = null
  // Recording start (perf clock) and accumulated paused time, for elapsed + start_ms.
  let startedAt = 0
  let pausedAccumMs = 0
  let pausedSince = 0
  // The start offset (ms from recording start) of the window currently buffering.
  let windowStartMs = 0

  /** Append a render-quantum's samples (ignored while paused). */
  const ingestSamples = (samples: Float32Array): void => {
    if (state.value !== 'recording') return
    // Copy defensively — Worklet messages are transferable-free copies already,
    // but ScriptProcessor reuses its buffer.
    pcmChunks.push(samples.slice(0))
  }

  /**
   * flushWindow — encode the accumulated PCM into one 16kHz mono WAV and emit it.
   * Resets the buffer for the next window. `final` lets stop() flush a short tail.
   */
  const flushWindow = (): void => {
    if (pcmChunks.length === 0) {
      // Nothing captured this window (e.g. fully paused) — advance the window
      // origin so the next window's start_ms stays accurate.
      windowStartMs = currentElapsedMs()
      return
    }
    const merged = concatFloat32(pcmChunks)
    pcmChunks = []
    const thisSeq = seq++
    const thisStartMs = windowStartMs
    windowStartMs = currentElapsedMs()

    try {
      const resampled = downsampleTo(merged, nativeSampleRate, targetSampleRate)
      const blob = encodeWav(resampled, targetSampleRate)
      const durationSeconds = resampled.length / targetSampleRate
      options.onSegment({ blob, seq: thisSeq, startMs: thisStartMs, durationSeconds })
    } catch (err) {
      options.onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }

  /** Elapsed recording ms excluding paused spans. */
  const currentElapsedMs = (): number => {
    if (startedAt === 0) return 0
    const base = performance.now() - startedAt - pausedAccumMs
    const livePause =
      state.value === 'paused' && pausedSince > 0 ? performance.now() - pausedSince : 0
    return Math.max(0, base - livePause)
  }

  const startTimers = (): void => {
    if (!flushTimer) {
      flushTimer = setInterval(() => {
        if (state.value === 'recording') flushWindow()
      }, intervalMs)
    }
    if (!elapsedTimer) {
      elapsedTimer = setInterval(() => {
        elapsedMs.value = currentElapsedMs()
      }, 250)
    }
  }

  const stopTimers = (): void => {
    if (flushTimer) {
      clearInterval(flushTimer)
      flushTimer = null
    }
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
        // Worklet has no audible output; connecting to destination is unnecessary
        // and would echo. The node still pulls audio as long as the source feeds it.
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
    // destination. Connect to destination so events fire; the node passes input
    // straight through, but since we never write to the output buffer it stays
    // silent (no echo).
    scriptNode.connect(audioContext.destination)
  }

  /**
   * teardownGraph — disconnect + release every audio-graph handle and the
   * MediaStream tracks, then close the AudioContext. Shared by stop() and by
   * start()'s failure path so a partially-initialized graph never leaks the mic
   * (indicator stays lit) or an open AudioContext. Best-effort: every step is
   * guarded so one failure doesn't strand the rest.
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

    // From here on the MediaStream is live; any failure must release it (and any
    // AudioContext we open) before re-throwing, or the mic indicator stays lit
    // and the AudioContext leaks while state is still 'idle' (stop() would no-op).
    try {
      // AudioContext runs at the device's native rate; we downsample at encode time.
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioContext = new Ctor()
      nativeSampleRate = audioContext.sampleRate || targetSampleRate
      // Some browsers start the context suspended until a user gesture; resume.
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      sourceNode = audioContext.createMediaStreamSource(mediaStream)

      await attachCaptureNode()
    } catch (err) {
      await teardownGraph()
      throw err
    }

    seq = 0
    pcmChunks = []
    startedAt = performance.now()
    pausedAccumMs = 0
    pausedSince = 0
    windowStartMs = 0
    elapsedMs.value = 0

    state.value = 'recording'
    isRecording.value = true
    isPaused.value = false
    startTimers()
  }

  const pause = (): void => {
    if (state.value !== 'recording') return
    // Flush whatever has accumulated so the seam falls on a window boundary, then
    // mark paused (ingestSamples drops samples while paused).
    flushWindow()
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
    // Realign the next window's origin to "now" so start_ms reflects wall-clock
    // recording position (paused gap excluded).
    windowStartMs = currentElapsedMs()
    state.value = 'recording'
    isRecording.value = true
    isPaused.value = false
  }

  const stop = async (): Promise<void> => {
    if (state.value === 'idle') return

    stopTimers()

    // Flush the trailing partial window before tearing down (capture only what
    // was recorded, not paused tail).
    if (state.value === 'recording') {
      flushWindow()
    } else {
      // Paused: anything buffered was already flushed at pause(); clear residue.
      pcmChunks = []
    }

    // Disconnect + release the audio graph, MediaStream tracks, and AudioContext.
    await teardownGraph()

    state.value = 'idle'
    isRecording.value = false
    isPaused.value = false
    startedAt = 0
    pausedAccumMs = 0
    pausedSince = 0
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
