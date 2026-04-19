/**
 * vitest 基础设施 sanity 测试。
 *
 * 仅用于验证 vitest 安装 + 配置正确。该文件可保留作为 smoke test。
 */
import { describe, it, expect } from 'vitest'

describe('vitest sanity', () => {
  it('runs basic assertion', () => {
    expect(1 + 1).toBe(2)
  })

  it('has jsdom environment', () => {
    expect(typeof window).toBe('object')
    expect(typeof document).toBe('object')
  })
})
