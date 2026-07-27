<script setup lang="ts">
/**
 * A recoverable, server-owned Feishu step inside the original Agent timeline.
 *
 * This component intentionally only presents an opaque action and emits a
 * lifecycle intent. It never constructs an answer, scopes, CLI arguments, or
 * a new chat message. AgentMessageItem owns the lifecycle-store calls.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ExternalLink, RefreshCw, ShieldCheck } from 'lucide-vue-next'
import AppButton from '@/components/common/AppButton.vue'
import type { ExternalActionMessage } from '@/types/agent'

interface Props {
  action: ExternalActionMessage
  busy?: boolean
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  busy: false,
  error: ''
})

const emit = defineEmits<{
  resume: [operationId: string]
  refresh: [sessionId: string]
  confirmed: [operationId: string]
}>()

const phaseContent = {
  create_app: {
    title: '创建个人应用',
    description: '为你的有数账号创建一个独立飞书自建应用。请在飞书官方页面确认。'
  },
  app_scope: {
    title: '等待管理员批准',
    description: '应用已经创建，但这项能力需要飞书管理员批准。批准后回到这里继续。'
  },
  user_auth: {
    title: '授权并继续',
    description: ''
  },
  confirmation: {
    title: '正在继续原任务',
    description: '旧版确认步骤已取消，正在按原任务自动继续。'
  }
} as const

const noticeContent = {
  authorization_pending: '尚未检测到授权完成，请完成后再继续。',
  authorization_processing: '正在确认授权状态，请稍候。',
  authorization_rejected: '本次授权未通过，已生成新的授权链接。',
  authorization_expired: '原链接已过期，已生成新的授权链接。',
  authorization_updated: '授权步骤已更新，正在加载最新操作。'
} as const

const now = ref(Date.now())
let expiryTimer: ReturnType<typeof setTimeout> | null = null

const deadline = computed<number | null>(() => {
  const timestamp = Date.parse(props.action.expires_at)
  return Number.isFinite(timestamp) ? timestamp : null
})

// An invalid timestamp is also expired. Keeping a sensitive URL alive is worse
// than taking the user through the server-owned refresh path one time too many.
const expired = computed<boolean>(
  () =>
    props.action.action_status === 'expired' ||
    (props.action.action_status === 'pending' &&
      (deadline.value === null || deadline.value <= now.value))
)
const pending = computed<boolean>(() => props.action.action_status === 'pending')
const current = computed<boolean>(() => pending.value && !expired.value)
const confirmation = computed<boolean>(() => props.action.phase === 'confirmation')
const refreshableAuthorizationPhase = computed<boolean>(
  () =>
    props.action.phase === 'create_app' ||
    props.action.phase === 'app_scope' ||
    props.action.phase === 'user_auth'
)
const url = computed<string>(() => props.action.url ?? '')
const showsCurrentURL = computed<boolean>(() => current.value && !confirmation.value && !!url.value)
const missingLink = computed<boolean>(() => current.value && !confirmation.value && !url.value)
const restartRequired = computed<boolean>(() => props.action.phase === 'app_scope' && expired.value)
const showRefresh = computed<boolean>(
  () => refreshableAuthorizationPhase.value && (expired.value || missingLink.value)
)
const canResume = computed<boolean>(
  () => current.value && !confirmation.value && (!!url.value || props.action.phase === 'app_scope')
)
const phase = computed(() => phaseContent[props.action.phase])
const cardTitle = computed<string>(() =>
  props.action.phase === 'user_auth' ? '飞书授权' : `飞书个人工作空间 · ${phase.value.title}`
)
const noticeText = computed<string>(() =>
  current.value && props.action.notice_code ? noticeContent[props.action.notice_code] : ''
)
const interactionBusy = computed<boolean>(
  () => props.busy || props.action.notice_code === 'authorization_processing'
)
let migratedConfirmationKey = ''
let migratedConfirmationAttempts = 0
let confirmationRetryTimer: ReturnType<typeof setTimeout> | null = null

function clearConfirmationRetry(): void {
  if (confirmationRetryTimer) {
    clearTimeout(confirmationRetryTimer)
    confirmationRetryTimer = null
  }
}

function scheduleConfirmationRetry(key: string, operationID: string): void {
  if (confirmationRetryTimer) return
  const delay = Math.min(
    1_000 * 2 ** Math.min(Math.max(migratedConfirmationAttempts - 1, 0), 4),
    15_000
  )
  confirmationRetryTimer = setTimeout(() => {
    confirmationRetryTimer = null
    const action = props.action
    if (
      action.phase !== 'confirmation' ||
      (action.action_status !== 'pending' && action.action_status !== 'expired') ||
      `${action.operation_id}:${action.session_id}` !== key ||
      props.busy
    ) {
      return
    }
    migratedConfirmationAttempts += 1
    emit('confirmed', operationID)
  }, delay)
}

watch(
  () =>
    [
      props.action.phase,
      props.action.operation_id,
      props.action.session_id,
      props.action.action_status,
      props.busy,
      props.error
    ] as const,
  ([actionPhase, operationID, sessionID, actionStatus, busy, error]) => {
    if (
      actionPhase !== 'confirmation' ||
      (actionStatus !== 'pending' && actionStatus !== 'expired')
    ) {
      clearConfirmationRetry()
      return
    }
    const key = `${operationID}:${sessionID}`
    if (migratedConfirmationKey !== key) {
      clearConfirmationRetry()
      if (busy) return
      migratedConfirmationKey = key
      migratedConfirmationAttempts = 1
      emit('confirmed', operationID)
      return
    }
    if (!busy && error) scheduleConfirmationRetry(key, operationID)
  },
  { immediate: true }
)

const statusText = computed<string>(() => {
  if (props.busy) return '正在检查飞书状态并衔接原任务，请稍候。'
  if (restartRequired.value) return '管理员批准步骤已失效，请重新生成链接。'
  if (props.action.action_status === 'completed') {
    return props.action.terminal_state === 'succeeded'
      ? '飞书操作已完成，正在继续原任务。'
      : '授权步骤已完成，正在继续原任务。'
  }
  if (props.action.action_status === 'terminal') {
    switch (props.action.terminal_state) {
      case 'failed':
        return '原飞书任务已结束，请重新发送原指令。'
      case 'unknown':
        return '原飞书操作结果未知，请先在飞书中核对后再试。'
      case 'cancelled':
        return '原飞书操作已取消。'
      case 'succeeded':
        return '飞书操作已完成，正在继续原任务。'
      default:
        return '原飞书任务已结束，请根据最新状态决定下一步。'
    }
  }
  if (confirmation.value) return '正在继续原任务。'
  if (expired.value) return '链接已过期，请重新生成后继续。'
  if (missingLink.value && props.action.phase === 'app_scope') {
    return '审批步骤已更新，请在刚才打开的飞书页面完成批准后继续。'
  }
  if (missingLink.value) return '正在获取当前步骤的最新飞书链接。'
  return ''
})

const alertText = computed<string>(() => props.error)

function scheduleExpiry(): void {
  if (expiryTimer) {
    clearTimeout(expiryTimer)
    expiryTimer = null
  }
  if (props.action.action_status !== 'pending') return
  const expiresAt = deadline.value
  if (expiresAt === null || expiresAt <= Date.now()) {
    now.value = Date.now()
    return
  }
  expiryTimer = setTimeout(
    () => {
      now.value = Date.now()
      expiryTimer = null
    },
    expiresAt - Date.now() + 1
  )
}

watch(
  () => [props.action.action_status, props.action.expires_at],
  () => scheduleExpiry(),
  { immediate: true }
)

onBeforeUnmount(() => {
  if (expiryTimer) clearTimeout(expiryTimer)
  clearConfirmationRetry()
})

function handleResume(): void {
  if (!canResume.value || interactionBusy.value) return
  emit('resume', props.action.operation_id)
}

function handleRefresh(): void {
  if (!showRefresh.value || interactionBusy.value) return
  emit('refresh', props.action.session_id)
}
</script>

<template>
  <section class="feishu-action-card" data-testid="feishu-action-card" aria-label="飞书操作步骤">
    <div class="feishu-action-card__header">
      <span class="feishu-action-card__icon" aria-hidden="true"><ShieldCheck :size="18" /></span>
      <h3 data-testid="feishu-phase" class="feishu-action-card__title">{{ cardTitle }}</h3>
    </div>

    <p v-if="phase.description" class="feishu-action-card__description">
      {{ phase.description }}
    </p>

    <p
      v-if="noticeText"
      data-testid="feishu-notice"
      class="feishu-action-card__notice"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ noticeText }}
    </p>
    <p v-if="statusText" class="feishu-action-card__status">{{ statusText }}</p>
    <p v-if="alertText" class="feishu-action-card__error" role="alert">{{ alertText }}</p>

    <template v-if="showsCurrentURL">
      <div class="feishu-action-card__action-band">
        <div class="feishu-action-card__action-copy">
          <strong>先去飞书完成授权</strong>
          <p>打开上述链接，完成操作后点击继续。</p>
        </div>
        <a
          data-testid="feishu-open-link"
          :href="url"
          target="_blank"
          rel="noopener noreferrer"
          class="feishu-action-card__open-link"
          aria-label="打开飞书授权链接"
        >
          <ExternalLink :size="15" aria-hidden="true" />
          <span>打开链接</span>
        </a>
      </div>
    </template>

    <div
      v-if="!confirmation && !restartRequired && (current || expired)"
      class="feishu-action-card__controls"
    >
      <AppButton
        data-testid="feishu-continue"
        variant="primary"
        size="sm"
        :loading="interactionBusy"
        :disabled="!canResume || interactionBusy"
        aria-label="确认继续"
        @click="handleResume"
      >
        {{ interactionBusy ? '正在检查…' : '确认继续' }}
      </AppButton>
      <AppButton
        v-if="showRefresh"
        data-testid="feishu-refresh"
        variant="secondary"
        size="sm"
        :loading="interactionBusy"
        :disabled="interactionBusy"
        aria-label="重新生成飞书链接"
        @click="handleRefresh"
      >
        <RefreshCw :size="15" aria-hidden="true" />
        重新生成链接
      </AppButton>
    </div>

    <div v-else-if="showRefresh" class="feishu-action-card__controls">
      <AppButton
        data-testid="feishu-refresh"
        variant="secondary"
        size="sm"
        :loading="interactionBusy"
        :disabled="interactionBusy"
        aria-label="重新生成飞书链接"
        @click="handleRefresh"
      >
        <RefreshCw :size="15" aria-hidden="true" />
        重新生成链接
      </AppButton>
    </div>
  </section>
</template>

<style scoped>
.feishu-action-card {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  max-width: 560px;
  min-width: 0;
  overflow: hidden;
  padding: var(--space-xl);
  padding-left: calc(var(--space-xl) + var(--space-xs));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  color: var(--text);
}

.feishu-action-card::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 4px;
  background: linear-gradient(180deg, var(--primary), hsl(160 65% 86%));
  content: '';
}

.feishu-action-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.feishu-action-card__icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--radius-sm);
  background: var(--accent-ultra-soft);
  color: var(--primary);
}

.feishu-action-card__description,
.feishu-action-card__notice,
.feishu-action-card__status,
.feishu-action-card__error {
  margin: 0;
}

.feishu-action-card__title {
  margin: 0;
  color: var(--text);
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  line-height: var(--line-height-tight);
}

.feishu-action-card__description {
  margin-top: var(--space-lg);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: var(--line-height-normal);
}

.feishu-action-card__notice,
.feishu-action-card__status,
.feishu-action-card__error {
  margin-top: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  line-height: var(--line-height-normal);
}

.feishu-action-card__notice,
.feishu-action-card__status {
  background: var(--surface-tint);
  color: var(--text-secondary);
}

.feishu-action-card__error {
  /* TODO(admin-rebrand): replace with --danger token */
  background: #fef2f2;
  color: #ef4444;
}

.feishu-action-card__action-band {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  margin-top: var(--space-lg);
  padding: var(--space-md);
  border: 1px solid hsl(160 60% 88%);
  border-radius: var(--radius-sm);
  background: linear-gradient(180deg, hsl(160 60% 96%), hsl(160 55% 98%));
}

.feishu-action-card__action-copy {
  min-width: 180px;
}

.feishu-action-card__action-copy strong {
  display: block;
  margin-bottom: var(--space-xs);
  color: var(--text);
  font-size: var(--text-sm);
  line-height: var(--line-height-tight);
}

.feishu-action-card__action-copy p {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--text-xs);
  line-height: var(--line-height-normal);
}

.feishu-action-card__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-lg);
}

.feishu-action-card__open-link {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  box-sizing: border-box;
  padding: 0 var(--space-md);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: var(--text-sm);
  font-weight: 500;
  text-decoration: none;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);
}

.feishu-action-card__open-link:hover {
  border-color: var(--primary);
  background: var(--surface-hover);
  color: var(--primary);
}

@media (max-width: 480px) {
  .feishu-action-card {
    padding: var(--space-lg);
    padding-left: calc(var(--space-lg) + var(--space-xs));
  }

  .feishu-action-card__action-band {
    align-items: flex-start;
    justify-content: flex-start;
  }

  .feishu-action-card__action-copy {
    min-width: 100%;
  }
}
</style>
