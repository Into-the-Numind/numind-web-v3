/**
 * 有数选题采集 — popup
 *
 * 展示授权状态 / 已采集数；提供「打开选题库」「解除授权」。
 * 授权 token 由有数 web 页通过 onMessageExternal 写入，popup 只读状态。
 */

// 上线前替换为真实有数选题库地址。
const YOUSHU_LIBRARY_URL = 'https://YOUSHU_WEB_DOMAIN_PLACEHOLDER/xhs';

const els = {
  authStatus: document.getElementById('auth-status'),
  collectedCount: document.getElementById('collected-count'),
  authHint: document.getElementById('auth-hint'),
  openLibrary: document.getElementById('open-library'),
  clearToken: document.getElementById('clear-token')
};

function renderStatus(status) {
  const authorized = !!(status && status.authorized);
  const count = (status && Number(status.collectedCount)) || 0;
  els.collectedCount.textContent = String(count);

  if (authorized) {
    els.authStatus.textContent = '已授权';
    els.authStatus.className = 'ys-badge ys-badge--ok';
    els.authHint.textContent = '已连接有数账号，可在小红书笔记页点击浮标采集。';
  } else {
    els.authStatus.textContent = '未授权';
    els.authStatus.className = 'ys-badge ys-badge--off';
    els.authHint.textContent =
      '请先在有数选题库网页登录并点击「连接采集插件」完成授权。';
  }
}

function loadStatus() {
  try {
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (resp) => {
      if (chrome.runtime.lastError) {
        renderStatus({ authorized: false, collectedCount: 0 });
        return;
      }
      renderStatus(resp || { authorized: false, collectedCount: 0 });
    });
  } catch (_) {
    renderStatus({ authorized: false, collectedCount: 0 });
  }
}

els.openLibrary.setAttribute('href', YOUSHU_LIBRARY_URL);

els.clearToken.addEventListener('click', () => {
  try {
    chrome.runtime.sendMessage({ type: 'CLEAR_TOKEN' }, () => loadStatus());
  } catch (_) {
    loadStatus();
  }
});

// background 广播未授权时刷新
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.action === 'YOUSHU_UNAUTHORIZED') {
    loadStatus();
  }
});

loadStatus();
