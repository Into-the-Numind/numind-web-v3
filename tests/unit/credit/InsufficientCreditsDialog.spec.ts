/**
 * InsufficientCreditsDialog 扩展测试 — credits-system Track E.6
 *
 * 覆盖 spec §4.2.2 对应的 dialog 结构化 payload 能力：
 *   1. 无参数 show() → 打开 dialog，沿用默认 message
 *   2. string show('msg') → 向后兼容：设置 message，reason 清空
 *   3. payload show({message, reason}) → 两字段同时渲染
 *   4. payload show({message}) 无 reason → 不渲染 reason 元素
 *   5. 连续 show 能覆盖上一次的 reason（避免残留）
 *   6. 关闭 dialog → visible=false
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import InsufficientCreditsDialog from '@/components/common/InsufficientCreditsDialog.vue'

beforeEach(() => {
  // Teleport(to='body') 需要 body 干净
  document.body.innerHTML = ''
})

async function mountDialog() {
  const wrapper = mount(InsufficientCreditsDialog, {
    attachTo: document.body
  })
  return wrapper
}

describe('InsufficientCreditsDialog.show()', () => {
  it('无参数调用：仅打开 dialog，保留默认 message，无 reason', async () => {
    const wrapper = await mountDialog()
    ;(wrapper.vm as unknown as { show: () => void }).show()
    await flushPromises()

    const overlay = document.body.querySelector('.modal-overlay')
    expect(overlay).not.toBeNull()
    expect(document.body.querySelector('.modal-message')?.textContent).toContain('额度不足')
    expect(document.body.querySelector('[data-testid="reason"]')).toBeNull()
  })

  it('向后兼容 string 参数：设置 message，reason 清空', async () => {
    const wrapper = await mountDialog()
    ;(wrapper.vm as unknown as { show: (m?: string) => void }).show('自定义消息')
    await flushPromises()

    expect(document.body.querySelector('.modal-message')?.textContent).toBe('自定义消息')
    expect(document.body.querySelector('[data-testid="reason"]')).toBeNull()
  })

  it('结构化 payload：message + reason 都渲染', async () => {
    const wrapper = await mountDialog()
    ;(
      wrapper.vm as unknown as {
        show: (p: { message?: string; reason?: string }) => void
      }
    ).show({
      message: '积分不足，请购买加量包',
      reason: 'booster_empty'
    })
    await flushPromises()

    expect(document.body.querySelector('.modal-message')?.textContent).toBe(
      '积分不足，请购买加量包'
    )
    const reasonEl = document.body.querySelector('[data-testid="reason"]')
    expect(reasonEl).not.toBeNull()
    expect(reasonEl?.textContent).toBe('booster_empty')
  })

  it('payload 只传 message 不传 reason → 不渲染 reason 元素', async () => {
    const wrapper = await mountDialog()
    ;(
      wrapper.vm as unknown as {
        show: (p: { message?: string; reason?: string }) => void
      }
    ).show({ message: 'only message' })
    await flushPromises()

    expect(document.body.querySelector('.modal-message')?.textContent).toBe('only message')
    expect(document.body.querySelector('[data-testid="reason"]')).toBeNull()
  })

  it('连续 show：新 reason 覆盖旧 reason，无 reason 时清空', async () => {
    const wrapper = await mountDialog()
    const show = (
      wrapper.vm as unknown as {
        show: (p: { message?: string; reason?: string } | string) => void
      }
    ).show

    show({ message: 'm1', reason: 'r1' })
    await flushPromises()
    expect(document.body.querySelector('[data-testid="reason"]')?.textContent).toBe('r1')

    // 第二次调用：string 形式应清空 reason
    show('m2')
    await flushPromises()
    expect(document.body.querySelector('.modal-message')?.textContent).toBe('m2')
    expect(document.body.querySelector('[data-testid="reason"]')).toBeNull()
  })

  it('点击 "我知道了" 按钮关闭 dialog', async () => {
    const wrapper = await mountDialog()
    ;(wrapper.vm as unknown as { show: (m: string) => void }).show('test')
    await flushPromises()
    expect(document.body.querySelector('.modal-overlay')).not.toBeNull()

    const btn = document.body.querySelector('.modal-btn') as HTMLButtonElement | null
    btn?.click()
    await flushPromises()
    expect(document.body.querySelector('.modal-overlay')).toBeNull()
  })
})
