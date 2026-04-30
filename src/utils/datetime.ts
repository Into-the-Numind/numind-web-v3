/**
 * Datetime formatting utilities — UTC+8 (Asia/Shanghai) aware.
 *
 * Implemented with the native `Intl.DateTimeFormat` API so that no extra
 * npm dependency (e.g. dayjs) is required.  The contract is identical to the
 * dayjs-based design in the task spec:
 *
 *   formatDate(null | undefined) → '—'
 *   formatDate('2026-05-15T16:00:00Z') → '2026-05-16'   (UTC+8, next calendar day)
 *   formatDate('2026-05-15T00:00:00+08:00') → '2026-05-15'
 *
 *   formatDateTime(null | undefined) → '—'
 *   formatDateTime('2026-05-15T16:00:00Z') → '2026-05-16 00:00'
 */

const TZ = 'Asia/Shanghai'

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})

/** Parse the Intl formatted parts into a YYYY-MM-DD string. */
function toDateString(d: Date): string {
  const parts = dateFormatter.formatToParts(d)
  const map: Record<string, string> = {}
  for (const p of parts) {
    map[p.type] = p.value
  }
  return `${map.year}-${map.month}-${map.day}`
}

/** Parse the Intl formatted parts into a YYYY-MM-DD HH:mm string. */
function toDateTimeString(d: Date): string {
  const parts = dateTimeFormatter.formatToParts(d)
  const map: Record<string, string> = {}
  for (const p of parts) {
    map[p.type] = p.value
  }
  // Intl hour12:false may output "24" for midnight — normalise to "00"
  const hour = map.hour === '24' ? '00' : map.hour
  return `${map.year}-${map.month}-${map.day} ${hour}:${map.minute}`
}

/**
 * Format an ISO 8601 timestamp to YYYY-MM-DD in UTC+8.
 * Returns '—' for null / undefined / empty input.
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return toDateString(d)
}

/**
 * Format an ISO 8601 timestamp to YYYY-MM-DD HH:mm in UTC+8.
 * Returns '—' for null / undefined / empty input.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return toDateTimeString(d)
}
