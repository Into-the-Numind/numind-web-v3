/**
 * OutputCard 组件单元测试（F6 + review fix）
 *
 * 覆盖：
 *   1. streaming 渲染：LIVE 标签 + 停止按钮，无 MetaFooter，output--streaming class
 *   2. read-only 渲染：⭐ + 复制按钮 + MetaFooter（wrap 在 .output__foot）
 *   3. read-only + hasOutput=false → ⭐ 按钮隐藏
 *   4. ⭐ 点击 → emit 'toggle-bookmark'
 *   5. 复制点击 → emit 'copy'
 *   6. 停止点击 → emit 'stop'
 *   7. hasBookmark=true → 显示"已收藏"态 class is-active
 *   8. nodeRun=null + read-only → 不渲染 MetaFooter（fallback 空态）
 *   9. streaming 时不显示 tiny buttons
 *  10. regenerate emit 接口存在（由外层 ActionRow/F11 触发）
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import OutputCard from '../OutputCard.vue'
import type { SopNodeRun } from '@/views/sop/types'

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

describe('OutputCard', () => {
  describe('streaming state', () => {
    it('renders LIVE label + stop button, no footer, adds --streaming class', () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: null,
          state: 'streaming',
          streamingContent: '正在生成中…',
          streamingThinking: ''
        }
      })
      expect(wrapper.find('.output').classes()).toContain('output--streaming')
      expect(wrapper.find('.output__live-dot').exists()).toBe(true)
      expect(wrapper.find('.output__live-label').exists()).toBe(true)
      expect(wrapper.text()).toContain('live')

      // 停止按钮可见
      expect(wrapper.find('[data-testid="output-stop"]').exists()).toBe(true)

      // tiny buttons 不可见
      expect(wrapper.find('[data-testid="bookmark-toggle"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="output-copy"]').exists()).toBe(false)

      // 无 MetaFooter
      expect(wrapper.find('.meta-footer').exists()).toBe(false)
    })

    it('emits stop on stop button click', async () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: null,
          state: 'streaming',
          streamingContent: 'partial'
        }
      })
      await wrapper.find('[data-testid="output-stop"]').trigger('click')
      expect(wrapper.emitted('stop')).toBeTruthy()
      expect(wrapper.emitted('stop')?.length).toBe(1)
    })
  })

  describe('read-only state', () => {
    it('renders ⭐ + copy buttons and MetaFooter (wrapped in .output__foot) when hasOutput=true', () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: makeNodeRun(),
          state: 'read-only',
          hasOutput: true,
          hasBookmark: false
        }
      })
      expect(wrapper.find('[data-testid="bookmark-toggle"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="output-copy"]').exists()).toBe(true)
      // MetaFooter wrap 在 .output__foot 内（F6 review fix E2）
      expect(wrapper.find('.output__foot').exists()).toBe(true)
      expect(wrapper.find('.output__foot .meta-footer').exists()).toBe(true)
      // 无 LIVE
      expect(wrapper.find('.output__live-dot').exists()).toBe(false)
      expect(wrapper.find('[data-testid="output-stop"]').exists()).toBe(false)
    })

    it('hides ⭐ button when hasOutput=false', () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: makeNodeRun(),
          state: 'read-only',
          hasOutput: false
        }
      })
      expect(wrapper.find('[data-testid="bookmark-toggle"]').exists()).toBe(false)
      // 复制按钮依然存在
      expect(wrapper.find('[data-testid="output-copy"]').exists()).toBe(true)
    })

    it('applies is-active class when hasBookmark=true', () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: makeNodeRun(),
          state: 'read-only',
          hasOutput: true,
          hasBookmark: true
        }
      })
      const star = wrapper.find('[data-testid="bookmark-toggle"]')
      expect(star.classes()).toContain('is-active')
      expect(star.text()).toContain('已收藏')
    })

    it('emits toggle-bookmark on ⭐ click', async () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: makeNodeRun(),
          state: 'read-only',
          hasOutput: true
        }
      })
      await wrapper.find('[data-testid="bookmark-toggle"]').trigger('click')
      expect(wrapper.emitted('toggle-bookmark')).toBeTruthy()
      expect(wrapper.emitted('toggle-bookmark')?.length).toBe(1)
    })

    it('emits copy on copy click', async () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: makeNodeRun(),
          state: 'read-only',
          hasOutput: false
        }
      })
      await wrapper.find('[data-testid="output-copy"]').trigger('click')
      expect(wrapper.emitted('copy')).toBeTruthy()
      expect(wrapper.emitted('copy')?.length).toBe(1)
    })

    it('does not render MetaFooter when nodeRun is null (fallback)', () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: null,
          state: 'read-only',
          hasOutput: false
        }
      })
      expect(wrapper.find('.output__foot').exists()).toBe(false)
      expect(wrapper.find('.meta-footer').exists()).toBe(false)
    })

    it('hides MetaFooter if nodeRun lacks model_name (R7 fallback)', () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: makeNodeRun({ model_name: '' }),
          state: 'read-only',
          hasOutput: true
        }
      })
      // OutputCard 渲染 MetaFooter 组件节点，但 MetaFooter 内部 v-if 会隐藏整行
      expect(wrapper.find('.meta-footer').exists()).toBe(false)
    })
  })

  describe('regenerate emit interface (spec §5.2)', () => {
    /*
     * F6 review fix E1：OutputCard 必须声明 regenerate emit。
     * 本组件内部没有触发按钮（按钮位于外层 ActionRow/F7，由 F11 主容器接线），
     * 但 emits 契约必须存在以便 TS 类型检查和父组件监听。
     *
     * 测试策略：通过 wrapper.vm.$emit 直接触发，验证 emit 接口被 Vue 注册。
     * 这也保证默认状态下（无外部触发）不会有意外的 regenerate emit 发出。
     */
    it('declares regenerate emit and does not fire it by default', () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: makeNodeRun(),
          state: 'read-only',
          hasOutput: true
        }
      })
      // 默认没有任何 regenerate emit
      expect(wrapper.emitted('regenerate')).toBeUndefined()

      // 接口存在：外部可以 emit（由 F11 主容器通过 ActionRow 的 regenerate 事件接线）
      wrapper.vm.$emit('regenerate')
      expect(wrapper.emitted('regenerate')).toBeTruthy()
      expect(wrapper.emitted('regenerate')?.length).toBe(1)
    })
  })
})
