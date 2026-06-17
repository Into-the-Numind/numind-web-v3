import { describe, it, expect } from 'vitest'
import {
  validateQ1,
  validateQ3,
  validateQ4,
  validateQ5,
  validateSystemPrompt,
  validateForm
} from '../validation'
import { initialFormState } from '@/types/agentBuilder'

describe('validation.ts — direct creation form validators', () => {
  describe('validateQ1 (name)', () => {
    it('empty → error', () => expect(validateQ1('')).toBeTruthy())
    it('1 char too short → error', () => expect(validateQ1('a')).toBe('名字应为 2-20 字'))
    it('21 char too long → error', () =>
      expect(validateQ1('a'.repeat(21))).toBe('名字应为 2-20 字'))
    it('all digits → error', () => expect(validateQ1('12345')).toBe('名字不能全是数字'))
    it('valid name → empty', () => expect(validateQ1('爆款分析师')).toBe(''))
  })

  describe('validateQ3 (description)', () => {
    it('empty → error', () => expect(validateQ3('')).toBeTruthy())
    it('9 chars → error', () => expect(validateQ3('a'.repeat(9))).toBe('描述应为 10-20 字'))
    it('21 chars → error', () => expect(validateQ3('a'.repeat(21))).toBe('描述应为 10-20 字'))
    it('valid → empty', () => expect(validateQ3('分析你的小红书笔记找出爆款规律')).toBe(''))
  })

  describe('validateQ4 (welcome)', () => {
    it('empty → error', () => expect(validateQ4('')).toBeTruthy())
    it('19 chars → error', () => expect(validateQ4('a'.repeat(19))).toBe('欢迎语应为 20-500 字'))
    it('501 chars → error', () => expect(validateQ4('a'.repeat(501))).toBe('欢迎语应为 20-500 字'))
    it('valid → empty', () => expect(validateQ4('a'.repeat(50))).toBe(''))
  })

  describe('validateQ5 (starters)', () => {
    it('empty list → empty (optional)', () => expect(validateQ5([])).toBe(''))
    it('5 chips → error', () =>
      expect(validateQ5(['aaaaa', 'bbbbb', 'ccccc', 'ddddd', 'eeeee'])).toBe(
        '最多 4 个快速开始按钮'
      ))
    it('4-char chip → error', () =>
      expect(validateQ5(['abcd'])).toBe('每条快速开始按钮应为 5-50 字'))
    it('51-char chip → error', () =>
      expect(validateQ5(['a'.repeat(51)])).toBe('每条快速开始按钮应为 5-50 字'))
    it('4 valid chips → empty', () =>
      expect(validateQ5(['aaaaa', 'bbbbb', 'ccccc', 'ddddd'])).toBe(''))
  })

  describe('validateSystemPrompt (提示词，必填)', () => {
    it('empty → error', () => expect(validateSystemPrompt('')).toBe('请输入提示词（行为指引）'))
    it('whitespace-only → error', () =>
      expect(validateSystemPrompt('   \n  ')).toBe('请输入提示词（行为指引）'))
    it('non-empty → empty', () => expect(validateSystemPrompt('你是一个销售助手')).toBe(''))
  })

  describe('validateForm (whole form)', () => {
    it('empty initial form → required errors (name/description/welcome/system_prompt)', () => {
      const form = initialFormState()
      const errors = validateForm(form)
      expect(errors.name).toBeTruthy()
      expect(errors.description).toBeTruthy()
      expect(errors.welcome_message).toBeTruthy()
      expect(errors.system_prompt).toBeTruthy()
      // questionnaire fields no longer validated
      expect(errors.q6).toBeUndefined()
      expect(errors.q7).toBeUndefined()
      expect(errors.q8).toBeUndefined()
    })

    it('complete valid form → no errors', () => {
      const form = initialFormState()
      form.name = '爆款分析师'
      form.description = '分析小红书笔记找爆款'
      form.welcome_message = '你好我是爆款分析师，可以分析你的笔记内容找规律。'
      form.system_prompt = '你是爆款分析师，负责分析小红书笔记找规律。'
      const errors = validateForm(form)
      expect(Object.keys(errors)).toHaveLength(0)
    })

    it('partial completion → only relevant errors', () => {
      const form = initialFormState()
      form.name = 'Bot'
      const errors = validateForm(form)
      expect(errors.name).toBeFalsy() // name valid
      expect(errors.description).toBeTruthy() // still empty
      expect(errors.system_prompt).toBeTruthy() // still empty
    })
  })
})
