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

  it('shares status polling state and timer across instances', () => {
    vi.useFakeTimers()
    const Harness = defineComponent({
      setup() {
        return {
          first: useAgentRun(),
          second: useAgentRun()
        }
      },
      template: '<div />'
    })

    const wrapper = mount(Harness)
    const { first, second } = wrapper.vm as unknown as {
      first: UseAgentRunApi
      second: UseAgentRunApi
    }

    expect(first.isStatusPolling.value).toBe(false)
    expect(second.isStatusPolling.value).toBe(false)

    first.startStatusPolling()
    expect(first.isStatusPolling.value).toBe(true)
    expect(second.isStatusPolling.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)

    second.startStatusPolling()
    expect(first.isStatusPolling.value).toBe(true)
    expect(second.isStatusPolling.value).toBe(true)
    expect(vi.getTimerCount()).toBe(1)

    second.stopStatusPolling()
    expect(first.isStatusPolling.value).toBe(false)
    expect(second.isStatusPolling.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)

    wrapper.unmount()
  })
})
