import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: {
      title: '登录',
      public: true // 公开页面，不需要登录
    }
  },
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: {
      title: '工作台',
      requiresAuth: true
    }
  },
  {
    path: '/sales',
    name: 'sales',
    component: () => import('@/views/SalesView.vue'),
    meta: {
      title: '销售智能体',
      requiresAuth: true
    }
  },
  {
    path: '/sop',
    name: 'sop-history',
    component: () => import('@/views/SOPHistoryView.vue'),
    meta: {
      title: '运行记录',
      requiresAuth: true
    }
  },
  {
    path: '/sop/run',
    name: 'sop-run',
    component: () => import('@/views/SOPView.vue'),
    meta: {
      title: 'SOP 执行',
      requiresAuth: true
    }
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: {
      title: '系统设置',
      requiresAuth: true
    }
  },
  {
    path: '/about',
    name: 'about',
    component: () => import('@/views/AboutView.vue'),
    meta: {
      title: '关于',
      requiresAuth: true
    }
  },
  // 404 页面
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/LoginView.vue'),
    meta: {
      title: '页面未找到',
      public: true
    }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  // 设置页面标题
  const title = to.meta.title as string
  if (title) {
    document.title = `${title} - 莫小派工作站`
  } else {
    document.title = '莫小派工作站'
  }

  // 检查登录状态
  const userStore = useUserStore()
  const isLoggedIn = userStore.isLoggedIn
  const requiresAuth = to.meta.requiresAuth

  // 需要登录但未登录，跳转到登录页
  if (requiresAuth && !isLoggedIn) {
    next({ name: 'login', query: { redirect: to.fullPath } })
    return
  }

  // 已登录但访问登录页，跳转到首页
  if (isLoggedIn && to.path === '/login') {
    next('/')
    return
  }

  next()
})

// 路由错误处理
router.onError((error) => {
  console.error('路由错误:', error)
})

export default router
