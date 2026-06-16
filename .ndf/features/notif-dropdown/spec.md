# 通知喇叭下拉 + 弹窗详情（notif-dropdown）— 精炼 Spec + Plan

> Standard 档（单仓库 numind-web-v3，纯前端，>3 文件）。需求/交互已在对话中与用户确认（= S0-S2），本文件合并 spec+plan，重点在 S4 实现 + review + 浏览器验收。后端零改动（接口全现成）。

## 锁定的交互设计（用户 2026-06-16 拍板）
1. **入口**：喇叭 icon 放**工作区首页(HomeView)右上角**，仅此一处；**移除侧边栏的通知入口**。未读时 icon 上显示数字角标（>99 显示 99+），无未读不显角标。
2. **下拉**：点喇叭展开下拉列表面板（非跳页）。列表**滚动到底自动加载下一页（append）**，不要"查看全部"跳转。点列表外区域关闭。
3. **弹窗详情**：点某条 → **固定高度弹窗 + 内部滚动**。纯公告渲染 Markdown；问卷渲染 SurveyFillForm（已提交则只读态）。打开即标记已读（红点/角标随之减少）。Esc / 点遮罩关闭。
4. **看过不再提醒**：复用既有 `is_read`（markRead）。

## 文件改动计划
**新增**
- `src/components/notification/NotificationMegaphone.vue` — 喇叭入口 + 角标 + 下拉面板（flag 门控、60s 轮询未读、滚动 append 分页、点条目开弹窗、点外关闭）。
- `src/components/notification/NotificationModal.vue` — 固定高度内容弹窗（Teleport+遮罩+Esc，仿 ConfirmModal）；加载详情+标已读；Markdown / SurveyFillForm / 已提交态；提交问卷。

**修改**
- `src/stores/announcements.ts` — 加分页 append：`page` / `loadingMore` / `hasMore`(computed: list.length<total) / `loadMore()`；`loadAnnouncements` 重置 page=1。
- `src/views/HomeView.vue` — hero 行右上角挂 `<NotificationMegaphone/>`。
- `src/components/layout/AppSidebar.vue` — 移除 `<NotificationBell/>` 挂载 + import。
- `src/router/index.ts` — 删除 `/notifications`、`/notifications/:id` 两路由（+ 清理无用 import）。
- `e2e/notification-center.spec.ts` — 重写为新流程（喇叭→下拉→弹窗→提交），无 seed 时 skip。

**删除**
- `src/views/NotificationsView.vue`、`src/views/NotificationDetailView.vue`、`src/components/layout/NotificationBell.vue`（被新设计取代；上一个 Micro 的页面成果并入）。

## 复用
- flag 门控 + 轮询 + 角标逻辑：从 NotificationBell 搬。
- 弹窗骨架（Teleport/overlay/Esc/click-outside/design token）：仿 ConfirmModal。
- 列表项样式（unread dot / survey tag / 时间）：从 NotificationsView 搬。
- Markdown：`useMarkdown()`；问卷：`SurveyFillForm`。
- 设计 token：`var(--color-*/space-*/text-*/radius-*)`，与 app 一致。

## S4 任务
- T1 store 分页 append（+ 更新 store 单测）
- T2 NotificationModal.vue（+ 复用 SurveyFillForm）
- T3 NotificationMegaphone.vue + 挂 HomeView 右上角 + 从 Sidebar 摘除 NotificationBell
- T4 清理：删路由 + 删 3 个旧文件 + 重写 e2e

## 验收
type-check + lint + vitest 全绿；浏览器 dev 实测：工作区右上角喇叭(角标)→下拉(滚动加载)→点条目弹窗(Markdown/问卷, 固定高内滚)→提交→已读红点消。
