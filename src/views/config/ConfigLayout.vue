<template>
  <MainLayout>
    <div class="config-layout">
      <div class="config-page-header">
        <h1 class="config-title">配置中心</h1>
        <p class="config-desc">管理首页可用工具，并维护它们可能会用到的知识库和 Skill。</p>
      </div>

      <div class="config-shell">
        <aside class="config-nav" aria-label="配置栏目">
          <section
            v-for="group in tabGroups"
            :key="group.label"
            class="config-nav-section"
            :class="{ 'config-nav-section--empty': group.tabs.length === 0 }"
          >
            <div v-if="group.tabs.length > 0" class="config-nav-label">{{ group.label }}</div>
            <router-link
              v-for="tab in group.tabs"
              :key="tab.path"
              :to="tab.path"
              class="config-nav-item"
              :class="{ active: isActive(tab.path) }"
            >
              {{ tab.label }}
            </router-link>
          </section>
        </aside>

        <main class="config-content">
          <router-view />
        </main>
      </div>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import MainLayout from '@/components/layout/MainLayout.vue'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const userStore = useUserStore()

// 确保 userInfo 就绪以正确显示 tab（子账户直达 /config/skills 时路由守卫不一定已 fetch）。
onMounted(() => {
  if (!userStore.userInfo) userStore.fetchUserInfo()
})

interface ConfigTab {
  label: string
  path: string
  group: 'tools' | 'assets'
  /** 父账户专属 tab（子账户隐藏）。 */
  parentOnly?: boolean
  /** 子账户可见 tab（skill-3tier-visibility T4：技能管理对子账户开放）。 */
  childVisible?: boolean
}

// skill-3tier-visibility T4: AI 助手/SOP/知识库/智能体 路由均 requiresParent，仅父账户可访问 →
// 全部标 parentOnly（之前 AI 助手/SOP/知识库 误标为非 parentOnly，子账户点了会被守卫弹回）。
// Skill 标 childVisible，子账户也能看到并管理个人技能。
const allTabs: ConfigTab[] = [
  { label: 'SOP 工作流', path: '/config/sop-templates', group: 'tools', parentOnly: true },
  { label: '智能体', path: '/config/agents', group: 'tools', parentOnly: true },
  { label: 'AI 助手', path: '/config/chatbots', group: 'tools', parentOnly: true },
  { label: '知识库', path: '/config/knowledge-bases', group: 'assets', parentOnly: true },
  { label: 'Skill', path: '/config/skills', group: 'assets', parentOnly: true, childVisible: true }
]

// userInfo 未就绪时默认隐藏 parentOnly tab，避免 isParentUser=true 的 flash；
// 加载完后：父账户看全部；子账户仅看 childVisible 的 tab（即 Skill）。
const tabs = computed<ConfigTab[]>(() => {
  if (!userStore.userInfo) return allTabs.filter((t) => !t.parentOnly)
  if (userStore.isParentUser) return allTabs
  return allTabs.filter((t) => t.childVisible)
})

const tabGroups = computed(() => [
  { label: '首页工具', tabs: tabs.value.filter((t) => t.group === 'tools') },
  { label: '能力资产', tabs: tabs.value.filter((t) => t.group === 'assets') }
])

function isActive(path: string) {
  return route.path.startsWith(path)
}
</script>

<style scoped>
.config-layout {
  width: 100%;
  height: 100%;
  margin: -36px -40px;
  width: calc(100% + 80px);
  height: calc(100% + 72px);
  padding: 32px 40px 40px;
  overflow-y: auto;
}

.config-page-header {
  max-width: 1200px;
  margin: 0 auto 22px;
}

.config-title {
  margin: 0;
  font-family: var(--font-sans);
  font-size: 26px;
  line-height: 1.25;
  font-weight: 700;
  color: var(--text);
  letter-spacing: 0;
}

.config-desc {
  margin: 7px 0 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.config-shell {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.config-nav {
  position: sticky;
  top: 0;
  padding: 10px;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
}

.config-nav-section + .config-nav-section {
  padding-top: 10px;
  margin-top: 10px;
  border-top: 1px solid var(--divider);
}

.config-nav-section--empty {
  display: none;
}

.config-nav-label {
  padding: 10px 10px 6px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.config-nav-item {
  min-height: 40px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  color: var(--text-secondary);
  font-size: 13px;
  text-decoration: none;
  transition:
    background var(--transition-fast),
    color var(--transition-fast);
}

.config-nav-item + .config-nav-item {
  margin-top: 2px;
}

.config-nav-item:hover {
  color: var(--text);
  background: var(--surface-hover);
}

.config-nav-item.active {
  color: var(--primary-hover);
  font-weight: 600;
  background: var(--accent-soft);
}

.config-content {
  min-width: 0;
}

@media (max-width: 960px) {
  .config-shell {
    grid-template-columns: 1fr;
  }

  .config-nav {
    position: static;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .config-nav-section + .config-nav-section {
    padding-top: 0;
    margin-top: 0;
    border-top: 0;
  }
}

@media (max-width: 720px) {
  .config-layout {
    margin: -24px -20px;
    width: calc(100% + 40px);
    height: calc(100% + 48px);
    padding: 24px 20px 32px;
  }

  .config-nav {
    grid-template-columns: 1fr;
  }
}
</style>
