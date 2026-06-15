import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ThinkingBlock from '../ThinkingBlock.vue'

describe('ThinkingBlock', () => {
  it('default (no autoCollapse): stays expanded when finished — sales/chatbot unchanged', () => {
    const w = mount(ThinkingBlock, { props: { content: 'thinking', finished: true } })
    expect(w.find('.thinking-container').classes()).not.toContain('collapsed')
  })

  it('autoCollapse + finished: starts collapsed (reload / completed agent run)', () => {
    const w = mount(ThinkingBlock, {
      props: { content: 'x', finished: true, autoCollapse: true }
    })
    expect(w.find('.thinking-container').classes()).toContain('collapsed')
  })

  it('autoCollapse while streaming stays expanded, then folds on finish', async () => {
    const w = mount(ThinkingBlock, {
      props: { content: 'x', finished: false, autoCollapse: true }
    })
    expect(w.find('.thinking-container').classes()).not.toContain('collapsed')
    await w.setProps({ finished: true })
    expect(w.find('.thinking-container').classes()).toContain('collapsed')
  })

  it('user can still manually expand after auto-collapse', async () => {
    const w = mount(ThinkingBlock, {
      props: { content: 'x', finished: true, autoCollapse: true }
    })
    expect(w.find('.thinking-container').classes()).toContain('collapsed')
    await w.find('.thinking-header').trigger('click')
    expect(w.find('.thinking-container').classes()).not.toContain('collapsed')
  })

  // #1: disclosure chevron base icon is ChevronRight (points right when collapsed;
  // CSS rotates it 90deg → down when expanded). Locks the icon so a future swap back
  // to ChevronDown (down-when-collapsed) is caught.
  it('uses a right-pointing chevron as the disclosure icon', () => {
    const w = mount(ThinkingBlock, { props: { content: 'x', finished: true } })
    const icon = w.find('.thinking-icon')
    expect(icon.exists()).toBe(true)
    expect(icon.classes()).toContain('lucide-chevron-right')
  })
})
