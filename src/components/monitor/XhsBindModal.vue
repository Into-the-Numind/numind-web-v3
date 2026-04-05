<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="handleClose">
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">绑定小红书账号</h3>
          <button class="close-btn" @click="handleClose">&times;</button>
        </div>

        <div class="modal-body">
          <!-- Loading state -->
          <div v-if="loading" class="qr-loading">
            <div class="loading-spinner"></div>
            <p class="loading-text">正在生成二维码...</p>
          </div>

          <!-- Error state -->
          <div v-else-if="errorMsg" class="qr-error">
            <p class="error-text">{{ errorMsg }}</p>
            <button class="retry-btn" @click="startQRLogin">重试</button>
          </div>

          <!-- QR Code display -->
          <div v-else-if="qrImageSrc" class="qr-display">
            <img :src="qrImageSrc" alt="小红书登录二维码" class="qr-image" />
            <p class="qr-instruction">请使用小红书 App 扫描二维码绑定账号</p>

            <!-- Status -->
            <div class="qr-status" :class="statusClass">
              <span v-if="qrStatus === 0" class="status-waiting">等待扫码...</span>
              <span v-else-if="qrStatus === 1" class="status-scanned">已扫码，请在手机上确认</span>
              <span v-else-if="qrStatus === 2" class="status-confirmed">绑定成功！</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import QRCode from 'qrcode'
import { createXhsQR, checkXhsQRStatus, completeXhsQR } from '@/api/monitor'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  bound: []
}>()

const loading = ref(false)
const errorMsg = ref('')
const qrImageSrc = ref('')
const qrID = ref('')
const qrStatus = ref(0) // 0=waiting, 1=scanned, 2=confirmed
let pollTimer: ReturnType<typeof setInterval> | null = null

const statusClass = computed(() => {
  switch (qrStatus.value) {
    case 0:
      return 'status-waiting-state'
    case 1:
      return 'status-scanned-state'
    case 2:
      return 'status-confirmed-state'
    default:
      return ''
  }
})

async function startQRLogin() {
  loading.value = true
  errorMsg.value = ''
  qrImageSrc.value = ''
  qrID.value = ''
  qrStatus.value = 0

  try {
    const res = await createXhsQR()
    const data = res.data
    qrID.value = data.qr_id

    // Generate QR code image from URL
    qrImageSrc.value = await QRCode.toDataURL(data.qr_url, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })

    // Start polling
    startPolling()
  } catch (e: unknown) {
    const err = e as Error
    errorMsg.value = err.message || '生成二维码失败'
  } finally {
    loading.value = false
  }
}

function startPolling() {
  stopPolling()
  const startedAt = Date.now()
  let consecutiveErrors = 0

  pollTimer = setInterval(async () => {
    if (!qrID.value) return

    // Client-side timeout: 4 minutes
    if (Date.now() - startedAt > 240_000) {
      stopPolling()
      errorMsg.value = '二维码已过期，请重新生成'
      qrImageSrc.value = ''
      return
    }

    try {
      const res = await checkXhsQRStatus(qrID.value)
      const data = res.data
      qrStatus.value = data.status
      consecutiveErrors = 0

      if (data.status === 2) {
        // User confirmed — complete the login
        stopPolling()
        await completeLogin()
      }
    } catch (e: unknown) {
      const err = e as { response?: { status?: number } }
      const status = err?.response?.status

      // Session expired on server side (404/410)
      if (status === 404 || status === 410) {
        stopPolling()
        errorMsg.value = '二维码已过期，请重新生成'
        qrImageSrc.value = ''
        return
      }

      // Transient network error — retry up to 3 times
      consecutiveErrors++
      if (consecutiveErrors >= 3) {
        stopPolling()
        errorMsg.value = '网络异常，请重试'
        qrImageSrc.value = ''
      }
    }
  }, 2000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function completeLogin() {
  try {
    await completeXhsQR(qrID.value)
    qrStatus.value = 2
    // Wait a moment so the user sees the success state
    setTimeout(() => {
      emit('bound')
      emit('close')
    }, 1000)
  } catch (e: unknown) {
    const err = e as Error
    errorMsg.value = err.message || '绑定失败'
    qrImageSrc.value = ''
  }
}

function handleClose() {
  stopPolling()
  emit('close')
}

// Start QR login when modal becomes visible
watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      startQRLogin()
    } else {
      stopPolling()
      qrImageSrc.value = ''
      qrID.value = ''
      qrStatus.value = 0
      errorMsg.value = ''
    }
  },
)

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--surface, #fff);
  border-radius: 12px;
  width: 380px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 0;
}

.modal-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text, #1a1a1a);
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-muted, #999);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text, #1a1a1a);
}

.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 300px;
  justify-content: center;
}

/* Loading */
.qr-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border-light, #e5e5e5);
  border-top-color: var(--primary, #6366f1);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  color: var(--text-muted, #999);
  font-size: 0.875rem;
}

/* Error */
.qr-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.error-text {
  color: hsl(0, 70%, 50%);
  font-size: 0.875rem;
  text-align: center;
}

.retry-btn {
  padding: 8px 20px;
  background: var(--primary, #6366f1);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.2s;
}

.retry-btn:hover {
  opacity: 0.9;
}

/* QR Display */
.qr-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.qr-image {
  width: 256px;
  height: 256px;
  border-radius: 8px;
}

.qr-instruction {
  color: var(--text-secondary, #666);
  font-size: 0.875rem;
  text-align: center;
}

.qr-status {
  font-size: 0.875rem;
  font-weight: 500;
  padding: 6px 16px;
  border-radius: 20px;
}

.status-waiting-state {
  color: var(--text-muted, #999);
  background: var(--surface-muted, #f5f5f5);
}

.status-scanned-state {
  color: hsl(40, 80%, 40%);
  background: hsl(40, 80%, 95%);
}

.status-confirmed-state {
  color: hsl(160, 72%, 34%);
  background: hsl(160, 72%, 95%);
}
</style>
