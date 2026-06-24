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
  // 登录态检测：读 __INITIAL_STATE__.user.userInfo / 页面登录态
  // ---------------------------------------------------------------------------
  /** 通过注入 main world 读取登录态（content script 隔离世界拿不到 SPA 内存）。 */
  function readLoginState() {
    return new Promise((resolve) => {
      const eventName = `youshu-login-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let done = false;
      const finish = (loggedIn) => {
        if (done) return;
        done = true;
        document.removeEventListener(eventName, onEvt);
        resolve(!!loggedIn);
      };
      const onEvt = (e) => finish(e && e.detail && e.detail.loggedIn);
      document.addEventListener(eventName, onEvt);
      const script = document.createElement('script');
      script.textContent = `(function(){
        var loggedIn = false;
        try {
          var st = window.__INITIAL_STATE__ || null;
          if (st && st.user) {
            var u = st.user;
            var info = u.userInfo || (u.loginUser) || null;
            // userInfo 通常是 promise/atom 包装，取常见字段
            var resolved = info && (info._value !== undefined ? info._value : info);
            if (resolved && (resolved.userId || resolved.user_id || resolved.guest === false)) loggedIn = true;
            if (u.isLogged === true || u.loggedIn === true) loggedIn = true;
          }
          // DOM 兜底：登录后右上角有用户头像/侧栏入口
          if (!loggedIn) {
            if (document.querySelector('.user.side-bar-component .channel') ||
                document.querySelector('.reds-avatar') ||
                document.cookie.indexOf('web_session=') > -1) {
              // web_session 存在通常代表已登录
              if (document.cookie.indexOf('web_session=') > -1) loggedIn = true;
            }
          }
        } catch (e) {}
        document.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}, { detail: { loggedIn: loggedIn } }));
      })();`;
      try {
        (document.head || document.documentElement).appendChild(script);
        script.remove();
      } catch (_) {
        finish(false);
        return;
      }
      setTimeout(() => finish(false), 800);
    });
  }

  // ---------------------------------------------------------------------------
  // 视频直链：注入 main world 读 __INITIAL_STATE__.note.noteDetailMap[noteId]
  // （移植 plugin3.2.1 readVideoUrlFromPageInitialState，但解析逻辑交给 parse.js）
  // ---------------------------------------------------------------------------
  function readInitialStateForNote(noteId) {
    return new Promise((resolve) => {
      const eventName = `youshu-state-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let done = false;
      const finish = (data) => {
        if (done) return;
        done = true;
        document.removeEventListener(eventName, onEvt);
        resolve(data || null);
      };
      const onEvt = (e) => {
        let parsed = null;
        try {
          parsed = e && e.detail && e.detail.json ? JSON.parse(e.detail.json) : null;
        } catch (_) {
          parsed = null;
        }
        finish(parsed);
      };
      document.addEventListener(eventName, onEvt);
      const script = document.createElement('script');
      // 只抽取与该 noteId 相关的最小 note 子树，避免 JSON.stringify 整个巨大的 state。
      script.textContent = `(function(){
        var noteId = ${JSON.stringify(noteId || '')};
        var slim = null;
        try {
          var st = window.__INITIAL_STATE__ || null;
          if (st && st.note) {
            var n = st.note;
            var note = null;
            if (noteId && n.noteDetailMap && n.noteDetailMap[noteId] && n.noteDetailMap[noteId].note) {
              note = n.noteDetailMap[noteId].note;
            } else if (n.noteDetailMap) {
              var keys = Object.keys(n.noteDetailMap);
              if (!noteId && keys.length === 1 && n.noteDetailMap[keys[0]]) note = n.noteDetailMap[keys[0]].note;
              else if (n.currentNoteId && n.note) note = n.note;
            } else if (n.note) {
              note = n.note;
            }
            if (note) {
              slim = { note: { noteDetailMap: {} }, _noteId: noteId || n.currentNoteId || '' };
              slim.note.currentNoteId = noteId || n.currentNoteId || '';
              slim.note.noteDetailMap[slim.note.currentNoteId] = { note: note };
            }
          }
        } catch (e) {}
        var json = '';
        try { json = slim ? JSON.stringify(slim) : ''; } catch (e2) { json = ''; }
        document.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}, { detail: { json: json } }));
      })();`;
      try {
        (document.head || document.documentElement).appendChild(script);
        script.remove();
      } catch (_) {
        finish(null);
        return;
      }
      setTimeout(() => finish(null), 1200);
    });
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

  async function collectCurrentNote() {
    const container =
      (await waitForElement('.note-detail-container', 6000)) ||
      document.querySelector('.note-detail-mask') ||
      document.querySelector('.note-container');
    if (!container) {
      return { success: false, error: '未找到笔记详情，请先点开一条笔记' };
    }

    const url = window.location.origin + window.location.pathname;
    const noteId = Parse.getNoteIdFromUrl(url);

    // 主世界读取 __INITIAL_STATE__ 的 note 子树（视频直链 + 结构化字段兜底）
    const state = await readInitialStateForNote(noteId);
    const videoUrl = Parse.extractVideoUrlFromState(state, noteId);

    const payload = Parse.parseNoteDetail({
      container,
      state,
      url,
      videoUrl
    });

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
      floatingButton.style.backgroundColor = '#ff2442';
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
    if (floatingButton) floatingButton.style.cursor = 'move';
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
      backgroundColor: '#ff2442',
      color: '#fff',
      border: 'none',
      borderRadius: '999px',
      cursor: 'move',
      boxShadow: '0 4px 14px rgba(255,36,66,0.35)',
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

  async function onCollectClick() {
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    if (unauthorized) {
      showToast('请打开插件弹窗重新授权有数账号');
      return;
    }
    const toast = showToast('正在采集当前笔记…', 0);
    try {
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
