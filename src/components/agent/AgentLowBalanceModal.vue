<script setup lang="ts">
import { computed } from 'vue'
import type { SupportContact } from '@/types/agent'
import AppButton from '@/components/common/AppButton.vue'

interface Props {
  open: boolean
  balance: number
  isMember: boolean
  supportContact?: SupportContact
}

const props = withDefaults(defineProps<Props>(), { supportContact: () => ({}) })

const emit = defineEmits<{
  (e: 'purchase'): void
  (e: 'try', text: string): void
  (e: 'close'): void
}>()

const DEMO_TASKS = [
  '查一下我本周发了几条笔记',
  '把这条笔记的标题改 3 个版本',
  '总结昨天的直播 3 个亮点'
]

const handlePurchase = (): void => {
  emit('purchase')
}

const handleTryTask = (text: string): void => {
  emit('try', text)
}

const handleClose = (): void => {
  emit('close')
}

const copyContact = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // fallback ignore
  }
}

const contactText = computed<string>(() => {
  const c = props.supportContact
  if (c?.wechat) return `微信：${c.wechat}`
  if (c?.phone) return `电话：${c.phone}`
  return ''
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" role="dialog" aria-modal="true">
      <div class="modal-content">
        <div class="modal-header">
          <span class="modal-icon">💳</span>
          <h2 class="modal-title">积分余额不够完成这次任务</h2>
        </div>

        <p class="modal-body">
          当前余额：<strong>{{ balance }}</strong> 积分
        </p>

        <div v-if="isMember" class="options">
          <div class="option">
            <p class="option-title">购买加量包</p>
            <p class="option-desc">+600 积分 · ¥29.9 · 90 天有效</p>
            <AppButton @click="handlePurchase">去购买</AppButton>
          </div>

          <div class="option">
            <p class="option-title">缩小任务范围，试一试</p>
            <p class="option-desc">剩余积分可处理 1-2 个简单问题：</p>
            <ul class="demo-tasks">
              <li v-for="(task, idx) in DEMO_TASKS" :key="idx">
                <span class="task-text">· "{{ task }}"</span>
                <button class="try-btn" @click="handleTryTask(task)">试试这个</button>
              </li>
            </ul>
          </div>
        </div>

        <div v-else class="contact-section">
          <p class="contact-title">联系老师为你开通会员</p>
          <p v-if="contactText" class="contact-text">{{ contactText }}</p>
          <p v-else class="contact-text">请联系你的老师获取开通方式</p>
          <div v-if="supportContact?.wechat || supportContact?.phone" class="contact-actions">
            <AppButton
              variant="secondary"
              @click="copyContact(supportContact?.wechat ?? supportContact?.phone ?? '')"
              >复制联系方式</AppButton
            >
          </div>
        </div>

        <div class="modal-footer">
          <AppButton variant="secondary" @click="handleClose">关闭</AppButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.modal-content {
  background: var(--color-surface, #fff);
  border-radius: 12px;
  padding: 24px;
  max-width: 540px;
  width: 100%;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.modal-icon {
  font-size: 28px;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0;
}

.modal-body {
  font-size: 14px;
  color: var(--color-text-muted, #4b5563);
  margin: 0 0 16px;
}

.modal-body strong {
  color: var(--color-text, #1f2937);
}

.options {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.option {
  background: #f9fafb;
  border-radius: 8px;
  padding: 12px 16px;
}

.option-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0 0 4px;
}

.option-desc {
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  margin: 0 0 8px;
}

.demo-tasks {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.demo-tasks li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.task-text {
  color: var(--color-text-muted, #4b5563);
  flex: 1;
}

.try-btn {
  background: var(--color-primary, #2563eb);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  cursor: pointer;
}

.try-btn:hover {
  background: var(--color-primary-hover, #1d4ed8);
}

.contact-section {
  background: #f9fafb;
  border-radius: 8px;
  padding: 16px;
}

.contact-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #1f2937);
  margin: 0 0 8px;
}

.contact-text {
  font-size: 13px;
  color: var(--color-text-muted, #4b5563);
  margin: 0 0 12px;
  word-break: break-all;
}

.contact-actions {
  display: flex;
  justify-content: flex-end;
}

.modal-footer {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
