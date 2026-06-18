/**
 * useMeetingSpeakers — shared speaker-diarization rendering for the Meeting
 * Copilot (会议副驾) views (DIARIZATION_SPEC §6 / §7 T10/T11).
 *
 * The live view (T10) renders per-segment speaker badges as sentences finalize;
 * the summary view (T11) renders the final, offline-refined roster and groups
 * the transcript by speaker. Both need the SAME display precedence + palette so a
 * speaker keeps one color/label across surfaces. This composable is the single
 * source of that logic:
 *
 *   display precedence (DIARIZATION_SPEC §6):
 *     final_speaker_id (→ meeting_speaker map: 1/2/3) ?? online_speaker_id
 *     (字母 A/B/C 临时) ?? grey "发言人?"
 *
 * Flag: gated by VITE_ENABLE_MEETING_DIARIZATION at the call site; this composable
 * is pure resolution logic and is safe to import unconditionally (a caller with
 * the flag OFF simply never renders the badges).
 *
 * No reactivity is owned here — callers pass the reactive `speakerByCluster`
 * lookup (from the meeting store) so resolution stays in sync with the roster.
 */

import type { MeetingSegment, MeetingSpeaker } from '@/types/meeting'

// ── Palette (DIARIZATION_SPEC §6 "取色板不同色") ─────────────────────────────
// 8 distinct hues matching MAX_SPEAKERS=8 (§5 D9). Each entry: a text/border
// color + a soft background tint. color_index (from meeting_speaker) / a derived
// online index is taken mod the palette length so we never overflow.
// Kept identical to the live view (T10) so a speaker's color is stable across the
// live → summary handoff.
export const SPEAKER_PALETTE: ReadonlyArray<{ fg: string; bg: string }> = [
  { fg: 'hsl(160, 60%, 34%)', bg: 'hsl(160, 55%, 94%)' }, // teal (brand-adjacent)
  { fg: 'hsl(212, 70%, 46%)', bg: 'hsl(212, 80%, 95%)' }, // blue
  { fg: 'hsl(28, 78%, 46%)', bg: 'hsl(28, 85%, 94%)' }, // amber
  { fg: 'hsl(280, 52%, 50%)', bg: 'hsl(280, 60%, 95%)' }, // violet
  { fg: 'hsl(340, 65%, 50%)', bg: 'hsl(340, 75%, 96%)' }, // rose
  { fg: 'hsl(96, 48%, 38%)', bg: 'hsl(96, 55%, 93%)' }, // green
  { fg: 'hsl(190, 60%, 40%)', bg: 'hsl(190, 65%, 93%)' }, // cyan
  { fg: 'hsl(255, 55%, 56%)', bg: 'hsl(255, 65%, 96%)' } // indigo
]

/** Palette lookup with safe wrap-around (negative-safe modulo). */
export const paletteAt = (index: number): { fg: string; bg: string } =>
  SPEAKER_PALETTE[
    ((index % SPEAKER_PALETTE.length) + SPEAKER_PALETTE.length) % SPEAKER_PALETTE.length
  ]

// Below this confidence a label is weakened (translucent + trailing "?") even if
// not flagged provisional (DIARIZATION_SPEC §6 "低 speaker_confidence 弱化").
export const SPEAKER_CONFIDENCE_FLOOR = 0.55

/**
 * onlineLetter — 0-indexed online cluster id → letter A/B/C… (会中临时标签, §6).
 * Wraps past Z with a numeric suffix (A2, B2 …) to stay reasonably unique.
 */
export const onlineLetter = (clusterId: number): string => {
  if (clusterId < 0) return '?'
  const base = clusterId % 26
  const cycle = Math.floor(clusterId / 26)
  const letter = String.fromCharCode(65 + base)
  return cycle === 0 ? letter : `${letter}${cycle + 1}`
}

/**
 * Resolved speaker display for one segment (DIARIZATION_SPEC §6 precedence).
 *  - `label`  : human-facing label ("1" / "发言人 1" final, or "A"/"B" online).
 *  - `fg`/`bg`: palette colors (CSS color strings; may be var(...) for unknown).
 *  - `weak`   : provisional OR low-confidence → translucent + trailing "?".
 *  - `known`  : false when no speaker id at all (grey "发言人?" fallback).
 *  - `final`  : true when this is the offline-refined (authoritative) label.
 *  - `clusterId`: the resolved cluster id (final wins; -1 when unknown) — used to
 *                 group/merge the transcript by speaker.
 */
export interface SpeakerView {
  label: string
  fg: string
  bg: string
  weak: boolean
  known: boolean
  final: boolean
  clusterId: number
}

/**
 * resolveSpeaker — map one segment to its SpeakerView. `speakerByCluster` is the
 * final cluster_id → MeetingSpeaker lookup (from the store getter); empty before
 * the offline pass, in which case final ids fall back to a synthesized label.
 */
export const resolveSpeaker = (
  seg: MeetingSegment,
  speakerByCluster: Record<number, MeetingSpeaker>
): SpeakerView => {
  const conf = seg.speaker_confidence
  const lowConf = typeof conf === 'number' && conf < SPEAKER_CONFIDENCE_FLOOR

  // 1) Final label wins (post offline pass): map via meeting_speaker.
  if (typeof seg.final_speaker_id === 'number' && seg.final_speaker_id >= 0) {
    const sp = speakerByCluster[seg.final_speaker_id]
    const colorIndex = sp ? sp.color_index : seg.final_speaker_id
    const { fg, bg } = paletteAt(colorIndex)
    return {
      label: sp ? sp.display_label : `发言人 ${seg.final_speaker_id + 1}`,
      fg,
      bg,
      weak: lowConf,
      known: true,
      final: true,
      clusterId: seg.final_speaker_id
    }
  }

  // 2) Online temp label (会中): A/B/C, weakened when provisional / low conf.
  if (typeof seg.online_speaker_id === 'number' && seg.online_speaker_id >= 0) {
    const { fg, bg } = paletteAt(seg.online_speaker_id)
    return {
      label: onlineLetter(seg.online_speaker_id),
      fg,
      bg,
      weak: Boolean(seg.online_provisional) || lowConf,
      known: true,
      final: false,
      // Offset online cluster ids into a separate namespace so grouping never
      // collides an online cluster 0 (A) with a final cluster 0 (1) in a mixed
      // segment list. -1 reserved for unknown.
      clusterId: -(seg.online_speaker_id + 2)
    }
  }

  // 3) No speaker id → grey unknown.
  return {
    label: '?',
    fg: 'var(--text-muted)',
    bg: 'var(--surface-tint)',
    weak: true,
    known: false,
    final: false,
    clusterId: -1
  }
}

/** Badge text: label + trailing "?" when weak; "发言人?" for the grey fallback. */
export const speakerBadgeText = (v: SpeakerView | undefined): string => {
  if (!v) return ''
  if (!v.known) return '发言人?'
  return v.weak ? `${v.label}?` : v.label
}

/** Inline CSS custom props feeding the .seg-speaker palette. */
export const speakerStyleVars = (v: SpeakerView | undefined): Record<string, string> => {
  if (!v) return {}
  return { '--spk-fg': v.fg, '--spk-bg': v.bg }
}

/** Hover title: authoritative for final labels; "初步识别" note for online. */
export const speakerTitleText = (v: SpeakerView | undefined): string => {
  if (!v) return ''
  if (!v.known) return '未能识别说话人'
  if (v.final) return `说话人 ${v.label}`
  const note = v.weak ? '（初步识别，置信度较低）' : '（初步识别，会后将自动校正）'
  return `说话人 ${v.label}${note}`
}

/**
 * One contiguous run of transcript segments attributed to the same speaker
 * (DIARIZATION_SPEC §7 T11 "纪要按发言人归并展示"). Consecutive segments sharing a
 * resolved clusterId fold into one group so the summary reads like a dialogue
 * rather than a flat sentence list.
 */
export interface SpeakerGroup {
  /** Stable key for v-for (clusterId + first segment id). */
  key: string
  speaker: SpeakerView
  segments: MeetingSegment[]
}

/**
 * groupSegmentsBySpeaker — fold a seq-ordered segment list into contiguous
 * same-speaker runs. A new group starts whenever the resolved clusterId differs
 * from the previous segment's (so the same speaker talking twice in a row stays
 * one group, but A→B→A produces three groups in dialogue order).
 *
 * `segments` MUST already be sorted by seq (the store sorts on load); we do not
 * re-sort here so grouping reflects true conversational order.
 */
export const groupSegmentsBySpeaker = (
  segments: MeetingSegment[],
  speakerByCluster: Record<number, MeetingSpeaker>
): SpeakerGroup[] => {
  const groups: SpeakerGroup[] = []
  for (const seg of segments) {
    const view = resolveSpeaker(seg, speakerByCluster)
    const last = groups[groups.length - 1]
    if (last && last.speaker.clusterId === view.clusterId) {
      last.segments.push(seg)
    } else {
      groups.push({
        key: `${view.clusterId}-${seg.id}`,
        speaker: view,
        segments: [seg]
      })
    }
  }
  return groups
}
