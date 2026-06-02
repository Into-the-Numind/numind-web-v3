import { describe, it, expect } from 'vitest'
import { diffSelection } from '@/views/customersPermissionDiff'

/**
 * 复现客户上报 bug：客户管理「管理模板权限」弹窗，全选「智能体」后再取消
 * 销售智能体并保存，重新打开发现销售智能体仍为勾选 —— 实际是被反向错误授权。
 *
 * 根因：销售智能体取消勾选时把 featurePermissions['sales_agent'] 置为 false
 * （key 仍留在对象里），而 grant 差异计算只看 key 是否存在、不看值，于是把这个
 * 「值为 false」的残留 key 误当成新增授权。
 */
describe('diffSelection — 管理模板权限保存差异', () => {
  it('复现 bug：原本未授权，全选后再取消（残留 key=false）不应被授权', () => {
    // 全选智能体把 sales_agent 置 true，随后取消勾选置为 false —— key 残留、值为 false
    const current = { sales_agent: false }
    const original = new Set<string>() // 原本未授权
    const { toGrant, toRevoke } = diffSelection(current, original)
    expect(toGrant).not.toContain('sales_agent') // ← 修复前失败：bug 把它放进了 toGrant
    expect(toRevoke).toEqual([])
  })

  it('原本已授权、取消勾选 → 应进入 toRevoke，不进入 toGrant', () => {
    const current = { sales_agent: false }
    const original = new Set<string>(['sales_agent'])
    const { toGrant, toRevoke } = diffSelection(current, original)
    expect(toGrant).toEqual([])
    expect(toRevoke).toEqual(['sales_agent'])
  })

  it('原本未授权、勾选 → 应进入 toGrant', () => {
    const current = { sales_agent: true }
    const original = new Set<string>()
    const { toGrant, toRevoke } = diffSelection(current, original)
    expect(toGrant).toEqual(['sales_agent'])
    expect(toRevoke).toEqual([])
  })

  it('原本已授权、保持勾选 → 无变更', () => {
    const current = { sales_agent: true }
    const original = new Set<string>(['sales_agent'])
    const { toGrant, toRevoke } = diffSelection(current, original)
    expect(toGrant).toEqual([])
    expect(toRevoke).toEqual([])
  })

  it('多 key 混合：新增一个、撤销一个、残留 false 不动', () => {
    const current = { a: true, b: false, c: true }
    const original = new Set<string>(['c', 'd'])
    const { toGrant, toRevoke } = diffSelection(current, original)
    expect(toGrant.sort()).toEqual(['a']) // b=false 残留不应授权
    expect(toRevoke.sort()).toEqual(['d']) // d 原有但当前未勾选 → 撤销
  })
})
