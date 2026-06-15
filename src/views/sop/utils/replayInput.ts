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

/** 有提取内容时，文件块以 `\n\n=== ` 起头拼接在用户文本之后 */
const FILE_BLOCK_MARKER = '\n\n=== '
/** 无法提取内容时，追加的文件提示段 */
const UPLOAD_NOTE_MARKER = '\n\n用户已上传以下文件：'

/**
 * 从合并后的节点 input 中剥离上传文件块，只返回用户输入的文本。
 *
 * @param input    sop_node_run.input（可能含合并进来的文件块）
 * @param hasFiles  该步是否确有上传文件（来自 files 数组长度）
 * @returns 用户文本（已 trim）。无文件时原样返回；文件块出现在最前（用户文本为空）时返回 ''。
 */
export function stripMergedFileBlocks(input: string, hasFiles: boolean): string {
  if (!hasFiles || !input) return input

  // 取两个 \n\n-前缀分隔符的最早出现位置
  let cut = -1
  for (const marker of [FILE_BLOCK_MARKER, UPLOAD_NOTE_MARKER]) {
    const idx = input.indexOf(marker)
    if (idx >= 0 && (cut < 0 || idx < cut)) cut = idx
  }
  if (cut >= 0) return input.slice(0, cut).trim()

  // 用户文本为空：input 直接以文件块 / 提示段开头
  if (input.startsWith('=== ') || input.startsWith('用户已上传以下文件：')) return ''

  // 有文件但无可识别块（防御）：保守全显，宁可多展示也不误删
  return input.trim()
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
