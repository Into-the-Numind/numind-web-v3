/**
 * OutputCard 组件单元测试（F6 + 页脚行改造 sop-step-footer-polish）
 *
 * 覆盖：
 *   - read-only：复制 + 保存生成记录按钮（左）+ 耗时/模型/tokens meta（右）在同一行 .output__footer
 *   - 模型展示 display_name（非 model_key）；列表缺失时回退 key
 *   - hasOutput=false / nodeRun=null / model_name='' 的渲染门槛
 *   - ⭐ 收藏态 + emit 接口
 *
 * 注：OutputCard 用 useLLMModelStore 把 model_key 映射成 display_name，故测试需活动 Pinia；
 * 预置 loadedByFeature.sop=true 让 onMounted 的 fetchModels 早返回（不发真实 HTTP）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OutputCard from '../OutputCard.vue'
import { useLLMModelStore } from '@/stores/llmModel'
import type { SopNodeRun } from '@/views/sop/types'
import type { LLMModel } from '@/api/llm'

function model(key: string, name: string): LLMModel {
  return {
    model_key: key,
    display_name: name,
    supports_thinking: false,
    thinking_only: false,
    icon: '',
    sort_order: 0
  }
}

function seedModels(models: LLMModel[]) {
  const store = useLLMModelStore()
  store.modelsByFeature = { sop: models }
  store.loadedByFeature = { sop: true } // fetchModels 早返回，不触发 HTTP
}

function makeNodeRun(overrides: Partial<SopNodeRun> = {}): SopNodeRun {
  return {
    id: 1,
    run_id: 1,
    node_id: 1,
    status: 'succeeded',
    input: 'some input',
    output: '# 输出标题\n\n这是一段 markdown 输出。',
    thinking: '',
    latency_ms: 7400,
    model_name: 'glm-4-7',
    total_tokens: 586,
    started_at: '2026-04-11T14:33:00Z',
    finished_at: '2026-04-11T14:33:12Z',
    ...overrides
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  seedModels([model('glm-4-7', 'GLM 4.7')])
})

describe('OutputCard', () => {
  describe('read-only footer row', () => {
    it('renders copy/save actions (left) + 耗时/模型/tokens meta (right) on one .output__footer row', () => {
      const wrapper = mount(OutputCard, {
        props: { nodeRun: makeNodeRun(), state: 'read-only', hasOutput: true, hasBookmark: false }
      })
      expect(wrapper.find('.output__footer').exists()).toBe(true)
      // 左侧动作
      expect(wrapper.find('.output__footer-actions [data-testid="output-copy"]').exists()).toBe(
        true
      )
      expect(wrapper.find('.output__footer-actions [data-testid="bookmark-toggle"]').exists()).toBe(
        true
      )
      // 右侧 meta 三项
      const meta = wrapper.find('.output__footer-meta')
      expect(meta.exists()).toBe(true)
      expect(meta.findAll('.output__meta-item').length).toBe(3)
      expect(meta.text()).toContain('耗时 7.4s')
      expect(meta.text()).toContain('586 tokens')
      // 旧 MetaFooter 已不在 OutputCard 内
      expect(wrapper.find('.meta-footer').exists()).toBe(false)
      expect(wrapper.find('.output__foot').exists()).toBe(false)
    })

    it('shows model display_name, not the raw model_key', () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: makeNodeRun({ model_name: 'glm-4-7' }),
          state: 'read-only',
          hasOutput: true
        }
      })
      const meta = wrapper.find('.output__footer-meta')
      expect(meta.text()).toContain('GLM 4.7')
      expect(meta.text()).not.toContain('glm-4-7')
    })

    it('falls back to the raw key when the model is not in the list', () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: makeNodeRun({ model_name: 'deprecated-model-x' }),
          state: 'read-only',
          hasOutput: true
        }
      })
      expect(wrapper.find('.output__footer-meta').text()).toContain('deprecated-model-x')
    })

    it('omits the tokens item when total_tokens is 0', () => {
      const wrapper = mount(OutputCard, {
        props: { nodeRun: makeNodeRun({ total_tokens: 0 }), state: 'read-only', hasOutput: true }
      })
      const meta = wrapper.find('.output__footer-meta')
      expect(meta.findAll('.output__meta-item').length).toBe(2)
      expect(meta.text()).not.toContain('tokens')
    })

    it('hides the meta group when nodeRun lacks model_name (R7 fallback)', () => {
      const wrapper = mount(OutputCard, {
        props: { nodeRun: makeNodeRun({ model_name: '' }), state: 'read-only', hasOutput: true }
      })
      expect(wrapper.find('.output__footer-meta').exists()).toBe(false)
      // 但复制/保存仍在
      expect(wrapper.find('[data-testid="output-copy"]').exists()).toBe(true)
    })

    it('hides the meta group when latency_ms is 0 (missing / legacy data)', () => {
      const wrapper = mount(OutputCard, {
        props: { nodeRun: makeNodeRun({ latency_ms: 0 }), state: 'read-only', hasOutput: true }
      })
      expect(wrapper.find('.output__footer-meta').exists()).toBe(false)
      expect(wrapper.find('[data-testid="output-copy"]').exists()).toBe(true)
    })

    it('renders no footer at all when nodeRun is null and hasOutput=false', () => {
      const wrapper = mount(OutputCard, {
        props: { nodeRun: null, state: 'read-only', hasOutput: false }
      })
      expect(wrapper.find('.output__footer').exists()).toBe(false)
      expect(wrapper.find('.meta-footer').exists()).toBe(false)
    })

    it('applies is-active class when hasBookmark=true', () => {
      const wrapper = mount(OutputCard, {
        props: { nodeRun: makeNodeRun(), state: 'read-only', hasOutput: true, hasBookmark: true }
      })
      const star = wrapper.find('[data-testid="bookmark-toggle"]')
      expect(star.classes()).toContain('is-active')
      expect(star.text()).toContain('已保存')
    })

    it('emits toggle-bookmark on ⭐ click', async () => {
      const wrapper = mount(OutputCard, {
        props: { nodeRun: makeNodeRun(), state: 'read-only', hasOutput: true }
      })
      await wrapper.find('[data-testid="bookmark-toggle"]').trigger('click')
      expect(wrapper.emitted('toggle-bookmark')).toBeTruthy()
      expect(wrapper.emitted('toggle-bookmark')?.length).toBe(1)
    })

    it('emits copy on copy click', async () => {
      const wrapper = mount(OutputCard, {
        props: { nodeRun: makeNodeRun(), state: 'read-only', hasOutput: true }
      })
      await wrapper.find('[data-testid="output-copy"]').trigger('click')
      expect(wrapper.emitted('copy')).toBeTruthy()
      expect(wrapper.emitted('copy')?.length).toBe(1)
    })
  })

  describe('model display name fuzzy matching (历史 model_name 与注册表 key 容错)', () => {
    // 注册表用 thinking 变体 + 各模型；执行时存的 model_name 形态不一
    const registry = [
      model('deepseek-v4-pro', 'DeepSeek V4 Pro'),
      model('deepseek-v3.2-thinking', 'DeepSeek V3.2'),
      model('claude-sonnet-4-6-thinking', 'Claude Sonnet 4.6'),
      model('gpt-5.4', 'GPT 5.4')
    ]
    function metaText(storedKey: string): string {
      seedModels(registry)
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: makeNodeRun({ model_name: storedKey }),
          state: 'read-only',
          hasOutput: true
        }
      })
      return wrapper.find('.output__footer-meta').text()
    }

    it('exact key → display_name', () => {
      expect(metaText('deepseek-v4-pro')).toContain('DeepSeek V4 Pro')
    })
    it('stored base key vs registry -thinking 变体 → display_name', () => {
      expect(metaText('deepseek-v3.2')).toContain('DeepSeek V3.2')
      expect(metaText('deepseek-v3.2')).not.toContain('deepseek-v3.2')
    })
    it('stored -think 简写 → display_name', () => {
      expect(metaText('deepseek-v3.2-think')).toContain('DeepSeek V3.2')
    })
    it('stored 带日期后缀的 provider id → display_name', () => {
      expect(metaText('gpt-5.4-2026-03-05')).toContain('GPT 5.4')
    })
    it('completely unmappable key → 回退原值', () => {
      expect(metaText('totally-unknown-model')).toContain('totally-unknown-model')
    })
  })

  describe('regenerate emit interface (spec §5.2)', () => {
    it('declares regenerate emit and does not fire it by default', () => {
      const wrapper = mount(OutputCard, {
        props: { nodeRun: makeNodeRun(), state: 'read-only', hasOutput: true }
      })
      expect(wrapper.emitted('regenerate')).toBeUndefined()
      wrapper.vm.$emit('regenerate')
      expect(wrapper.emitted('regenerate')).toBeTruthy()
      expect(wrapper.emitted('regenerate')?.length).toBe(1)
    })
  })
})
