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

export interface ArtifactRef {
  filename: string
  url: string
  mime: string
}

export interface ExtractedArtifacts {
  prose: string
  artifacts: ArtifactRef[]
}

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

  const prose = markdown.replace(NODE_RE, (match, bang: string, _text: string, url: string) => {
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
      filename: filenameOf(url) || `artifact.${ext}`,
      url,
      mime
    })
    return '' // strip the node from the prose
  })

  return { prose, artifacts }
}
