<template>
  <MainLayout>
    <template #actions>
      <button class="btn-primary">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        新建任务
      </button>
    </template>

    <div class="dashboard">
      <!-- 统计卡片 -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon blue">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.customers }}</div>
            <div class="stat-label">客户总数</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon green">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.completedTasks }}</div>
            <div class="stat-label">已完成任务</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon orange">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.pendingTasks }}</div>
            <div class="stat-label">待处理任务</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon purple">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.messages }}</div>
            <div class="stat-label">今日消息</div>
          </div>
        </div>
      </div>

      <!-- 主要内容区域 -->
      <div class="content-grid">
        <!-- 快速入口 -->
        <div class="panel">
          <div class="panel-header">
            <h3 class="panel-title">快速入口</h3>
          </div>
          <div class="panel-body">
            <div class="quick-links">
              <RouterLink to="/sales" class="quick-link">
                <div class="quick-icon">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                  </svg>
                </div>
                <span>销售智能体</span>
              </RouterLink>
              <RouterLink to="/sop" class="quick-link">
                <div class="quick-icon">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                </div>
                <span>SOP 管理</span>
              </RouterLink>
              <RouterLink to="/archive" class="quick-link">
                <div class="quick-icon">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                  </svg>
                </div>
                <span>微信存档</span>
              </RouterLink>
            </div>
          </div>
        </div>

        <!-- 最近活动 -->
        <div class="panel">
          <div class="panel-header">
            <h3 class="panel-title">最近活动</h3>
            <RouterLink to="/activities" class="link-more">查看全部</RouterLink>
          </div>
          <div class="panel-body">
            <div class="activity-list">
              <div v-for="(activity, index) in recentActivities" :key="index" class="activity-item">
                <div class="activity-icon" :class="activity.type">
                  <svg v-if="activity.type === 'task'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 11 12 14 22 4"/>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                  <svg v-else-if="activity.type === 'message'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="16" x2="12" y2="12"/>
                    <line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                </div>
                <div class="activity-content">
                  <div class="activity-text">{{ activity.text }}</div>
                  <div class="activity-time">{{ activity.time }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 系统公告 -->
      <div class="panel announcement-panel">
        <div class="panel-header">
          <h3 class="panel-title">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            系统公告
          </h3>
        </div>
        <div class="panel-body">
          <div class="announcement-content">
            <p>🎉 欢迎使用莫小派工作站 v3！这是一个全新的版本，基于 Vue 3 + Vite 构建，提供更流畅的用户体验。</p>
            <p>如有问题，请联系技术支持。</p>
          </div>
        </div>
      </div>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import MainLayout from '@/components/layout/MainLayout.vue'

// 统计数据（示例）
const stats = reactive({
  customers: 128,
  completedTasks: 86,
  pendingTasks: 12,
  messages: 256
})

// 最近活动（示例数据）
const recentActivities = [
  { type: 'task', text: '完成了客户跟进任务', time: '10分钟前' },
  { type: 'message', text: '收到新的微信消息', time: '30分钟前' },
  { type: 'system', text: '系统更新完成', time: '2小时前' },
  { type: 'task', text: '创建了新的 SOP 流程', time: '昨天' },
]
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 统计卡片 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.stat-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.2s;
}

.stat-card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon.blue {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.stat-icon.green {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.stat-icon.orange {
  background: rgba(249, 115, 22, 0.1);
  color: #f97316;
}

.stat-icon.purple {
  background: rgba(168, 85, 247, 0.1);
  color: #a855f7;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1;
}

.stat-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}

/* 内容网格 */
.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-light);
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 8px;
}

.link-more {
  font-size: 13px;
  color: var(--color-primary);
  text-decoration: none;
}

.link-more:hover {
  text-decoration: underline;
}

.panel-body {
  padding: 20px;
}

/* 快速入口 */
.quick-links {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quick-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius-md);
  background: var(--color-bg);
  color: var(--color-text);
  text-decoration: none;
  transition: all 0.2s;
}

.quick-link:hover {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.quick-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
}

/* 活动列表 */
.activity-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.activity-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.activity-icon {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.activity-icon.task {
  background: rgba(34, 197, 94, 0.1);
  color: #22c55e;
}

.activity-icon.message {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.activity-icon.system {
  background: rgba(249, 115, 22, 0.1);
  color: #f97316;
}

.activity-content {
  flex: 1;
  min-width: 0;
}

.activity-text {
  font-size: 14px;
  color: var(--color-text);
}

.activity-time {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 2px;
}

/* 公告 */
.announcement-panel .panel-body {
  padding: 16px 20px;
}

.announcement-content {
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}

.announcement-content p {
  margin: 0 0 8px;
}

.announcement-content p:last-child {
  margin-bottom: 0;
}

/* 按钮 */
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  color: white;
  background: var(--color-primary);
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: var(--color-primary-hover);
}

/* 响应式 */
@media (max-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .stats-grid {
    grid-template-columns: 1fr;
  }
}
</style>
