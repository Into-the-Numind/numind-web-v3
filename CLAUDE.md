# numind-web-v3 — L1 仓库级约束

> 此文件在 Claude Code 操作本仓库文件时自动加载。

---

## §1 技术栈声明

- **框架**: Vue 3.4 / TypeScript 5.4 / Vite 5
- **状态管理**: Pinia 2
- **路由**: Vue Router 4
- **HTTP**: Axios（封装于 `src/api/request.ts`）
- **图标**: Lucide Vue Next（`lucide-vue-next`）
- **工具库**: @vueuse/core, marked, highlight.js, DOMPurify, qrcode
- **UI**: 自研组件体系，不使用任何外部 UI 框架（如 Element Plus、Ant Design Vue 等）
- **设计语言**: 见根目录 `DESIGN.md`（v3 是 master 品牌）+ `.impeccable.md`（品牌叙事）

---

## §2 组件与架构规则

- 必须使用 `<script setup lang="ts">` + Composition API
- 状态管理统一用 Pinia store（`src/stores/`）
- HTTP 请求统一用 `src/api/request.ts` 导出的 axios 实例，禁止直接 `import axios`
- 新建组件前**优先复用**已有公共组件

### 公共组件清单

| 分类 | 组件 |
|------|------|
| Common | `AppButton`, `AppInput`, `InsufficientCreditsDialog`, `ConfirmModal`, `AppNotification` |
| Layout | `MainLayout`, `AppSidebar` |
| Sales | `ChatArea`, `ChatMessage`, `CitationModal`, `DeleteSessionModal`, `GlobalLoadingStatus`, `ImagePreviewModal`, `ImagePreviewStrip`, `InputArea`, `KbTagStrip`, `MainHeader`, `NewChatModal`, `RenameSessionModal`, `SalesStageDropdown`, `ScrollToBottomBtn`, `SessionSidebar`, `ThinkingBlock`, `WelcomeScreen` |
| Modals | `ChatStyleModal`, `KbModal`, `ProfileModal` |

---

## §3 编码规范

- TypeScript **严格模式**，不允许 `any` 逃逸
- Props 必须用 `defineProps<T>()` 定义类型
- 事件 emit 必须用 `defineEmits<T>()` 声明
- 不要在代码中硬编码 API 密钥、Token 等敏感信息
- CSS 优先使用 `<style scoped>`，避免全局样式污染

---

## §4 开发命令

```bash
npm run dev          # 本地开发服务器
npm run lint         # ESLint 检查（含 --fix 自动修复）
npm run type-check   # TypeScript 类型检查（vue-tsc）
npm run build        # 生产构建（含类型检查）
npm run test:e2e     # Playwright E2E 测试
npm run format       # Prettier 格式化
```

修改代码后必须运行 `npm run lint && npm run type-check` 通过后才能提交。

---

## §5 项目结构速查

```
src/
├── api/            # API 请求层（axios 实例 + 接口定义）
├── components/
│   ├── common/     # 通用公共组件
│   ├── layout/     # 布局组件
│   └── sales/      # 销售模块组件（含 modals/ 子目录）
├── composables/    # 组合式函数（useXxx）
├── modules/        # 业务模块
├── router/         # 路由配置
├── shared/         # 共享常量与工具
├── stores/         # Pinia 状态管理
├── types/          # TypeScript 类型定义
├── utils/          # 工具函数
└── views/          # 页面视图
e2e/                # Playwright E2E 测试
```

---

## §6 前端 Debug 方法论

遇到前端 UI bug 时，**禁止直接读代码做静态推理**。必须按以下流程操作：

1. **观测** — 用 Playwright 脚本获取运行时数据（DOM 状态、网络请求、Store 快照）
2. **定位** — 根据运行时数据判断问题出在哪一层（视图 / Store / API / 后端）
3. **修复** — 针对性修改，避免盲改

工具：`e2e/helpers/diagnose.ts`（`createDiagnostics`）
模板和 API 详见 `Claude Code/infra-guide.md` 第 11 节。
