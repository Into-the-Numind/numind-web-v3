import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentRun } from '../useAgentRun'
import type { UseAgentRunApi } from '../useAgentRun'

describe('useAgentRun', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('tracks status polling lifecycle through start, idempotent start, stop, and unmount', () => {
    vi.useFakeTimers()
    const Harness = defineComponent({
      setup() {
        return { ctrl: useAgentRun() }
      },
      template: '<div />'
    })

    const wrapper = mount(Harness)
    const { ctrl } = wrapper.vm as unknown as { ctrl: UseAgentRunApi }

    expect(ctrl.isStatusPolling.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)

    ctrl.startStatusPolling()
    expect(ctrl.isStatusPolling.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)

    ctrl.startStatusPolling()
    expect(ctrl.isStatusPolling.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)

    ctrl.stopStatusPolling()
    expect(ctrl.isStatusPolling.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)

    ctrl.startStatusPolling()
    expect(ctrl.isStatusPolling.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)

    wrapper.unmount()
    expect(ctrl.isStatusPolling.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
