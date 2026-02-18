# 莫小派 Web v3

基于 Vue 3 + Vite + Pinia 的前端重构项目。

## 技术栈

- **框架**: Vue 3.4 + Composition API
- **构建工具**: Vite 5
- **状态管理**: Pinia
- **路由**: Vue Router 4
- **HTTP**: Axios
- **样式**: CSS Variables + Scoped CSS

## 项目结构

```
src/
├── components/          # 组件
│   ├── common/         # 通用组件（Button, Input等）
│   └── layout/         # 布局组件
├── views/              # 页面视图
├── stores/             # Pinia 状态管理
├── router/             # 路由配置
├── api/                # API 封装
├── shared/             # 共享资源
│   ├── styles/        # 全局样式
│   ├── utils/         # 工具函数
│   └── types/         # TypeScript 类型
└── modules/           # 业务模块
    ├── auth/          # 认证模块
    ├── sop/           # SOP 模块
    ├── sales/         # 销售模块
    ├── chat/          # 对话模块
    └── knowledge/     # 知识库模块
```

## 开发命令

```bash
# 安装依赖
npm install

# 开发服务器
npm run dev

# 构建生产版本
npm run build

# 代码检查
npm run lint

# 格式化代码
npm run format
```

## 与旧系统关系

- 旧系统: `numind-web/` (独立仓库/目录)
- 新系统: `numind-web-v3/` (本目录)
- 共存方式: Nginx 路由分流
  - `/v3/` -> 新系统
  - `/` -> 旧系统

## 开发计划

- [x] Phase 0: 项目搭建
- [ ] Phase 1: 公共组件和 Auth 模块
- [ ] Phase 2: 页面迁移
- [ ] Phase 3: 桌面端 (Tauri)
- [ ] Phase 4: 模块化架构