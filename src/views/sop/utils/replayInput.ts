/**
 * 回看输入卡纯函数工具集。
 *
 * 背景：执行 SOP 节点时，后端把上传文件的提取文本以
 *   `<用户文本>\n\n=== <文件名> ===\n<提取内容>`（每文件，有内容时）
 * 或
 *   `<用户文本>\n\n用户已上传以下文件：...`（无法提取内容时）
 * 的方式合并进 sop_node_run.input（controller/v1/sop/sop.go:730-746）。用户纯文本未单独
 * 持久化。回看时若整块渲染会把文件提取文本和用户文本混在一起、且与文件卡内容重复。
 *
 * 这里用「结构分隔符」剥离，不依赖文件名匹配（合并 marker 用原始名、DB file_name 可能 sanitize
 * 后不同），且仅在该步确有上传文件时才剥离，避免误伤纯文本步骤里恰好含 `=== ` 的内容。
 */
import type { SopReplayFile } from '@/views/sop/types'

/** 无法提取内容时后端追加的提示段（老格式），按整段尾部剥掉 */
const UPLOAD_NOTE_RE = /用户已上传以下文件：[\s\S]*$/

/**
 * 从合并后的节点 input 中剥离上传文件内容，只返回用户真正输入的文本。
 *
 * 为什么按「内容」而非「分隔符」剥离：input 的合成格式有两种且都不可靠地用 marker 区分——
 *   - 新流程（前端 compose）：`<用户文本>\n\n<文件提取内容>`，**没有** `=== 文件名 ===` 标记
 *   - 老流程（后端 multipart 合并）：`<用户文本>\n\n=== <文件名> ===\n<文件提取内容>`
 * 而每个文件的 `content`（提取文本）我们手上就有，直接从 input 里精确移除最稳妥；同时移除老格式
 * 的 `=== 文件名 ===` 标记行。input 可能是 CRLF、content 多为 LF，先统一成 LF 再比对。
 *
 * @param input  sop_node_run.input（可能含合并进来的文件内容）
 * @param files  该步上传的文件（用其 file_name / content 精确移除）
 * @returns 用户文本（已 trim）。无文件→原样返回；用户没输入文字→''。
 */
export function stripMergedFileBlocks(
  input: string,
  files: ReadonlyArray<Pick<SopReplayFile, 'file_name' | 'content'>> = []
): string {
  if (files.length === 0) return input // 无文件：绝不剥离（避免误伤含 === 的用户文本）
  if (!input) return ''

  let result = input.replace(/\r\n/g, '\n') // 统一换行，便于与 content 精确比对
  // 先去掉老后端格式的 `=== 文件名 ===` 标记行
  for (const f of files) {
    if (f.file_name) result = result.split(`=== ${f.file_name} ===`).join('')
  }
  // 按文件内容移除，但**锚定**在拼接位置，避免误删用户文本中恰好同名的子串：
  //   - 拼接块 = `\n\n<内容>`（compose/合并都用双换行分隔）→ 整块移除
  //   - file-only（用户没输入文字）→ 剩余整体即文件内容 → 清空
  for (const f of files) {
    const content = (f.content ?? '').replace(/\r\n/g, '\n').trim()
    if (!content) continue
    result = result.split('\n\n' + content).join('')
    if (result.trim() === content) result = ''
  }
  result = result.replace(UPLOAD_NOTE_RE, '') // 老的无内容提示段
  return result.replace(/\n{3,}/g, '\n\n').trim() // 收敛多余空行
}

/** 人类可读文件大小：<1KB→B，<1MB→KB（整数），否则 MB（一位小数）。非法输入返回 ''。 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'])

function normalizeExt(ext: string): string {
  let e = ext.toLowerCase().trim()
  if (e && !e.startsWith('.')) e = `.${e}`
  return e
}

/**
 * 判断回看文件是否为可内联渲染的图片（决定缩略图 vs 文件卡）。
 * 优先看 MIME `image/` 前缀，其次回退扩展名（file_ext 或从 file_name 推断）。
 */
export function isImageFile(
  file: Pick<SopReplayFile, 'file_type' | 'file_ext' | 'file_name'>
): boolean {
  if (file.file_type && file.file_type.startsWith('image/')) return true
  let ext = file.file_ext ?? ''
  if (!ext && file.file_name) {
    const dot = file.file_name.lastIndexOf('.')
    if (dot >= 0) ext = file.file_name.slice(dot)
  }
  return IMAGE_EXTS.has(normalizeExt(ext))
}
