<template>
  <MainLayout>
    <div class="config-layout">
      <div class="config-tabs">
        <div class="config-tabs-inner">
          <router-link
            v-for="tab in tabs"
            :key="tab.path"
            :to="tab.path"
            class="config-tab"
            :class="{ active: isActive(tab.path) }"
          >
            {{ tab.label }}
          </router-link>
        </div>
      </div>
      <div class="config-content">
        <div class="config-content-inner">
          <router-view />
        </div>
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
  /** 父账户专属 tab（子账户隐藏）。 */
  parentOnly?: boolean
  /** 子账户可见 tab（skill-3tier-visibility T4：技能管理对子账户开放）。 */
  childVisible?: boolean
}

// skill-3tier-visibility T4: AI 助手/SOP/知识库/智能体 路由均 requiresParent，仅父账户可访问 →
// 全部标 parentOnly（之前 AI 助手/SOP/知识库 误标为非 parentOnly，子账户点了会被守卫弹回）。
// Skill 标 childVisible，子账户也能看到并管理个人技能。
const allTabs: ConfigTab[] = [
  { label: 'AI 助手', path: '/config/chatbots', parentOnly: true },
  { label: 'SOP', path: '/config/sop-templates', parentOnly: true },
  { label: '知识库', path: '/config/knowledge-bases', parentOnly: true },
  { label: '智能体', path: '/config/agents', parentOnly: true },
  { label: 'Skill', path: '/config/skills', parentOnly: true, childVisible: true }
]

// userInfo 未就绪时默认隐藏 parentOnly tab，避免 isParentUser=true 的 flash；
// 加载完后：父账户看全部；子账户仅看 childVisible 的 tab（即 Skill）。
const tabs = computed<ConfigTab[]>(() => {
  if (!userStore.userInfo) return allTabs.filter((t) => !t.parentOnly)
  if (userStore.isParentUser) return allTabs
  return allTabs.filter((t) => t.childVisible)
})

function isActive(path: string) {
  return route.path.startsWith(path)
}
</script>

<style scoped>
.config-layout {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin: -36px -40px;
  width: calc(100% + 80px);
  height: calc(100% + 72px);
}

.config-tabs {
  display: flex;
  justify-content: center;
  padding: 0 40px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--surface);
}

.config-tabs-inner {
  display: flex;
  gap: 4px;
  padding: 20px 0 0;
  max-width: 1200px;
  width: 100%;
  box-sizing: border-box;
}

.config-tab {
  padding: 10px 18px;
  font-size: 0.875rem;
  color: var(--text-secondary);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all var(--transition-fast);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.config-tab:hover {
  color: var(--text);
  background: var(--surface-hover);
}

.config-tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
  font-weight: 600;
  background: transparent;
}

.config-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 40px;
}

.config-content-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 28px 0;
}
</style>
