# 前端重构进度追踪

> 最后更新: 2026-02-20

---

## 总体进度

```
Phase 0: 基础架构    [████████████████████] 100% ✅
Phase 1: CI/CD 配置  [████████████████████] 100% ✅
Phase 2: 后端清理    [████████████████████] 100% ✅
Phase 3: 部署验证    [████████████████████] 100% ✅
Phase 4: 核心页面    [████████████████████] 100% ✅
Phase 5: 销售智能体  [███████░░░░░░░░░░░░░] 35% ⏳
Phase 6: SOP 管理    [░░░░░░░░░░░░░░░░░░░░] 0% ⏳
Phase 7: 微信存档    [░░░░░░░░░░░░░░░░░░░░] 0% ⏳
Phase 8: 系统设置    [░░░░░░░░░░░░░░░░░░░░] 0% ⏳
Phase 9: 生产切换    [░░░░░░░░░░░░░░░░░░░░] 0% ⏳
```

**总体完成度: 56% (Phase 5 持续推进中)**

---

## ✅ 已完成事项

### Phase 0: 基础架构 (2026-01-XX)

| 任务 | 状态 | 备注 |
|------|------|------|
| 初始化 Vue 3 + Vite + TS 项目 | ✅ | 使用官方 create-vue |
| 配置 Pinia 状态管理 | ✅ | 替代 Vuex |
| 创建基础组件 AppButton | ✅ | 支持多种变体 |
| 创建基础组件 AppInput | ✅ | 支持表单验证 |
| 迁移 CSS 变量系统 | ✅ | 从 ui.css 迁移 |
| 创建 GitHub 仓库 | ✅ | https://github.com/Into-the-Numind/numind-web-v3 |

**关键提交**: `initial commit`

---

### Phase 1: CI/CD 配置 (2026-01-XX)

| 任务 | 状态 | 备注 |
|------|------|------|
| GitHub Actions 工作流 | ✅ | .github/workflows/ci-cd.yml |
| Docker 多阶段构建 | ✅ | 使用 Buildx 缓存 |
| 多环境部署 (Dev/QA/Prod) | ✅ | 根据分支自动选择环境 |
| Docker Hub 自动推送 | ✅ | neozhang96/numind-web-v3 |
| ESLint 代码检查 | ✅ | 集成到 CI 流程 |

**关键提交**: `ci: add multi-environment deployment`

**环境配置**:
- Dev: 49.233.219.254:9203 (develop 分支)
- QA: 49.233.219.254:9204 (release 分支)
- Prod: 129.28.125.51:9205 (main 分支)

---

### Phase 2: 后端清理 (2026-02-XX)

| 任务 | 状态 | 备注 |
|------|------|------|
| 禁用 wecom-agent 服务 | ✅ | docker-compose.yml |
| 删除 WeCom 代码文件 (11个) | ✅ | internal/wecom/* |
| 创建数据库清理脚本 | ✅ | scripts/cleanup_wecom.sql |
| 更新 CI/CD 配置 | ✅ | 移除 wecom-agent 构建 |

**删除的文件**:
```
internal/wecom/client.go
internal/wecom/message.go
internal/wecom/agent.go
internal/wecom/auth.go
internal/wecom/group.go
internal/wecom/media.go
internal/wecom/user.go
internal/wecom/department.go
internal/wecom/tag.go
internal/wecom/wecom.go
internal/controllers/wechat.go
```

**关键提交**: `chore: remove wecom related code`

---

### Phase 3: 部署验证 (2026-02-19)

| 任务 | 状态 | 备注 |
|------|------|------|
| Dev 容器运行验证 | ✅ | http://49.233.219.254:9203 |
| QA 容器运行验证 | ✅ | http://49.233.219.254:9204 |
| 腾讯云防火墙配置 | ✅ | 开放 9203/9204/9205 端口 |
| Nginx 配置修复 | ✅ | 移除错误 WebSocket 配置 |

**遇到的问题与解决**:

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| ERR_CONNECTION_CLOSED | Nginx WebSocket 配置错误 | 移除 server 块外的 WebSocket 配置 |
| 端口未开放 | 腾讯云防火墙限制 | 添加防火墙规则放行端口 |
| 资源 404 | Docker 构建环境变量错误 | 使用 build-args 传递环境变量 |

**关键提交**: 
- `fix: remove invalid websocket config from nginx`
- `fix: Docker build with environment-specific base path`

---

### Phase 4: 核心页面迁移 (2026-02-19)

#### 4.1 登录页面

| 功能 | 状态 | 备注 |
|------|------|------|
| 登录表单 UI | ✅ | 与原系统一致的设计 |
| 表单验证 | ✅ | 账号密码必填 |
| API 对接 | ✅ | POST /v1/web/login |
| Token 存储 | ✅ | localStorage |
| 错误提示 | ✅ | 友好错误消息 |
| 加载状态 | ✅ | 登录中动画 |

**文件**: `src/views/LoginView.vue`

#### 4.2 Dashboard 首页

| 功能 | 状态 | 备注 |
|------|------|------|
| 统计卡片 | ✅ | 4个核心指标展示 |
| 快速入口 | ✅ | 销售/SOP/存档快捷链接 |
| 最近活动 | ✅ | 活动列表展示 |
| 系统公告 | ✅ | 公告信息展示 |
| 响应式布局 | ✅ | 支持移动端 |

**文件**: `src/views/HomeView.vue`

#### 4.3 布局组件

| 组件 | 状态 | 功能 |
|------|------|------|
| AppSidebar | ✅ | 侧边导航栏，支持折叠 |
| MainLayout | ✅ | 主布局框架 |

**文件**:
- `src/components/layout/AppSidebar.vue`
- `src/components/layout/MainLayout.vue`

#### 4.4 状态管理

| 功能 | 状态 | 备注 |
|------|------|------|
| 用户登录状态 | ✅ | Pinia + localStorage |
| Token 管理 | ✅ | 自动添加请求头 |
| 用户信息缓存 | ✅ | 登录后获取用户信息 |
| 自动登录检查 | ✅ | 刷新页面恢复状态 |

**文件**: `src/stores/user.ts`

#### 4.5 路由与权限

| 功能 | 状态 | 备注 |
|------|------|------|
| 路由守卫 | ✅ | 未登录跳转到登录页 |
| 页面标题 | ✅ | 根据路由自动设置 |
| 公开页面 | ✅ | 登录页无需认证 |
| 404 处理 | ✅ | 未找到页面处理 |

**文件**: `src/router/index.ts`

#### 4.6 API 封装

| 功能 | 状态 | 备注 |
|------|------|------|
| 请求拦截器 | ✅ | 自动添加 Token |
| 响应拦截器 | ✅ | 统一错误处理 |
| 401 处理 | ✅ | Token 过期自动跳转 |
| 网络错误处理 | ✅ | 超时/断网提示 |

**文件**: `src/api/request.ts`

**关键提交**: `feat: 完善登录页和 Dashboard 首页`

---

### Phase 5: 销售智能体迁移 (进行中 2026-02-20)

| 任务 | 状态 | 备注 |
|------|------|------|
| 分析 sales-agent.html 功能结构 | ✅ | 明确会话、消息、SOP、客户信息四大区块 |
| 设计并落地组件拆分方案 | ✅ | ChatMessage / CustomerInfo / SOPSelector / QuickReply |
| 创建独立销售页面 | ✅ | 新增 `src/views/SalesView.vue`，替换 `/sales` 路由占位页 |
| 1:1 页面结构迁移 | ✅ | 引入原版 `sales-agent.html` DOM 到 `SalesView.vue` 模板（移除 `innerHTML` 壳注入） |
| 1:1 样式迁移 | ✅ | 引入原版 `sales-agent.css`（`public/legacy/sales-agent-legacy.css`） |
| Pinia 生命周期接管 | ✅ | `src/stores/salesAgent.ts` 统一接管 runtime 挂载/卸载与全局依赖注入 |
| 1:1 交互逻辑迁移 | ⏳ | 复用原版 `sales-agent.js` 行为，持续清理 legacy 全局函数与模块边界 |
| 流式回复与实时状态 | ⏳ | 已接入原版 SSE 逻辑，需继续验证细节一致性 |

**新增文件**:
- `src/views/SalesView.vue`
- `src/stores/salesAgent.ts`
- `src/legacy/sales-agent-shell.html`
- `public/legacy/sales-agent-legacy.js`
- `public/legacy/sales-agent-legacy.css`
- `src/components/sales/ChatMessage.vue`
- `src/components/sales/CustomerInfo.vue`
- `src/components/sales/SOPSelector.vue`
- `src/components/sales/QuickReply.vue`
- `src/api/sales.ts`

---

## 🔧 技术债务

### 已解决

- [x] ESLint 错误修复 (case 块声明、组件命名)
- [x] Docker 构建环境变量传递
- [x] Nginx 配置语法错误
- [x] API 代理回退误命中前端 HTML（`/v1/*` 与 `/api/*` 兼容）

### 待处理

- [ ] 生产环境 HTTPS 配置
- [ ] API 错误边界处理
- [ ] 单元测试覆盖
- [ ] 性能优化 (懒加载、缓存)

---

## 📊 代码统计

| 指标 | 数值 |
|------|------|
| 总文件数 | 30+ |
| Vue 组件 | 13 |
| TypeScript 文件 | 13 |
| 代码行数 | ~3800 |
| 测试覆盖率 | 0% |

---

## 🚀 下一步行动

### 近期 (本周)

1. **销售智能体迁移（继续）**
   - 对接 SSE 流式回复，替换当前 chat 接口兜底逻辑
   - 增加会话操作（重命名、删除、置顶）
   - 完成客户档案弹窗与保存流程

2. **联调验证**
   - 使用真实账号验证 `/v1/sales-rag/*` 接口
   - 验证 SOP 模板与销售会话联动
   - 验证移动端布局与输入交互

### 中期 (本月)

3. SOP 管理页面迁移
4. 微信存档页面迁移
5. 系统设置页面迁移

### 远期 (下月)

6. 功能回归测试
7. 性能优化
8. 生产环境切换

---

## 📌 重要链接

| 环境 | 地址 | 状态 |
|------|------|------|
| 开发 | http://49.233.219.254:9203 | ✅ 正常 |
| 测试 | http://49.233.219.254:9204 | ✅ 正常 |
| 生产 | http://youshu.asia:9205 | ⏳ 待部署 |
| GitHub | https://github.com/Into-the-Numind/numind-web-v3 | - |
| Docker Hub | https://hub.docker.com/r/neozhang96/numind-web-v3 | - |

---

## 📝 变更日志

### 2026-02-20
- ✅ 修复 API 代理回退导致的 HTML 响应异常（`request.ts` + Nginx `/v1/*` 兼容）
- ✅ 启动 Phase 5：完成销售页组件拆分与首版页面落地
- ✅ 新增销售模块 API 封装（sessions/messages/templates/chat）
- ✅ 接入销售聊天 SSE 基础流式读取（token 增量拼接）
- ✅ 按 1:1 策略引入 legacy 销售页 DOM/CSS/JS，并通过 Pinia 启动层管理运行环境

### 2026-02-19
- ✅ 完成 Phase 4: 核心页面迁移
- ✅ 修复 ESLint 错误
- ✅ 修复 Docker 构建问题
- ✅ 修复 Nginx 配置问题

### 2026-02-18
- ✅ 完成 Phase 3: 部署验证
- ✅ 配置腾讯云防火墙

### 2026-02-17
- ✅ 完成 Phase 2: 后端清理

### 2026-02-XX
- ✅ 完成 Phase 1: CI/CD 配置

### 2026-01-XX
- ✅ 完成 Phase 0: 基础架构
