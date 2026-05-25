<!--
  MarketplaceDetail — 详情页 (T9).
  agent-mode-v2-skill-marketplace spec §8.3.

  Router: /marketplace/:id
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { RefreshCcw, ArrowLeft } from 'lucide-vue-next'

import { useMarketplaceStore } from '@/stores/marketplace'
import { useNotificationsStore } from '@/stores/notifications'
import AppButton from '@/components/common/AppButton.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'

const route = useRoute()
const router = useRouter()
const store = useMarketplaceStore()
const notifications = useNotificationsStore()

const marketplaceID = computed(() => Number(route.params.id))
const confirmSubscribeOpen = ref(false)
const confirmUnsubscribeOpen = ref(false)

// subscribed status derived from store.mySubscriptions (T9 P1 reviewer fix):
// previous implementation used a local ref defaulting to false, which made the
// "Subscribe" button show on page reload even for already-subscribed users.
// Now we hydrate mySubscriptions on mount and compute subscribed from it.
//
// Backend Get /v1/marketplace/:id does NOT currently return i_subscribed
// (spec §4.1 design intent — controller passes mp through unmodified; field
// hydration is a backend tech debt logged in manifest S4-T9-D3). Until backend
// adds i_subscribed, mySubscriptions provides the authoritative status.
const subscribed = computed(() =>
  store.mySubscriptions.some((s) => s.marketplace.id === marketplaceID.value)
)

async function load() {
  if (!marketplaceID.value) return
  // Parallel: detail fetch + my-subscriptions fetch (needed for subscribed status).
  await Promise.all([store.fetchDetail(marketplaceID.value), store.fetchMySubscriptions()])
}
onMounted(load)
watch(marketplaceID, load)

const renderedBody = computed(() => {
  const body = store.currentItem?.sanitized_body_md || ''
  const raw = marked.parse(body, { async: false }) as string
  return DOMPurify.sanitize(raw)
})

async function doSubscribe() {
  confirmSubscribeOpen.value = false
  try {
    const res = await store.subscribe(marketplaceID.value)
    // Refresh mySubscriptions so the computed `subscribed` flips to true.
    await store.fetchMySubscriptions()
    notifications.success(`订阅成功：已添加到你的技能库（skill id=${res.cloned_skill_id}）`)
  } catch (e) {
    notifications.error(`订阅失败：${(e as Error).message || '请稍后重试'}`)
  }
}

async function doUnsubscribe() {
  confirmUnsubscribeOpen.value = false
  try {
    await store.unsubscribe(marketplaceID.value)
    // store.unsubscribe already drops the row from mySubscriptions optimistically;
    // computed `subscribed` flips to false without an extra fetch.
    notifications.success('已取消订阅：副本技能已软删除')
  } catch (e) {
    notifications.error(`取消订阅失败：${(e as Error).message || '请稍后重试'}`)
  }
}

function back() {
  router.push('/marketplace')
}
</script>

<template>
  <div class="marketplace-detail">
    <div class="back-link" @click="back">
      <ArrowLeft :size="16" />
      <span>返回市场</span>
    </div>

    <!-- Loading -->
    <div v-if="store.currentLoading" class="state-msg">加载中...</div>

    <!-- Error -->
    <div v-else-if="store.currentError" class="state-msg state-msg--error">
      <p>{{ store.currentError }}</p>
      <AppButton @click="load"><RefreshCcw :size="14" /> 重试</AppButton>
    </div>

    <!-- Empty/Not found -->
    <div v-else-if="!store.currentItem" class="state-msg state-msg--empty">
      <p>项目不存在或已下架</p>
      <AppButton @click="back">返回市场</AppButton>
    </div>

    <!-- Success -->
    <template v-else>
      <header class="detail-header">
        <h1>{{ store.currentItem.name }}</h1>
        <div class="meta">
          <span v-if="store.currentItem.is_platform_recommended" class="badge badge--recommended">
            官方推荐
          </span>
          <span class="meta__count">{{ store.currentItem.subscribe_count }} 人订阅</span>
        </div>
        <p class="desc">{{ store.currentItem.description }}</p>

        <div class="actions">
          <AppButton
            v-if="!subscribed"
            variant="primary"
            :loading="store.saving"
            @click="confirmSubscribeOpen = true"
          >
            订阅
          </AppButton>
          <AppButton
            v-else
            variant="secondary"
            :loading="store.saving"
            @click="confirmUnsubscribeOpen = true"
          >
            取消订阅
          </AppButton>
        </div>
      </header>

      <section class="meta-table">
        <h2>技能信息</h2>
        <dl>
          <dt>何时使用</dt>
          <dd>{{ store.currentItem.when_to_use || '（未填写）' }}</dd>
          <dt>允许工具</dt>
          <dd>
            <span v-for="t in store.currentItem.allowed_tools" :key="t" class="tool-tag">{{
              t
            }}</span>
            <span v-if="!store.currentItem.allowed_tools?.length" class="muted">（无）</span>
          </dd>
          <dt>分类</dt>
          <dd>
            <span v-for="c in store.currentItem.category_tags" :key="c" class="tag">{{ c }}</span>
          </dd>
        </dl>
      </section>

      <section class="body">
        <h2>完整内容</h2>
        <!-- DOMPurify-sanitized markdown HTML; trusted output (DOMPurify allowlist) -->
        <!-- eslint-disable-next-line vue/no-v-html -->
        <article class="markdown" v-html="renderedBody"></article>
      </section>
    </template>

    <ConfirmModal
      v-model="confirmSubscribeOpen"
      title="确认订阅"
      message="订阅后会在你的技能库添加一份副本，可装载到 Agent。继续？"
      confirm-text="订阅"
      @confirm="doSubscribe"
    />
    <ConfirmModal
      v-model="confirmUnsubscribeOpen"
      title="确认取消订阅"
      message="取消订阅会软删除你的副本技能。已装载到 Agent 的关系将失效。确认？"
      variant="danger"
      confirm-text="取消订阅"
      @confirm="doUnsubscribe"
    />
  </div>
</template>

<style scoped>
.marketplace-detail {
  padding: 24px 32px;
  max-width: 920px;
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
.detail-header h1 {
  margin: 0 0 8px;
  font-size: 22px;
}
.meta {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
  margin-bottom: 12px;
}
.badge--recommended {
  background: #fef3c7;
  color: #92400e;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}
.desc {
  margin: 0 0 16px;
  color: var(--color-text-secondary, #4b5563);
}
.actions {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
}
.meta-table {
  background: var(--color-bg-secondary, #f9fafb);
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
}
.meta-table h2,
.body h2 {
  font-size: 16px;
  margin: 0 0 12px;
}
.meta-table dl {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 8px 16px;
  margin: 0;
}
.meta-table dt {
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
}
.meta-table dd {
  margin: 0;
}
.tool-tag,
.tag {
  display: inline-block;
  padding: 2px 8px;
  background: #fff;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 999px;
  font-size: 12px;
  margin-right: 4px;
}
.muted {
  color: var(--color-text-secondary, #9ca3af);
  font-size: 13px;
}
.markdown {
  font-size: 14px;
  line-height: 1.7;
}
.markdown :deep(h1) {
  font-size: 20px;
  margin: 16px 0 8px;
}
.markdown :deep(h2) {
  font-size: 17px;
  margin: 14px 0 6px;
}
.markdown :deep(pre) {
  background: #f6f8fa;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
}
.markdown :deep(code) {
  background: #f6f8fa;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 13px;
}
.state-msg {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-secondary, #6b7280);
}
.state-msg--error {
  color: var(--color-danger, #dc2626);
}
</style>
