/**
 * OutputCard 组件单元测试（F6）
 *
 * 覆盖：
 *   1. streaming 渲染：LIVE 标签 + 停止按钮，无 MetaFooter，output--streaming class
 *   2. read-only 渲染：⭐ + 复制按钮 + MetaFooter
 *   3. read-only + canBookmark=false → ⭐ 按钮隐藏
 *   4. ⭐ 点击 → emit 'toggle-bookmark'
 *   5. 复制点击 → emit 'copy'
 *   6. 停止点击 → emit 'stop'
 *   7. isBookmarked=true → 显示"已收藏"态 class is-active
 *   8. nodeRun=null + read-only → 不渲染 MetaFooter（fallback 空态）
 *   9. streaming 时不显示 tiny buttons
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
    it('renders ⭐ + copy buttons and MetaFooter when canBookmark=true', () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: makeNodeRun(),
          state: 'read-only',
          canBookmark: true,
          isBookmarked: false
        }
      })
      expect(wrapper.find('[data-testid="bookmark-toggle"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="output-copy"]').exists()).toBe(true)
      expect(wrapper.find('.meta-footer').exists()).toBe(true)
      // 无 LIVE
      expect(wrapper.find('.output__live-dot').exists()).toBe(false)
      expect(wrapper.find('[data-testid="output-stop"]').exists()).toBe(false)
    })

    it('hides ⭐ button when canBookmark=false', () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: makeNodeRun(),
          state: 'read-only',
          canBookmark: false
        }
      })
      expect(wrapper.find('[data-testid="bookmark-toggle"]').exists()).toBe(false)
      // 复制按钮依然存在
      expect(wrapper.find('[data-testid="output-copy"]').exists()).toBe(true)
    })

    it('applies is-active class when isBookmarked=true', () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: makeNodeRun(),
          state: 'read-only',
          canBookmark: true,
          isBookmarked: true
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
          canBookmark: true
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
          canBookmark: false
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
          canBookmark: false
        }
      })
      expect(wrapper.find('.meta-footer').exists()).toBe(false)
    })

    it('hides MetaFooter if nodeRun lacks model_name (R7 fallback)', () => {
      const wrapper = mount(OutputCard, {
        props: {
          nodeRun: makeNodeRun({ model_name: '' }),
          state: 'read-only',
          canBookmark: true
        }
      })
      // OutputCard 渲染 MetaFooter 组件节点，但 MetaFooter 内部 v-if 会隐藏整行
      expect(wrapper.find('.meta-footer').exists()).toBe(false)
    })
  })
})
