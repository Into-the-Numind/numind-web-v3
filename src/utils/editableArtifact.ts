// 判定 agent 产物是否支持 v1 在线编辑（document-system）。
// 与后端 biz/document/objectkey.go IsEditableMime 保持一致：仅文本类可编。

const EDITABLE_EXTS = ['.md', '.markdown', '.txt', '.html', '.htm', '.docx']

const EDITABLE_MIMES = [
  'text/markdown',
  'text/plain',
  'text/html',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]

// isEditable 文本类（md/txt/html/docx）→ true；图表PNG/CSV/Excel/PPT/PDF → false。
export function isEditable(mime?: string, filename?: string): boolean {
  if (mime) {
    const base = mime.split(';')[0].trim().toLowerCase()
    if (EDITABLE_MIMES.includes(base)) {
      return true
    }
  }
  if (filename) {
    const lower = filename.toLowerCase()
    return EDITABLE_EXTS.some((ext) => lower.endsWith(ext))
  }
  return false
}

// isDocumentSystemEnabled feature flag —— 'true' 时显示"打开编辑"入口。
// prod 构建默认不设该变量 → 整个入口不渲染。
export function isDocumentSystemEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_DOCUMENT_SYSTEM === 'true'
}
