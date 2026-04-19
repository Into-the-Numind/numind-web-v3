/**
 * StepInput 组件单元测试
 *
 * 覆盖：
 *
 * 基础渲染 (4)：
 *   1. textarea 绑定 modelValue
 *   2. placeholder 默认 + 自定义
 *   3. disabled 状态
 *   4. 无 items 时不显示 chip 区
 *
 * 输入交互 (2)：
 *   5. textarea input 触发 update:modelValue
 *   6. modelValue 变化同步到内部 baseText（通过 compose 验证）
 *
 * 文件上传 (6)：
 *   7. 点击 upload button 触发 file input click
 *   8. picker change 上传并显示 chip
 *   9. 缺 runId 时 emit error 不上传
 *  10. 缺 nodeId 时 emit error 不上传
 *  11. 上传失败时 chip 显示 error 状态 + emit error
 *  12. 多文件并发上传
 *
 * 拖拽 (4)：
 *  13. dragenter 设置 is-drag-over 类 + 显示 hint
 *  14. dragleave 离开 dropzone 时清除 is-drag-over
 *  15. dragleave 到子元素不清除（currentTarget.contains check）
 *  16. drop 调用上传流程
 *
 * expose API (3)：
 *  17. compose() 返回 baseText + 成功上传结果
 *  18. clearUploads() 清空 items
 *  19. focus() 聚焦 textarea
 *
 * Chip 交互 (2)：
 *  20. 点击 × 移除 item
 *  21. uploading 状态不显示 × 按钮
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/sop', () => ({
  uploadImageForOCR: vi.fn(),
  uploadFileForText: vi.fn()
}))

import StepInput from '../StepInput.vue'
import { uploadImageForOCR, uploadFileForText } from '@/api/sop'

const uploadImageForOCRMock = uploadImageForOCR as unknown as ReturnType<typeof vi.fn>
const uploadFileForTextMock = uploadFileForText as unknown as ReturnType<typeof vi.fn>

function makeFile(name: string, sizeBytes: number = 1024): File {
  const blob = new Blob(['x'.repeat(sizeBytes)], { type: 'application/octet-stream' })
  return new File([blob], name)
}

/**
 * 完整 flush 异步链，确保 handleFilePick → doUpload → fileUpload.handleFiles →
 * Promise.all(uploadSingleFile) → DOM update 全部完成。
 *
 * 单次 flushPromises 不够，因为调用链有多层 await。三次确保所有 microtask
 * 链路（handleFilePick → doUpload → handleFiles → Promise.all → DOM）完成。
 */
async function flushUpload() {
  await flushPromises()
  await flushPromises()
  await flushPromises()
}

function defaultProps() {
  return {
    modelValue: '',
    runId: 100 as number | null,
    nodeId: 5 as number | null
  }
}

beforeEach(() => {
  uploadImageForOCRMock.mockReset()
  uploadFileForTextMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('StepInput — 基础渲染', () => {
  it('textarea 绑定 modelValue', () => {
    const wrapper = mount(StepInput, {
      props: { ...defaultProps(), modelValue: '初始内容' }
    })
    const textarea = wrapper.find('textarea')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('初始内容')
  })

  it('placeholder 支持默认 + 自定义', () => {
    const w1 = mount(StepInput, { props: defaultProps() })
    expect(w1.find('textarea').attributes('placeholder')).toContain('在此输入内容')

    const w2 = mount(StepInput, {
      props: { ...defaultProps(), placeholder: '自定义提示' }
    })
    expect(w2.find('textarea').attributes('placeholder')).toBe('自定义提示')
  })

  it('disabled 状态：组件根元素有 is-disabled 类，textarea 被 disabled', () => {
    const wrapper = mount(StepInput, {
      props: { ...defaultProps(), disabled: true }
    })
    expect(wrapper.classes()).toContain('is-disabled')
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('无 items 时不显示 chip 区', () => {
    const wrapper = mount(StepInput, { props: defaultProps() })
    expect(wrapper.find('.step-input-chips').exists()).toBe(false)
  })
})

describe('StepInput — 输入交互', () => {
  it('textarea input 触发 update:modelValue', async () => {
    const wrapper = mount(StepInput, { props: defaultProps() })
    const textarea = wrapper.find('textarea')
    await textarea.setValue('用户输入')
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['用户输入'])
  })

  it('modelValue 变化同步到内部 baseText（通过 compose 验证）', async () => {
    const wrapper = mount(StepInput, { props: defaultProps() })
    await wrapper.setProps({ modelValue: '新内容' })
    // compose() 应返回 newValue（没有 items）
    const composed = (wrapper.vm as unknown as { compose: () => string }).compose()
    expect(composed).toBe('新内容')
  })
})

describe('StepInput — 文件上传', () => {
  it('点击 upload 按钮触发 file input click', async () => {
    const wrapper = mount(StepInput, { props: defaultProps() })
    const fileInput = wrapper.find('input[type="file"]').element as HTMLInputElement
    const clickSpy = vi.spyOn(fileInput, 'click')

    await wrapper.find('.step-input-upload-btn').trigger('click')
    expect(clickSpy).toHaveBeenCalled()
  })

  it('picker change 上传并显示 chip', async () => {
    uploadImageForOCRMock.mockResolvedValue({ content: '识别结果' })
    const wrapper = mount(StepInput, { props: defaultProps() })

    // 模拟文件选择
    const file = makeFile('photo.jpg')
    const fileInput = wrapper.find('input[type="file"]').element as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false,
      configurable: true
    })
    await wrapper.find('input[type="file"]').trigger('change')
    await flushUpload()

    expect(uploadImageForOCRMock).toHaveBeenCalledWith(file, 100, 5)
    // chip 显示
    const chips = wrapper.findAll('.step-input-chip')
    expect(chips.length).toBe(1)
    expect(chips[0].text()).toContain('photo.jpg')
  })

  it('缺 runId 时 emit error 不上传', async () => {
    const wrapper = mount(StepInput, {
      props: { ...defaultProps(), runId: null }
    })
    const file = makeFile('photo.jpg')
    const fileInput = wrapper.find('input[type="file"]').element as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false,
      configurable: true
    })
    await wrapper.find('input[type="file"]').trigger('change')
    await flushUpload()

    expect(uploadImageForOCRMock).not.toHaveBeenCalled()
    const errorEvents = wrapper.emitted('error')
    expect(errorEvents).toBeTruthy()
    expect(errorEvents?.[0]?.[0]).toContain('请先进入节点')
  })

  it('缺 nodeId 时 emit error 不上传', async () => {
    const wrapper = mount(StepInput, {
      props: { ...defaultProps(), nodeId: null }
    })
    const file = makeFile('photo.jpg')
    const fileInput = wrapper.find('input[type="file"]').element as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false,
      configurable: true
    })
    await wrapper.find('input[type="file"]').trigger('change')
    await flushUpload()

    expect(uploadImageForOCRMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('error')).toBeTruthy()
  })

  it('上传失败时 chip 显示 error 状态 + emit error', async () => {
    uploadImageForOCRMock.mockRejectedValue(new Error('OCR 服务错误'))
    const wrapper = mount(StepInput, { props: defaultProps() })

    const file = makeFile('photo.jpg')
    const fileInput = wrapper.find('input[type="file"]').element as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false,
      configurable: true
    })
    await wrapper.find('input[type="file"]').trigger('change')
    // 等待 error emit（说明 chip 已是 error 状态 + doUpload 走完读取 lastError 的后半段）
    await vi.waitUntil(() => wrapper.emitted('error') !== undefined, {
      timeout: 2000,
      interval: 10
    })

    const chip = wrapper.find('.step-input-chip')
    expect(chip.classes()).toContain('step-input-chip--error')
    expect(wrapper.emitted('error')).toBeTruthy()
  })

  it('多文件并发上传', async () => {
    uploadImageForOCRMock.mockResolvedValue({ content: 'ok' })
    const wrapper = mount(StepInput, { props: defaultProps() })

    const files = [makeFile('a.jpg'), makeFile('b.png'), makeFile('c.gif')]
    const fileInput = wrapper.find('input[type="file"]').element as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      value: files,
      writable: false,
      configurable: true
    })
    await wrapper.find('input[type="file"]').trigger('change')
    await flushUpload()

    expect(uploadImageForOCRMock).toHaveBeenCalledTimes(3)
    expect(wrapper.findAll('.step-input-chip').length).toBe(3)
  })
})

describe('StepInput — 拖拽', () => {
  it('dragenter 设置 is-drag-over 类 + 显示 hint', async () => {
    const wrapper = mount(StepInput, { props: defaultProps() })
    await wrapper.find('.step-input-dropzone').trigger('dragenter')
    expect(wrapper.classes()).toContain('is-drag-over')
    expect(wrapper.find('.step-input-drag-hint').exists()).toBe(true)
  })

  it('dragleave 离开 dropzone 时清除 is-drag-over', async () => {
    const wrapper = mount(StepInput, { props: defaultProps() })
    await wrapper.find('.step-input-dropzone').trigger('dragenter')
    expect(wrapper.classes()).toContain('is-drag-over')

    // 模拟离开到外部（relatedTarget 为 null）
    await wrapper.find('.step-input-dropzone').trigger('dragleave', { relatedTarget: null })
    expect(wrapper.classes()).not.toContain('is-drag-over')
  })

  it('dragleave 到子元素时不清除 is-drag-over', async () => {
    const wrapper = mount(StepInput, { props: defaultProps() })
    await wrapper.find('.step-input-dropzone').trigger('dragenter')
    expect(wrapper.classes()).toContain('is-drag-over')

    // relatedTarget 是 dropzone 的子元素（textarea）
    const textarea = wrapper.find('textarea').element
    await wrapper.find('.step-input-dropzone').trigger('dragleave', { relatedTarget: textarea })
    // 仍应保持 is-drag-over
    expect(wrapper.classes()).toContain('is-drag-over')
  })

  it('drop 调用上传流程', async () => {
    uploadImageForOCRMock.mockResolvedValue({ content: 'ok' })
    const wrapper = mount(StepInput, { props: defaultProps() })

    const file = makeFile('dropped.jpg')
    await wrapper.find('.step-input-dropzone').trigger('drop', {
      dataTransfer: { files: [file] }
    })
    await flushUpload()

    expect(uploadImageForOCRMock).toHaveBeenCalledWith(file, 100, 5)
    expect(wrapper.classes()).not.toContain('is-drag-over')
  })
})

describe('StepInput — expose API', () => {
  it('compose() 返回 baseText + 成功上传结果', async () => {
    uploadImageForOCRMock.mockResolvedValue({ content: '识别文字' })
    const wrapper = mount(StepInput, {
      props: { ...defaultProps(), modelValue: '用户手输内容' }
    })

    const file = makeFile('photo.jpg')
    const fileInput = wrapper.find('input[type="file"]').element as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false,
      configurable: true
    })
    await wrapper.find('input[type="file"]').trigger('change')
    await flushUpload()

    const composed = (wrapper.vm as unknown as { compose: () => string }).compose()
    expect(composed).toContain('用户手输内容')
    expect(composed).toContain('识别文字')
  })

  it('clearUploads() 清空 items', async () => {
    uploadImageForOCRMock.mockResolvedValue({ content: 'ok' })
    const wrapper = mount(StepInput, { props: defaultProps() })

    const file = makeFile('photo.jpg')
    const fileInput = wrapper.find('input[type="file"]').element as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false,
      configurable: true
    })
    await wrapper.find('input[type="file"]').trigger('change')
    await flushUpload()

    expect(wrapper.findAll('.step-input-chip').length).toBe(1)
    ;(wrapper.vm as unknown as { clearUploads: () => void }).clearUploads()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.step-input-chip').length).toBe(0)
  })

  it('focus() 聚焦 textarea', () => {
    const wrapper = mount(StepInput, {
      props: defaultProps(),
      attachTo: document.body // 挂到 body 才能 focus
    })
    const textarea = wrapper.find('textarea').element as HTMLTextAreaElement
    ;(wrapper.vm as unknown as { focus: () => void }).focus()
    expect(document.activeElement).toBe(textarea)
    wrapper.unmount()
  })
})

describe('StepInput — Chip 交互', () => {
  it('点击 × 移除 item', async () => {
    uploadImageForOCRMock.mockResolvedValue({ content: 'ok' })
    const wrapper = mount(StepInput, { props: defaultProps() })

    const file = makeFile('photo.jpg')
    const fileInput = wrapper.find('input[type="file"]').element as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false,
      configurable: true
    })
    await wrapper.find('input[type="file"]').trigger('change')
    // 用 vi.waitUntil 轮询直到 × 按钮出现（上传成功后才显示）
    await vi.waitUntil(() => wrapper.find('.step-input-chip-remove').exists(), {
      timeout: 2000,
      interval: 10
    })

    expect(wrapper.findAll('.step-input-chip').length).toBe(1)
    await wrapper.find('.step-input-chip-remove').trigger('click')
    expect(wrapper.findAll('.step-input-chip').length).toBe(0)
  })

  it('上传失败（error 状态）chip 仍显示 × 按钮允许移除', async () => {
    uploadImageForOCRMock.mockRejectedValue(new Error('fail'))
    const wrapper = mount(StepInput, { props: defaultProps() })

    const file = makeFile('photo.jpg')
    const fileInput = wrapper.find('input[type="file"]').element as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      writable: false,
      configurable: true
    })
    await wrapper.find('input[type="file"]').trigger('change')
    // 用 vi.waitUntil 轮询直到 chip 进入 error 状态
    await vi.waitUntil(() => wrapper.find('.step-input-chip--error').exists(), {
      timeout: 2000,
      interval: 10
    })

    const chip = wrapper.find('.step-input-chip')
    expect(chip.classes()).toContain('step-input-chip--error')
    expect(chip.find('.step-input-chip-remove').exists()).toBe(true)
  })
})
