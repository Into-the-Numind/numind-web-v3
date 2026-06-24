<script setup lang="ts">
/**
 * AgentAuthPrompt.vue — renders an agent pause whose pause_type === 'auth'
 * (feishu-integration T13; generalized in feishu-agent-connect).
 *
 * WHY a separate card (not QuestionPrompt): an ask_user_question pause is
 * resolved IN-APP — the user picks an option / types an answer and the parent
 * (AgentChatView) streams the resumed leg via startResume. An external-link
 * pause is resolved EXTERNALLY: the user opens auth_url in their browser,
 * completes the step there, and the run resumes SERVER-side (the OAuth callback
 * or the next tool re-call calls biz.Answer with the fixed question_text key,
 * design §6). There is therefore NO in-app submit and NO answer payload — this
 * card only PRESENTS the link (copyable URL + QR) and shows a "waiting for you
 * to finish" state. The parent view keeps status polling alive
 * (store.isWaitingForAuth) so the externally-resumed leg auto-continues; when the
 * run leaves waiting_for_user_choice the store flips this card to answered.
 *
 * TWO URL FLAVORS, ONE CARD (feishu-agent-connect): the 飞书 connect tool yields
 * pause_type=auth for BOTH legs of the connect flow — the "建应用" (create-app,
 * device-code page) link AND the OAuth "授权" link (tool_feishu_connect.go). They
 * share the same PauseType + the same neutral prompt text + a single AuthURL, and
 * the card cannot (and need not) tell them apart from auth_url alone. So this
 * card's own chrome copy is deliberately FLOW-NEUTRAL ("打开链接完成"/"扫码打开"/
 * "完成后会自动继续") — it reads correctly whether the link creates an app or
 * authorizes scopes. The backend-supplied `prompt` carries any flow-specific
 * lead-in; the card never hard-codes "授权"-only wording that would mis-describe
 * the create-app leg.
 *
 * Async-4-states mapping (ui-ux.md rule 2) for the pause's own lifecycle:
 *   - success/empty → pending: URL + QR + "打开链接" CTA (the actionable state)
 *   - loading       → answered=false + polling: the small "完成后会自动继续" hint
 *                     is always shown beneath the CTA while pending (no spinner that
 *                     blocks the link — the user must still be able to open it)
 *   - error         → auth_url missing: a quiet "链接生成失败，请重新发起连接" note
 *                     with no dead CTA (the run stays waiting; re-trigger makes a
 *                     fresh link)
 *   - answered      → the run resumed: a calm "已完成，正在继续…" recap (locked)
 *
 * Props:
 *   authUrl  — external link (QuestionPromptMessage.auth_url): a create-app page
 *              URL or an OAuth authorize URL — both handled identically here.
 *   prompt   — the fixed prompt text (Questions[0].Question, design §6); shown as
 *              the card's lead-in so the card reads like the agent explaining why
 *              it paused. Optional — falls back to a default copy.
 *   answered — true once the run resumed (store flipped answer_status='answered')
 *
 * This card emits NOTHING: resume is external + server-driven.
 */
import { ref, computed, watch } from 'vue'
import QRCode from 'qrcode'
import { copyText } from '@/utils/clipboard'
import { ExternalLink, Copy, Check, ShieldCheck, Loader2 } from 'lucide-vue-next'

interface Props {
  authUrl?: string
  prompt?: string
  answered?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  authUrl: '',
  prompt: '',
  answered: false
})

// hasUrl drives the pending(actionable) vs error(no link) branch. An auth pause
// MUST carry a URL; a missing one means the link generation failed (the run is
// still waiting) → render the error note, never a dead "去授权" button.
const hasUrl = computed(() => !!props.authUrl)

// Flow-neutral lead-in: works for both the create-app and authorize legs. The
// backend `prompt` (feishuConnectPromptText) normally overrides this with the
// per-flow copy; the fallback must not assume "授权"-only (it could be a
// create-app link).
const leadText = computed(
  () => props.prompt?.trim() || '请打开下面的链接完成操作 — 完成后会自动继续。'
)

// ── QR code ─────────────────────────────────────────────────────────────────
// Render auth_url to a QR data URL so the user can scan it on a phone to open
// the link there. Race guard (BoosterPurchaseDialog pattern): a fast prop
// change could resolve an older toDataURL after a newer one; only the latest
// qrGenId writes back.
const qrDataUrl = ref('')
let qrGenId = 0
watch(
  () => props.authUrl,
  async (url) => {
    if (!url) {
      qrDataUrl.value = ''
      return
    }
    qrGenId += 1
    const myId = qrGenId
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 176,
        margin: 1,
        color: { dark: '#1a1d26', light: '#ffffff' }
      })
      if (myId === qrGenId) qrDataUrl.value = dataUrl
    } catch {
      if (myId === qrGenId) qrDataUrl.value = ''
    }
  },
  { immediate: true }
)

// ── Copy link ─────────────────────────────────────────────────────────────
// copyText (utils/clipboard) falls back to execCommand on a non-secure context
// (dev/qa over HTTP IP have no navigator.clipboard). copied flips a 2s ✓ badge.
const copied = ref(false)
const handleCopy = async (): Promise<void> => {
  if (!props.authUrl) return
  const ok = await copyText(props.authUrl)
  if (ok) {
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }
}
</script>

<template>
  <div
    class="auth-prompt"
    :class="{ 'auth-prompt--answered': answered }"
    role="group"
    aria-label="飞书连接"
  >
    <!-- Answered (resumed) recap — calm, locked, no controls. -->
    <template v-if="answered">
      <div class="auth-prompt__done">
        <span class="auth-prompt__avatar auth-prompt__avatar--done" aria-hidden="true">
          <Check :size="15" />
        </span>
        <span class="auth-prompt__done-text">已完成，正在继续…</span>
      </div>
    </template>

    <!-- Pending: present the link (the run is waiting for external authorization). -->
    <template v-else>
      <!-- Lead-in: avatar + why-it-paused copy. -->
      <div class="auth-prompt__who">
        <span class="auth-prompt__avatar" aria-hidden="true">
          <ShieldCheck :size="15" />
        </span>
        <span class="auth-prompt__who-text">{{ leadText }}</span>
      </div>

      <!-- Error: link generation failed → no dead CTA, just a re-trigger hint. -->
      <p v-if="!hasUrl" class="auth-prompt__error">
        连接链接生成失败，请在「设置 · 账号连接」重新发起连接。
      </p>

      <template v-else>
        <!-- QR + URL side by side; the user scans on a phone OR opens/copies the
             link. Copy is flow-neutral — the link may create an app or authorize. -->
        <div class="auth-prompt__body">
          <div class="auth-prompt__qr">
            <img
              v-if="qrDataUrl"
              :src="qrDataUrl"
              alt="飞书连接二维码"
              class="auth-prompt__qr-img"
            />
            <div v-else class="auth-prompt__qr-skeleton" aria-hidden="true" />
            <span class="auth-prompt__qr-hint">扫码打开</span>
          </div>

          <div class="auth-prompt__link-col">
            <p class="auth-prompt__link-label">或在浏览器打开链接</p>
            <div class="auth-prompt__url-row">
              <code class="auth-prompt__url" :title="authUrl">{{ authUrl }}</code>
              <button
                type="button"
                class="auth-prompt__copy"
                :aria-label="copied ? '已复制' : '复制链接'"
                @click="handleCopy"
              >
                <component :is="copied ? Check : Copy" :size="14" />
                <span>{{ copied ? '已复制' : '复制' }}</span>
              </button>
            </div>
            <a :href="authUrl" target="_blank" rel="noopener noreferrer" class="auth-prompt__cta">
              <ExternalLink :size="15" />
              <span>打开链接</span>
            </a>
          </div>
        </div>

        <!-- Always-visible "we'll auto-continue" hint (the loading signal that does
             not block the link). -->
        <div class="auth-prompt__waiting">
          <Loader2 :size="13" class="auth-prompt__spin" aria-hidden="true" />
          <span>完成后会自动继续，无需返回操作。</span>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
/* Mirrors QuestionPrompt's C3 soft card so an auth pause reads as the same
   family as a question pause (just a different action). */
.auth-prompt {
  background: linear-gradient(
    180deg,
    var(--color-accent-ultra-soft, hsl(160, 60%, 95%)),
    var(--color-surface, #fff) 42%
  );
  border: 1px solid var(--color-accent-soft, hsl(160, 60%, 93%));
  border-radius: var(--radius-lg, 16px);
  padding: 18px;
  max-width: 480px;
  width: 100%;
}

.auth-prompt--answered {
  background: var(--color-accent-ultra-soft, hsl(160, 60%, 95%));
  border-color: var(--color-accent-soft, hsl(160, 60%, 93%));
}

.auth-prompt__who {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--color-text-secondary, #5f6577);
  font-size: 13px;
  line-height: 1.5;
}

.auth-prompt__avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--color-primary, hsl(160, 72%, 40%));
  color: #fff;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.auth-prompt__error {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-muted, #6b7280);
  line-height: 1.5;
}

/* QR + link layout */
.auth-prompt__body {
  display: flex;
  gap: 18px;
  align-items: flex-start;
}

@media (max-width: 520px) {
  .auth-prompt__body {
    flex-direction: column;
    align-items: stretch;
  }
}

.auth-prompt__qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.auth-prompt__qr-img,
.auth-prompt__qr-skeleton {
  width: 132px;
  height: 132px;
  border-radius: var(--radius-md, 12px);
  background: #fff;
  border: 1px solid var(--color-border, #e5e7eb);
}

.auth-prompt__qr-skeleton {
  background: linear-gradient(90deg, #f3f4f8 25%, #e9ebf1 37%, #f3f4f8 63%);
  background-size: 400% 100%;
  animation: auth-shimmer 1.4s ease infinite;
}

@keyframes auth-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: 0 0;
  }
}

.auth-prompt__qr-hint {
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}

.auth-prompt__link-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.auth-prompt__link-label {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}

.auth-prompt__url-row {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.auth-prompt__url {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  font-size: 12px;
  font-family: var(--font-mono, ui-monospace, 'SF Mono', Menlo, monospace);
  color: var(--color-text, #1a1d26);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e4ea);
  border-radius: var(--radius-sm, 8px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.auth-prompt__copy {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  font-family: inherit;
  font-size: 12px;
  color: var(--color-text-secondary, #5f6577);
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e4ea);
  border-radius: var(--radius-sm, 8px);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    border-color 0.12s,
    color 0.12s;
}

.auth-prompt__copy:hover {
  border-color: var(--color-primary, hsl(160, 72%, 40%));
  color: var(--color-primary, hsl(160, 72%, 40%));
}

.auth-prompt__cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 2px;
  padding: 9px 16px;
  background: var(--color-primary, hsl(160, 72%, 40%));
  color: #fff;
  border: none;
  border-radius: var(--radius-pill, 999px);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.12s;
  align-self: flex-start;
}

.auth-prompt__cta:hover {
  background: var(--color-primary-hover, hsl(160, 72%, 34%));
}

.auth-prompt__waiting {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  font-size: 12px;
  color: var(--color-text-muted, #6b7280);
}

.auth-prompt__spin {
  animation: auth-spin 1s linear infinite;
  flex-shrink: 0;
  color: var(--color-primary, hsl(160, 72%, 40%));
}

@keyframes auth-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Answered (resumed) recap */
.auth-prompt__done {
  display: flex;
  align-items: center;
  gap: 8px;
}

.auth-prompt__avatar--done {
  background: var(--color-primary, hsl(160, 72%, 40%));
}

.auth-prompt__done-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-primary, hsl(160, 72%, 40%));
}
</style>
