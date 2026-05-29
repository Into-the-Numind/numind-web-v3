<!--
  MarketplaceBrowse — 跨租户 Skill 市场浏览页 (T9).

  agent-mode-v2-skill-marketplace spec §8.3:
    - 重新设计：极简主义与现代感并存的刊物式布局，突显“莫小派”翠绿品牌基调
    - 所有的字体均为系统默认字体 (var(--font-sans))
    - 全面优化交互动效、加载状态与响应式体验

  Router: /marketplace
-->
<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { 
  Search, 
  RefreshCcw, 
  ArrowLeft, 
  ArrowRight,
  TrendingUp, 
  Compass, 
  Database, 
  Cpu, 
  MessageSquare, 
  HelpCircle,
  Sparkles,
  Layers
} from 'lucide-vue-next'

import { useMarketplaceStore } from '@/stores/marketplace'
import AppButton from '@/components/common/AppButton.vue'
import MainLayout from '@/components/layout/MainLayout.vue'

const router = useRouter()
const store = useMarketplaceStore()

const CATEGORIES = ['销售', '调研', '数据分析', 'SOP', '客服', '其他'] as const

// 根据分类获取对应图标组件
function getCategoryIcon(category: string) {
  switch (category) {
    case '销售': return TrendingUp
    case '调研': return Compass
    case '数据分析': return Database
    case 'SOP': return Cpu
    case '客服': return MessageSquare
    default: return HelpCircle
  }
}

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
    <div class="marketplace-container">
      <!-- 极简返回面包屑 -->
      <div class="nav-breadcrumb" @click="router.push('/config/skills')">
        <ArrowLeft :size="14" class="back-icon" />
        <span>返回我的 Skill</span>
      </div>

      <!-- 刊物大字报级 Hero 头部设计 -->
      <header class="hero-header">
        <div class="hero-meta">
          <span class="meta-tag">
            <Sparkles :size="12" class="sparkle-icon" />
            <span>SOP 工作流共享中心</span>
          </span>
          <router-link to="/marketplace/subscribed" class="subscribed-btn">
            <span>我的已订阅</span>
            <ArrowRight :size="14" class="arrow-icon" />
          </router-link>
        </div>
        
        <h1 class="hero-title">技能探索市场</h1>
        <p class="hero-subtitle">
          在此浏览由其他机构发布的脱敏技能，支持一键订阅。开箱即用的高阶 SOP 工作流模板，助力团队效能跃迁。
        </p>
      </header>

      <!-- 现代一体化检索中枢 -->
      <div class="search-hub">
        <div class="search-bar">
          <Search :size="18" class="search-icon" />
          <input
            v-model="store.queryQ"
            type="text"
            placeholder="搜索技能名称、描述、用途..."
            aria-label="搜索"
          />
          <button v-if="store.queryQ" class="clear-btn" @click="store.queryQ = ''">清除</button>
        </div>
        <div class="sort-selector">
          <select v-model="store.querySort" aria-label="排序">
            <option value="recommended">🔍 官方精选</option>
            <option value="recent">📅 最近上架</option>
            <option value="popular">🔥 热度排行</option>
          </select>
        </div>
      </div>

      <!-- 主双栏布局 -->
      <div class="main-layout">
        <!-- 左侧分类控制面板 -->
        <aside class="sidebar-panel">
          <div class="panel-header">
            <Layers :size="14" class="panel-icon" />
            <h2>技能分类</h2>
          </div>
          <nav class="category-list">
            <button
              type="button"
              class="category-item"
              :class="{ active: !store.queryCategory }"
              @click="selectCategory('')"
            >
              <span class="category-dot"></span>
              <span class="category-name">全部技能</span>
            </button>
            
            <button
              v-for="cat in CATEGORIES"
              :key="cat"
              type="button"
              class="category-item"
              :class="{ active: store.queryCategory === cat }"
              @click="selectCategory(cat)"
            >
              <!-- 动态分类图标 -->
              <component :is="getCategoryIcon(cat)" :size="14" class="category-icon-glyph" />
              <span class="category-name">{{ cat }}</span>
            </button>
          </nav>

          <!-- 快捷统计贴纸 -->
          <div class="stats-card">
            <div class="stats-item">
              <span class="stats-label">本月订阅</span>
              <span class="stats-val">99+</span>
            </div>
            <div class="stats-divider"></div>
            <div class="stats-item">
              <span class="stats-label">在架模版</span>
              <span class="stats-val">120+</span>
            </div>
          </div>
        </aside>

        <!-- 右侧主内容展示区 -->
        <main class="content-panel">
          <!-- 1. 加载状态：莫小派专属高雅骨架屏 -->
          <div v-if="store.loading" class="skills-grid">
            <div v-for="i in 6" :key="i" class="skill-card-skeleton" aria-hidden="true">
              <div class="skeleton-icon"></div>
              <div class="skeleton-line-title"></div>
              <div class="skeleton-line-body-1"></div>
              <div class="skeleton-line-body-2"></div>
              <div class="skeleton-footer">
                <div class="skeleton-pill-1"></div>
                <div class="skeleton-pill-2"></div>
              </div>
            </div>
          </div>

          <!-- 2. 错误重试面板 -->
          <div v-else-if="store.error" class="feedback-panel error">
            <div class="feedback-icon">⚠️</div>
            <h3>加载失败</h3>
            <p>{{ store.error }}</p>
            <AppButton class="retry-btn" @click="reload">
              <RefreshCcw :size="14" class="u-spin-hover" />
              <span>重新加载</span>
            </AppButton>
          </div>

          <!-- 3. 空白数据面板 -->
          <div v-else-if="store.isEmpty" class="feedback-panel empty">
            <div class="feedback-icon">✨</div>
            <h3>暂无可用技能</h3>
            <p v-if="store.queryQ || store.queryCategory">
              未找到相关技能模板，建议清空搜索条件或调整分类重试
            </p>
            <p v-else>市场暂无模板，期待您的加入</p>
            <AppButton v-if="store.queryQ || store.queryCategory" class="clear-query-btn" @click="clearQuery">
              <span>清除搜索条件</span>
            </AppButton>
          </div>

          <!-- 4. 成功网格卡片 -->
          <div v-else class="skills-grid">
            <article
              v-for="item in store.items"
              :key="item.id"
              class="skill-card"
              tabindex="0"
              role="button"
              @click="goDetail(item.id)"
              @keyup.enter="goDetail(item.id)"
            >
              <div class="card-glow"></div>
              
              <!-- 推荐角标/高亮条 -->
              <div v-if="item.is_platform_recommended" class="card-recommended-banner">
                <Sparkles :size="10" />
                <span>精选</span>
              </div>

              <!-- 卡片头部 -->
              <div class="card-header">
                <div class="icon-box" :class="item.category_tags[0] || '其他'">
                  <!-- 动态引入当前分类对应的图标 -->
                  <component :is="getCategoryIcon(item.category_tags[0] || '其他')" :size="18" />
                </div>
                
                <h3 class="card-title">{{ item.name }}</h3>
              </div>

              <!-- 卡片描述 -->
              <p class="card-desc" :title="item.description">{{ item.description }}</p>

              <!-- 卡片尾部 -->
              <footer class="card-footer">
                <span class="card-meta-count">
                  <strong>{{ item.subscribe_count }}</strong> 次订阅
                </span>
                
                <div class="card-tags">
                  <span v-for="t in item.category_tags.slice(0, 2)" :key="t" class="card-tag">
                    {{ t }}
                  </span>
                </div>
              </footer>
            </article>
          </div>

          <!-- 极其高级优雅的分页控制 -->
          <div v-if="!store.isEmpty && store.total > store.queryPageSize" class="pagination-hub">
            <button 
              class="pag-btn" 
              :disabled="store.queryPage <= 1" 
              @click="prevPage"
            >
              上一页
            </button>
            <span class="pag-info">
              第 <strong>{{ store.queryPage }}</strong> 页 / 共 {{ Math.ceil(store.total / store.queryPageSize) }} 页
            </span>
            <button 
              class="pag-btn" 
              :disabled="store.queryPage * store.queryPageSize >= store.total" 
              @click="nextPage"
            >
              下一页
            </button>
          </div>
        </main>
      </div>
    </div>
  </MainLayout>
</template>

<style scoped>
/* 容器及基础设置 */
.marketplace-container {
  min-height: 100vh;
  background: var(--bg-gradient);
  padding: var(--space-xl) var(--space-3xl);
  max-width: 1400px;
  margin: 0 auto;
  font-family: var(--font-sans);
  color: var(--text);
  display: flex;
  flex-direction: column;
}

/* 导航面包屑 */
.nav-breadcrumb {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  cursor: pointer;
  width: fit-content;
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--border-light);
  transition: all var(--transition-fast);
  margin-bottom: var(--space-xl);
  user-select: none;
}
.nav-breadcrumb:hover {
  color: var(--primary);
  background: var(--surface);
  border-color: var(--primary-hover);
  transform: translateX(-2px);
}
.back-icon {
  transition: transform var(--transition-fast);
}
.nav-breadcrumb:hover .back-icon {
  transform: translateX(-2px);
}

/* Hero 标题头部 */
.hero-header {
  margin-bottom: var(--space-2xl);
  position: relative;
}
.hero-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-sm);
}
.meta-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  background: var(--accent-ultra-soft);
  color: var(--primary);
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid rgba(0, 180, 120, 0.1);
}
.sparkle-icon {
  color: var(--primary);
}
.subscribed-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: var(--text-sm);
  color: var(--primary);
  font-weight: 600;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}
.subscribed-btn:hover {
  background: var(--accent-ultra-soft);
  color: var(--primary-hover);
}
.arrow-icon {
  transition: transform var(--transition-fast);
}
.subscribed-btn:hover .arrow-icon {
  transform: translateX(4px);
}

.hero-title {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin: 0 0 var(--space-md) 0;
}
.hero-subtitle {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  max-width: 72ch;
  margin: 0;
}

/* 检索中枢 */
.search-hub {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-2xl);
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 8px;
  box-shadow: var(--shadow-sm);
  align-items: center;
  transition: box-shadow var(--transition-fast);
}
.search-hub:focus-within {
  box-shadow: var(--shadow-md);
  border-color: rgba(0, 180, 120, 0.2);
}
.search-bar {
  display: flex;
  align-items: center;
  flex: 1;
  position: relative;
  gap: var(--space-sm);
  padding-left: var(--space-sm);
}
.search-icon {
  color: var(--text-muted);
}
.search-bar input {
  flex: 1;
  border: 0;
  background: transparent;
  padding: 10px 0;
  font-size: var(--text-sm);
  color: var(--text);
  outline: none;
}
.search-bar input::placeholder {
  color: var(--text-muted);
}
.clear-btn {
  background: transparent;
  border: 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background var(--transition-fast);
}
.clear-btn:hover {
  background: var(--surface-hover);
}

.sort-selector select {
  border: 1px solid var(--border-light);
  background: var(--surface-tint);
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 600;
  outline: none;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.sort-selector select:hover {
  border-color: var(--border);
  background: var(--surface);
}

/* 主双栏布局 */
.main-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: var(--space-2xl);
  align-items: start;
}

/* 左侧分类控制面板 */
.sidebar-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  position: sticky;
  top: var(--space-lg);
}
.panel-header {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  border-bottom: 1px solid var(--divider);
  padding-bottom: var(--space-sm);
}
.panel-icon {
  color: var(--text-secondary);
}
.panel-header h2 {
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
  margin: 0;
}
.category-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.category-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 10px 12px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 600;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
  user-select: none;
  width: 100%;
}
.category-item:hover {
  background: var(--surface);
  color: var(--text);
  transform: translateX(3px);
}
.category-item.active {
  background: var(--accent-ultra-soft);
  color: var(--primary);
  font-weight: 700;
}
.category-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--text-muted);
}
.category-item.active .category-dot {
  background: var(--primary);
}
.category-icon-glyph {
  color: var(--text-muted);
}
.category-item.active .category-icon-glyph {
  color: var(--primary);
}

.stats-card {
  display: flex;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 12px;
  justify-content: space-around;
  align-items: center;
  box-shadow: var(--shadow-sm);
}
.stats-item {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.stats-label {
  font-size: 10px;
  color: var(--text-muted);
}
.stats-val {
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--primary);
}
.stats-divider {
  width: 1px;
  height: 24px;
  background: var(--divider);
}

/* 右侧内容面板 */
.content-panel {
  display: flex;
  flex-direction: column;
}

/* 卡片网格 */
.skills-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-xl);
}

/* 技能卡片 */
.skill-card {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  min-height: 190px;
  cursor: pointer;
  position: relative;
  transition: all var(--transition-base);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
.skill-card::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 3px;
  background: var(--primary);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform var(--transition-base);
}
.skill-card:hover {
  transform: translateY(-4px);
  border-color: rgba(0, 180, 120, 0.2);
  box-shadow: var(--shadow-lg);
}
.skill-card:hover::after {
  transform: scaleX(1);
}
.skill-card:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

/* 推荐条 */
.card-recommended-banner {
  position: absolute;
  top: var(--space-lg);
  right: var(--space-lg);
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fde68a;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 2px;
}

/* 卡片头部与图标盒子 */
.card-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}
.icon-box {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-hover);
  color: var(--text-secondary);
  transition: all var(--transition-base);
}
/* 卡片悬停时图标微弹效果 */
.skill-card:hover .icon-box {
  background: var(--accent-ultra-soft);
  color: var(--primary);
  transform: scale(1.08);
}
.card-title {
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--text);
  margin: 0;
  line-height: var(--line-height-tight);
}

/* 卡片描述 */
.card-desc {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  line-height: var(--line-height-normal);
  margin: 0 0 var(--space-xl) 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  line-clamp: 3;
  overflow: hidden;
  flex: 1;
}

/* 卡片底部 */
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--divider);
  padding-top: var(--space-md);
  margin-top: auto;
}
.card-meta-count {
  font-size: 11px;
  color: var(--text-muted);
}
.card-meta-count strong {
  color: var(--text);
  font-weight: 600;
}
.card-tags {
  display: flex;
  gap: var(--space-xs);
}
.card-tag {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-hover);
  color: var(--text-secondary);
  font-weight: 600;
}
.skill-card:hover .card-tag {
  background: var(--accent-ultra-soft);
  color: var(--primary);
}

/* 高雅骨架屏 */
.skill-card-skeleton {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  min-height: 190px;
  position: relative;
  overflow: hidden;
}
.skill-card-skeleton::before {
  content: '';
  display: block;
  position: absolute;
  left: -150px;
  top: 0;
  height: 100%;
  width: 150px;
  background: linear-gradient(to right, transparent 0%, rgba(255, 255, 255, 0.6) 50%, transparent 100%);
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer {
  from { left: -150px; }
  to { left: 100%; }
}
.skeleton-icon {
  width: 36px;
  height: 36px;
  background: var(--divider);
  border-radius: var(--radius-md);
  margin-bottom: var(--space-md);
}
.skeleton-line-title {
  height: 14px;
  background: var(--divider);
  width: 60%;
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-md);
}
.skeleton-line-body-1 {
  height: 12px;
  background: var(--divider);
  width: 90%;
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-xs);
}
.skeleton-line-body-2 {
  height: 12px;
  background: var(--divider);
  width: 70%;
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-xl);
}
.skeleton-footer {
  display: flex;
  justify-content: space-between;
  margin-top: auto;
  border-top: 1px solid var(--divider);
  padding-top: var(--space-md);
}
.skeleton-pill-1 {
  height: 12px;
  background: var(--divider);
  width: 40px;
  border-radius: var(--radius-sm);
}
.skeleton-pill-2 {
  height: 12px;
  background: var(--divider);
  width: 60px;
  border-radius: var(--radius-sm);
}

/* 反馈面板（错误及空值） */
.feedback-panel {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: var(--space-4xl) var(--space-2xl);
  text-align: center;
  box-shadow: var(--shadow-sm);
}
.feedback-icon {
  font-size: 32px;
  margin-bottom: var(--space-md);
}
.feedback-panel h3 {
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--text);
  margin: 0 0 var(--space-xs) 0;
}
.feedback-panel p {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin: 0 0 var(--space-xl) 0;
}
.retry-btn, .clear-query-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  background: var(--primary);
  color: var(--primary-foreground);
  border: 0;
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.retry-btn:hover, .clear-query-btn:hover {
  background: var(--primary-hover);
  transform: translateY(-1px);
}
.u-spin-hover {
  transition: transform 0.6s ease;
}
.retry-btn:hover .u-spin-hover {
  transform: rotate(360deg);
}

/* 极其高级优雅的分页控制 */
.pagination-hub {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-xl);
  margin-top: var(--space-3xl);
  padding: var(--space-md) 0;
  border-top: 1px solid var(--divider);
}
.pag-btn {
  background: var(--surface);
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-sm);
}
.pag-btn:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
  transform: translateY(-1px);
  background: var(--accent-ultra-soft);
}
.pag-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}
.pag-info {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
.pag-info strong {
  color: var(--primary);
}

/* 响应式样式适配 */
@media (max-width: 1024px) {
  .marketplace-container {
    padding: var(--space-lg) var(--space-xl);
  }
  .main-layout {
    grid-template-columns: 1fr;
  }
  .sidebar-panel {
    position: static;
  }
  .category-list {
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
  .category-item {
    width: auto;
  }
  .category-item:hover {
    transform: none;
  }
  .stats-card {
    display: none; /* 在中屏隐藏快捷统计以保证视觉干净度 */
  }
}

@media (max-width: 768px) {
  .hero-title {
    font-size: var(--text-2xl);
  }
  .search-hub {
    flex-direction: column;
    align-items: stretch;
  }
  .sort-selector select {
    width: 100%;
    text-align: center;
  }
}
</style>
