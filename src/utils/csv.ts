/**
 * CSV 导出工具 — 纯前端，零依赖。
 *
 * 设计目标：
 *  - RFC 4180 转义：字段含逗号 / 双引号 / 换行时用双引号包裹，内部双引号翻倍。
 *  - UTF-8 BOM：buildCsv 输出以 U+FEFF（BOM）开头，保证 Excel（Windows /
 *    macOS）正确识别 UTF-8 编码、中文不乱码。
 *  - CRLF 行分隔：遵循 RFC 4180，跨平台兼容性最佳。
 *  - downloadCsv：用 Blob + 临时 <a download> 触发浏览器下载，结束后 revoke
 *    object URL 释放内存。
 *
 * 典型用法：
 *   const csv = buildCsv(['列1', '列2'], rows.map((r) => [r.a, r.b]))
 *   downloadCsv('报表.csv', csv)
 */

/** CSV 单元格可接受的类型；转义前统一强制转字符串。 */
export type CsvCell = string | number | boolean | null | undefined

/**
 * 公式注入触发字符：单元格以 = + - @ TAB CR 开头时，Excel / Sheets / Calc 可能把
 * 它当公式（甚至 DDE 命令）执行（CSV / Formula Injection，OWASP CWE-1236）。
 * 本页导出的「子账号」来自用户可控昵称，必须中和。
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/

/**
 * 按 RFC 4180 转义单个字段，并中和公式注入。
 * - null / undefined → 空串
 * - 以公式触发字符开头 → 前置单引号，使其被当作纯文本（非表格工具中仍可读）
 * - 含 " , \r \n 之一 → 用双引号包裹，内部 " → ""
 */
export function escapeCsvField(value: CsvCell): string {
  let s = value == null ? '' : String(value)
  if (FORMULA_TRIGGER.test(s)) {
    s = `'${s}`
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * 组装 CSV 文本。
 * - 首部加 UTF-8 BOM（U+FEFF）保证 Excel 中文不乱码。
 * - 每个单元格经 escapeCsvField 转义。
 * - 行内用逗号分隔，行间用 CRLF（\r\n）。
 *
 * @param headers 表头
 * @param rows    数据行（每行单元格数应与 headers 等长，但不强制）
 */
export function buildCsv(headers: CsvCell[], rows: CsvCell[][]): string {
  const BOM = '\uFEFF'
  const escapeRow = (cells: CsvCell[]): string => cells.map(escapeCsvField).join(',')
  const lines = [escapeRow(headers), ...rows.map(escapeRow)]
  return BOM + lines.join('\r\n')
}

/**
 * 触发浏览器下载一个 CSV 文件。
 *
 * 用 Blob（text/csv;charset=utf-8）+ 临时 <a download> 点击，随后 revoke object
 * URL 释放内存。SSR / 无 document 环境下静默返回。
 *
 * @param filename 下载文件名（含 .csv 后缀）
 * @param content  CSV 文本（通常来自 buildCsv）
 */
export function downloadCsv(filename: string, content: string): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 延后一拍 revoke：a.click() 触发的下载在部分浏览器引擎是异步启动的，立即 revoke
  // 理论上可能让下载读不到 Blob。延迟释放规避该竞态（FileSaver 等库的成熟做法）。
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
