import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useNotificationsStore } from '@/stores/notifications'

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
    // Vue 3 完整重写（NDF sop-runtime-vue-rewrite）
    component: () => import('@/views/sop/SOPRunView.vue'),
    meta: {
      title: 'SOP 执行',
      requiresAuth: true
    }
  },
  {
    path: '/customers',
    name: 'customers',
    component: () => import('@/views/CustomersView.vue'),
    meta: {
      title: '客户管理',
      requiresAuth: true,
      parentOnly: true
    }
  },
  {
    path: '/customers/billing',
    name: 'customers-billing',
    component: () => import('@/views/CustomersBillingView.vue'),
    meta: {
      title: '费用对账',
      requiresAuth: true,
      parentOnly: true
    }
  },
  {
    path: '/knowledge',
    name: 'knowledge',
    component: () => import('@/views/KnowledgeView.vue'),
    meta: {
      title: '知识库',
      requiresAuth: true
    }
  },
  {
    path: '/monitor',
    name: 'monitor',
    component: () => import('@/views/MonitorView.vue'),
    meta: {
      title: '竞品监控',
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
  {
    path: '/config',
    component: () => import('@/views/config/ConfigLayout.vue'),
    meta: {
      title: '配置中心',
      requiresAuth: true,
      requiresParent: true
    },
    children: [
      { path: '', redirect: '/config/chatbots' },
      {
        path: 'chatbots',
        component: () => import('@/views/config/ChatbotList.vue'),
        meta: { title: 'AI 助手', requiresAuth: true, requiresParent: true }
      },
      {
        path: 'chatbots/:id/edit',
        component: () => import('@/views/config/ChatbotEdit.vue'),
        meta: { title: '编辑智能体', requiresAuth: true, requiresParent: true }
      },
      {
        path: 'sop-templates',
        component: () => import('@/views/config/SopTemplateList.vue'),
        meta: { title: 'SOP', requiresAuth: true, requiresParent: true }
      },
      {
        path: 'sop-templates/:id/edit',
        component: () => import('@/views/config/SopTemplateEdit.vue'),
        meta: { title: '编辑 SOP 模板', requiresAuth: true, requiresParent: true }
      },
      {
        path: 'knowledge-bases',
        component: () => import('@/views/config/KnowledgeBaseList.vue'),
        meta: { title: '知识库', requiresAuth: true, requiresParent: true }
      },
      {
        path: 'knowledge-bases/:id',
        component: () => import('@/views/config/KnowledgeBaseDetail.vue'),
        meta: { title: '知识库详情', requiresAuth: true, requiresParent: true }
      },
      // AI Agent 配置者 UX (agent-mode-configurator-relocate, 2026-05-22)
      {
        path: 'agents',
        name: 'config-agents',
        component: () => import('@/views/config/agents/AgentList.vue'),
        meta: { title: '智能体', requiresAuth: true, requiresParent: true }
      },
      {
        path: 'agents/new',
        name: 'config-agents-new',
        component: () => import('@/views/config/agents/AgentCreateChoose.vue'),
        meta: { title: '创建助手', requiresAuth: true, requiresParent: true }
      },
      {
        path: 'agents/new/from-template',
        name: 'config-agents-from-template',
        component: () => import('@/views/config/agents/TemplateGallery.vue'),
        meta: { title: '选择模板', requiresAuth: true, requiresParent: true }
      },
      {
        path: 'agents/builder',
        name: 'config-agents-builder',
        component: () => import('@/views/config/agents/AgentBuilder.vue'),
        // mode='create' is REQUIRED — without it AgentBuilder receives undefined,
        // falls into the edit branch, and PATCHes /v1/agent/skills/undefined → 400.
        // The /edit route is wrapped by AgentEdit.vue which explicitly passes mode="edit".
        props: { mode: 'create' },
        meta: { title: '创建助手', requiresAuth: true, requiresParent: true }
      },
      {
        path: 'agents/:id',
        name: 'config-agents-detail',
        component: () => import('@/views/config/agents/AgentDetail.vue'),
        props: true,
        meta: { title: '助手详情', requiresAuth: true, requiresParent: true }
      },
      {
        path: 'agents/:id/edit',
        name: 'config-agents-edit',
        component: () => import('@/views/config/agents/AgentEdit.vue'),
        props: true,
        meta: { title: '编辑助手', requiresAuth: true, requiresParent: true }
      },
      // 我的技能 (agent-mode-v2-skill-as-artifact, 2026-05-24)
      {
        path: 'skills',
        name: 'config-skills',
        component: () => import('@/views/config/skills/SkillList.vue'),
        meta: { title: 'Skill', requiresAuth: true, requiresParent: true }
      },
      {
        path: 'skills/templates',
        name: 'config-skills-templates',
        component: () => import('@/views/config/skills/SkillTemplateBrowse.vue'),
        meta: { title: '官方模板库', requiresAuth: true, requiresParent: true }
      },
      {
        path: 'skills/new',
        name: 'config-skills-new',
        component: () => import('@/views/config/skills/SkillEditor.vue'),
        props: { mode: 'create' },
        meta: { title: '新建技能', requiresAuth: true, requiresParent: true }
      },
      {
        path: 'skills/:id',
        name: 'config-skills-detail',
        component: () => import('@/views/config/skills/SkillDetail.vue'),
        meta: { title: '技能详情', requiresAuth: true, requiresParent: true }
      },
      {
        path: 'skills/:id/edit',
        name: 'config-skills-edit',
        component: () => import('@/views/config/skills/SkillEditor.vue'),
        props: { mode: 'edit' },
        meta: { title: '编辑技能', requiresAuth: true, requiresParent: true }
      },
      {
        path: 'skills/:id/history',
        name: 'config-skills-history',
        component: () => import('@/views/config/skills/SkillHistory.vue'),
        meta: { title: '技能历史', requiresAuth: true, requiresParent: true }
      }
    ]
  },
  {
    path: '/credits',
    name: 'credits',
    component: () => import('@/views/CreditsView.vue'),
    meta: {
      title: '我的积分',
      requiresAuth: true
    }
  },
  {
    path: '/chatbot/:id',
    name: 'chatbot-chat',
    component: () => import('@/views/chatbot/ChatbotChat.vue'),
    meta: {
      title: '智能体对话',
      requiresAuth: true
    }
  },
  {
    path: '/agent/history',
    name: 'agent-history',
    component: () => import('@/views/agent/AgentHistoryView.vue'),
    meta: { title: '助手历史', requiresAuth: true }
  },
  {
    // Task 3.5: full-text Chinese search over agent history messages
    path: '/agent/history/search',
    name: 'agent-history-search',
    component: () => import('@/views/agent/AgentHistorySearchView.vue'),
    meta: { title: '搜索历史', requiresAuth: true }
  },
  {
    path: '/agent/chat/:sessionId',
    name: 'agent-chat',
    component: () => import('@/views/agent/AgentChatView.vue'),
    meta: { title: 'AI 助手对话', requiresAuth: true },
    props: (route) => ({
      sessionId: route.params.sessionId,
      agentId: route.query.agent_id ? Number(route.query.agent_id) : null,
      readOnly: route.query.read_only === '1'
    })
  },
  // 技能市场 (agent-mode-v2-skill-marketplace, 2026-05-24)
  // requiresParent: true — 子账户/学员不能访问 (spec §10.1 rule 2);
  // 现有 router.beforeEach 已处理 redirect (line 309-317).
  // /subscribed 必须在 /:id 之前注册避免被 :id catch-all 吞掉.
  {
    path: '/marketplace',
    name: 'marketplace-browse',
    component: () => import('@/views/marketplace/MarketplaceBrowse.vue'),
    meta: { title: '技能市场', requiresAuth: true, requiresParent: true }
  },
  {
    path: '/marketplace/subscribed',
    name: 'marketplace-subscribed',
    component: () => import('@/views/marketplace/MarketplaceSubscribed.vue'),
    meta: { title: '我的订阅', requiresAuth: true, requiresParent: true }
  },
  {
    path: '/marketplace/publish/:skill_id',
    name: 'marketplace-publish',
    component: () => import('@/views/marketplace/MarketplacePublish.vue'),
    meta: { title: '发布到市场', requiresAuth: true, requiresParent: true }
  },
  {
    path: '/marketplace/:id',
    name: 'marketplace-detail',
    component: () => import('@/views/marketplace/MarketplaceDetail.vue'),
    meta: { title: '技能详情', requiresAuth: true, requiresParent: true }
  },
  // 通知中心入口已改为工作区右上角喇叭下拉 + 弹窗（notif-dropdown），不再有独立路由页。
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

// 路由守卫（async：requiresParent 需 await fetchUserInfo 避免初始 isParentUser=true 的 flash）
router.beforeEach(async (to) => {
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
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  // 已登录但访问登录页，跳转到首页
  if (isLoggedIn && to.path === '/login') {
    return { path: '/' }
  }

  // 父用户专属页面：子用户（有 parent_user_id）不可访问
  // 改造：先确保 userInfo 已加载（fetch 完成）再判定，避免初始 isParentUser=true 误放行
  if (to.meta.parentOnly || to.meta.requiresParent) {
    if (!userStore.userInfo && userStore.isLoggedIn) {
      await userStore.fetchUserInfo()
    }
    if (!userStore.isParentUser) {
      // T10 reviewer P2: 路径分支文案 — marketplace 路径使用 marketplace 措辞,
      // 其它父账户专属路径仍用 "AI 助手配置..." 默认。避免子账户看到混淆提示.
      const msg = to.path.startsWith('/marketplace')
        ? '技能市场仅父账户可访问'
        : to.path.startsWith('/customers')
          ? '客户管理仅父账户可访问'
          : 'AI 助手配置仅父账户可访问'
      useNotificationsStore().info(msg)
      return { path: '/' }
    }
  }

  // 默认 pass（返回 undefined = pass）
})

// 路由错误处理
router.onError((error) => {
  console.error('路由错误:', error)
})

export default router
