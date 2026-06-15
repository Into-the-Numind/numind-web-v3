/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_APP_ENV: string
  /** 通知中心 feature flag — 'true' 时显示铃铛入口（notification-center）。 */
  readonly VITE_ENABLE_NOTIFICATIONS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
