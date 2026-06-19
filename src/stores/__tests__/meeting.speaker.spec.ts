import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach } from 'vitest'
import { useMeetingStore } from '@/stores/meeting'
import type { MeetingSegment } from '@/types/meeting'

// Regression for the dev-acceptance bug (2026-06-19): the backend pushes a standalone
// {"type":"speaker"} ws frame a few seconds AFTER the `final`, but the frontend dropped it,
// so the live transcript showed every segment as 「发言人?」 forever. applySpeakerUpdate is the
// store action wired to onSpeaker that merges the assignment into the matching segment by id.

const seg = (id: number): MeetingSegment => ({
  id,
  session_id: 1,
  seq: id,
  text: 'seg ' + id,
  start_ms: 0,
  duration_seconds: 1,
  audio_url: null,
  created_at: '',
  online_speaker_id: null,
  online_provisional: false,
  speaker_confidence: null
})

describe('meeting store · applySpeakerUpdate', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('merges a speaker assignment into the matching segment by id', () => {
    const store = useMeetingStore()
    store.segments.push(seg(41), seg(42), seg(43))

    store.applySpeakerUpdate({
      segment_id: 42,
      online_speaker_id: 2,
      online_provisional: true,
      speaker_confidence: 0.61
    })

    const target = store.segments.find((s) => s.id === 42)
    expect(target?.online_speaker_id).toBe(2)
    expect(target?.online_provisional).toBe(true)
    expect(target?.speaker_confidence).toBeCloseTo(0.61)
    // other segments untouched
    expect(store.segments.find((s) => s.id === 41)?.online_speaker_id).toBeNull()
  })

  it('is a no-op when no segment matches (out-of-order / dropped frame)', () => {
    const store = useMeetingStore()
    store.segments.push(seg(1))
    store.applySpeakerUpdate({
      segment_id: 999,
      online_speaker_id: 1,
      online_provisional: false,
      speaker_confidence: 0.9
    })
    expect(store.segments).toHaveLength(1)
    expect(store.segments[0].online_speaker_id).toBeNull()
  })
})
