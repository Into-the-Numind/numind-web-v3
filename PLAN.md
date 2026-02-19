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
- **访问地址**: http://youshu.asia:9205 (独立端口)
- **容器端口**: 9205 (新系统)

---

## 架构设计

### 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                     用户访问层                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   旧系统 (端口 9202)          新系统 v3 (端口 9205)           │
│   ┌─────────────────┐        ┌─────────────────┐            │
│   │ numind-web-prod │        │ numind-web-v3   │            │
│   │ (HTML/JS/CSS)   │        │ (Vue 3 + TS)    │            │
│   │ youshu.asia/    │        │ youshu.asia:9205│            │
│   └─────────────────┘        └─────────────────┘            │
│                                                              │
│   共享后端 API: https://youshu.asia/dev                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 分支策略

| 分支 | 环境 | 服务器 | 端口 | 镜像标签 |
|------|------|--------|------|----------|
| `develop` | 开发 | 49.233.219.254 | 9203 | `develop` |
| `release` | 测试 | 49.233.219.254 | 9204 | `release` |
| `main` | 生产 | 129.28.125.51 | 9205 | `latest` |

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
- [x] 验证独立端口访问 (9203/9204/9205)
- [x] 修复 Nginx 配置问题

**验收标准**: http://49.233.219.254:9203 可正常访问

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

- [ ] 分析 sales-agent.html 功能结构
- [ ] 设计 Vue 组件拆分方案
  - ChatMessage 组件
  - CustomerInfo 组件
  - SOPSelector 组件
  - QuickReply 组件
- [ ] 对接销售智能体 API
- [ ] 实现 WebSocket 实时消息
- [ ] 实现客户信息管理

**验收标准**: 可在新系统完成完整的销售对话流程

---

### Phase 6: SOP 管理迁移 ⏳
**目标**: 迁移 SOP 管理功能

- [ ] 分析 sop-detail.html 功能
- [ ] 创建 SOP 列表页面
- [ ] 创建 SOP 详情/编辑页面
- [ ] 实现 SOP 节点编辑器
- [ ] 对接 SOP API

**验收标准**: 可创建、编辑、查看 SOP 流程

---

### Phase 7: 微信存档迁移 ⏳
**目标**: 迁移微信存档功能

- [ ] 分析 wechat-archive.html 功能
- [ ] 创建消息列表组件
- [ ] 实现消息搜索和筛选
- [ ] 对接微信存档 API

**验收标准**: 可查看和搜索微信聊天记录

---

### Phase 8: 系统设置迁移 ⏳
**目标**: 迁移系统配置功能

- [ ] 分析 settings-preview.html 功能
- [ ] 创建设置页面
- [ ] 实现配置项管理
- [ ] 对接设置 API

**验收标准**: 可修改系统配置并生效

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

- [ ] 服务器开放对应端口 (9203/9204/9205)
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
- 开发环境: http://49.233.219.254:9203
- 测试环境: http://49.233.219.254:9204
- 生产环境: http://youshu.asia:9205

### 维护人员

- 前端开发: [待填写]
- 后端支持: [待填写]
- 运维部署: [待填写]
