/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_APP_ENV: string
  /** 通知中心 feature flag — 'true' 时显示铃铛入口（notification-center）。 */
  readonly VITE_ENABLE_NOTIFICATIONS?: string
  /** 文档系统 feature flag — 'true' 时显示"打开编辑"入口（document-system）。prod 默认不设。 */
  readonly VITE_ENABLE_DOCUMENT_SYSTEM?: string
  /** 会议副驾 feature flag — 'true' 时显示入口与路由（meeting-copilot）。prod 默认 false/不设。 */
  readonly VITE_ENABLE_MEETING_COPILOT?: string
  /**
   * 说话人色标 feature flag — 'true' 时转写每段显示说话人标签 + 取色（meeting-speaker-diarization）。
   * OFF/不设时转写界面与现状逐字一致（无标签、无色块）。prod 默认 false/不设。
   */
  readonly VITE_ENABLE_MEETING_DIARIZATION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
