import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'

// Configure marked once
let configured = false

function ensureConfigured() {
  if (configured) return
  configured = true

  marked.setOptions({
    gfm: true,
    breaks: true,
    async: false,
    pedantic: false
  })

  marked.use({
    renderer: {
      code({ text, lang }: { text: string; lang?: string }) {
        const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
        const highlighted = hljs.highlight(text, { language }).value
        // language is validated by hljs.getLanguage, safe for class attr
        return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
      }
    }
  })
}

export function useMarkdown() {
  ensureConfigured()

  function render(markdown: string): string {
    if (!markdown) return ''
    const raw = marked.parse(markdown) as string
    return DOMPurify.sanitize(raw)
  }

  function cleanContent(raw: string): string {
    if (!raw) return ''
    let content = raw.trim()
    // Remove ```markdown wrapper if present
    if (content.startsWith('```markdown')) {
      content = content.slice('```markdown'.length)
    }
    if (content.startsWith('```')) {
      content = content.slice(3)
    }
    if (content.endsWith('```')) {
      content = content.slice(0, -3)
    }
    return content.trim()
  }

  return { render, cleanContent }
}
