import { describe, it, expect } from 'vitest'
import { isSelfRow } from '@/views/customersSelfManagement'

/**
 * 复现：客户管理「管理模板权限」弹窗管理父账户自己时，所有模块都没打勾
 * （后端三个读接口因 GetSubUser 自我归属校验失败被吞成空）。修复要求前端能识别
 * 「目标行 == 当前登录用户」，从而改走只读全勾「全部可用」渲染。
 */
describe('isSelfRow — 识别父账户管理自己', () => {
  it('复现 bug：目标行 id 等于当前登录用户 → 应判定为 self', () => {
    expect(isSelfRow({ id: 7 }, 7)).toBe(true) // ← 修复前失败（占位实现恒返回 false）
  })

  it('优先用 user_id，与当前用户匹配 → self', () => {
    expect(isSelfRow({ id: 99, user_id: 7 }, 7)).toBe(true)
  })

  it('number / string 形态混用也应正确匹配', () => {
    expect(isSelfRow({ id: '7' }, 7)).toBe(true)
    expect(isSelfRow({ user_id: 7 }, '7')).toBe(true)
  })

  it('真正的子账户（id 不等于当前用户）→ 非 self', () => {
    expect(isSelfRow({ id: 42, user_id: 42 }, 7)).toBe(false)
  })

  it('缺失 target / currentUserId → 安全返回 false', () => {
    expect(isSelfRow(null, 7)).toBe(false)
    expect(isSelfRow({ id: 7 }, null)).toBe(false)
    expect(isSelfRow({}, 7)).toBe(false)
  })
})
