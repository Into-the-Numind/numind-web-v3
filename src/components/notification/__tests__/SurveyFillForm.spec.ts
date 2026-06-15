/**
 * SurveyFillForm 单元测试（notification-center T8）
 *
 * 覆盖：
 *   1. required 题未答 → 提交被拦截（不 emit submit），显示行内错误
 *   2. 各题型完整作答 → emit submit，answers 形状匹配 spec §3.1
 *      (single→options 1 个 / multi→options N 个 / rating→rating / text→text)
 *   3. NPS rating 允许 0 分（== null 判定，非 falsy）
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SurveyFillForm from '../SurveyFillForm.vue'
import type { Question, SubmitAnswer } from '@/api/announcements'

const singleQ: Question = {
  id: 1,
  order_index: 0,
  question_type: 'single',
  title: '单选题',
  required: true,
  options: ['A', 'B']
}
const multiQ: Question = {
  id: 2,
  order_index: 1,
  question_type: 'multi',
  title: '多选题',
  required: true,
  options: ['X', 'Y', 'Z']
}
const ratingStarQ: Question = {
  id: 3,
  order_index: 2,
  question_type: 'rating',
  title: '星级题',
  required: true,
  rating_max: 5,
  rating_style: 'star'
}
const textQ: Question = {
  id: 4,
  order_index: 3,
  question_type: 'text',
  title: '文本题',
  required: true
}

describe('SurveyFillForm', () => {
  it('required 题未答时提交被拦截，不 emit submit 且显示错误', async () => {
    const wrapper = mount(SurveyFillForm, { props: { questions: [singleQ, textQ] } })
    await wrapper.find('[data-testid="survey-form"]').trigger('submit')

    expect(wrapper.emitted('submit')).toBeFalsy()
    // 两个 required 题都应显示行内错误
    expect(wrapper.find('[data-testid="survey-error-1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="survey-error-4"]').exists()).toBe(true)
  })

  it('各题型完整作答后 emit 形状正确的 answers', async () => {
    const wrapper = mount(SurveyFillForm, {
      props: { questions: [singleQ, multiQ, ratingStarQ, textQ] }
    })

    // single：选 A
    await wrapper.findAll('input[type="radio"]')[0].setValue()
    // multi：勾 X 和 Z
    const checks = wrapper.findAll('input[type="checkbox"]')
    await checks[0].setValue(true) // X
    await checks[2].setValue(true) // Z
    // rating star：点第 4 颗星 → 4 分
    await wrapper.findAll('.star-btn')[3].trigger('click')
    // text：填内容
    await wrapper.find('textarea').setValue('我的反馈')

    await wrapper.find('[data-testid="survey-form"]').trigger('submit')

    const emitted = wrapper.emitted('submit')
    expect(emitted).toBeTruthy()
    const answers = emitted![0][0] as SubmitAnswer[]

    expect(answers).toHaveLength(4)
    expect(answers.find((a) => a.question_id === 1)).toEqual({ question_id: 1, options: ['A'] })
    expect(answers.find((a) => a.question_id === 2)).toEqual({
      question_id: 2,
      options: ['X', 'Z']
    })
    expect(answers.find((a) => a.question_id === 3)).toEqual({ question_id: 3, rating: 4 })
    expect(answers.find((a) => a.question_id === 4)).toEqual({ question_id: 4, text: '我的反馈' })
  })

  it('NPS rating 允许 0 分作为有效作答', async () => {
    const npsQ: Question = {
      id: 5,
      order_index: 0,
      question_type: 'rating',
      title: 'NPS',
      required: true,
      rating_max: 10,
      rating_style: 'nps'
    }
    const wrapper = mount(SurveyFillForm, { props: { questions: [npsQ] } })

    // NPS 范围 0..10 共 11 个按钮，点第一个（0 分）
    const npsBtns = wrapper.findAll('.nps-btn')
    expect(npsBtns).toHaveLength(11)
    await npsBtns[0].trigger('click')

    await wrapper.find('[data-testid="survey-form"]').trigger('submit')

    const emitted = wrapper.emitted('submit')
    expect(emitted).toBeTruthy()
    const answers = emitted![0][0] as SubmitAnswer[]
    expect(answers[0]).toEqual({ question_id: 5, rating: 0 })
    // 0 分不应被当成「未作答」
    expect(wrapper.find('[data-testid="survey-error-5"]').exists()).toBe(false)
  })
})
