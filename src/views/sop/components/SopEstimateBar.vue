<template>
  <!-- 仅当 shouldEstimate=true 且 estimate 存在 且 skip_deduction=false 时渲染 -->
  <div v-if="shouldShow" class="sop-estimate-bar" :data-sufficient="String(!!estimate?.sufficient)">
    <div class="info">
      <span class="estimate">
        预估消耗 <strong>{{ estimate?.total_estimated_credits ?? 0 }}</strong> 积分
        <span v-if="(estimate?.node_count ?? 0) > 1" class="steps">
          （{{ estimate?.node_count }} 步）
        </span>
      </span>
      <span class="balance">
        当前余额
        <strong>{{ currentRemain }}</strong>
      </span>
    </div>
    <AppButton variant="primary" size="md" :disabled="!estimate?.sufficient" @click="emit('start')">
      {{ estimate?.sufficient ? '开始运行' : '积分不足，购买加量包' }}
    </AppButton>
  </div>
</template>

<script setup lang="ts">
/**
 * SopEstimateBar — SOP 运行前估算条（credits-system Track E.3，spec §4.2.5）
 *
 * ## 挂载约束（code review 硬性）
 *
 * 禁止出现在：`HomeView.vue`、SOP 列表页、任何循环渲染的容器内。
 * 仅允许在 `SopRunView`（单模板详情页）。
 *
 * ## 行为
 *
 * - `shouldEstimate` guard：
 *     - user.tier === 'free'                  → 不渲染，不调 API
 *     - balance.billing_mode === 'legacy_tier' → 不渲染，不调 API
 *     - 其它情况                              → 渲染，正常调用 estimateCredits
 * - debounce 300ms：父组件切换 `sopTemplateId` 时避免重复请求
 * - onMounted 一次立即触发（若 guard 允许）
 * - estimate.skip_deduction=true 时也隐藏（后端告知这次免扣）
 *
 * ## Emits
 *
 * - `start`：用户点击"开始运行"按钮，父组件接管 SOP 启动逻辑
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { useUserStore } from '@/stores/user'
import { useCreditsStore } from '@/stores/credits'
import AppButton from '@/components/common/AppButton.vue'
import type { EstimateResp } from '@/api/credits'

interface Props {
  sopTemplateId: string
  /**
   * debounce 毫秒数。默认 300ms（spec §4.2.5），测试可注入 0 立即触发。
   */
  debounceMs?: number
}
const props = withDefaults(defineProps<Props>(), { debounceMs: 300 })
const emit = defineEmits<{ (e: 'start'): void }>()

const user = useUserStore()
const credits = useCreditsStore()

const estimate = ref<EstimateResp | null>(null)

const tier = computed(() => {
  const info = user.userInfo as Record<string, unknown> | null
  const raw = (info?.user_tier ?? info?.tier ?? info?.plan ?? 'free') as string
  return String(raw).toLowerCase()
})

/** Guard — spec §4.2.5：free / legacy_tier 都跳过估算。 */
const shouldEstimate = computed(
  () => tier.value !== 'free' && credits.balance?.billing_mode !== 'legacy_tier'
)

const shouldShow = computed(
  () => shouldEstimate.value && !!estimate.value && !estimate.value.skip_deduction
)

const currentRemain = computed(() => {
  const b = credits.balance
  if (!b) return 0
  return (b.sub_remain ?? 0) + (b.booster_remain ?? 0)
})

async function runEstimate(): Promise<void> {
  if (!shouldEstimate.value) {
    estimate.value = null
    return
  }
  if (!props.sopTemplateId) return
  await credits.fetchEstimate('sop_run', props.sopTemplateId)
  estimate.value = credits.estimate
}

const debouncedEstimate = useDebounceFn(runEstimate, props.debounceMs)

onMounted(() => {
  if (shouldEstimate.value) void debouncedEstimate()
})

watch(
  () => props.sopTemplateId,
  (newId, oldId) => {
    if (newId !== oldId) void debouncedEstimate()
  }
)
</script>

<style scoped>
.sop-estimate-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md, 12px);
  padding: var(--space-md, 12px) var(--space-lg, 16px);
  background: #fff;
  border: 1px solid var(--border, #e8e9ee);
  border-radius: var(--radius-md, 12px);
}

.info {
  display: flex;
  align-items: baseline;
  gap: var(--space-lg, 16px);
  font-size: 13px;
  color: var(--text-secondary, #6b7085);
}

.info strong {
  font-size: 15px;
  font-weight: 700;
  color: var(--text, #1a1d26);
}

.steps {
  color: var(--text-tertiary, #9ea1b1);
  font-size: 12px;
}

.sop-estimate-bar[data-sufficient='false'] {
  border-color: var(--warning, #f59e0b);
}
</style>
