/**
 * useInputPersistence 单元测试
 *
 * 覆盖场景：
 *   1-4. localStorage 基础操作 (load / save / remove / default)
 *   5. Draft 和 Run scope 的 key 命名差异
 *   6. clearInputsForScope 只清空匹配前缀的 key
 *   7-10. Dirty 检测逻辑（snapshot / isDirty / trim 规范化 / 未 snapshot）
 *   11. resetSnapshot 单个 / 全部
 *   12. 多实例独立（dirty state 互不影响）
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useInputPersistence } from '../useInputPersistence'

beforeEach(() => {
  localStorage.clear()
})

describe('useInputPersistence — localStorage 基础操作', () => {
  it('loadInput 返回空字符串当 key 不存在', () => {
    const p = useInputPersistence()
    expect(p.loadInput({ kind: 'run', runId: 100 }, 'product-input')).toBe('')
  })

  it('saveInput + loadInput 往返正确', () => {
    const p = useInputPersistence()
    p.saveInput({ kind: 'run', runId: 100 }, 'product-input', '产品描述')
    expect(p.loadInput({ kind: 'run', runId: 100 }, 'product-input')).toBe('产品描述')
  })

  it('removeInput 删除后 loadInput 返回空', () => {
    const p = useInputPersistence()
    p.saveInput({ kind: 'run', runId: 100 }, 'product-input', '产品')
    p.removeInput({ kind: 'run', runId: 100 }, 'product-input')
    expect(p.loadInput({ kind: 'run', runId: 100 }, 'product-input')).toBe('')
  })

  it('Draft 和 Run scope 使用不同的 key 命名', () => {
    const p = useInputPersistence()
    p.saveInput({ kind: 'draft', templateId: 42 }, 'product-input', 'draft-value')
    p.saveInput({ kind: 'run', runId: 100 }, 'product-input', 'run-value')

    // 两个 scope 的值独立
    expect(p.loadInput({ kind: 'draft', templateId: 42 }, 'product-input')).toBe('draft-value')
    expect(p.loadInput({ kind: 'run', runId: 100 }, 'product-input')).toBe('run-value')

    // 验证底层 localStorage key 格式与 task 8 useDraftLifecycle 一致
    expect(localStorage.getItem('sop_input_draft_42_product-input')).toBe('draft-value')
    expect(localStorage.getItem('sop_input_100_product-input')).toBe('run-value')
  })

  it('clearInputsForScope 只清空匹配前缀的 key', () => {
    const p = useInputPersistence()
    p.saveInput({ kind: 'run', runId: 100 }, 'product-input', 'p1')
    p.saveInput({ kind: 'run', runId: 100 }, 'script-input', 's1')
    p.saveInput({ kind: 'run', runId: 200 }, 'product-input', 'other-run')
    p.saveInput({ kind: 'draft', templateId: 42 }, 'product-input', 'draft')
    localStorage.setItem('unrelated-key', 'should-stay')

    p.clearInputsForScope({ kind: 'run', runId: 100 })

    // run 100 的 key 被清空
    expect(p.loadInput({ kind: 'run', runId: 100 }, 'product-input')).toBe('')
    expect(p.loadInput({ kind: 'run', runId: 100 }, 'script-input')).toBe('')

    // 其他 scope 和 key 保持不变
    expect(p.loadInput({ kind: 'run', runId: 200 }, 'product-input')).toBe('other-run')
    expect(p.loadInput({ kind: 'draft', templateId: 42 }, 'product-input')).toBe('draft')
    expect(localStorage.getItem('unrelated-key')).toBe('should-stay')
  })
})

describe('useInputPersistence — dirty 检测', () => {
  it('未 snapshot 的 inputId isDirty 返回 false', () => {
    const p = useInputPersistence()
    expect(p.isDirty('product-input', 'any value')).toBe(false)
  })

  it('snapshot 后值未变返回 false，值变返回 true', () => {
    const p = useInputPersistence()
    p.snapshot('product-input', '原始内容')
    expect(p.isDirty('product-input', '原始内容')).toBe(false)
    expect(p.isDirty('product-input', '修改后')).toBe(true)
  })

  it('isDirty 比较时 trim 空白（尾部空白不算 dirty）', () => {
    const p = useInputPersistence()
    p.snapshot('product-input', '内容')
    expect(p.isDirty('product-input', '  内容  ')).toBe(false)
    expect(p.isDirty('product-input', '内容\n')).toBe(false)
    expect(p.isDirty('product-input', '内容实际变了')).toBe(true)
  })

  it('snapshot 对同一 inputId 覆盖之前的快照', () => {
    const p = useInputPersistence()
    p.snapshot('product-input', 'v1')
    p.snapshot('product-input', 'v2') // 覆盖
    expect(p.isDirty('product-input', 'v2')).toBe(false)
    expect(p.isDirty('product-input', 'v1')).toBe(true)
  })

  it('resetSnapshot 单个 inputId 恢复到"未 snapshot"状态', () => {
    const p = useInputPersistence()
    p.snapshot('product-input', 'original')
    p.snapshot('script-input', 'other')

    p.resetSnapshot('product-input')

    // product-input 恢复到"未 snapshot"，isDirty 返回 false
    expect(p.isDirty('product-input', 'anything')).toBe(false)
    // script-input 不受影响
    expect(p.isDirty('script-input', 'changed')).toBe(true)
  })

  it('resetSnapshot 不传参数清空全部', () => {
    const p = useInputPersistence()
    p.snapshot('product-input', 'a')
    p.snapshot('script-input', 'b')

    p.resetSnapshot()

    expect(p.isDirty('product-input', 'changed')).toBe(false)
    expect(p.isDirty('script-input', 'changed')).toBe(false)
  })

  it('多实例 dirty state 独立', () => {
    const p1 = useInputPersistence()
    const p2 = useInputPersistence()
    p1.snapshot('product-input', 'p1 original')

    // p2 的 snapshot 与 p1 无关
    expect(p2.isDirty('product-input', 'anything')).toBe(false)

    // p1 的 dirty 检测不受 p2 影响
    expect(p1.isDirty('product-input', 'modified')).toBe(true)
  })
})
