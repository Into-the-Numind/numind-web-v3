<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="logo-icon"></div>
      <div class="sidebar-title">AI Workflow</div>
    </div>

    <nav class="nav-menu">
      <RouterLink
        v-for="item in menuItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: isActive(item.path) }"
      >
        <span>{{ item.title }}</span>
      </RouterLink>
    </nav>

    <div class="sidebar-footer">
      <div class="run-count-card">
        <div class="run-count-title">运行次数</div>
        <div class="run-count-value">--</div>
        <div class="run-count-label">加载中...</div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const userStore = useUserStore()

const menuItems = computed(() => {
  const items = [
    { path: '/', title: '工作区' },
    { path: '/sop', title: '运行记录' }
  ]

  // 客户管理：仅父用户可见（parent_user_id 不存在时为父用户）
  const parentUserId = userStore.userInfo?.parent_user_id
  if (!parentUserId) {
    items.push({ path: '/customers', title: '客户管理' })
  }

  items.push({ path: '/knowledge', title: '知识库管理' })
  items.push({ path: '/settings', title: '设置' })

  return items
})

const isActive = (path: string) => {
  if (path === '/') {
    return route.path === '/'
  }
  return route.path === path || route.path.startsWith(`${path}/`)
}
</script>

<style scoped>
.sidebar {
  width: 260px;
  height: 100vh;
  background: #003811;
  border: none;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  box-shadow: none;
  overflow: hidden;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 24px 20px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 12px;
}

.logo-icon {
  width: 180px;
  height: 72px;
  background-image: url('https://numind-dev-1334169463.cos.ap-chengdu.myqcloud.com/sop/logo/%E8%8E%AB%E5%B0%8F%E6%B4%BElogo2.png');
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
}

.sidebar-title {
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.8);
  letter-spacing: 0;
}

.nav-menu {
  flex: 1;
  padding: 0 12px 12px;
  overflow: hidden;
}

.nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin-bottom: 4px;
  border-radius: var(--radius-md);
  color: #fff;
  font-size: 14px;
  text-decoration: none;
  border: 1px solid transparent;
  position: relative;
  transition: all 0.2s;
}

.nav-item:hover {
  background-color: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav-item.active {
  background-color: var(--sidebar-active-bg);
  color: var(--sidebar-active-text);
  font-weight: 500;
}

.nav-item.active::after {
  content: '';
  position: absolute;
  right: 16px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--accent);
}

.sidebar-footer {
  padding: 0 12px 20px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  margin-top: auto;
  gap: 0;
}

.run-count-card {
  width: 100%;
  padding: 16px;
  background-color: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: var(--radius-md);
  border: 1px solid rgba(192, 202, 198, 0.5);
  box-shadow: 0 1px 3px 0 rgb(0 0 0 / 8%), 0 1px 2px -1px rgb(0 0 0 / 8%);
}

.run-count-title {
  font-size: 13px;
  font-weight: 500;
  color: hsl(150, 10%, 15%);
  margin-bottom: 8px;
}

.run-count-value {
  font-size: 28px;
  font-weight: 700;
  color: hsl(150, 10%, 15%);
  margin-bottom: 4px;
  line-height: 1.2;
}

.run-count-label {
  font-size: 12px;
  color: hsl(150, 10%, 40%);
}

@media (max-width: 1024px) {
  .sidebar {
    width: 220px;
  }
}

@media (max-width: 768px) {
  .sidebar {
    width: 100%;
    height: auto;
    max-height: 260px;
  }

  .sidebar-header {
    padding-top: 16px;
    padding-bottom: 12px;
  }

  .logo-icon {
    width: 150px;
    height: 60px;
  }
}
</style>
