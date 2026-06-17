<!--
  MeetingSetupView — 会议副驾「开场」页 (SPEC §0.1 / §5)

  用户在这里:
    - 填写角色定位 + 反馈规则 (role_prompt, 自由文本)
    - 可选从预设载入 / 把当前配置存为预设 (SPEC §3 presets)
    - 设置 auto_interval_seconds (自动反馈间隔 5–60 秒, 默认 15; FEEDBACK_V2 §1 去档位)
    - 授权麦克风 (start 一个临时 recorder 探针 → 立刻 stop, 仅为触发授权弹窗)
    - 「开始会议」→ createSession → 跳 /meeting/live/:id

  4 状态 (.claude/rules/ui-ux.md §2):
    - presets loading: 预设下拉显 skeleton/占位
    - presets empty: 仅内置 (始终有 3 个 builtin, 实质不会真空, 但仍兜底)
    - presets error: 提示 + 重试
    - creating: 「开始会议」按钮 loading 态

  组件全自研 + 现有 design token; 禁外部 UI 框架。
-->
<template>
  <MainLayout>
    <div class="setup-view">
      <header class="setup-head">
        <h1 class="setup-title">会议副驾</h1>
        <p class="setup-subtitle">设定一个角色与反馈规则，让 AI 在会议中实时为你出谋划策。</p>
        <button type="button" class="history-link" @click="goHistory">查看历史会议 →</button>
      </header>

      <section class="setup-card">
        <!-- 预设区 -->
        <div class="field">
          <label class="field-label" for="preset-select">从预设载入（可选）</label>
          <div class="preset-row">
            <div class="preset-select-wrap">
              <select
                id="preset-select"
                v-model="selectedPresetId"
                class="native-select"
                :disabled="meeting.loadingPresets"
                @change="onPresetChange"
              >
                <option :value="null">— 不使用预设 —</option>
                <option v-for="p in meeting.presets" :key="p.id" :value="p.id">
                  {{ p.is_builtin ? '★ ' : '' }}{{ p.name }}
                </option>
              </select>
            </div>
            <button
              v-if="selectedPreset && !selectedPreset.is_builtin"
              type="button"
              class="preset-delete-btn"
              title="删除该预设"
              @click="askDeletePreset"
            >
              <Trash2 :size="16" />
            </button>
          </div>

          <!-- 预设加载 4 态 -->
          <p v-if="meeting.loadingPresets" class="hint hint--muted">正在加载预设…</p>
          <p v-else-if="presetError" class="hint hint--error">
            预设加载失败：{{ presetError }}
            <button type="button" class="inline-retry" @click="loadPresets">重试</button>
          </p>
        </div>

        <!-- role_prompt -->
        <div class="field">
          <label class="field-label" for="role-prompt">角色定位 + 反馈规则</label>
          <textarea
            id="role-prompt"
            v-model="rolePrompt"
            class="role-textarea"
            rows="7"
            placeholder="例如：你是我的辩论陪练。实时听我和对手的论辩，当我出现逻辑漏洞、举证不足或被对方抓住把柄时立刻提醒我，并给出一句可立即使用的反驳或补强。其他时候保持沉默。"
            @blur="validateRolePrompt"
          />
          <p v-if="rolePromptError" class="hint hint--error">{{ rolePromptError }}</p>
          <p v-else class="hint hint--muted">
            描述 AI 的身份、关注什么、何时该出声、何时保持沉默。
          </p>
        </div>

        <!-- auto_interval -->
        <div class="field">
          <label class="field-label" for="auto-interval">自动反馈间隔（秒）</label>
          <div class="interval-row">
            <input
              id="auto-interval"
              v-model.number="autoIntervalSeconds"
              class="interval-input"
              type="number"
              min="5"
              max="60"
              step="1"
              @blur="validateInterval"
            />
            <span class="interval-suffix">秒 / 次</span>
          </div>
          <p v-if="intervalError" class="hint hint--error">{{ intervalError }}</p>
          <p v-else class="hint hint--muted">
            每隔这么久，且有足够新转写时，AI 自动判断是否给反馈（5–60 秒）。
          </p>
        </div>

        <!-- 存为预设 -->
        <div class="field save-preset-field">
          <button type="button" class="text-action" @click="toggleSavePreset">
            <Bookmark :size="15" />
            <span>{{ showSavePreset ? '收起' : '把当前配置存为预设' }}</span>
          </button>
          <div v-if="showSavePreset" class="save-preset-box">
            <input
              v-model="newPresetName"
              class="preset-name-input"
              type="text"
              maxlength="100"
              placeholder="预设名称，如「我的辩论陪练」"
            />
            <AppButton
              variant="secondary"
              size="sm"
              :loading="meeting.savingPreset"
              :disabled="!canSavePreset"
              @click="doSavePreset"
            >
              保存预设
            </AppButton>
          </div>
        </div>

        <!-- 麦克风授权 -->
        <div class="field mic-field">
          <div class="mic-status" :class="`mic-status--${micState}`">
            <Mic :size="16" />
            <span>{{ micStatusLabel }}</span>
          </div>
          <button
            v-if="micState !== 'granted'"
            type="button"
            class="text-action"
            :disabled="micState === 'requesting'"
            @click="requestMic"
          >
            {{ micState === 'requesting' ? '请求中…' : '授权麦克风' }}
          </button>
          <p v-if="micError" class="hint hint--error">{{ micError }}</p>
        </div>

        <!-- 开始 -->
        <div class="actions">
          <AppButton
            variant="primary"
            size="lg"
            :loading="meeting.creating"
            :disabled="!canStart"
            @click="startMeeting"
          >
            开始会议
          </AppButton>
        </div>
        <p v-if="meeting.error && !presetError" class="hint hint--error center">
          {{ meeting.error }}
        </p>
      </section>
    </div>

    <ConfirmModal
      v-model="confirmDeleteOpen"
      title="删除预设"
      message="确定删除该预设吗？此操作无法撤销。"
      variant="danger"
      confirm-text="删除"
      @confirm="confirmDeletePreset"
    />
  </MainLayout>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Mic, Bookmark, Trash2 } from 'lucide-vue-next'
import MainLayout from '@/components/layout/MainLayout.vue'
import AppButton from '@/components/common/AppButton.vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import { useMeetingStore } from '@/stores/meeting'
import { useNotificationsStore } from '@/stores/notifications'

const router = useRouter()
const meeting = useMeetingStore()
const notifications = useNotificationsStore()

// ── Form state ───────────────────────────────────────────────────────────
const rolePrompt = ref('')
const autoIntervalSeconds = ref(15)
const selectedPresetId = ref<number | null>(null)
const newPresetName = ref('')
const showSavePreset = ref(false)

// ── Validation ─────────────────────────────────────────────────────────────
const rolePromptError = ref('')
const intervalError = ref('')
const presetError = ref('')

const validateRolePrompt = (): boolean => {
  if (rolePrompt.value.trim().length === 0) {
    rolePromptError.value = '请填写角色定位与反馈规则'
    return false
  }
  rolePromptError.value = ''
  return true
}

const validateInterval = (): boolean => {
  const v = autoIntervalSeconds.value
  if (!Number.isFinite(v) || v < 5 || v > 60) {
    intervalError.value = '间隔需在 5–60 秒之间'
    return false
  }
  intervalError.value = ''
  return true
}

// ── Mic permission probe ───────────────────────────────────────────────────
type MicState = 'idle' | 'requesting' | 'granted' | 'denied'
const micState = ref<MicState>('idle')
const micError = ref('')

const micStatusLabel = computed(() => {
  switch (micState.value) {
    case 'granted':
      return '麦克风已授权'
    case 'requesting':
      return '正在请求麦克风权限…'
    case 'denied':
      return '麦克风被拒绝'
    default:
      return '麦克风未授权'
  }
})

const requestMic = async (): Promise<void> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    micState.value = 'denied'
    micError.value = '当前浏览器不支持麦克风录音'
    return
  }
  micState.value = 'requesting'
  micError.value = ''
  try {
    // 仅探测授权；拿到 stream 立刻释放 track（实际采集在 Live 页由 recorder 接管）。
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks()) track.stop()
    micState.value = 'granted'
  } catch (err) {
    micState.value = 'denied'
    micError.value =
      (err as Error)?.name === 'NotAllowedError'
        ? '麦克风权限被拒绝，请在浏览器地址栏允许后重试'
        : `无法访问麦克风：${(err as Error)?.message ?? '未知错误'}`
  }
}

// ── Presets ──────────────────────────────────────────────────────────────
const selectedPreset = computed(
  () => meeting.presets.find((p) => p.id === selectedPresetId.value) ?? null
)

const onPresetChange = (): void => {
  const p = selectedPreset.value
  if (!p) return
  rolePrompt.value = p.role_prompt
  // Clamp into the new 5–60 range (FEEDBACK_V2 §1): older builtin presets may
  // carry a legacy interval (e.g. 60 or a higher value) outside the new bounds.
  autoIntervalSeconds.value = Math.min(60, Math.max(5, p.auto_interval_seconds))
  rolePromptError.value = ''
  intervalError.value = ''
}

const loadPresets = async (): Promise<void> => {
  presetError.value = ''
  await meeting.loadPresets()
  // store.error reflects the last failed action; surface it as a preset-scoped error.
  if (meeting.error && meeting.presets.length === 0) {
    presetError.value = meeting.error
  }
}

const toggleSavePreset = (): void => {
  showSavePreset.value = !showSavePreset.value
}

const canSavePreset = computed(
  () => newPresetName.value.trim().length > 0 && rolePrompt.value.trim().length > 0
)

const doSavePreset = async (): Promise<void> => {
  if (!canSavePreset.value) return
  const preset = await meeting.savePreset({
    name: newPresetName.value.trim(),
    role_prompt: rolePrompt.value.trim(),
    auto_interval_seconds: autoIntervalSeconds.value
  })
  if (preset) {
    notifications.success('预设已保存')
    selectedPresetId.value = preset.id
    newPresetName.value = ''
    showSavePreset.value = false
  } else {
    notifications.error(meeting.error ?? '保存预设失败')
  }
}

// ── Preset deletion (destructive → confirm dialog, ui-ux §4) ───────────────
const confirmDeleteOpen = ref(false)
const askDeletePreset = (): void => {
  if (!selectedPreset.value || selectedPreset.value.is_builtin) return
  confirmDeleteOpen.value = true
}
const confirmDeletePreset = async (): Promise<void> => {
  const id = selectedPresetId.value
  if (id == null) return
  const ok = await meeting.deletePreset(id)
  if (ok) {
    notifications.success('预设已删除')
    selectedPresetId.value = null
  } else {
    notifications.error(meeting.error ?? '删除预设失败')
  }
}

// ── Start ──────────────────────────────────────────────────────────────────
const canStart = computed(
  () =>
    rolePrompt.value.trim().length > 0 &&
    !rolePromptError.value &&
    !intervalError.value &&
    !meeting.creating
)

const startMeeting = async (): Promise<void> => {
  if (!validateRolePrompt() || !validateInterval()) return
  // 麦克风未授权也允许创建会话 —— Live 页 recorder.start() 会再次触发授权弹窗；
  // 不强行阻塞（用户可能想先建会话再决定何时录音）。
  const session = await meeting.createSession({
    role_prompt: rolePrompt.value.trim(),
    auto_interval_seconds: autoIntervalSeconds.value,
    preset_id: selectedPresetId.value ?? undefined
  })
  if (session) {
    router.push({ name: 'meeting-live', params: { id: String(session.id) } })
  } else {
    notifications.error(meeting.error ?? '创建会议失败')
  }
}

const goHistory = (): void => {
  router.push({ name: 'meeting-history' })
}

onMounted(() => {
  meeting.reset()
  void loadPresets()
})
</script>

<style scoped>
.setup-view {
  max-width: 720px;
  margin: 0 auto;
  padding: 8px 0 48px;
}

.setup-head {
  position: relative;
  margin-bottom: 28px;
}

.setup-title {
  font-family: var(--font-sans);
  font-size: 30px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
  margin: 0 0 8px;
}

.setup-subtitle {
  font-size: 15px;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
  max-width: 560px;
}

.history-link {
  position: absolute;
  top: 4px;
  right: 0;
  border: none;
  background: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  transition: color 0.15s ease;
}

.history-link:hover {
  color: var(--color-primary);
}

.setup-card {
  background: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  padding: 28px 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.preset-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.preset-select-wrap {
  flex: 1;
  min-width: 0;
}

.native-select {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-family: var(--font-sans);
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.native-select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--shadow-focus);
}

.native-select:disabled {
  background: var(--surface-tint);
  cursor: not-allowed;
}

.preset-delete-btn {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-delete-btn:hover {
  border-color: #ef4444;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.06);
}

.role-textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-family: var(--font-sans);
  line-height: 1.6;
  color: var(--text);
  background: var(--surface);
  resize: vertical;
  min-height: 120px;
  transition: border-color 0.15s ease;
}

.role-textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--shadow-focus);
}

.interval-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.interval-input {
  width: 120px;
  height: 42px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-family: var(--font-sans);
  color: var(--text);
  background: var(--surface);
  transition: border-color 0.15s ease;
}

.interval-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--shadow-focus);
}

.interval-suffix {
  font-size: 13px;
  color: var(--text-muted);
}

.hint {
  font-size: 12.5px;
  line-height: 1.5;
  margin: 0;
}

.hint--muted {
  color: var(--text-muted);
}

.hint--error {
  color: #ef4444;
}

.hint.center {
  text-align: center;
}

.inline-retry {
  border: none;
  background: none;
  color: var(--color-primary);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 0 0 0 4px;
}

.save-preset-field {
  gap: 10px;
}

.text-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  border: none;
  background: none;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 600;
  font-family: var(--font-sans);
  cursor: pointer;
  padding: 0;
  transition: color 0.15s ease;
}

.text-action:hover:not(:disabled) {
  color: var(--primary-hover);
}

.text-action:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
}

.save-preset-box {
  display: flex;
  align-items: center;
  gap: 10px;
}

.preset-name-input {
  flex: 1;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-family: var(--font-sans);
  color: var(--text);
  background: var(--surface);
}

.preset-name-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--shadow-focus);
}

.mic-field {
  flex-direction: row;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.mic-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 500;
  padding: 7px 14px;
  border-radius: var(--radius-pill);
}

.mic-status--idle {
  background: var(--surface-tint);
  color: var(--text-muted);
}

.mic-status--requesting {
  background: hsl(40, 90%, 95%);
  color: hsl(35, 80%, 40%);
}

.mic-status--granted {
  background: var(--accent-ultra-soft);
  color: var(--color-primary);
}

.mic-status--denied {
  background: rgba(239, 68, 68, 0.08);
  color: #ef4444;
}

.actions {
  display: flex;
  justify-content: center;
  margin-top: 4px;
}

@media (max-width: 768px) {
  .history-link {
    position: static;
    display: inline-block;
    margin-top: 8px;
  }

  .setup-card {
    padding: 20px 16px;
  }
}
</style>
