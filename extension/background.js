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

// 上线前替换为真实有数配置。
const YOUSHU_API_BASE = 'https://YOUSHU_API_DOMAIN_PLACEHOLDER';
const YOUSHU_NOTES_ENDPOINT = `${YOUSHU_API_BASE}/v1/xhs/notes`;
// onMessageExternal 仅信任此精确 origin（与 manifest.externally_connectable 对齐）。
const YOUSHU_WEB_ORIGIN = 'https://YOUSHU_WEB_DOMAIN_PLACEHOLDER';

const TOKEN_KEY = 'youshu_ext_token';
const COLLECTED_COUNT_KEY = 'youshu_collected_count';
const MAX_NOTES_PER_REQUEST = 50;

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
  const token = await getToken();
  if (!token) {
    await handleUnauthorized(tabId);
    return { success: false, unauthorized: true, error: '尚未授权，请打开插件弹窗授权有数账号' };
  }

  const list = (Array.isArray(notes) ? notes : [notes]).slice(0, MAX_NOTES_PER_REQUEST);
  if (!list.length) return { success: false, error: '没有可上送的笔记' };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  try {
    const resp = await fetch(YOUSHU_NOTES_ENDPOINT, {
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
        chrome.storage.local.get([COLLECTED_COUNT_KEY], (res) =>
          r((res && Number(res[COLLECTED_COUNT_KEY])) || 0)
        )
      )
    ]).then(([token, count]) => {
      sendResponse({ authorized: !!token, collectedCount: count });
    });
    return true;
  }

  if (message.type === 'CLEAR_TOKEN') {
    clearToken().then(() => sendResponse({ success: true }));
    return true;
  }

  return false;
});

// ---------------------------------------------------------------------------
// 外部消息（有数授权页 postMessage 过来 token）
// 必须校验 sender.origin === 精确有数域名，否则丢弃。
// ---------------------------------------------------------------------------
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const origin = sender && sender.origin ? sender.origin : '';
  if (origin !== YOUSHU_WEB_ORIGIN) {
    console.warn('[有数采集] 拒绝来自非法 origin 的外部消息:', origin);
    sendResponse && sendResponse({ success: false, error: 'origin not allowed' });
    return false;
  }

  if (message && message.type === 'YOUSHU_SET_TOKEN' && message.token) {
    setToken(message.token).then(() => {
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
