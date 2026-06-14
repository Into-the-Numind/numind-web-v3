// Maps an agent tool_name → a lucide icon component for the process timeline.
// One icon per tool TYPE (what kind of action it is). Run state (active/done/
// error) is conveyed separately by the line's leading icon (Loader2 / type icon /
// AlertCircle), not here.
import {
  Search,
  Globe,
  BookOpen,
  Image,
  FileCode,
  FileJson,
  FileSpreadsheet,
  FileText,
  BarChart3,
  BookMarked,
  Brain,
  Terminal,
  Calendar,
  Sparkles,
  Wrench,
  type LucideIcon
} from 'lucide-vue-next'

const TOOL_ICONS: Record<string, LucideIcon> = {
  web_search: Search,
  kb_search: BookOpen,
  web_fetch: Globe,
  image_gen: Image,
  analyze_image: Image,
  annotate_image: Image,
  create_html: FileCode,
  create_csv: FileSpreadsheet,
  create_json: FileJson,
  create_text: FileText,
  create_png_chart: BarChart3,
  document_generate: FileText,
  invoke_skill: FileText,
  run_python: Terminal,
  bash_exec: Terminal,
  load_skill: BookMarked,
  use_skill: BookMarked,
  read_skill: BookMarked,
  memory_read: Brain,
  memory_write: Brain,
  file_read: FileText,
  file_write: FileText,
  get_current_date: Calendar
}

/** Returns the type icon for a tool. SOP-bound tools (sop_*) get a Sparkles; any
 *  unmapped tool falls back to a generic Wrench. */
export function toolIcon(toolName: string): LucideIcon {
  if (TOOL_ICONS[toolName]) return TOOL_ICONS[toolName]
  if (toolName.startsWith('sop_')) return Sparkles
  return Wrench
}
