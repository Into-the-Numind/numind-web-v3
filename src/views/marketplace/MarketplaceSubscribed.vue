<!--
  MarketplaceSubscribed — 我的订阅 (DataTable per ui-ux.md 硬规则 1) (T9).
  agent-mode-v2-skill-marketplace spec §8.3.

  Router: /marketplace/subscribed
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft } from 'lucide-vue-next'

import { useMarketplaceStore } from '@/stores/marketplace'
import { useNotificationsStore } from '@/stores/notifications'
import DataTable, { type Column } from '@/components/common/DataTable.vue'
import AppButton from '@/components/common/AppButton.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import MainLayout from '@/components/layout/MainLayout.vue'
import { formatDateTime } from '@/utils/datetime'
import type { SubscriptionItem } from '@/types/marketplace'

const router = useRouter()
const store = useMarketplaceStore()
const notifications = useNotificationsStore()

const columns: Column[] = [
  { key: 'name', title: '技能名称', align: 'left' },
  { key: 'category_tags', title: '分类', width: '200px' },
  { key: 'subscribed_at', title: '订阅时间', width: '180px' },
  { key: 'agent_count', title: '装载 Agent', width: '110px', align: 'center' },
  { key: 'actions', title: '操作', width: '240px', align: 'right' }
]

const page = ref(1)
const pageSize = 20

const confirmOpen = ref(false)
const pending = ref<SubscriptionItem | null>(null)

async function load() {
  // Clear stale error so the loading state isn't masked when retrying after a
  // prior failure (T9 P1 reviewer fix: spec compliance B.2).
  store.mySubscriptionsError = ''
  await store.fetchMySubscriptions({ page: page.value, page_size: pageSize })
}
onMounted(load)

function goDetail(item: SubscriptionItem) {
  router.push(`/marketplace/${item.marketplace.id}`)
}

function goLoadIntoAgent(item: SubscriptionItem) {
  // 跳到 Skill 编辑/列表页，让用户选 Agent 装载 (沿用 #1 SkillBindingPanel UX)
  router.push(`/config/skills/${item.subscription.cloned_skill_id}`)
}

function askUnsubscribe(item: SubscriptionItem) {
  pending.value = item
  confirmOpen.value = true
}

async function doUnsubscribe() {
  if (!pending.value) return
  const item = pending.value
  confirmOpen.value = false
  try {
    await store.unsubscribe(item.marketplace.id)
    notifications.success(`已取消订阅：「${item.marketplace.name}」已从列表移除`)
    if (item.agent_count > 0) {
      notifications.warning(`${item.agent_count} 个 Agent 装载了此技能，装载关系已失效`)
    }
  } catch (e) {
    notifications.error(`取消订阅失败：${(e as Error).message || '请稍后重试'}`)
  } finally {
    pending.value = null
  }
}

function onPageChange(p: number) {
  page.value = p
  load()
}
</script>

<template>
  <MainLayout>
    <div class="marketplace-subscribed">
      <div class="back-link" @click="router.push('/marketplace')">
        <ArrowLeft :size="16" />
        <span>返回市场</span>
      </div>

      <header class="page-header">
        <h1>我的订阅</h1>
      </header>

      <!-- States order: loading → error → empty → success (T9 P1 reviewer fix). -->
      <div v-if="store.mySubscriptionsLoading && store.mySubsEmpty" class="state-msg">
        <p>加载中...</p>
      </div>

      <div v-else-if="store.mySubscriptionsError" class="state-msg state-msg--error">
        <p>{{ store.mySubscriptionsError }}</p>
        <AppButton @click="load">重试</AppButton>
      </div>

      <div v-else-if="store.mySubsEmpty" class="state-msg state-msg--empty">
        <p>还没有订阅的技能</p>
        <router-link to="/marketplace" class="cta">去市场逛逛 →</router-link>
      </div>

      <!-- Success: DataTable -->
      <DataTable
        v-else
        :columns="columns"
        :data="store.mySubscriptions"
        :loading="store.mySubscriptionsLoading"
        :total="store.mySubscriptionsTotal"
        :page="page"
        :page-size="pageSize"
        row-key="id"
        @update:page="onPageChange"
      >
        <template #cell-name="{ row }">
          <span class="name-cell">{{ (row as SubscriptionItem).marketplace.name }}</span>
          <span
            v-if="(row as SubscriptionItem).marketplace.is_platform_recommended"
            class="badge badge--recommended"
            >推荐</span
          >
        </template>
        <template #cell-category_tags="{ row }">
          <span
            v-for="t in (row as SubscriptionItem).marketplace.category_tags"
            :key="t"
            class="tag"
            >{{ t }}</span
          >
        </template>
        <template #cell-subscribed_at="{ row }">
          {{ formatDateTime((row as SubscriptionItem).subscription.subscribed_at) }}
        </template>
        <template #cell-agent_count="{ row }">
          {{ (row as SubscriptionItem).agent_count }}
        </template>
        <template #cell-actions="{ row }">
          <AppButton size="sm" @click="goLoadIntoAgent(row as SubscriptionItem)"
            >装载到 Agent</AppButton
          >
          <AppButton size="sm" @click="goDetail(row as SubscriptionItem)">详情</AppButton>
          <AppButton size="sm" variant="text" @click="askUnsubscribe(row as SubscriptionItem)">
            取消订阅
          </AppButton>
        </template>
      </DataTable>

      <ConfirmModal
        v-model="confirmOpen"
        title="确认取消订阅"
        :message="
          pending
            ? `取消订阅「${pending.marketplace.name}」会软删除你的副本技能${
                pending.agent_count > 0 ? `（影响 ${pending.agent_count} 个 Agent 装载关系）` : ''
              }。继续？`
            : ''
        "
        variant="danger"
        confirm-text="取消订阅"
        @confirm="doUnsubscribe"
      />
    </div>
  </MainLayout>
</template>

<style scoped>
.marketplace-subscribed {
  padding: 24px 32px;
  max-width: 1280px;
  margin: 0 auto;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--color-text-secondary, #6b7280);
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 20px;
  user-select: none;
}

.back-link:hover {
  color: var(--color-primary, #2563eb);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 20px;
}

.page-header h1 {
  margin: 0;
  font-size: 22px;
}
.name-cell {
  font-weight: 500;
  margin-right: 6px;
}
.badge--recommended {
  background: #fef3c7;
  color: #92400e;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
}
.tag {
  display: inline-block;
  padding: 2px 8px;
  background: var(--color-bg-secondary, #f3f4f6);
  border-radius: 999px;
  font-size: 12px;
  margin-right: 4px;
}
.state-msg {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-secondary, #6b7280);
}
.state-msg--error {
  color: var(--color-danger, #dc2626);
}
.state-msg .cta {
  color: var(--color-primary, #2563eb);
  text-decoration: none;
  font-size: 14px;
}
</style>
