/**
 * 有数选题采集 — content script
 *
 * 职责：
 *  1. 小红书登录态检测（未登录 → 浮标禁用 + 提示）。
 *  2. 可拖动浮标「采集」按钮。
 *  3. 采集当前笔记详情 → 归一化为 NotePayload（调用 lib/parse.js）。
 *  4. 视频直链通过注入 main world 读取 window.__INITIAL_STATE__（移植 plugin3.2.1 手法）。
 *  5. 消息发 background.js 完成上送；接收 background 的「未授权」通知切换浮标态。
 *
 * 仅采集公开内容；不触碰飞书 / 卖家后端 / 抖音 / 识别码（原插件业务全部剔除）。
 */
(function () {
  'use strict';

  const Parse = window.YouShuXhsParse;
  if (!Parse) {
    console.error('[有数采集] lib/parse.js 未加载');
    return;
  }

  let floatingButton = null;
  let isDragging = false;
  let dragMoved = false;
  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;
  let unauthorized = false;
  const PAGE_STATE_REQUEST_EVENT = 'YOUSHU_XHS_READ_PAGE_STATE_REQUEST';
  const PAGE_STATE_RESPONSE_EVENT = 'YOUSHU_XHS_READ_PAGE_STATE_RESPONSE';

  // ---------------------------------------------------------------------------
  // 提示
  // ---------------------------------------------------------------------------
  function showToast(message, duration = 3000) {
    const existing = document.getElementById('youshu-extract-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'youshu-extract-toast';
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      backgroundColor: '#1f2937',
      color: '#fff',
      padding: '10px 18px',
      borderRadius: '8px',
      zIndex: '2147483647',
      fontSize: '14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      maxWidth: '70vw'
    });
    document.body.appendChild(toast);
    if (duration > 0) setTimeout(() => toast.remove(), duration);
    return toast;
  }

  // ---------------------------------------------------------------------------
  // 采集
  // ---------------------------------------------------------------------------
  function waitForElement(selector, timeout = 8000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);
        if (Date.now() - start >= timeout) return resolve(null);
        setTimeout(tick, 120);
      };
      tick();
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function readPageRuntimeState(noteId) {
    return new Promise((resolve) => {
      const requestId = `youshu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        document.removeEventListener(PAGE_STATE_RESPONSE_EVENT, onResponse);
        resolve(value || { state: null, videoUrl: '' });
      };
      const onResponse = (event) => {
        let message = null;
        try {
          message = JSON.parse(String(event.detail || '{}'));
        } catch (_) {
          message = null;
        }
        if (!message || message.requestId !== requestId) return;
        let state = null;
        try {
          state = message.stateJson ? JSON.parse(message.stateJson) : null;
        } catch (_) {
          state = null;
        }
        finish({ state, videoUrl: message.videoUrl || '' });
      };
      document.addEventListener(PAGE_STATE_RESPONSE_EVENT, onResponse);
      try {
        document.dispatchEvent(new CustomEvent(PAGE_STATE_REQUEST_EVENT, {
          detail: JSON.stringify({ requestId, noteId: noteId || '' })
        }));
      } catch (_) {
        finish({ state: null, videoUrl: '' });
        return;
      }
      setTimeout(() => finish({ state: null, videoUrl: '' }), 1200);
    });
  }

  function getResourceVideoUrl(noteId, collectStartMs, contextText) {
    if (!Parse.extractVideoUrlFromResourceEntries || typeof performance === 'undefined') return '';
    try {
      return Parse.extractVideoUrlFromResourceEntries(
        performance.getEntriesByType('resource'),
        noteId,
        {
          sinceStartTime: collectStartMs || 0,
          contextText: contextText || ''
        }
      );
    } catch (_) {
      return '';
    }
  }

  async function fetchVideoUrlFromNotePage(pageUrl, noteId) {
    if (!pageUrl || !/xiaohongshu\.com/i.test(pageUrl)) return '';
    const id = noteId || Parse.getNoteIdFromUrl(pageUrl);
    if (!id) return '';
    if (typeof fetch !== 'function') return '';
    try {
      const response = await fetch(pageUrl, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store'
      });
      if (!response || !response.ok) return '';
      const html = await response.text();
      const u = Parse.extractVideoUrlFromFetchedNoteHtml
        ? Parse.extractVideoUrlFromFetchedNoteHtml(html, pageUrl)
        : Parse.extractVideoUrlFromHtmlText(html, id);
      return Parse.isDirectStreamUrl(u) ? u : '';
    } catch (_) {
      return '';
    }
  }

  async function pollVideoUrlFromLoadedPage(noteId, container, collectStartMs, contextText) {
    for (let i = 0; i < 12; i++) {
      const domVideoUrl = Parse.extractVideoUrlFromDom ? Parse.extractVideoUrlFromDom(container) : '';
      if (domVideoUrl) return domVideoUrl;

      const resourceVideoUrl = getResourceVideoUrl(noteId, collectStartMs, contextText);
      if (resourceVideoUrl) return resourceVideoUrl;

      const runtime = await readPageRuntimeState(noteId);
      if (runtime.videoUrl) return runtime.videoUrl;
      if (runtime.state) {
        const stateVideoUrl = Parse.extractVideoUrlFromState(runtime.state, noteId);
        if (stateVideoUrl) return stateVideoUrl;
      }
      await sleep(380);
    }
    return '';
  }

  async function collectCurrentNote() {
    const collectStartMs = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
    const container =
      (await waitForElement('.note-detail-container', 6000)) ||
      document.querySelector('.note-detail-mask') ||
      document.querySelector('.note-container');
    if (!container) {
      return { success: false, error: '未找到笔记详情，请先点开一条笔记' };
    }

    const url = window.location.href; // 完整 URL（含 xsec_token），否则原帖打不开
    const noteId = Parse.getNoteIdFromUrl(url);

    // 先通过 MAIN world bridge 读运行时 __INITIAL_STATE__，这是旧 Numind/plugin3.2.1 最可靠的视频来源。
    const runtime = await readPageRuntimeState(noteId);

    // 再读页面已有 script/HTML 文本、DOM video、resource entries 兜底。
    const htmlText = document.documentElement ? document.documentElement.innerHTML : '';
    const state = runtime.state || Parse.extractInitialStateFromHtmlText(htmlText);
    const contextText = `${container.innerHTML || ''}\n${htmlText || ''}`;
    const stateVideoUrl = runtime.videoUrl || Parse.extractVideoUrlFromState(state, noteId);
    const htmlVideoUrl = Parse.extractVideoUrlFromHtmlText(htmlText, noteId);
    const domVideoUrl = Parse.extractVideoUrlFromDom ? Parse.extractVideoUrlFromDom(container) : '';
    const resourceVideoUrl = getResourceVideoUrl(noteId, collectStartMs, contextText);
    let videoUrl = stateVideoUrl || htmlVideoUrl || domVideoUrl || resourceVideoUrl;

    let payload = Parse.parseNoteDetail({
      container,
      state,
      url,
      videoUrl
    });

    if (payload.note_type === 'video' && !payload.video_url) {
      const fetchedVideoUrl = await fetchVideoUrlFromNotePage(url, noteId);
      const lateVideoUrl = fetchedVideoUrl || await pollVideoUrlFromLoadedPage(noteId, container, collectStartMs, contextText);
      if (lateVideoUrl) {
        videoUrl = lateVideoUrl;
        payload = Parse.parseNoteDetail({ container, state, url, videoUrl });
      }
    }

    if (!payload.xhs_note_id) {
      return { success: false, error: '无法识别笔记 ID（请在笔记详情页采集）' };
    }
    return { success: true, payload };
  }

  // ---------------------------------------------------------------------------
  // 浮标
  // ---------------------------------------------------------------------------
  function setButtonState(state) {
    if (!floatingButton) return;
    if (state === 'unauthorized') {
      unauthorized = true;
      floatingButton.textContent = '未授权';
      floatingButton.style.backgroundColor = '#9ca3af';
      floatingButton.title = '请打开插件弹窗重新授权有数账号';
    } else if (state === 'disabled') {
      floatingButton.textContent = '请先登录小红书';
      floatingButton.style.backgroundColor = '#9ca3af';
      floatingButton.disabled = true;
    } else {
      unauthorized = false;
      floatingButton.textContent = '采集';
      floatingButton.style.backgroundColor = '#161616';
      floatingButton.disabled = false;
      floatingButton.title = '采集当前笔记到有数选题库';
    }
  }

  function onDragStart(e) {
    isDragging = true;
    dragMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    const rect = floatingButton.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    floatingButton.style.cursor = 'grabbing';
    e.preventDefault();
  }
  function onDragMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
    floatingButton.style.left = `${initialLeft + dx}px`;
    floatingButton.style.top = `${initialTop + dy}px`;
    floatingButton.style.right = 'auto';
  }
  function onDragEnd() {
    isDragging = false;
    if (floatingButton) floatingButton.style.cursor = 'pointer';
  }

  function createFloatingButton() {
    if (floatingButton) return;
    floatingButton = document.createElement('button');
    floatingButton.id = 'youshu-floating-collect-btn';
    Object.assign(floatingButton.style, {
      position: 'fixed',
      zIndex: '2147483647',
      top: '360px',
      right: '24px',
      padding: '10px 16px',
      backgroundColor: '#161616',
      color: '#f7f7f4',
      border: '1px solid rgba(255,255,255,0.72)',
      borderRadius: '999px',
      cursor: 'pointer',
      boxShadow: '0 8px 22px rgba(0,0,0,0.28)',
      userSelect: 'none',
      fontSize: '14px',
      fontWeight: '600'
    });
    floatingButton.textContent = '采集';
    floatingButton.addEventListener('mousedown', onDragStart);
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    floatingButton.addEventListener('click', onCollectClick);
    document.body.appendChild(floatingButton);
  }

  // 滚动加载更多评论：小红书评论懒加载，需滚动评论容器 .note-scroller 到底（对齐 plugin3.2.1 手法）。
  // 安全上限 40 轮 / 连续 3 次无新增即停，避免无限滚 + 风控。
  async function loadMoreComments() {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const scroller = document.querySelector('.note-scroller');
    if (!scroller) {
      // 兜底：没找到评论容器就滚窗口几次
      for (let i = 0; i < 8; i++) {
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(600);
      }
      return;
    }
    let lastH = -1;
    let noChange = 0;
    for (let i = 0; i < 40; i++) {
      try { scroller.scrollBy({ top: 800, behavior: 'auto' }); } catch (_) { /* ignore */ }
      await sleep(500);
      const atBottom = scroller.scrollHeight - scroller.scrollTop <= scroller.clientHeight + 5;
      if (scroller.scrollHeight === lastH) { noChange++; } else { noChange = 0; lastH = scroller.scrollHeight; }
      if (atBottom || noChange >= 3) break;
    }
  }

  async function onCollectClick() {
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    // 插件被重载（开发者模式 ↻）后，旧 content script 上下文失效 → chrome.runtime.id 为空。
    if (!chrome.runtime || !chrome.runtime.id) {
      showToast('插件已更新，请刷新本页后再采集');
      return;
    }
    if (unauthorized) {
      showToast('请打开插件弹窗重新授权有数账号');
      return;
    }
    const toast = showToast('正在加载评论…', 0);
    try {
      await loadMoreComments();
      toast.textContent = '正在采集当前笔记…';
      const result = await collectCurrentNote();
      if (!result.success) {
        toast.remove();
        showToast(result.error || '采集失败');
        return;
      }
      toast.textContent = '采集完成，正在上送…';
      const resp = await sendToBackground(result.payload);
      toast.remove();
      if (resp && resp.success) {
        showToast('已上送到选题库');
      } else if (resp && resp.unauthorized) {
        setButtonState('unauthorized');
        showToast('授权已失效，请打开插件弹窗重新授权');
      } else {
        showToast('上送失败：' + ((resp && resp.error) || '未知错误'));
      }
    } catch (err) {
      toast.remove();
      showToast('采集出错：' + (err && err.message ? err.message : String(err)));
    }
  }

  function sendToBackground(payload) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve({ success: false, error: '后台无响应，请重试' });
      }, 30000);
      try {
        chrome.runtime.sendMessage({ type: 'COLLECT_NOTE', payload }, (response) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message || '后台不可用' });
            return;
          }
          resolve(response || { success: false, error: '未知错误' });
        });
      } catch (e) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ success: false, error: (e && e.message) || '后台不可用' });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // background → content 通知（401 时切「未授权」）
  // ---------------------------------------------------------------------------
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || !message.action) return false;
    if (message.action === 'YOUSHU_UNAUTHORIZED') {
      setButtonState('unauthorized');
      showToast('授权已失效，请打开插件弹窗重新授权');
      sendResponse && sendResponse({ ok: true });
      return true;
    }
    if (message.action === 'YOUSHU_AUTHORIZED') {
      setButtonState('enabled');
      sendResponse && sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  // ---------------------------------------------------------------------------
  // 初始化
  // ---------------------------------------------------------------------------
  async function init() {
    createFloatingButton();
    // 默认启用：小红书 CSP 会拦截注入的主世界脚本，登录预检不可靠（会把已登录用户误判为未登录）。
    // 故不再用登录态硬门控浮标；真采不到内容时在点击采集时给明确提示（见 collectCurrentNote）。
    setButtonState('enabled');
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    init();
  } else {
    window.addEventListener('load', init);
  }

  // SPA 路由变化时重新评估登录态
  let lastUrl = window.location.href;
  new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      if (floatingButton && !unauthorized) {
        setButtonState('enabled');
      }
    }
  }).observe(document, { subtree: true, childList: true });
})();
