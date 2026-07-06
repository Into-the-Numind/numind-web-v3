import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const extensionRoot = [process.cwd(), resolve(process.cwd(), 'extension')].find((dir) =>
  existsSync(resolve(dir, 'manifest.json'))
)

const background = readFileSync(resolve(extensionRoot, 'background.js'), 'utf8')
const popup = readFileSync(resolve(extensionRoot, 'popup.js'), 'utf8')
const manifest = JSON.parse(readFileSync(resolve(extensionRoot, 'manifest.json'), 'utf8'))
const apiDomainPlaceholder = ['YOUSHU_API', 'DOMAIN', 'PLACEHOLDER'].join('_')
const webDomainPlaceholder = ['YOUSHU_WEB', 'DOMAIN', 'PLACEHOLDER'].join('_')

describe('extension production domains', () => {
  it('points background and popup URLs at youshulab.com', () => {
    const apiBase = background.match(/const YOUSHU_API_BASE = '([^']+)'/)[1]
    const endpointSuffix = background.match(
      /const YOUSHU_SCRIPT_NOTES_ENDPOINT = `\$\{YOUSHU_API_BASE\}([^`]+)`/
    )[1]

    expect(`${apiBase}${endpointSuffix}`).toBe(
      'https://youshulab.com/api/v1/xhs-script/notes'
    )
    expect(background).toContain("const YOUSHU_WEB_ORIGIN = 'https://youshulab.com'")
    expect(popup).toContain(
      "const YOUSHU_SCRIPT_WORKSPACE_URL = 'https://youshulab.com/script/'"
    )
    expect(`${background}\n${popup}`).not.toContain(apiDomainPlaceholder)
    expect(`${background}\n${popup}`).not.toContain(webDomainPlaceholder)
  })

  it('allows only the youshulab.com web origin in manifest integration points', () => {
    const webBridge = manifest.content_scripts.find((script) =>
      script.js.includes('connect-bridge.js')
    )

    expect(manifest.host_permissions).toContain('https://youshulab.com/*')
    expect(webBridge.matches).toEqual(['https://youshulab.com/*'])
    expect(manifest.externally_connectable.matches).toEqual(['https://youshulab.com/*'])
    expect(JSON.stringify(manifest)).not.toContain(apiDomainPlaceholder)
    expect(JSON.stringify(manifest)).not.toContain(webDomainPlaceholder)
  })
})
