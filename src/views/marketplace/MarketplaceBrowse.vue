<!--
  MarketplaceBrowse — 跨租户 Skill 市场浏览页 (T9).

  Awwwards-Tier Re-design (Simplified Layout):
    - 移除了灰色外边框设计，采用更直接、轻量级的单层卡片设计
    - 移除了顶部的 “SOP 工作流共享中心” 组件，界面更加极简专业
    - 移除了顶部的 “返回我的技能” 面包屑链接，使页面结构更加紧凑
    - 所有的字体均为系统默认字体 (var(--font-sans))

  Router: /marketplace
-->
<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Search,
  RefreshCcw,
  ArrowRight,
  TrendingUp,
  Compass,
  Database,
  Cpu,
  MessageSquare,
  HelpCircle,
  Sparkles,
  Layers,
  ChevronRight
} from 'lucide-vue-next'

import { useMarketplaceStore } from '@/stores/marketplace'
import AppButton from '@/components/common/AppButton.vue'
import MainLayout from '@/components/layout/MainLayout.vue'

const router = useRouter()
const store = useMarketplaceStore()

const CATEGORIES = ['销售', '调研', '数据分析', 'SOP', '客服', '其他'] as const

// 根据分类获取对应图标
function getCategoryIcon(category: string) {
  switch (category) {
    case '销售':
      return TrendingUp
    case '调研':
      return Compass
    case '数据分析':
      return Database
    case 'SOP':
      return Cpu
    case '客服':
      return MessageSquare
    default:
      return HelpCircle
  }
}

// 初次加载 + query 变化时拉列表
onMounted(() => store.fetchList())

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => store.queryQ,
  () => {
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
    <div class="haptic-shell">
      <!-- 刊物大字报级别 Hero 区 (极简白美学) -->
      <header class="editorial-hero">
        <div class="hero-top-ribbon">
          <!-- “SOP 工作流共享中心”与返回链接已移除，只保留已订阅功能入口 -->
          <div class="spacer"></div>
          <router-link to="/marketplace/subscribed" class="subscribed-island">
            <span>我的已订阅</span>
            <div class="island-circle">
              <ArrowRight :size="12" :stroke-width="1.5" />
            </div>
          </router-link>
        </div>

        <h1 class="hero-headline">技能探索市场</h1>
        <p class="hero-subline">
          在此浏览由其他机构发布的脱敏技能，支持一键引用订阅（只读、开发者更新后自动同步）。开箱即用的高阶
          SOP 工作流模板，助力团队效能跃迁。
        </p>
      </header>

      <!-- 一体化轻量检索中枢 -->
      <div class="search-inner-core">
        <div class="search-input-wrap">
          <Search :size="16" :stroke-width="1.5" class="search-glyph" />
          <input
            v-model="store.queryQ"
            type="text"
            placeholder="搜索技能名称、描述、用途..."
            aria-label="搜索"
          />
          <button v-if="store.queryQ" class="clear-pill" @click="store.queryQ = ''">清除</button>
        </div>
        <div class="sort-island">
          <select v-model="store.querySort" aria-label="排序">
            <option value="recommended">🔍 官方精选</option>
            <option value="recent">📅 最近上架</option>
            <option value="popular">🔥 热度排行</option>
          </select>
        </div>
      </div>

      <!-- 响应式布局 -->
      <div class="bento-layout">
        <!-- 左侧分类控制面板 -->
        <aside class="left-control-center">
          <div class="panel-inner-core">
            <div class="panel-header-badge">
              <Layers :size="12" :stroke-width="1.5" />
              <span>技能分类</span>
            </div>

            <nav class="pill-nav-list">
              <button
                type="button"
                class="pill-nav-item"
                :class="{ active: !store.queryCategory }"
                @click="selectCategory('')"
              >
                <span class="pill-nav-dot"></span>
                <span>全部技能</span>
              </button>

              <button
                v-for="cat in CATEGORIES"
                :key="cat"
                type="button"
                class="pill-nav-item"
                :class="{ active: store.queryCategory === cat }"
                @click="selectCategory(cat)"
              >
                <component
                  :is="getCategoryIcon(cat)"
                  :size="13"
                  :stroke-width="1.5"
                  class="pill-nav-icon"
                />
                <span>{{ cat }}</span>
              </button>
            </nav>

            <div class="stats-nested-box">
              <div class="nested-stat">
                <span class="stat-label">本月订阅</span>
                <span class="stat-value">99+</span>
              </div>
              <div class="nested-stat-divider"></div>
              <div class="nested-stat">
                <span class="stat-label">在架模版</span>
                <span class="stat-value">120+</span>
              </div>
            </div>
          </div>
        </aside>

        <!-- 右侧非对称 Bento 网格 -->
        <main class="bento-main">
          <!-- 1. 加载状态：莫小派专属高雅骨架屏 -->
          <div v-if="store.loading" class="bento-grid">
            <div
              v-for="i in 6"
              :key="i"
              class="bento-skeleton-card"
              :class="{ 'md:col-span-2': i % 3 === 0 }"
              aria-hidden="true"
            >
              <div class="skel-icon"></div>
              <div class="skel-line-title"></div>
              <div class="skel-line-desc-1"></div>
              <div class="skel-line-desc-2"></div>
              <div class="skel-footer">
                <div class="skel-badge"></div>
                <div class="skel-badge"></div>
              </div>
            </div>
          </div>

          <!-- 2. 错误重试面板 -->
          <div v-else-if="store.error" class="haptic-feedback-card error">
            <div class="feedback-emoji">⚠️</div>
            <h3>加载失败</h3>
            <p>{{ store.error }}</p>
            <button class="bezel-action-btn" @click="reload">
              <RefreshCcw :size="14" :stroke-width="1.5" class="u-spin-hover" />
              <span>重新加载</span>
            </button>
          </div>

          <!-- 3. 空白数据面板 -->
          <div v-else-if="store.isEmpty" class="haptic-feedback-card empty">
            <div class="feedback-emoji">✨</div>
            <h3>暂无可用技能</h3>
            <p v-if="store.queryQ || store.queryCategory">
              未找到相关技能模板，建议清空搜索条件或调整分类重试
            </p>
            <p v-else>市场暂无模板，期待您的加入</p>
            <button
              v-if="store.queryQ || store.queryCategory"
              class="bezel-action-btn"
              @click="clearQuery"
            >
              <span>清除搜索条件</span>
            </button>
          </div>

          <!-- 4. 成功非对称 Bento 网格 -->
          <div v-else class="bento-grid">
            <article
              v-for="item in store.items"
              :key="item.id"
              class="bento-card"
              :class="{ 'md:col-span-2 recommended-card': item.is_platform_recommended }"
              tabindex="0"
              role="button"
              @click="goDetail(item.id)"
              @keyup.enter="goDetail(item.id)"
            >
              <!-- 推荐指示线条 -->
              <div v-if="item.is_platform_recommended" class="recommended-accent-bar"></div>

              <!-- 官方推荐轻量徽章 -->
              <div v-if="item.is_platform_recommended" class="platform-recommended-badge">
                <Sparkles :size="10" :stroke-width="1.5" />
                <span>官方精选</span>
              </div>

              <div class="card-body-section">
                <!-- 卡片头部 -->
                <div class="card-title-row">
                  <div class="haptic-icon-shell" :class="item.category_tags[0] || '其他'">
                    <component
                      :is="getCategoryIcon(item.category_tags[0] || '其他')"
                      :size="16"
                      :stroke-width="1.5"
                    />
                  </div>
                  <div class="card-headline-group">
                    <h3 class="card-name">{{ item.name }}</h3>
                  </div>
                </div>

                <!-- 卡片描述 -->
                <p class="card-teaser" :title="item.description">{{ item.description }}</p>
              </div>

              <!-- 卡片尾部 -->
              <footer class="card-haptic-footer">
                <span class="subscription-metric">
                  <strong>{{ item.subscribe_count }}</strong> 次订阅
                </span>

                <div class="capsule-tags">
                  <span v-for="t in item.category_tags.slice(0, 2)" :key="t" class="capsule-tag">
                    {{ t }}
                  </span>
                </div>

                <!-- 隐式探索剪切箭头 -->
                <div class="card-trailing-circle">
                  <ChevronRight :size="12" :stroke-width="2" class="chevron-glyph" />
                </div>
              </footer>
            </article>
          </div>

          <!-- 极简分页 -->
          <div
            v-if="!store.isEmpty && store.total > store.queryPageSize"
            class="editorial-pagination"
          >
            <button class="editorial-pag-btn" :disabled="store.queryPage <= 1" @click="prevPage">
              上一页
            </button>
            <span class="editorial-pag-info">
              第 <strong>{{ store.queryPage }}</strong> 页 / 共
              {{ Math.ceil(store.total / store.queryPageSize) }} 页
            </span>
            <button
              class="editorial-pag-btn"
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
/* 1. Global Meta & Soft Structuralism Layout */
.haptic-shell {
  font-family: var(--font-sans);
  color: var(--text);
  display: flex;
  flex-direction: column;
  background: var(--surface);
}

/* 2. Hero Header breathing rhythm */
.editorial-hero {
  margin-bottom: var(--space-xl);
  position: relative;
}
.hero-top-ribbon {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-xs);
}
.subscribed-island {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: var(--text-xs);
  color: var(--primary);
  font-weight: 600;
  padding: 4px 4px 4px 14px;
  border-radius: var(--radius-pill);
  background: var(--surface-tint);
  border: 1px solid var(--border-light);
  transition: all 700ms cubic-bezier(0.32, 0.72, 0, 1);
  text-decoration: none;
}
.island-circle {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-pill);
  background: var(--primary);
  color: var(--primary-foreground);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 700ms cubic-bezier(0.32, 0.72, 0, 1);
}
.subscribed-island:hover {
  background: var(--surface);
  border-color: var(--primary-hover);
  box-shadow: var(--shadow-sm);
}
.subscribed-island:hover .island-circle {
  transform: translateX(2px) scale(1.05);
}

.hero-headline {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin: 0 0 var(--space-md) 0;
}
.hero-subline {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  max-width: 68ch;
  margin: 0;
}

/* 3. 一体化轻量检索中枢 */
.search-inner-core {
  display: flex;
  gap: var(--space-md);
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 8px 8px 8px 16px;
  align-items: center;
  box-shadow: var(--shadow-sm);
  margin-bottom: var(--space-2xl);
  transition: all 700ms cubic-bezier(0.32, 0.72, 0, 1);
}
.search-inner-core:focus-within {
  border-color: var(--primary);
  box-shadow: var(--shadow-md);
}
.search-input-wrap {
  display: flex;
  align-items: center;
  flex: 1;
  gap: var(--space-sm);
}
.search-glyph {
  color: var(--text-muted);
}
.search-input-wrap input {
  flex: 1;
  border: 0;
  background: transparent;
  padding: 8px 0;
  font-size: var(--text-sm);
  color: var(--text);
  outline: none;
}
.search-input-wrap input::placeholder {
  color: var(--text-muted);
}
.clear-pill {
  background: var(--surface-tint);
  border: 1px solid var(--border-light);
  font-size: 11px;
  color: var(--text-secondary);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: all 700ms cubic-bezier(0.32, 0.72, 0, 1);
}
.clear-pill:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.sort-island select {
  border: 1px solid var(--border-light);
  background: var(--surface-tint);
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  outline: none;
  cursor: pointer;
  transition: all 700ms cubic-bezier(0.32, 0.72, 0, 1);
}
.sort-island select:hover {
  border-color: var(--primary);
  background: var(--surface);
}

/* 4. Main Grid Layout */
.bento-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: var(--space-2xl);
  align-items: start;
}

/* Left controls panel */
.left-control-center {
  position: sticky;
  top: var(--space-lg);
}
.panel-inner-core {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  background: var(--surface-tint);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: var(--space-lg) var(--space-md);
}
.panel-header-badge {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border-bottom: 1px solid var(--divider);
  padding-bottom: var(--space-sm);
}
.pill-nav-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.pill-nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 10px 14px;
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 600;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 700ms cubic-bezier(0.32, 0.72, 0, 1);
  text-align: left;
  user-select: none;
  width: 100%;
}
.pill-nav-item:hover {
  background: var(--surface);
  color: var(--text);
  transform: translateX(4px);
}
.pill-nav-item.active {
  background: var(--accent-ultra-soft);
  color: var(--primary);
  font-weight: 700;
}
.pill-nav-dot {
  width: 5px;
  height: 5px;
  border-radius: var(--radius-pill);
  background: var(--text-muted);
  transition: all 700ms cubic-bezier(0.32, 0.72, 0, 1);
}
.pill-nav-item.active .pill-nav-dot {
  background: var(--primary);
  transform: scale(1.3);
}
.pill-nav-icon {
  color: var(--text-muted);
  transition: all 700ms cubic-bezier(0.32, 0.72, 0, 1);
}
.pill-nav-item.active .pill-nav-icon {
  color: var(--primary);
  transform: scale(1.1);
}

.stats-nested-box {
  display: flex;
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 12px;
  justify-content: space-around;
  align-items: center;
  box-shadow: var(--shadow-sm);
}
.nested-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.stat-label {
  font-size: 10px;
  color: var(--text-muted);
}
.stat-value {
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--primary);
}
.nested-stat-divider {
  width: 1px;
  height: 20px;
  background: var(--divider);
}

/* 5. Bento Grid & Elegant Cards */
.bento-main {
  display: flex;
  flex-direction: column;
}
.bento-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-xl);
}

/* Bento Card - Direct Clean Styling (No double border) */
.bento-card {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  min-height: 190px;
  cursor: pointer;
  position: relative;
  box-shadow: var(--shadow-card);
  transition: all 700ms cubic-bezier(0.32, 0.72, 0, 1);
  overflow: hidden;
}

/* Hover State */
.bento-card:hover {
  transform: translateY(-5px);
  border-color: rgba(0, 180, 120, 0.2);
  box-shadow: var(--shadow-lg);
  background: var(--accent-ultra-soft);
}
.bento-card:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

/* Bento recommended card (Spans 2 cols on md+) */
@media (min-width: 768px) {
  .bento-card.recommended-card {
    grid-column: span 2;
    min-height: 200px;
    flex-direction: row;
    align-items: center;
    gap: var(--space-xl);
  }
  .bento-card.recommended-card .card-body-section {
    flex: 1;
  }
  .bento-card.recommended-card .card-haptic-footer {
    flex-direction: column;
    align-items: flex-end;
    justify-content: center;
    border-top: 0;
    padding-top: 0;
    border-left: 1px solid var(--divider);
    padding-left: var(--space-xl);
    gap: var(--space-sm);
    margin-top: 0;
  }
}

/* Recommended Accent Indicator */
.recommended-accent-bar {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 50%;
  border-radius: var(--radius-pill);
  background: var(--primary);
}

/* recommended micro capsule tag */
.platform-recommended-badge {
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
  gap: 3px;
  letter-spacing: 0.02em;
}

/* Card content rows */
.card-body-section {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.card-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}
.haptic-icon-shell {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-tint);
  color: var(--text-secondary);
  transition: all 700ms cubic-bezier(0.32, 0.72, 0, 1);
}
.bento-card:hover .haptic-icon-shell {
  background: var(--accent-ultra-soft);
  color: var(--primary);
  transform: scale(1.08) rotate(4deg);
}
.card-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
  margin: 0;
  line-height: var(--line-height-tight);
}
.card-teaser {
  font-size: 12px;
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

/* Haptic Footer & Button Nesting */
.card-haptic-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--divider);
  padding-top: var(--space-md);
  margin-top: auto;
}
.subscription-metric {
  font-size: 11px;
  color: var(--text-muted);
}
.subscription-metric strong {
  color: var(--text);
  font-weight: 700;
}
.capsule-tags {
  display: flex;
  gap: var(--space-xs);
}
.capsule-tag {
  font-size: 10px;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  background: var(--surface-tint);
  color: var(--text-secondary);
  font-weight: 600;
  transition: all 700ms cubic-bezier(0.32, 0.72, 0, 1);
}
.bento-card:hover .capsule-tag {
  background: var(--accent-ultra-soft);
  color: var(--primary);
}
.card-trailing-circle {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--surface-tint);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 700ms cubic-bezier(0.32, 0.72, 0, 1);
  margin-left: var(--space-sm);
}
.bento-card:hover .card-trailing-circle {
  background: var(--primary);
  color: var(--primary-foreground);
  transform: translateX(2px) scale(1.05);
}
.chevron-glyph {
  transition: transform 700ms cubic-bezier(0.32, 0.72, 0, 1);
}
.bento-card:hover .chevron-glyph {
  transform: translateX(1px);
}

/* Bento Skeleton */
.bento-skeleton-card {
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
.bento-skeleton-card::before {
  content: '';
  display: block;
  position: absolute;
  left: -150px;
  top: 0;
  height: 100%;
  width: 150px;
  background: linear-gradient(
    to right,
    transparent 0%,
    rgba(255, 255, 255, 0.6) 50%,
    transparent 100%
  );
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer {
  from {
    left: -150px;
  }
  to {
    left: 100%;
  }
}
.skel-icon {
  width: 36px;
  height: 36px;
  background: var(--divider);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-md);
}
.skel-line-title {
  height: 14px;
  background: var(--divider);
  width: 50%;
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-md);
}
.skel-line-desc-1 {
  height: 11px;
  background: var(--divider);
  width: 85%;
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-xs);
}
.skel-line-desc-2 {
  height: 11px;
  background: var(--divider);
  width: 60%;
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-xl);
}
.skel-footer {
  display: flex;
  justify-content: space-between;
  margin-top: auto;
  border-top: 1px solid var(--divider);
  padding-top: var(--space-md);
}
.skel-badge {
  height: 12px;
  background: var(--divider);
  width: 50px;
  border-radius: var(--radius-pill);
}

/* Feedback Panel */
.haptic-feedback-card {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: var(--space-4xl) var(--space-2xl);
  text-align: center;
  box-shadow: var(--shadow-sm);
}
.feedback-emoji {
  font-size: 32px;
  margin-bottom: var(--space-md);
}
.haptic-feedback-card h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 var(--space-xs) 0;
}
.haptic-feedback-card p {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0 0 var(--space-xl) 0;
}
.bezel-action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  background: var(--primary);
  color: var(--primary-foreground);
  border: 0;
  padding: 10px 24px;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  transition: all 700ms cubic-bezier(0.32, 0.72, 0, 1);
  box-shadow: var(--shadow-sm);
}
.bezel-action-btn:hover {
  background: var(--primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
.u-spin-hover {
  transition: transform 0.6s ease;
}
.bezel-action-btn:hover .u-spin-hover {
  transform: rotate(360deg);
}

/* Editorial Pagination System */
.editorial-pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--space-xl);
  margin-top: var(--space-3xl);
  padding: var(--space-md) 0;
  border-top: 1px solid var(--divider);
}
.editorial-pag-btn {
  background: var(--surface);
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  padding: 8px 20px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: all 700ms cubic-bezier(0.32, 0.72, 0, 1);
  box-shadow: var(--shadow-sm);
}
.editorial-pag-btn:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
  transform: translateY(-1px);
  background: var(--accent-ultra-soft);
  box-shadow: var(--shadow-md);
}
.editorial-pag-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}
.editorial-pag-info {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
.editorial-pag-info strong {
  color: var(--primary);
}

/* Responsive Mobile Collapse Rules */
@media (max-width: 1024px) {
  .bento-layout {
    grid-template-columns: 1fr;
  }
  .left-control-center {
    position: static;
  }
  .pill-nav-list {
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
  .pill-nav-item {
    width: auto;
  }
  .pill-nav-item:hover {
    transform: none;
  }
  .stats-nested-box {
    display: none;
  }
}

@media (max-width: 768px) {
  .hero-headline {
    font-size: var(--text-2xl);
  }
  .search-inner-core {
    flex-direction: column;
    align-items: stretch;
    padding: 10px;
  }
  .sort-island select {
    width: 100%;
    text-align: center;
  }
}
</style>
