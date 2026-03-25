# 莫小派前端重构计划

> 将原有 HTML/CSS/JS 项目迁移至 Vue 3 + Vite + TypeScript 技术栈

---

## 项目背景

### 现有系统
- **技术栈**: 纯 HTML + CSS + JavaScript
- **部署方式**: Docker + Nginx
- **访问地址**: https://youshu.asia
- **容器端口**: 9202 (旧系统)

### 新系统目标
- **技术栈**: Vue 3 + Vite + TypeScript + Pinia
- **部署方式**: Docker + Nginx
- **访问地址**: https://youshu.asia
- **容器端口**: 9202

---

## 架构设计

### 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                     用户访问层                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   numind-web-v3 (端口 9202)                                  │
│   ┌─────────────────┐                                        │
│   │ numind-web-v3   │                                        │
│   │ (Vue 3 + TS)    │                                        │
│   │ youshu.asia     │                                        │
│   └─────────────────┘                                        │
│                                                              │
│   后端 API: https://youshu.asia                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 分支策略

| 分支 | 环境 | 服务器 | 端口 | 镜像标签 |
|------|------|--------|------|----------|
| `develop` | 开发 | 49.233.219.254 | 9200 | `develop` |
| `release` | 测试 | 49.233.219.254 | 9201 | `release` |
| `main` | 生产 | 129.28.125.51 | 9202 | `latest` |

---

## 重构阶段计划

### Phase 0: 基础架构 ✅
**目标**: 搭建 Vue 3 项目框架

- [x] 初始化 Vue 3 + Vite + TypeScript 项目
- [x] 配置 Pinia 状态管理
- [x] 创建基础组件 (AppButton, AppInput)
- [x] 迁移 CSS 变量系统
- [x] 创建 GitHub 仓库
- [x] 配置 CI/CD 基础流程

**验收标准**: 项目可在本地运行，成功构建 Docker 镜像

---

### Phase 1: CI/CD 配置 ✅
**目标**: 实现自动化部署

- [x] 配置 GitHub Actions 工作流
- [x] 实现多环境部署 (Dev/QA/Prod)
- [x] 配置 Docker Hub 自动推送
- [x] 配置服务器自动部署脚本
- [x] 配置 ESLint 代码检查

**验收标准**: 代码推送到分支后自动部署到对应环境

---

### Phase 2: 后端清理 ✅
**目标**: 移除不再使用的 WeCom 功能

- [x] 禁用 wecom-agent 服务
- [x] 删除 WeCom 相关代码文件
- [x] 创建数据库清理脚本
- [x] 更新 CI/CD 移除 wecom-agent 构建步骤

**验收标准**: 后端服务正常运行，WeCom 代码完全移除

---

### Phase 3: 部署验证 ✅
**目标**: 确保新系统可正常访问

- [x] 验证容器在服务器运行正常
- [x] 配置腾讯云防火墙放行端口
- [x] 验证独立端口访问 (9200/9201/9202)
- [x] 修复 Nginx 配置问题

**验收标准**: http://49.233.219.254:9200 可正常访问

---

### Phase 4: 核心页面迁移 ✅
**目标**: 实现登录和首页功能

- [x] 完善登录页面 (UI + API 对接)
- [x] 创建 Dashboard 工作台首页
- [x] 创建布局组件 (Sidebar, MainLayout)
- [x] 实现路由守卫和权限控制
- [x] 配置多环境 API 地址

**验收标准**: 
- 可使用正式账号登录
- Dashboard 显示正常
- 侧边栏导航可用

---

### Phase 5: 销售智能体迁移 ⏳
**目标**: 迁移核心销售功能

- [x] 分析 sales-agent.html 功能结构
- [x] 设计 Vue 组件拆分方案
  - [x] ChatMessage 组件
  - [x] CustomerInfo 组件
  - [x] SOPSelector 组件
  - [x] QuickReply 组件
- [x] 创建 `/sales` 独立页面并替换占位路由
- [x] 迁移原版页面结构（`sales-agent.html`）到 Vue 容器
- [x] 移除 `innerHTML` 壳注入，改为 `SalesView.vue` 直接承载原版 DOM 结构
- [x] 迁移原版样式（`sales-agent.css`）到 v3 运行环境
- [x] 对接销售智能体 API（legacy 交互全链路接入：会话 CRUD、消息加载、SSE 聊天）
- [x] 实现 SSE 实时消息（legacy SSE 逻辑对齐：status/verdict/thinking/token/error/done 全事件处理）
- [x] 实现客户信息管理（客户档案弹窗、知识库选择、语言风格分析全流程接入）
- [x] 修复 marked v17 代码高亮兼容（通过 `marked.use({ renderer })` 集成 highlight.js）
- [x] 修复事件监听器泄漏（`closeAllSessionMenus` 从 renderSessions 移至一次性初始化）
- [x] 添加 unmount 清理机制（`__salesAgentLegacyCleanup` 移除 document 监听、重置状态）
- [x] 全链路回归验证（41 个 E2E 测试全部通过）

**验收标准**: 可在新系统完成完整的销售对话流程 ✅

---

### Phase 6: SOP 管理迁移 ✅
**目标**: 迁移 SOP 执行页 + 运行记录列表页

- [x] 分析 sop-detail.html 功能结构
- [x] 提取 Legacy CSS/JS，创建 SOPView.vue（1:1 DOM 迁移）
- [x] 创建 SOPHistoryView.vue（运行记录列表，原生 Vue）
- [x] 路由拆分：`/sop` → 列表页，`/sop/run` → 执行页
- [x] 创建 src/api/sop.ts（4 个 API 端点）
- [x] E2E 测试全部通过

**验收标准**: 可查看运行记录列表、进入 SOP 执行页完成工作流 ✅

---

### ~~Phase 7: 微信存档迁移~~ (已取消)
> 微信存档功能不再需要，相关路由和侧栏入口已删除。

---

### Phase 8: 系统设置迁移 ✅
**目标**: 迁移系统配置功能

- [x] 分析 settings-preview.html 功能（两栏布局：个人资料 + 用量统计）
- [x] 创建设置页面（`SettingsView.vue`，原生 Vue 组件）
- [x] 对接用户信息 API（`GET /v1/web/user/info`，复用 `auth.ts` 的 `getUserInfo`）
- [x] 实现个人资料展示（昵称、ID、等级徽章、会员有效期、退出登录）
- [x] 实现用量统计展示（剩余次数、本月已用、进度条）
- [x] 实现等级差异化样式（free/standard/premium 三级样式）
- [x] 更新路由（`/settings` → `SettingsView.vue`）
- [x] 跳过微信绑定功能（Phase 7 已取消）

**验收标准**: 可查看个人信息、用量统计，支持退出登录 ✅

---

### Phase 8.5: 知识库管理 + 客户管理 ✅
**目标**: 补全旧系统的「知识库管理」和「客户管理」两个页面

- [x] 创建 API 模块（`src/api/knowledge.ts` 6 端点 + `src/api/customers.ts` 8 端点）
- [x] 创建知识库管理页面（`KnowledgeView.vue`：文档列表/详情/切片、上传、删除、状态轮询）
- [x] 创建客户管理页面（`CustomersView.vue`：统计卡片、子用户表格、注册、权限管理、批量操作）
- [x] 更新侧栏（`AppSidebar.vue`：`menuItems` 改为 computed，客户管理按 `parent_user_id` 条件显示）
- [x] 更新路由（`router/index.ts`：新增 `/customers`、`/knowledge` 路由，`/customers` 增加父用户守卫）
- [x] `npm run lint && npm run type-check && npm run build` 全部通过

**验收标准**: 侧栏显示完整菜单，知识库/客户管理页面可正常交互，子用户无法看到客户管理 ✅

---

### Phase 9: 生产切换 ⏳
**目标**: 新系统正式上线

- [ ] 功能回归测试
- [ ] 性能测试
- [ ] 用户验收测试
- [ ] 更新 DNS 或 Nginx 配置
- [ ] 旧系统下线

**验收标准**: youshu.asia 指向新系统，旧系统停止服务

---

## 技术规范

### 代码规范

```bash
# 运行代码检查
npm run lint

# 自动修复
npm run lint -- --fix
```

### 提交规范

```
feat: 新功能
fix: 修复
style: 样式调整
refactor: 重构
docs: 文档
chore: 构建/工具
```

### 组件命名

- 单文件组件: `PascalCase.vue`
- 基础组件: `AppXXX.vue` (如 AppButton.vue)
- 布局组件: `AppXXX.vue` (如 AppSidebar.vue)
- 页面组件: `XXXView.vue` (如 HomeView.vue)

---

## 环境配置

### 开发环境

```bash
# 本地开发
npm install
npm run dev

# 访问 http://localhost:5173
```

### API 配置

| 环境 | API 地址 | 配置文件 |
|------|----------|----------|
| 开发 | https://youshu.asia/dev | .env.development |
| 测试 | https://youshu.asia/dev | .env.development |
| 生产 | https://youshu.asia/dev | .env.production |

---

## 部署检查清单

### 首次部署

- [ ] 服务器开放对应端口 (9200/9201/9202)
- [ ] 腾讯云防火墙放行端口
- [ ] Docker 网络配置正确
- [ ] 环境变量配置正确

### 常规更新

- [ ] 代码提交到正确分支
- [ ] CI/CD 构建成功
- [ ] 容器正常启动
- [ ] 页面可正常访问

---

## 风险与应对

| 风险 | 可能性 | 影响 | 应对措施 |
|------|--------|------|----------|
| 功能缺失 | 中 | 高 | 新旧系统并行运行，逐步迁移 |
| 性能问题 | 低 | 中 | 充分测试，预留优化时间 |
| 数据不兼容 | 低 | 高 | API 保持向后兼容 |
| 用户不适应 | 中 | 低 | 保持 UI 一致性，提供培训 |

---

## 附录

### 相关链接

- GitHub 仓库: https://github.com/Into-the-Numind/numind-web-v3
- Docker Hub: https://hub.docker.com/r/neozhang96/numind-web-v3
- 开发环境: http://49.233.219.254:9200
- 测试环境: http://49.233.219.254:9201
- 生产环境: http://youshu.asia

### 维护人员

- 前端开发: [待填写]
- 后端支持: [待填写]
- 运维部署: [待填写]
