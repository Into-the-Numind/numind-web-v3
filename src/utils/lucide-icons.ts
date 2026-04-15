// 项目实际使用的 lucide 图标白名单（47 个）
// 使用深度导入（deep imports）避免 barrel file 导致 Rollup 无法 tree-shake
//
// 维护规则：
//   1. 新增 data-lucide="xxx" 时，添加对应的 deep import 和 icons 对象条目
//   2. PascalCase key 必须与 lucide 官方 alias 一致（用于 replaceElement 的 toPascalCase 匹配）
//   3. 开发模式下调用 diagnoseMissingIcons() 检测白名单缺失的图标

// --- deep imports: 每个图标从独立 ESM 文件导入，避免引入整个 barrel ---
import AlertCircle from 'lucide/dist/esm/icons/circle-alert.js'
import ArrowDown from 'lucide/dist/esm/icons/arrow-down.js'
import ArrowLeft from 'lucide/dist/esm/icons/arrow-left.js'
import ArrowUp from 'lucide/dist/esm/icons/arrow-up.js'
import BookOpen from 'lucide/dist/esm/icons/book-open.js'
import Bookmark from 'lucide/dist/esm/icons/bookmark.js'
import BookmarkCheck from 'lucide/dist/esm/icons/bookmark-check.js'
import Bot from 'lucide/dist/esm/icons/bot.js'
import Brain from 'lucide/dist/esm/icons/brain.js'
import Check from 'lucide/dist/esm/icons/check.js'
import CheckCircle from 'lucide/dist/esm/icons/circle-check-big.js'
import ChevronDown from 'lucide/dist/esm/icons/chevron-down.js'
import Compass from 'lucide/dist/esm/icons/compass.js'
import Copy from 'lucide/dist/esm/icons/copy.js'
import Edit3 from 'lucide/dist/esm/icons/pen-line.js'
import File from 'lucide/dist/esm/icons/file.js'
import FilePlus from 'lucide/dist/esm/icons/file-plus.js'
import FileText from 'lucide/dist/esm/icons/file-text.js'
import FileType2 from 'lucide/dist/esm/icons/file-type-corner.js'
import HardDrive from 'lucide/dist/esm/icons/hard-drive.js'
import HelpCircle from 'lucide/dist/esm/icons/circle-question-mark.js'
import Home from 'lucide/dist/esm/icons/house.js'
import Image from 'lucide/dist/esm/icons/image.js'
import Inbox from 'lucide/dist/esm/icons/inbox.js'
import Info from 'lucide/dist/esm/icons/info.js'
import Layers from 'lucide/dist/esm/icons/layers.js'
import Library from 'lucide/dist/esm/icons/library.js'
import Loader2 from 'lucide/dist/esm/icons/loader-circle.js'
import Maximize2 from 'lucide/dist/esm/icons/maximize-2.js'
import Menu from 'lucide/dist/esm/icons/menu.js'
import MessageCircle from 'lucide/dist/esm/icons/message-circle.js'
import MessageSquare from 'lucide/dist/esm/icons/message-square.js'
import Minimize2 from 'lucide/dist/esm/icons/minimize-2.js'
import MoreVertical from 'lucide/dist/esm/icons/ellipsis-vertical.js'
import Pencil from 'lucide/dist/esm/icons/pencil.js'
import Pin from 'lucide/dist/esm/icons/pin.js'
import PinOff from 'lucide/dist/esm/icons/pin-off.js'
import Plus from 'lucide/dist/esm/icons/plus.js'
import Presentation from 'lucide/dist/esm/icons/presentation.js'
import RotateCcw from 'lucide/dist/esm/icons/rotate-ccw.js'
import Scale from 'lucide/dist/esm/icons/scale.js'
import Sheet from 'lucide/dist/esm/icons/sheet.js'
import Trash2 from 'lucide/dist/esm/icons/trash-2.js'
import Upload from 'lucide/dist/esm/icons/upload.js'
import User from 'lucide/dist/esm/icons/user.js'
import X from 'lucide/dist/esm/icons/x.js'
import XCircle from 'lucide/dist/esm/icons/circle-x.js'

import replaceElement from 'lucide/dist/esm/replaceElement.js'

type IconNode = [tag: string, attrs: Record<string, string | number | undefined>][]

export const icons: Record<string, IconNode> = {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Bot,
  Brain,
  Check,
  CheckCircle,
  ChevronDown,
  Compass,
  Copy,
  Edit3,
  File,
  FilePlus,
  FileText,
  FileType2,
  HardDrive,
  HelpCircle,
  Home,
  Image,
  Inbox,
  Info,
  Layers,
  Library,
  Loader2,
  Maximize2,
  Menu,
  MessageCircle,
  MessageSquare,
  Minimize2,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Presentation,
  RotateCcw,
  Scale,
  Sheet,
  Trash2,
  Upload,
  User,
  X,
  XCircle
}

/**
 * 扫描 DOM 中的 [data-lucide] 元素并替换为 SVG 图标。
 * 功能等同于 lucide 官方 createIcons()，但不依赖 barrel 导入。
 */
export function createIcons({
  icons: iconSet = icons,
  nameAttr = 'data-lucide',
  attrs = {},
  root = document
}: {
  icons?: Record<string, IconNode>
  nameAttr?: string
  attrs?: Record<string, string>
  root?: Document | DocumentFragment
} = {}) {
  if (!Object.values(iconSet).length) {
    throw new Error(
      'Please provide an icons object.\n' +
        "Import it like: import { icons } from '@/utils/lucide-icons'"
    )
  }
  const elements = Array.from(root.querySelectorAll(`[${nameAttr}]`))
  elements.forEach((element) =>
    replaceElement(element as Element, { nameAttr, icons: iconSet, attrs })
  )
}

/**
 * DEV 模式诊断：检测 DOM 中 data-lucide 图标未被白名单覆盖的情况。
 * 应在 createIcons() 之后调用。
 */
export function diagnoseMissingIcons() {
  if (!import.meta.env.DEV) return
  document.querySelectorAll<HTMLElement>('[data-lucide]').forEach((el) => {
    if (!el.querySelector('svg')) {
      const name = el.getAttribute('data-lucide')
      console.error(
        `[lucide-whitelist] 图标 "${name}" 未在白名单中，请添加到 src/utils/lucide-icons.ts`
      )
    }
  })
}
