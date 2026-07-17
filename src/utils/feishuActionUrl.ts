const FEISHU_OPEN_HOSTS = new Set(['open.feishu.cn', 'open.larksuite.com'])
const FEISHU_ACCOUNT_HOSTS = new Set(['accounts.feishu.cn', 'accounts.larksuite.com'])
const DEVICE_VERIFY_PATH = '/oauth/v1/device/verify'

function isSingleOpaqueParameter(url: URL, name: string): boolean {
  const values = url.searchParams.getAll(name)
  return values.length === 1 && values[0].length > 0 && !values[0].includes('\0')
}

/**
 * Treat external-action URLs as untrusted transport data. Legacy open-domain
 * links keep their existing compatibility policy, while account-domain device
 * links must exactly match the contract emitted by lark-cli v1.0.68.
 */
export function isOfficialFeishuActionURL(value: unknown, phase: string): value is string {
  if (typeof value !== 'string' || !value || value.trim() !== value) return false

  try {
    const parsed = new URL(value)
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      (parsed.port && parsed.port !== '443')
    ) {
      return false
    }

    if (FEISHU_OPEN_HOSTS.has(parsed.hostname)) return true
    if (!FEISHU_ACCOUNT_HOSTS.has(parsed.hostname) || phase !== 'user_auth') return false

    return (
      parsed.pathname === DEVICE_VERIFY_PATH &&
      [...parsed.searchParams.keys()].length === 2 &&
      isSingleOpaqueParameter(parsed, 'flow_id') &&
      isSingleOpaqueParameter(parsed, 'user_code')
    )
  } catch {
    return false
  }
}
