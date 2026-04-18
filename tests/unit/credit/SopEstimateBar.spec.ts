/**
 * SopEstimateBar 单元测试 — credits-system Track E.3
 *
 * 覆盖 spec §4.2.5 挂载条件 + debounce 行为：
 *   1. user.tier='free'               → 不渲染 + 不调 fetchEstimate
 *   2. billing_mode='legacy_tier'     → 不渲染 + 不调 fetchEstimate
 *   3. billing_mode='credits'         → 渲染 + 调 fetchEstimate，首次 onMounted 立即触发
 *   4. 切换 sopTemplateId → 触发 fetchEstimate（测试 watch 链）
 *   5. skip_deduction=true 不渲染（后端告知免扣）
 *   6. sufficient=false → 按钮禁用 + 文案切换
 *
 * 使用 debounceMs=0 让 useDebounceFn 退化为 microtask，便于断言。
 */
import { describe, it, expect, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

import SopEstimateBar from '@/views/sop/components/SopEstimateBar.vue'
import { useUserStore } from '@/stores/user'
import { useCreditsStore } from '@/stores/credits'
import type { EstimateResp, QuotaBreakdown } from '@/api/credits'

const balanceCredits: QuotaBreakdown = {
  balance: 1000,
  sub_total: 1000,
  sub_remain: 800,
  booster_total: 100,
  booster_remain: 100,
  billing_mode: 'credits'
}

const balanceLegacy: QuotaBreakdown = {
  balance: 0,
  sub_total: 0,
  sub_remain: 0,
  booster_total: 0,
  booster_remain: 0,
  billing_mode: 'legacy_tier',
  monthly_limit: 20,
  remaining_runs: 5
}

const estimateOK: EstimateResp = {
  total_estimated_credits: 80,
  first_node_estimate: 20,
  node_count: 4,
  sufficient: true,
  skip_deduction: false,
  balance: balanceCredits,
  coefficient_id: 1
}

async function settle() {
  // 3 轮 microtask：let debounceMs=0 → 内部 setTimeout 触发 → await fetch → DOM 更新
  await flushPromises()
  await nextTick()
  await flushPromises()
}

function setup(opts: { tier: string; balance: QuotaBreakdown | null }) {
  setActivePinia(createPinia())
  const user = useUserStore()
  user.userInfo = { id: 1, username: 'u', user_tier: opts.tier }
  const credits = useCreditsStore()
  credits.balance = opts.balance
  const fetchSpy = vi.fn(async () => {
    credits.estimate = estimateOK
  })
  credits.fetchEstimate = fetchSpy as typeof credits.fetchEstimate
  return { user, credits, fetchSpy }
}

describe('SopEstimateBar — guard 条件', () => {
  it('user.tier=free → 不渲染 + 不调 fetchEstimate', async () => {
    const { fetchSpy } = setup({ tier: 'free', balance: balanceCredits })
    const wrapper = mount(SopEstimateBar, {
      props: { sopTemplateId: 'sop-1', debounceMs: 0 }
    })
    await settle()

    expect(wrapper.find('.sop-estimate-bar').exists()).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('billing_mode=legacy_tier → 不渲染 + 不调 fetchEstimate', async () => {
    const { fetchSpy } = setup({ tier: 'premium', balance: balanceLegacy })
    const wrapper = mount(SopEstimateBar, {
      props: { sopTemplateId: 'sop-1', debounceMs: 0 }
    })
    await settle()

    expect(wrapper.find('.sop-estimate-bar').exists()).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('billing_mode=credits + tier !== free → 渲染 + 调 fetchEstimate', async () => {
    const { fetchSpy } = setup({ tier: 'premium', balance: balanceCredits })
    const wrapper = mount(SopEstimateBar, {
      props: { sopTemplateId: 'sop-1', debounceMs: 0 }
    })
    await settle()

    expect(fetchSpy).toHaveBeenCalledWith('sop_run', 'sop-1')
    expect(wrapper.find('.sop-estimate-bar').exists()).toBe(true)
    expect(wrapper.text()).toContain('预估消耗')
    expect(wrapper.text()).toContain('80')
    expect(wrapper.text()).toContain('4 步')
    expect(wrapper.text()).toContain('开始运行')
  })
})

describe('SopEstimateBar — 行为', () => {
  it('sopTemplateId 切换 → 再次触发 fetchEstimate', async () => {
    const { fetchSpy } = setup({ tier: 'premium', balance: balanceCredits })
    const wrapper = mount(SopEstimateBar, {
      props: { sopTemplateId: 'sop-1', debounceMs: 0 }
    })
    await settle()
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ sopTemplateId: 'sop-2' })
    await settle()

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(fetchSpy).toHaveBeenLastCalledWith('sop_run', 'sop-2')
  })

  it('skip_deduction=true → 不渲染 bar', async () => {
    const { credits } = setup({ tier: 'premium', balance: balanceCredits })
    credits.fetchEstimate = vi.fn(async () => {
      credits.estimate = { ...estimateOK, skip_deduction: true }
    }) as typeof credits.fetchEstimate

    const wrapper = mount(SopEstimateBar, {
      props: { sopTemplateId: 'sop-1', debounceMs: 0 }
    })
    await settle()

    expect(wrapper.find('.sop-estimate-bar').exists()).toBe(false)
  })

  it('sufficient=false → 按钮禁用 + 文案切换', async () => {
    const { credits } = setup({ tier: 'premium', balance: balanceCredits })
    credits.fetchEstimate = vi.fn(async () => {
      credits.estimate = { ...estimateOK, sufficient: false }
    }) as typeof credits.fetchEstimate

    const wrapper = mount(SopEstimateBar, {
      props: { sopTemplateId: 'sop-1', debounceMs: 0 }
    })
    await settle()

    const bar = wrapper.find('.sop-estimate-bar')
    expect(bar.exists()).toBe(true)
    expect(bar.attributes('data-sufficient')).toBe('false')
    const btn = wrapper.find('button')
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.text()).toContain('积分不足')
  })

  it('点击按钮触发 start emit', async () => {
    setup({ tier: 'premium', balance: balanceCredits })
    const wrapper = mount(SopEstimateBar, {
      props: { sopTemplateId: 'sop-1', debounceMs: 0 }
    })
    await settle()

    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('start')).toHaveLength(1)
  })

  it('单 node SOP（node_count=1）→ 不渲染步数括号', async () => {
    const { credits } = setup({ tier: 'premium', balance: balanceCredits })
    credits.fetchEstimate = vi.fn(async () => {
      credits.estimate = {
        ...estimateOK,
        node_count: 1,
        total_estimated_credits: 25,
        first_node_estimate: 25
      }
    }) as typeof credits.fetchEstimate

    const wrapper = mount(SopEstimateBar, {
      props: { sopTemplateId: 'sop-1', debounceMs: 0 }
    })
    await settle()

    expect(wrapper.find('.steps').exists()).toBe(false)
  })
})
