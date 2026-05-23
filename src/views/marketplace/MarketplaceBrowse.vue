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
import { Search, RefreshCcw } from 'lucide-vue-next'

import { useMarketplaceStore } from '@/stores/marketplace'
import AppButton from '@/components/common/AppButton.vue'

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
</script>

<template>
  <div class="marketplace-browse">
    <header class="page-header">
      <h1>技能市场</h1>
      <p class="subtitle">浏览其他机构发布的脱敏技能，一键订阅到自己的技能库。</p>
      <div class="page-header__actions">
        <router-link to="/marketplace/subscribed" class="link-subscribed"> 我的订阅 → </router-link>
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
          <AppButton
            :disabled="store.queryPage <= 1"
            @click="
              store.queryPage = Math.max(1, store.queryPage - 1)
              store.fetchList()
            "
          >
            上一页
          </AppButton>
          <span class="pagination__info">
            第 {{ store.queryPage }} 页 / 共 {{ Math.ceil(store.total / store.queryPageSize) }} 页
          </span>
          <AppButton
            :disabled="store.queryPage * store.queryPageSize >= store.total"
            @click="
              store.queryPage = store.queryPage + 1
              store.fetchList()
            "
          >
            下一页
          </AppButton>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.marketplace-browse {
  padding: 24px 32px;
  max-width: 1280px;
  margin: 0 auto;
}

.page-header h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}
.page-header .subtitle {
  margin: 4px 0 0;
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
}
.page-header__actions {
  margin-top: 8px;
}
.link-subscribed {
  font-size: 13px;
  color: var(--color-primary, #2563eb);
  text-decoration: none;
}

.toolbar {
  display: flex;
  gap: 16px;
  margin: 20px 0;
  align-items: center;
}
.search-input {
  position: relative;
  flex: 1;
}
.search-input input {
  width: 100%;
  padding: 9px 12px 9px 36px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  font-size: 14px;
}
.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-secondary, #9ca3af);
}
.toolbar select {
  padding: 9px 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
}

.layout {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 24px;
}
.sidebar h3 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
  text-transform: uppercase;
}
.sidebar ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.sidebar li button {
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}
.sidebar li button:hover {
  background: var(--color-bg-secondary, #f9fafb);
}
.sidebar li button.active {
  background: var(--color-primary-soft, #e0e7ff);
  color: var(--color-primary, #2563eb);
  font-weight: 500;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.card {
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 12px;
  padding: 16px;
  cursor: pointer;
  background: #fff;
  transition:
    box-shadow 0.15s,
    transform 0.05s;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 140px;
}
.card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}
.card.skeleton {
  background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
  background-size: 200% 100%;
  animation: skeleton 1.5s ease-in-out infinite;
  cursor: default;
}
@keyframes skeleton {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
.card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.card__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}
.card__desc {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
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
  font-size: 12px;
  margin-top: auto;
}
.card__count {
  color: var(--color-text-secondary, #6b7280);
}
.card__tags {
  display: flex;
  gap: 4px;
}
.tag {
  padding: 2px 8px;
  background: var(--color-bg-secondary, #f3f4f6);
  border-radius: 999px;
}
.badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}
.badge--recommended {
  background: #fef3c7;
  color: #92400e;
}

.state-msg {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-secondary, #6b7280);
}
.state-msg p {
  margin: 0 0 16px;
}
.state-msg--error {
  color: var(--color-danger, #dc2626);
}

.pagination {
  margin-top: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
}
.pagination__info {
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
}
</style>
