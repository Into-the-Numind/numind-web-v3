<template>
  <div class="monitor-config">
    <!-- Loading -->
    <div v-if="configLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <div class="loading-text">加载配置...</div>
    </div>

    <template v-else>
      <!-- XHS Account Binding Section -->
      <div class="xhs-bind-section">
        <div class="section-header">
          <label class="form-label">小红书账号</label>
        </div>
        <div v-if="xhsBound" class="xhs-bound">
          <div class="xhs-info">
            <span class="xhs-badge">已绑定</span>
            <span class="xhs-nickname">{{ xhsNickname || xhsUserID || '已绑定' }}</span>
          </div>
          <button class="unbind-btn" :disabled="unbinding" @click="handleUnbind">
            <span v-if="unbinding" class="btn-spinner"></span>
            解绑
          </button>
        </div>
        <div v-else class="xhs-unbound">
          <span class="xhs-hint">绑定小红书账号后才能抓取博主内容</span>
          <button class="bind-btn" @click="showBindModal = true">绑定账号</button>
        </div>
      </div>

      <XhsBindModal
        :visible="showBindModal"
        @close="showBindModal = false"
        @bound="onXhsBound"
      />

      <div class="config-form">
        <!-- Crawl frequency -->
        <div class="form-group">
          <label class="form-label">抓取频率</label>
          <CronPicker v-model="form.crawl_cron" type="crawl" />
        </div>

        <!-- Briefing time -->
        <div class="form-group">
          <label class="form-label">简报时间</label>
          <CronPicker v-model="form.briefing_cron" type="briefing" />
        </div>

        <!-- Briefing type -->
        <div class="form-group">
          <label class="form-label">简报类型</label>
          <select v-model="form.briefing_type" class="form-select">
            <option value="daily">日报</option>
            <option value="weekly">周报</option>
          </select>
        </div>

        <!-- Feishu webhook -->
        <div class="form-group">
          <label class="form-label">飞书 Webhook URL</label>
          <input
            v-model="form.feishu_webhook"
            type="text"
            class="form-input"
            placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
          />
        </div>

        <!-- Notify toggle -->
        <div class="form-group toggle-group">
          <label class="form-label">新内容通知</label>
          <label class="toggle">
            <input v-model="form.notify_on_update" type="checkbox" class="toggle-input" />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
            <span class="toggle-label">{{ form.notify_on_update ? '已开启' : '已关闭' }}</span>
          </label>
        </div>

        <!-- Save button -->
        <div class="form-actions">
          <button
            class="save-btn"
            :disabled="saving"
            @click="handleSave"
          >
            <span v-if="saving" class="btn-spinner"></span>
            保存配置
          </button>
          <span v-if="saveMessage" class="save-message" :class="saveSuccess ? 'success' : 'error'">
            {{ saveMessage }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useMonitorStore } from '@/stores/monitor'
import { updateMonitorConfig, getXhsBindStatus, unbindXhs } from '@/api/monitor'
import CronPicker from './CronPicker.vue'
import XhsBindModal from './XhsBindModal.vue'

const store = useMonitorStore()

const configLoading = ref(true)
const saving = ref(false)
const saveMessage = ref('')
const saveSuccess = ref(false)

// XHS binding state
const showBindModal = ref(false)
const xhsBound = ref(false)
const xhsNickname = ref('')
const xhsUserID = ref('')
const unbinding = ref(false)

const form = reactive({
  crawl_cron: '0 */6 * * *',
  briefing_cron: '0 9 * * *',
  briefing_type: 'daily',
  feishu_webhook: '',
  notify_on_update: true,
})

async function loadXhsBindStatus() {
  try {
    const res = await getXhsBindStatus()
    xhsBound.value = res.data.bound
    xhsNickname.value = res.data.nickname
    xhsUserID.value = res.data.xhs_user_id
  } catch {
    // If fetch fails, assume unbound
    xhsBound.value = false
  }
}

async function handleUnbind() {
  if (unbinding.value) return
  if (!confirm('确认解绑小红书账号？解绑后将无法抓取博主内容。')) return
  unbinding.value = true
  try {
    await unbindXhs()
    xhsBound.value = false
    xhsNickname.value = ''
    xhsUserID.value = ''
  } catch {
    // handled by interceptor
  } finally {
    unbinding.value = false
  }
}

function onXhsBound() {
  loadXhsBindStatus()
}

async function loadConfig() {
  configLoading.value = true
  try {
    await Promise.all([store.fetchConfig(), loadXhsBindStatus()])
    if (store.config) {
      form.crawl_cron = store.config.crawl_cron || '0 */6 * * *'
      form.briefing_cron = store.config.briefing_cron || '0 9 * * *'
      form.briefing_type = store.config.briefing_type || 'daily'
      form.feishu_webhook = store.config.feishu_webhook || ''
      form.notify_on_update = store.config.notify_on_update ?? true
    }
  } finally {
    configLoading.value = false
  }
}

async function handleSave() {
  if (saving.value) return
  saving.value = true
  saveMessage.value = ''
  try {
    await updateMonitorConfig({
      crawl_cron: form.crawl_cron,
      briefing_cron: form.briefing_cron,
      briefing_type: form.briefing_type,
      feishu_webhook: form.feishu_webhook,
      notify_on_update: form.notify_on_update,
    })
    saveMessage.value = '保存成功'
    saveSuccess.value = true
    // Refresh store config
    store.fetchConfig()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { message?: string } } }
    saveMessage.value = err?.response?.data?.message || '保存失败'
    saveSuccess.value = false
  } finally {
    saving.value = false
    setTimeout(() => {
      saveMessage.value = ''
    }, 3000)
  }
}

onMounted(loadConfig)
</script>

<style scoped>
.monitor-config {
  max-width: 560px;
}

/* Loading */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-4xl) 0;
  gap: var(--space-lg);
}

.loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--border-light);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

/* Form */
.config-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.form-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text);
}

.form-input,
.form-select {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--text);
  background: var(--surface);
  outline: none;
  transition: border-color var(--transition-fast);
  box-sizing: border-box;
}

.form-input:focus,
.form-select:focus {
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
}

.form-input::placeholder {
  color: var(--text-muted);
}

.form-select {
  cursor: pointer;
  max-width: 200px;
}

/* Toggle */
.toggle-group {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
}

.toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-track {
  position: relative;
  width: 40px;
  height: 22px;
  background: var(--border);
  border-radius: 11px;
  transition: background var(--transition-fast);
}

.toggle-input:checked + .toggle-track {
  background: var(--primary);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  transition: transform var(--transition-fast);
}

.toggle-input:checked + .toggle-track .toggle-thumb {
  transform: translateX(18px);
}

.toggle-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

/* Actions */
.form-actions {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding-top: var(--space-sm);
}

.save-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 24px;
  background: var(--primary);
  color: var(--primary-foreground);
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.save-btn:hover:not(:disabled) {
  background: var(--primary-hover);
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.save-message {
  font-size: var(--text-sm);
  font-weight: 500;
}

.save-message.success {
  color: hsl(160, 72%, 34%);
}

.save-message.error {
  color: hsl(0, 70%, 50%);
}

/* Spinner */
.btn-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* XHS Bind Section */
.xhs-bind-section {
  padding: var(--space-lg, 16px);
  border: 1px solid var(--border, #e5e5e5);
  border-radius: var(--radius-sm, 8px);
  margin-bottom: var(--space-xl, 24px);
  background: var(--surface, #fff);
}

.section-header {
  margin-bottom: var(--space-sm, 8px);
}

.xhs-bound {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.xhs-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
}

.xhs-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: var(--text-xs, 0.75rem);
  font-weight: 500;
  color: hsl(160, 72%, 34%);
  background: hsl(160, 72%, 95%);
  border-radius: 10px;
}

.xhs-nickname {
  font-size: var(--text-sm, 0.875rem);
  color: var(--text, #1a1a1a);
  font-weight: 500;
}

.unbind-btn {
  padding: 6px 14px;
  font-size: var(--text-sm, 0.875rem);
  color: hsl(0, 70%, 50%);
  background: none;
  border: 1px solid hsl(0, 70%, 85%);
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: background 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.unbind-btn:hover:not(:disabled) {
  background: hsl(0, 70%, 97%);
}

.unbind-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.xhs-unbound {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.xhs-hint {
  font-size: var(--text-sm, 0.875rem);
  color: var(--text-muted, #999);
}

.bind-btn {
  padding: 8px 18px;
  font-size: var(--text-sm, 0.875rem);
  color: var(--primary-foreground, #fff);
  background: var(--primary, #6366f1);
  border: none;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: background 0.2s;
}

.bind-btn:hover {
  background: var(--primary-hover, #5558e6);
}
</style>
