// Frontmatter ↔ Form 双向同步 composable
//
// 算法（与 spec §3.3 后端 Parse 对齐）：
//   1. 仅识别**首行** `---`（trim 后）作为 frontmatter 起始
//   2. 找到首行 `---` 后向下找下一个独占一行的 `---` 作为结束
//   3. 中间用 yaml.load 解析；结束行之后是 body_md
//   4. 若首行非 `---`：整篇都是 body_md，frontmatter 为零值
//   5. yaml 解析失败：返回 error，service 层 fallback 保留 raw
//
// agent-mode-v2-skill-as-artifact (S4 T11)
// Refs: docs/superpowers/specs/2026-05-24-agent-mode-v2-skill-as-artifact-design.md §3.3, §5.3, ADR-11

import yaml from 'js-yaml'
import type { Frontmatter, ParsedFrontmatter } from '@/types/skill'

/**
 * 解析 markdown 文本中的 YAML frontmatter
 *
 * 容错策略：
 *   - 无 frontmatter → frontmatter 全空、body 为整篇
 *   - YAML 语法错误 → ok=false + error message + frontmatter 全空 + body 保留 raw
 *   - frontmatter 不是 object（如 yaml 解析成 array） → 视为 ok=false
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const empty: Frontmatter = { name: '', description: '', when_to_use: '', allowed_tools: [] }
  if (!content) {
    return { ok: true, frontmatter: { ...empty }, body: '' }
  }

  // 拆行（保留各行原文，便于后续重组 body）
  const lines = content.split('\n')
  if (lines.length === 0 || lines[0].trim() !== '---') {
    return { ok: true, frontmatter: { ...empty }, body: content }
  }

  // 找下一个独占一行的 `---`（i >= 1）
  let endIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      endIdx = i
      break
    }
  }
  if (endIdx === -1) {
    // 没有结束分隔符 — 把首行 `---` 当 markdown ruler 处理，整篇是 body
    return { ok: true, frontmatter: { ...empty }, body: content }
  }

  const yamlText = lines.slice(1, endIdx).join('\n')
  const bodyMd = lines.slice(endIdx + 1).join('\n')

  let parsed: unknown
  try {
    parsed = yaml.load(yamlText) ?? {}
  } catch (e) {
    return {
      ok: false,
      frontmatter: { ...empty },
      body: content,
      error: `frontmatter YAML 解析失败: ${(e as Error).message}`
    }
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      frontmatter: { ...empty },
      body: content,
      error: 'frontmatter 必须是 YAML object（key: value 形式）'
    }
  }

  const fmRaw = parsed as Record<string, unknown>
  const fm: Frontmatter = {
    name: typeof fmRaw.name === 'string' ? fmRaw.name : '',
    description: typeof fmRaw.description === 'string' ? fmRaw.description : '',
    when_to_use: typeof fmRaw.when_to_use === 'string' ? fmRaw.when_to_use : '',
    allowed_tools: Array.isArray(fmRaw.allowed_tools)
      ? (fmRaw.allowed_tools.filter((t): t is string => typeof t === 'string') as string[])
      : []
  }

  return { ok: true, frontmatter: fm, body: bodyMd }
}

/**
 * 反向序列化：根据表单字段 + body 生成完整 markdown（带 frontmatter）
 *
 * 规则：
 *   - 全空字段（包括 allowed_tools 空数组）→ 不写 frontmatter（输出 = body 原样）
 *   - 至少一个字段非空 → 写完整 frontmatter，省略空字段
 */
export function serializeFrontmatter(fm: Frontmatter, body: string): string {
  const obj: Record<string, unknown> = {}
  if (fm.name) obj.name = fm.name
  if (fm.description) obj.description = fm.description
  if (fm.when_to_use) obj.when_to_use = fm.when_to_use
  if (fm.allowed_tools && fm.allowed_tools.length > 0) obj.allowed_tools = fm.allowed_tools

  if (Object.keys(obj).length === 0) {
    return body
  }

  // js-yaml dump 使用 flow level -1 保持 block 风格，与人工编辑习惯一致
  const yamlStr = yaml.dump(obj, { lineWidth: -1, noRefs: true, sortKeys: false }).trimEnd()
  return `---\n${yamlStr}\n---\n\n${body.replace(/^\n+/, '')}`
}

/**
 * 比较两个 Frontmatter 是否字段层面相等（用于循环触发判断）
 */
export function frontmatterEqual(a: Frontmatter, b: Frontmatter): boolean {
  if ((a.name || '') !== (b.name || '')) return false
  if ((a.description || '') !== (b.description || '')) return false
  if ((a.when_to_use || '') !== (b.when_to_use || '')) return false
  const ta = a.allowed_tools || []
  const tb = b.allowed_tools || []
  if (ta.length !== tb.length) return false
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] !== tb[i]) return false
  }
  return true
}
