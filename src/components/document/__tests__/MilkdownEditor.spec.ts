import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// mock Crepe（ProseMirror DOM 重，jsdom 无法真实跑）：只验证组件 wiring。
const h = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }))
vi.mock('@milkdown/crepe', () => ({
  Crepe: vi.fn().mockImplementation((opts: unknown) => {
    const inst: Record<string, unknown> = {
      opts,
      mdCb: null as ((ctx: unknown, md: string, prev?: string) => void) | null,
      create: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(
        (
          fn: (l: {
            markdownUpdated: (cb: (ctx: unknown, md: string, prev?: string) => void) => void
          }) => void
        ) => {
          fn({
            markdownUpdated: (cb) => {
              inst.mdCb = cb
            }
          })
        }
      ),
      setReadonly: vi.fn(),
      destroy: vi.fn()
    }
    h.last = inst
    return inst
  })
}))
// CSS 副作用导入在测试环境置空
vi.mock('@milkdown/crepe/theme/common/style.css', () => ({}))
vi.mock('@milkdown/crepe/theme/frame.css', () => ({}))

import MilkdownEditor from '../MilkdownEditor.vue'

beforeEach(() => {
  h.last = null
  vi.clearAllMocks()
})

describe('MilkdownEditor', () => {
  it('挂载时以 modelValue 为初值创建 Crepe 并 create()', async () => {
    mount(MilkdownEditor, { props: { modelValue: '# 标题' } })
    await flushPromises()
    expect(h.last).not.toBeNull()
    expect((h.last as { opts: { defaultValue: string } }).opts.defaultValue).toBe('# 标题')
    expect((h.last as { create: ReturnType<typeof vi.fn> }).create).toHaveBeenCalled()
  })

  it('编辑（markdownUpdated）emit update:modelValue', async () => {
    const wrapper = mount(MilkdownEditor, { props: { modelValue: '# a' } })
    await flushPromises()
    const inst = h.last as { mdCb: (ctx: unknown, md: string, prev?: string) => void }
    inst.mdCb(null, '# edited')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['# edited'])
  })

  it('readonly=true 时调用 setReadonly(true)', async () => {
    mount(MilkdownEditor, { props: { modelValue: 'x', readonly: true } })
    await flushPromises()
    expect((h.last as { setReadonly: ReturnType<typeof vi.fn> }).setReadonly).toHaveBeenCalledWith(
      true
    )
  })

  it('卸载时 destroy()', async () => {
    const wrapper = mount(MilkdownEditor, { props: { modelValue: 'x' } })
    await flushPromises()
    const inst = h.last as { destroy: ReturnType<typeof vi.fn> }
    wrapper.unmount()
    expect(inst.destroy).toHaveBeenCalled()
  })

  it('readonly=true 且 create 前卸载不 crash（unmount-during-create 竞态）', async () => {
    const wrapper = mount(MilkdownEditor, { props: { modelValue: 'x', readonly: true } })
    // 不 flushPromises：create() 尚未 resolve 时立即卸载
    wrapper.unmount()
    await flushPromises() // 让 onMounted 的 await create() resume
    const inst = h.last as {
      destroy: ReturnType<typeof vi.fn>
      setReadonly: ReturnType<typeof vi.fn>
    }
    // create 后实例应被销毁（卸载检测），且不应对已置 null 的 crepe 调 setReadonly
    expect(inst.destroy).toHaveBeenCalled()
    expect(inst.setReadonly).not.toHaveBeenCalled()
  })
})
