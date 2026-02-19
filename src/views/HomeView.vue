<template>
  <MainLayout>
    <div class="workspace-section">
      <div class="workspace-section-title">已上线</div>
      <div class="cards-grid">
        <RouterLink
          v-for="workflow in onlineWorkflows"
          :key="workflow.title"
          :to="workflow.path"
          class="card"
        >
          <svg class="workflow-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="6" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.5" fill="none" />
            <path
              d="M14 11H18M18 11C18 13.2091 19.7909 15 22 15C24.2091 15 26 13.2091 26 11C26 8.79086 24.2091 7 22 7C19.7909 7 18 8.79086 18 11Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
            <path d="M22 11H26" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <circle cx="7" cy="25" r="3" stroke="currentColor" stroke-width="1.5" fill="none" />
            <path d="M10 25H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <rect x="14" y="22" width="10" height="6" rx="1" stroke="currentColor" stroke-width="1.5" fill="none" />
          </svg>
          <div class="card-title">{{ workflow.title }}</div>
          <div class="card-subtitle">{{ workflow.subtitle }}</div>
          <div class="card-meta">
            <span class="card-badge card-badge-active">{{ workflow.badge }}</span>
            <span class="card-date">{{ workflow.date }}</span>
          </div>
        </RouterLink>
      </div>
    </div>

    <div class="workspace-section">
      <div class="workspace-section-title">本月上线</div>
      <div class="cards-grid">
        <div v-for="workflow in comingSoonWorkflows" :key="workflow.title" class="card disabled">
          <svg class="workflow-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="6" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.5" fill="none" />
            <path
              d="M14 11H18M18 11C18 13.2091 19.7909 15 22 15C24.2091 15 26 13.2091 26 11C26 8.79086 24.2091 7 22 7C19.7909 7 18 8.79086 18 11Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
            <path d="M22 11H26" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <circle cx="7" cy="25" r="3" stroke="currentColor" stroke-width="1.5" fill="none" />
            <path d="M10 25H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <rect x="14" y="22" width="10" height="6" rx="1" stroke="currentColor" stroke-width="1.5" fill="none" />
          </svg>
          <div class="card-title">{{ workflow.title }}</div>
          <div class="card-subtitle">{{ workflow.subtitle }}</div>
          <div class="card-meta">
            <span class="card-badge card-badge-draft">即将上线</span>
          </div>
        </div>
      </div>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import MainLayout from '@/components/layout/MainLayout.vue'

const onlineWorkflows = [
  {
    path: '/sales',
    title: 'AI销售智能体',
    subtitle: '智能话术引导，提升销售转化',
    badge: 'active',
    date: '2026-02-19'
  },
  {
    path: '/sop',
    title: 'SOP 运行记录',
    subtitle: '查看流程执行状态与结果',
    badge: 'active',
    date: '2026-02-19'
  },
  {
    path: '/archive',
    title: '微信存档',
    subtitle: '追踪客户沟通，回溯关键内容',
    badge: 'active',
    date: '2026-02-19'
  },
  {
    path: '/settings',
    title: '系统设置',
    subtitle: '管理账号和系统配置',
    badge: 'active',
    date: '2026-02-19'
  }
]

const comingSoonWorkflows = [
  {
    title: 'AI生成剪辑脚本',
    subtitle: '一键生成脚本，视频剪辑快人一步'
  },
  {
    title: 'AI销售成交指导',
    subtitle: '专业话术引导，搞定最终成交'
  },
  {
    title: 'AI朋友圈：晒学员战绩',
    subtitle: '花式晒好评，用口碑刺激成交'
  },
  {
    title: 'AI文稿创作：营销选题口播稿',
    subtitle: '打造置顶广告牌，精准捕捞成交'
  }
]
</script>

<style scoped>
.workspace-section {
  margin-bottom: 40px;
}

.workspace-section-title {
  font-family: var(--font-sans);
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 20px;
  max-width: 1600px;
  margin-left: auto;
  margin-right: auto;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 40px;
  max-width: 1600px;
  margin: 0 auto;
  justify-items: center;
}

.card {
  background-color: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 32px 24px;
  box-shadow: var(--shadow-card);
  position: relative;
  transition: all 0.25s ease;
  cursor: pointer;
  text-decoration: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  width: 100%;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  background-color: var(--accent-soft);
  border-color: var(--accent);
}

.card.disabled {
  cursor: not-allowed;
  opacity: 0.7;
  pointer-events: none;
}

.card.disabled:hover {
  transform: none;
  box-shadow: var(--shadow-card);
  background-color: var(--surface);
  border-color: var(--border-light);
}

.workflow-icon {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  opacity: 0.6;
  color: hsl(158, 64%, 70%);
  transition: opacity 0.2s ease, color 0.2s ease;
}

.card:hover .workflow-icon {
  opacity: 0.9;
  color: hsl(158, 64%, 50%);
}

.card-title {
  font-family: var(--font-sans);
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  text-align: center;
  margin-bottom: 8px;
}

.card-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
}

.card-meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.card-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.card-badge-active {
  background-color: hsl(158, 50%, 92%);
  color: hsl(158, 64%, 50%);
}

.card-badge-draft {
  background-color: var(--border-light);
  color: var(--text-muted);
}

.card-date {
  font-size: 11px;
  color: var(--text-muted);
}

@media (max-width: 1400px) {
  .cards-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 1024px) {
  .cards-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
  }
}

@media (max-width: 768px) {
  .cards-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
