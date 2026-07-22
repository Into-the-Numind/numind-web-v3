/**
 * 有数选题采集 — background service worker (MV3)
 *
 * 职责：
 *  1. chrome.storage 存 / 取有数 ext-token。
 *  2. 收到 content.js 的采集消息 → POST {有数API}/v1/xhs/notes（Header: Authorization: Bearer <ext-token>）。
 *  3. 401 三步：清 token + 通知 content.js 浮标切「未授权」+ 提示打开 popup 重新授权。
 *  4. onMessageExternal 接收有数授权页发来的 token，落 storage 前校验 sender.origin 为精确有数域名。
 *
 * 安全：token 只存本地；externally_connectable 已在 manifest 限定到精确有数 web 域名。
 */

const TOKEN_KEY = 'youshu_ext_token';
const COLLECTED_COUNT_KEY = 'youshu_collected_count';
const API_BASE_KEY = 'youshu_api_base';
const WEB_ORIGIN_KEY = 'youshu_web_origin';
const MAX_NOTES_PER_REQUEST = 50;
const DEFAULT_WEB_ORIGIN = 'http://49.233.219.254:9200';
const TRUSTED_WEB_ORIGINS = new Set([
  'https://youshu.asia',
  'http://49.233.219.254:9200',
  'http://localhost:5173',
  'http://localhost:9200',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:9200',
  'http://127.0.0.1:3000'
]);

function originFromUrl(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    return new URL(value).origin;
  } catch (_) {
    return '';
  }
}

function trustedOriginFromMessage(message, sender) {
  const explicit = originFromUrl((message && message.origin) || '');
  const senderOrigin = originFromUrl((sender && (sender.origin || sender.url)) || '');
  const origin = explicit || senderOrigin;
  return TRUSTED_WEB_ORIGINS.has(origin) ? origin : '';
}

function apiBaseForOrigin(origin) {
  const trusted = TRUSTED_WEB_ORIGINS.has(origin) ? origin : DEFAULT_WEB_ORIGIN;
  return `${trusted}/api`;
}

function getToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get([TOKEN_KEY], (res) => {
      resolve((res && res[TOKEN_KEY]) || '');
    });
  });
}

function setToken(token) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [TOKEN_KEY]: String(token || '') }, () => resolve());
  });
}

function setAuthContext(token, origin) {
  const webOrigin = TRUSTED_WEB_ORIGINS.has(origin) ? origin : DEFAULT_WEB_ORIGIN;
  return new Promise((resolve) => {
    chrome.storage.local.set(
      {
        [TOKEN_KEY]: String(token || ''),
        [WEB_ORIGIN_KEY]: webOrigin,
        [API_BASE_KEY]: apiBaseForOrigin(webOrigin)
      },
      () => resolve()
    );
  });
}

function getApiBase() {
  return new Promise((resolve) => {
    chrome.storage.local.get([API_BASE_KEY], (res) => {
      const value = res && typeof res[API_BASE_KEY] === 'string' ? res[API_BASE_KEY] : '';
      resolve(value || apiBaseForOrigin(DEFAULT_WEB_ORIGIN));
    });
  });
}

function clearToken() {
  return new Promise((resolve) => {
    chrome.storage.local.remove([TOKEN_KEY], () => resolve());
  });
}

function incrCollectedCount(n) {
  return new Promise((resolve) => {
    chrome.storage.local.get([COLLECTED_COUNT_KEY], (res) => {
      const cur = (res && Number(res[COLLECTED_COUNT_KEY])) || 0;
      const next = cur + (Number(n) || 0);
      chrome.storage.local.set({ [COLLECTED_COUNT_KEY]: next }, () => resolve(next));
    });
  });
}

/** 401 三步：清 token + 通知 content.js + 让 popup 显示需重新授权。 */
async function handleUnauthorized(tabId) {
  await clearToken();
  if (tabId != null) {
    try {
      chrome.tabs.sendMessage(tabId, { action: 'YOUSHU_UNAUTHORIZED' });
    } catch (_) {}
  }
  // popup 通过读取 storage 中 token 缺失自行展示「需授权」，此处仅广播一次（popup 可能未开）。
  try {
    chrome.runtime.sendMessage({ action: 'YOUSHU_UNAUTHORIZED' });
  } catch (_) {}
}

/** 上送笔记到有数后端。 */
async function uploadNotes(notes, tabId) {
  const [token, apiBase] = await Promise.all([getToken(), getApiBase()]);
  if (!token) {
    await handleUnauthorized(tabId);
    return { success: false, unauthorized: true, error: '尚未授权，请打开插件弹窗授权有数账号' };
  }

  const list = (Array.isArray(notes) ? notes : [notes]).slice(0, MAX_NOTES_PER_REQUEST);
  if (!list.length) return { success: false, error: '没有可上送的笔记' };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  try {
    const resp = await fetch(`${apiBase}/v1/xhs/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ notes: list }),
      signal: controller.signal
    });

    if (resp.status === 401) {
      await handleUnauthorized(tabId);
      return { success: false, unauthorized: true, error: '授权已失效，请重新授权' };
    }

    const text = await resp.text();
    let result = null;
    try {
      result = text ? JSON.parse(text) : {};
    } catch (_) {
      return { success: false, error: `解析响应失败: ${text.slice(0, 200)}` };
    }

    // 有数统一响应：{ code: 0, message, data }
    const code = result && result.code !== undefined ? Number(result.code) : NaN;
    const businessOk = resp.ok && (code === 0 || Number.isNaN(code));
    if (!businessOk) {
      return {
        success: false,
        error: (result && (result.message || result.msg)) || `请求失败 HTTP ${resp.status}`,
        data: result
      };
    }

    await incrCollectedCount(list.length);
    return { success: true, data: result };
  } catch (e) {
    return {
      success: false,
      error: e && e.name === 'AbortError' ? '请求超时，请稍后重试' : (e && e.message) || '上送失败'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// 内部消息（content.js / popup.js）
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'COLLECT_NOTE') {
    const tabId = sender && sender.tab ? sender.tab.id : null;
    const notes = message.payload ? [message.payload] : message.notes || [];
    uploadNotes(notes, tabId)
      .then((res) => sendResponse(res))
      .catch((err) =>
        sendResponse({ success: false, error: (err && err.message) || '上送异常' })
      );
    return true; // async
  }

  if (message.type === 'GET_STATUS') {
    Promise.all([
      getToken(),
      new Promise((r) =>
        chrome.storage.local.get([WEB_ORIGIN_KEY], (res) =>
          r((res && res[WEB_ORIGIN_KEY]) || DEFAULT_WEB_ORIGIN)
        )
      ),
      new Promise((r) =>
        chrome.storage.local.get([COLLECTED_COUNT_KEY], (res) =>
          r((res && Number(res[COLLECTED_COUNT_KEY])) || 0)
        )
      )
    ]).then(([token, webOrigin, count]) => {
      sendResponse({ authorized: !!token, collectedCount: count, webOrigin });
    });
    return true;
  }

  if (message.type === 'CLEAR_TOKEN') {
    clearToken().then(() => sendResponse({ success: true }));
    return true;
  }

  // 授权页桥接(connect-bridge.js content script)转发来的 token。
  if (message.type === 'YOUSHU_SET_TOKEN' && typeof message.token === 'string' && message.token.length > 0 && message.token.length <= 4096) {
    const origin = trustedOriginFromMessage(message, sender);
    if (!origin) {
      sendResponse({ success: false, error: 'origin not allowed' });
      return false;
    }
    setAuthContext(message.token, origin).then(() => sendResponse({ success: true }));
    return true;
  }

  return false;
});

// ---------------------------------------------------------------------------
// 外部消息（有数授权页 postMessage 过来 token）
// 必须校验 sender.origin === 精确有数域名，否则丢弃。
// ---------------------------------------------------------------------------
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const origin = trustedOriginFromMessage(message, sender);
  if (!origin) {
    console.warn('[有数采集] 拒绝来自非法 origin 的外部消息:', origin);
    sendResponse && sendResponse({ success: false, error: 'origin not allowed' });
    return false;
  }

  if (message && (message.type === 'YOUSHU_SET_TOKEN' || message.type === 'NUMIND_XHS_EXT_TOKEN') && typeof message.token === 'string' && message.token.length > 0 && message.token.length <= 4096) {
    setAuthContext(message.token, origin).then(() => {
      // 广播授权成功，已打开的小红书标签页浮标恢复可用
      try {
        chrome.tabs.query({ url: '*://*.xiaohongshu.com/*' }, (tabs) => {
          (tabs || []).forEach((t) => {
            if (t.id != null) {
              try {
                chrome.tabs.sendMessage(t.id, { action: 'YOUSHU_AUTHORIZED' });
              } catch (_) {}
            }
          });
        });
      } catch (_) {}
      sendResponse && sendResponse({ success: true });
    });
    return true;
  }

  if (message && message.type === 'YOUSHU_CLEAR_TOKEN') {
    clearToken().then(() => sendResponse && sendResponse({ success: true }));
    return true;
  }

  sendResponse && sendResponse({ success: false, error: 'unknown message' });
  return false;
});
