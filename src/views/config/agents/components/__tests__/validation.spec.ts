import { describe, it, expect } from 'vitest'
import {
  validateQ1,
  validateQ3,
  validateQ4,
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

  describe('validateQ3 (description — 选填)', () => {
    it('empty → empty (optional)', () => expect(validateQ3('')).toBe(''))
    it('short value → empty (no min)', () => expect(validateQ3('a'.repeat(9))).toBe(''))
    it('21 chars → over-limit error', () =>
      expect(validateQ3('a'.repeat(21))).toBe('描述最多 20 字'))
    it('valid → empty', () => expect(validateQ3('分析你的小红书笔记找出爆款规律')).toBe(''))
  })

  describe('validateQ4 (welcome — 选填)', () => {
    it('empty → empty (optional)', () => expect(validateQ4('')).toBe(''))
    it('short value → empty (no min)', () => expect(validateQ4('a'.repeat(19))).toBe(''))
    it('501 chars → over-limit error', () =>
      expect(validateQ4('a'.repeat(501))).toBe('欢迎语最多 500 字'))
    it('valid → empty', () => expect(validateQ4('a'.repeat(50))).toBe(''))
  })

  describe('validateSystemPrompt (提示词，必填)', () => {
    it('empty → error', () => expect(validateSystemPrompt('')).toBe('请输入提示词（行为指引）'))
    it('whitespace-only → error', () =>
      expect(validateSystemPrompt('   \n  ')).toBe('请输入提示词（行为指引）'))
    it('non-empty → empty', () => expect(validateSystemPrompt('你是一个销售助手')).toBe(''))
  })

  describe('validateForm (whole form)', () => {
    it('empty initial form → only name + system_prompt required', () => {
      const form = initialFormState()
      const errors = validateForm(form)
      expect(errors.name).toBeTruthy()
      expect(errors.system_prompt).toBeTruthy()
      // description / welcome 现为选填，留空不报错
      expect(errors.description).toBeUndefined()
      expect(errors.welcome_message).toBeUndefined()
      // questionnaire fields no longer validated
      expect(errors.q6).toBeUndefined()
      expect(errors.q7).toBeUndefined()
      expect(errors.q8).toBeUndefined()
    })

    it('name + system_prompt only → no errors (desc/welcome optional)', () => {
      const form = initialFormState()
      form.name = '爆款分析师'
      form.system_prompt = '你是爆款分析师，负责分析小红书笔记找规律。'
      const errors = validateForm(form)
      expect(Object.keys(errors)).toHaveLength(0)
    })

    it('partial completion → only relevant errors', () => {
      const form = initialFormState()
      form.name = 'Bot'
      const errors = validateForm(form)
      expect(errors.name).toBeFalsy() // name valid
      expect(errors.description).toBeFalsy() // optional, empty ok
      expect(errors.system_prompt).toBeTruthy() // still empty
    })
  })
})
