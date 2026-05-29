<!--
  MarketplaceBrowse — 跨租户 Skill 市场浏览页 (T9).

  agent-mode-v2-skill-marketplace spec §8.3:
    - 顶部搜索框 + 排序下拉 + 左侧分类 sidebar + 右侧卡片网格
    - 4 states: loading skeleton / empty CTA / error retry / success grid
    - 卡片用 grid (硬规则 1 例外: 发现型 UI, 类 Notion/Figma 模板库)

  Router: /marketplace
-->
<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search, RefreshCcw, ArrowLeft } from 'lucide-vue-next'

import { useMarketplaceStore } from '@/stores/marketplace'
import AppButton from '@/components/common/AppButton.vue'
import MainLayout from '@/components/layout/MainLayout.vue'

const router = useRouter()
const store = useMarketplaceStore()

const CATEGORIES = ['销售', '调研', '数据分析', 'SOP', '客服', '其他'] as const

// 初次加载 + query 变化时拉列表
onMounted(() => store.fetchList())

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => store.queryQ,
  () => {
    // 300ms debounce
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      store.queryPage = 1
      store.fetchList()
    }, 300)
  }
)
watch([() => store.queryCategory, () => store.querySort], () => {
  store.queryPage = 1
  store.fetchList()
})

function selectCategory(cat: string) {
  store.queryCategory = store.queryCategory === cat ? '' : cat
}

function goDetail(id: number) {
  router.push(`/marketplace/${id}`)
}

function reload() {
  store.fetchList()
}

function clearQuery() {
  store.resetQuery()
  store.fetchList()
}

function prevPage() {
  store.queryPage = Math.max(1, store.queryPage - 1)
  store.fetchList()
}

function nextPage() {
  store.queryPage = store.queryPage + 1
  store.fetchList()
}
</script>

<template>
  <MainLayout>
    <div class="marketplace-browse">
      <div class="back-link" @click="router.push('/config/skills')">
        <ArrowLeft :size="16" />
        <span>返回 Skill</span>
      </div>

      <header class="page-header">
        <h1>技能市场</h1>
        <p class="subtitle">浏览其他机构发布的脱敏技能，一键订阅到自己的技能库。</p>
        <div class="page-header__actions">
          <router-link to="/marketplace/subscribed" class="link-subscribed">
            我的订阅 →
          </router-link>
        </div>
      </header>

      <div class="toolbar">
        <div class="search-input">
          <Search :size="16" class="search-icon" />
          <input
            v-model="store.queryQ"
            type="text"
            placeholder="搜索技能名称、描述、用途..."
            aria-label="搜索"
          />
        </div>
        <select v-model="store.querySort" aria-label="排序">
          <option value="recommended">官方推荐</option>
          <option value="recent">最近上架</option>
          <option value="popular">最多订阅</option>
        </select>
      </div>

      <div class="layout">
        <aside class="sidebar">
          <h3>分类</h3>
          <ul>
            <li>
              <button
                type="button"
                :class="{ active: !store.queryCategory }"
                @click="selectCategory('')"
              >
                全部
              </button>
            </li>
            <li v-for="cat in CATEGORIES" :key="cat">
              <button
                type="button"
                :class="{ active: store.queryCategory === cat }"
                @click="selectCategory(cat)"
              >
                {{ cat }}
              </button>
            </li>
          </ul>
        </aside>

        <section class="content">
          <!-- Loading skeleton -->
          <div v-if="store.loading" class="grid">
            <div v-for="i in 6" :key="i" class="card skeleton" aria-hidden="true"></div>
          </div>

          <!-- Error retry -->
          <div v-else-if="store.error" class="state-msg state-msg--error">
            <p>{{ store.error }}</p>
            <AppButton @click="reload"> <RefreshCcw :size="14" /> 重试 </AppButton>
          </div>

          <!-- Empty -->
          <div v-else-if="store.isEmpty" class="state-msg state-msg--empty">
            <p v-if="store.queryQ || store.queryCategory">未找到相关技能，试试别的关键词或分类</p>
            <p v-else>市场暂无技能，欢迎成为第一个发布者</p>
            <AppButton v-if="store.queryQ || store.queryCategory" @click="clearQuery">
              清空搜索
            </AppButton>
          </div>

          <!-- Success grid -->
          <div v-else class="grid">
            <article
              v-for="item in store.items"
              :key="item.id"
              class="card"
              tabindex="0"
              role="button"
              @click="goDetail(item.id)"
              @keyup.enter="goDetail(item.id)"
            >
              <header class="card__head">
                <h4 class="card__title">{{ item.name }}</h4>
                <span v-if="item.is_platform_recommended" class="badge badge--recommended">
                  官方推荐
                </span>
              </header>
              <p class="card__desc" :title="item.description">{{ item.description }}</p>
              <footer class="card__foot">
                <span class="card__count">订阅 {{ item.subscribe_count }}</span>
                <span class="card__tags">
                  <span v-for="t in item.category_tags.slice(0, 3)" :key="t" class="tag">
                    {{ t }}
                  </span>
                </span>
              </footer>
            </article>
          </div>

          <!-- Pagination (轻量) -->
          <div v-if="!store.isEmpty && store.total > store.queryPageSize" class="pagination">
            <AppButton :disabled="store.queryPage <= 1" @click="prevPage"> 上一页 </AppButton>
            <span class="pagination__info">
              第 {{ store.queryPage }} 页 / 共 {{ Math.ceil(store.total / store.queryPageSize) }} 页
            </span>
            <AppButton
              :disabled="store.queryPage * store.queryPageSize >= store.total"
              @click="nextPage"
            >
              下一页
            </AppButton>
          </div>
        </section>
      </div>
    </div>
  </MainLayout>
</template>

<style scoped>
.marketplace-browse {
  min-height: 100vh;
  background: var(--bg-gradient);
  padding: var(--space-xl) var(--space-3xl);
  max-width: 1440px;
  margin: 0 auto;
  font-family: var(--font-sans);
  color: var(--text);
}

/* 返回链接 — 精雅微动效 */
.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: color var(--transition-fast);
  margin-bottom: var(--space-xl);
  user-select: none;
  font-weight: 500;
}
.back-link:hover {
  color: var(--primary);
}

/* 页面头部 — 刊物大标题 */
.page-header {
  margin-bottom: var(--space-2xl);
  border-bottom: 1px solid var(--divider);
  padding-bottom: var(--space-lg);
}
.page-header h1 {
  font-family: var(--font-heading, Georgia, serif);
  font-size: var(--text-3xl);
  font-weight: 500;
  color: var(--text);
  letter-spacing: -0.01em;
  margin: 0;
  line-height: var(--line-height-tight);
}
.page-header .subtitle {
  margin: var(--space-xs) 0 0;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: var(--line-height-normal);
}
.page-header__actions {
  margin-top: var(--space-md);
}
.link-subscribed {
  font-size: var(--text-sm);
  color: var(--primary);
  font-weight: 600;
  text-decoration: none;
  transition: color var(--transition-fast);
}
.link-subscribed:hover {
  color: var(--primary-hover);
  text-decoration: underline;
}

/* 工具栏 — 极细边框与高雅焦点环 */
.toolbar {
  display: flex;
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
  align-items: center;
}
.search-input {
  position: relative;
  flex: 1;
}
.search-input input {
  width: 100%;
  padding: 10px 12px 10px 38px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--text);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}
.search-input input:focus {
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
  outline: none;
}
.search-input input::placeholder {
  color: var(--text-muted);
}
.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary);
  pointer-events: none;
}
.toolbar select {
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}
.toolbar select:focus {
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
  outline: none;
}

/* 双栏布局 */
.layout {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: var(--space-2xl);
  align-items: start;
}

/* 左侧分类侧边栏 — 翠绿主题高亮 */
.sidebar h3 {
  margin: 0 0 var(--space-md);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.sidebar ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.sidebar li button {
  width: 100%;
  text-align: left;
  padding: 10px 14px;
  border: 0;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-secondary);
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast);
}
.sidebar li button:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.sidebar li button.active {
  background: var(--accent-ultra-soft);
  color: var(--primary);
  font-weight: 600;
}

/* 卡片网格 */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-xl);
}

/* 莫小派刊物级卡片设计 */
.card {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: var(--space-xl);
  cursor: pointer;
  background: var(--surface);
  box-shadow: var(--shadow-card);
  transition:
    box-shadow var(--transition-base),
    border-color var(--transition-base),
    transform var(--transition-base);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  min-height: 160px;
  position: relative;
  overflow: hidden;
}
/* 卡片左侧精雅翠绿修饰线 */
.card::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 100%;
  background: var(--primary);
  opacity: 0;
  transition: opacity var(--transition-base);
}
.card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--accent-light);
  transform: translateY(-3px);
}
.card:hover::after {
  opacity: 1;
}
.card:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

/* 骨架屏动画 */
.card.skeleton {
  background: linear-gradient(90deg, var(--surface-hover) 25%, var(--border-light) 50%, var(--surface-hover) 75%);
  background-size: 200% 100%;
  animation: skeleton 1.6s ease-in-out infinite;
  cursor: default;
  box-shadow: none;
  border-color: var(--border-light);
}
.card.skeleton::after {
  display: none;
}
@keyframes skeleton {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* 卡片内部结构 */
.card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-sm);
}
.card__title {
  font-family: var(--font-heading, Georgia, serif);
  font-size: var(--text-lg);
  font-weight: 500;
  color: var(--text);
  line-height: var(--line-height-tight);
  margin: 0;
}
.card__desc {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-normal);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-clamp: 2;
}
.card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--text-xs);
  margin-top: auto;
  padding-top: var(--space-sm);
  border-top: 1px solid var(--divider);
}
.card__count {
  color: var(--text-secondary);
  font-weight: 500;
}
.card__tags {
  display: flex;
  gap: var(--space-xs);
}
/* 新型翠绿轻微反光标签 */
.tag {
  padding: 2px 10px;
  background: var(--accent-ultra-soft);
  color: var(--primary);
  border-radius: var(--radius-pill);
  font-weight: 500;
}

/* 官方推荐徽章 — 温和的琥珀色 */
.badge {
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 600;
  white-space: nowrap;
}
.badge--recommended {
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fde68a;
}

/* 页面消息状态 (错误/空值) */
.state-msg {
  text-align: center;
  padding: var(--space-4xl) var(--space-2xl);
  color: var(--text-secondary);
}
.state-msg p {
  margin: 0 0 var(--space-lg);
  font-size: var(--text-base);
}
.state-msg--error {
  color: #dc2626; /* TODO(admin-rebrand): replace with --danger token */
}

/* 轻量分页 */
.pagination {
  margin-top: var(--space-3xl);
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-xl);
}
.pagination__info {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  font-weight: 500;
}
</style>
