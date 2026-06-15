/**
 * agentArtifacts.ts — split agent-generated artifacts out of a final-answer
 * markdown string (agent-output-polish #2a + #4).
 *
 * The agent's final answer is a markdown blob. When the run produced files
 * (images via image_gen, docx/xlsx/pptx/pdf/csv via the doc tools) it embeds
 * them inline as markdown image (`![alt](url)`) or link (`[text](url)`) nodes
 * pointing at COS. Rendering those raw — a bare thumbnail or a naked link — buries
 * the deliverable in the prose. `extractArtifacts` lifts those COS-artifact nodes
 * out into structured `ArtifactRef`s (so the UI can render them as prominent
 * artifact cards) and returns the remaining prose with those nodes removed.
 *
 * ## Why derive from markdown (not a separate artifact list)
 *
 * The final answer is the single persisted source of truth (it survives reload —
 * a transient SSE artifact event does not, see loadSessionSnapshot). Deriving the
 * cards from the persisted markdown means they reappear on reload for free.
 *
 * ## COS-artifact precision (P1-A — must not touch third-party citations)
 *
 * Only nodes whose URL points at a generated COS artifact are extracted. A URL
 * qualifies iff BOTH:
 *   (a) host contains `myqcloud.com` OR `cos.ap-`, AND
 *   (b) path contains `agent-outputs/`.
 * Everything else — a `[来源](https://example.com/report.pdf)` citation, a
 * `![](https://picsum.photos/200)` stock image — is left untouched in the prose
 * as an ordinary markdown node. Presigned query suffixes (`?q-sign-algorithm=…`)
 * are ignored by parsing host+path only.
 */
import { renderMarkdown } from './markdown'

export interface ArtifactRef {
  filename: string
  url: string
  mime: string
}

export interface ExtractedArtifacts {
  prose: string
  artifacts: ArtifactRef[]
}

/**
 * One ordered piece of a final answer: either a run of prose (already rendered
 * to safe HTML) or a single COS artifact pulled out to render as a card in place.
 * The segments preserve document order so the answer reads top-to-bottom exactly
 * as written, with cards sitting where the link used to be.
 */
export type Segment = { type: 'prose'; html: string } | { type: 'artifact'; ref: ArtifactRef }

/**
 * A render-ready segment: like Segment, but consecutive image artifacts are
 * coalesced into one `image-group` so the answer can lay multiple images out as a
 * responsive grid (#3 M1) while a lone image stays an `artifact` (rendered as a
 * single S2 card). Produced by {@link groupAdjacentImages}; consumed by the view.
 */
export type RenderSegment = Segment | { type: 'image-group'; refs: ArtifactRef[] }

// Extension → MIME. Office formats use their canonical OOXML/binary types so the
// artifact card can label/download them correctly.
const MIME_BY_EXT: Record<string, string> = {
  // images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  // documents
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  pdf: 'application/pdf',
  csv: 'text/csv'
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])
const DOC_EXTS = new Set(['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'pdf', 'csv'])

/**
 * Pull the path (no query/fragment) from a URL. Works without a base for
 * absolute URLs; falls back to a manual split so a malformed value never throws.
 */
function urlPath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    // Strip query + fragment manually (relative or odd URLs).
    return url.split('#')[0].split('?')[0]
  }
}

/** Host (lowercased) or '' when the URL has no parseable host. */
function urlHost(url: string): string {
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return ''
  }
}

/** Lowercased extension (no dot) of a URL's last path segment, '' if none. */
function extOf(url: string): string {
  const path = urlPath(url)
  const last = path.substring(path.lastIndexOf('/') + 1)
  const dot = last.lastIndexOf('.')
  if (dot < 0 || dot === last.length - 1) return ''
  return last.slice(dot + 1).toLowerCase()
}

/**
 * Display name for an artifact (#2): prefer the markdown node's link text / image
 * alt — that is the human-readable name the LLM actually wrote (`![销售漏斗图](url)`,
 * `[报告.docx](url)`). It beats the COS object-key tail, where Chinese is sanitized
 * to underscores (`..py-______.docx`) and images carry a machine name. Falls back to
 * the URL filename, then a generic `artifact.<ext>`, when the node has no text/alt.
 */
function displayName(text: string, url: string, ext: string): string {
  const label = (text ?? '').trim()
  return label || filenameOf(url) || `artifact.${ext}`
}

/** Filename = last path segment (query stripped), URL-decoded. */
function filenameOf(url: string): string {
  const path = urlPath(url)
  const base = path.substring(path.lastIndexOf('/') + 1)
  if (!base) return ''
  try {
    return decodeURIComponent(base)
  } catch {
    return base
  }
}

/**
 * COS-artifact predicate (P1-A): host contains myqcloud.com OR cos.ap- AND path
 * contains agent-outputs/. Both must hold. Query suffix is irrelevant (host+path
 * only).
 */
function isCosArtifactUrl(url: string): boolean {
  const host = urlHost(url)
  const path = urlPath(url)
  const hostOk = host.includes('myqcloud.com') || host.includes('cos.ap-')
  const pathOk = path.includes('agent-outputs/')
  return hostOk && pathOk
}

// Markdown image: ![alt](url)   — capture group 2 = url
// Markdown link:  [text](url)   — capture group 2 = url
// Both stop the URL at whitespace or the closing paren. A leading `!` distinguishes
// an image from a link, so we run them as one alternation and branch on it.
const NODE_RE = /(!?)\[([^\]]*)\]\(\s*(\S+?)\s*\)/g

/**
 * Split COS-artifact image/download nodes out of a final-answer markdown string.
 *
 * @param markdown raw final-answer markdown (may be empty)
 * @returns `{ prose, artifacts }` — prose with the extracted nodes removed
 *          (other markdown untouched), and the structured artifact refs in
 *          document order.
 */
export function extractArtifacts(markdown: string | null | undefined): ExtractedArtifacts {
  if (!markdown) return { prose: '', artifacts: [] }

  const artifacts: ArtifactRef[] = []

  const prose = markdown.replace(NODE_RE, (match, bang: string, text: string, url: string) => {
    if (!isCosArtifactUrl(url)) return match // third-party node → leave as-is

    const ext = extOf(url)
    const isImageNode = bang === '!'

    // An image node (`![]`) is only extracted if it has a known image extension;
    // a link node (`[]`) only if it has a known downloadable-doc extension. A COS
    // node with an unrecognized extension stays inline (don't guess a mime).
    if (isImageNode) {
      if (!IMAGE_EXTS.has(ext)) return match
    } else {
      if (!DOC_EXTS.has(ext)) return match
    }

    const mime = MIME_BY_EXT[ext]
    if (!mime) return match

    artifacts.push({
      filename: displayName(text, url, ext),
      url,
      mime
    })
    return '' // strip the node from the prose
  })

  return { prose, artifacts }
}

/**
 * Build an ArtifactRef for a single COS node, or null if the node is not an
 * extractable COS artifact (wrong host/path, wrong node-kind/extension pairing,
 * or an unknown extension). Mirrors the per-node decision inside extractArtifacts
 * so both code paths agree on what counts as an artifact.
 */
function artifactRefOf(isImageNode: boolean, text: string, url: string): ArtifactRef | null {
  if (!isCosArtifactUrl(url)) return null
  const ext = extOf(url)
  if (isImageNode) {
    if (!IMAGE_EXTS.has(ext)) return null
  } else {
    if (!DOC_EXTS.has(ext)) return null
  }
  const mime = MIME_BY_EXT[ext]
  if (!mime) return null
  return { filename: displayName(text, url, ext), url, mime }
}

// A markdown line is "structural" (a list item, blockquote, or table row) when it
// starts with a list/quote marker or contains a table pipe. Splitting an artifact
// out of such a line would break the markdown block, so those COS nodes stay inline
// in the prose (P1-A: only whole-line/paragraph COS nodes become cards).
const LIST_OR_QUOTE_RE = /^\s*(?:[-*+]\s|\d+[.)]\s|>\s?)/

/**
 * Decide whether a single line is "an artifact node standing alone on its line".
 *
 * The line qualifies only when the COS artifact node is the LAST meaningful thing
 * on the line — i.e. the line is `[optional label]` + `<COS node>` + (trailing
 * whitespace only). This matches the "文件下载：[报告](…)" shape while leaving a COS
 * link that is followed by more prose ("…从 [这里](…) 下载，记得保存。") inline, and
 * leaving structural lines (list / blockquote / table) untouched — splitting any of
 * those would break the markdown block (P1-A).
 *
 * @returns the extracted ArtifactRef when the line qualifies, else null.
 */
function standaloneArtifactOf(line: string): ArtifactRef | null {
  // Structural line → never split (would break the list/table/quote block).
  if (LIST_OR_QUOTE_RE.test(line)) return null
  if (line.includes('|')) return null

  // Exactly one markdown node on the line; a second node means it is mixed prose.
  const matches = [...line.matchAll(NODE_RE)]
  if (matches.length !== 1) return null

  const m = matches[0]
  const [match, bang, text, url] = m
  const ref = artifactRefOf(bang === '!', text, url)
  if (!ref) return null

  // The node must be the last meaningful content: only whitespace may follow it.
  // Anything else (", 下载，记得保存。") means it is embedded inline → stays prose.
  const after = line.slice((m.index ?? 0) + match.length)
  if (after.trim().length > 0) return null
  return ref
}

/**
 * Split a final-answer markdown string into ordered prose / artifact segments.
 *
 * The answer renders top-to-bottom in document order: each run of prose lines is
 * rendered to safe HTML via renderMarkdown, and each standalone COS-artifact line
 * becomes its own artifact segment (rendered as a card by the caller) sitting
 * exactly where the link was written. COS links embedded in a list item, table,
 * blockquote, or surrounded by other prose on the same line are NOT split — they
 * stay in the prose so the markdown block structure is preserved (P1-A).
 *
 * @param markdown raw final-answer markdown (may be empty/nullish)
 * @returns ordered Segment[]; empty array for empty input.
 */
export function splitIntoSegments(markdown: string | null | undefined): Segment[] {
  if (!markdown) return []

  const segments: Segment[] = []
  let proseBuffer: string[] = []

  const flushProse = (): void => {
    if (proseBuffer.length === 0) return
    const html = renderMarkdown(proseBuffer.join('\n'))
    proseBuffer = []
    // renderMarkdown of pure-whitespace prose is empty — don't emit a blank card-less gap.
    if (html) segments.push({ type: 'prose', html })
  }

  for (const line of markdown.split('\n')) {
    const ref = standaloneArtifactOf(line)
    if (ref) {
      flushProse()
      segments.push({ type: 'artifact', ref })
    } else {
      proseBuffer.push(line)
    }
  }
  flushProse()

  return segments
}

const isImageRef = (ref: ArtifactRef): boolean => ref.mime.startsWith('image/')

/**
 * Coalesce runs of consecutive image artifacts into `image-group` segments so the
 * view can lay them out as a responsive grid (#3 M1), while a lone image stays a
 * plain `artifact` (rendered as a single S2 card). Document order is preserved;
 * prose and non-image (document) artifacts are passed through untouched. Two images
 * separated only by blank lines stay adjacent (splitIntoSegments drops empty prose),
 * so they group; two images separated by real prose are in different groups.
 *
 * @param segments output of {@link splitIntoSegments}
 * @returns ordered RenderSegment[] ready to render
 */
export function groupAdjacentImages(segments: Segment[]): RenderSegment[] {
  const out: RenderSegment[] = []
  let run: ArtifactRef[] = []

  const flushRun = (): void => {
    if (run.length === 0) return
    // A single image renders as one S2 card; 2+ become a grid.
    if (run.length === 1) out.push({ type: 'artifact', ref: run[0] })
    else out.push({ type: 'image-group', refs: run })
    run = []
  }

  for (const seg of segments) {
    if (seg.type === 'artifact' && isImageRef(seg.ref)) {
      run.push(seg.ref)
    } else {
      flushRun()
      out.push(seg)
    }
  }
  flushRun()

  return out
}
