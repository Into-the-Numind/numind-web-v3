/**
 * markdown.ts — 安全的 Markdown 渲染工具
 *
 * 封装 marked + highlight.js + DOMPurify 的纯函数接口。
 *
 * ## 为什么是纯函数（不是 composable）
 *
 * StepOutput / ChatBubble 在流式输出时会在**每一次**内容更新时调用 render，
 * 频率很高。纯函数：
 *   - 无 composable 状态管理开销
 *   - 无 setup() 生命周期绑定
 *   - 可在任何地方直接 import 使用（utils、组件、composables）
 *
 * ## 已有的 useMarkdown composable
 *
 * 项目中已有 `src/composables/useMarkdown.ts` 提供相同功能但用 composable
 * 形式包装。为了**不破坏现有 sales 视图调用**（BriefingDetail.vue 等），
 * 保留那个文件不动。本文件作为 SOP 运行页 Vue 重写的新工具入口。
 *
 * 未来可以把 useMarkdown 改为 re-export 本文件的函数（不在本 task 范围）。
 *
 * ## 安全保证
 *
 * - **DOMPurify** 消除 XSS 向量：删除 <script>、内联事件（onclick=）、
 *   javascript: 协议链接等
 * - highlight.js 仅用于代码块着色，不会执行任何代码
 * - marked 的 `breaks: true` 让 `\n` 转 `<br>`，符合流式输出的视觉预期
 *
 * ## 使用
 *
 * ```ts
 * import { renderMarkdown, stripCodeFence } from '@/utils/markdown'
 *
 * const html = renderMarkdown(streamingContent.value)
 * // 绑到 v-html
 *
 * const clean = stripCodeFence('```markdown\n# Title\n```')
 * // → '# Title'
 * ```
 */
import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

/**
 * 延迟初始化 marked + hljs，只执行一次。
 *
 * 不在模块 top-level 直接调用 marked.setOptions，是为了：
 *   - vitest 环境下 jsdom 初始化顺序友好
 *   - 避免"import 即副作用"
 */
let configured = false
function ensureConfigured(): void {
  if (configured) return
  configured = true

  marked.setOptions({
    gfm: true, // GitHub Flavored Markdown（表格、删除线、任务列表等）
    breaks: true, // 单个换行也渲染为 <br>
    async: false, // 同步解析（本工具要求同步返回）
    pedantic: false
  })

  marked.use({
    renderer: {
      code({ text, lang }: { text: string; lang?: string }) {
        // hljs.getLanguage 验证 lang，不在白名单则降级到 plaintext
        const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
        const highlighted = hljs.highlight(text, { language }).value
        // language 经过 hljs.getLanguage 验证，可安全插入 class 属性
        return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
      }
    }
  })
}

/**
 * 把 Markdown 文本渲染为**安全的** HTML 字符串。
 *
 * 空字符串 / null / undefined 会返回空字符串，便于流式输出的"首 tick 无内容"
 * 场景直接绑定 v-html 而不用额外判空。
 *
 * @param content Markdown 源文本
 * @returns 经过 DOMPurify 清洗的安全 HTML
 */
export function renderMarkdown(content: string | null | undefined): string {
  if (!content) return ''
  ensureConfigured()
  const raw = marked.parse(content) as string
  return DOMPurify.sanitize(raw)
}

/**
 * 剥离被三反引号包裹的 markdown 代码块，常见于 LLM 输出。
 *
 * 例如 LLM 有时会返回：
 *
 * ```markdown
 * # 标题
 * 正文
 * ```
 *
 * 此时直接渲染会显示代码块而非实际内容。本函数剥离外层 `` ```markdown `` 和
 * 末尾的 `` ``` ``，保留中间内容。
 *
 * 仅处理 `` ```markdown `` 和 `` ``` `` 两种前缀。如果只有末尾的 `` ``` ``
 * 但无开头围栏，不做修改（避免误伤正常的代码块）。
 *
 * @param raw 原始 LLM 输出
 * @returns 剥离围栏后的文本（trim 过）
 */
export function stripCodeFence(raw: string | null | undefined): string {
  if (!raw) return ''
  let content = raw.trim()

  // 只有当开头是围栏时才剥离，否则不动
  const hasMarkdownFence = content.startsWith('```markdown')
  const hasPlainFence = !hasMarkdownFence && content.startsWith('```')

  if (!hasMarkdownFence && !hasPlainFence) {
    return content
  }

  if (hasMarkdownFence) {
    content = content.slice('```markdown'.length)
  } else {
    content = content.slice(3)
  }

  // 剥离末尾围栏（如有）
  if (content.endsWith('```')) {
    content = content.slice(0, -3)
  }

  return content.trim()
}
