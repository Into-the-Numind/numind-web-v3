// 有数授权页桥接 content script(xhs-script 授权流通道2)。
// 注入在有数 web 域;监听授权页 window.postMessage 下发的 token,转发给 background 落 storage。
// 用 content script(内部 onMessage)而非 externally_connectable,避免依赖 unpacked 插件的随机 runtime id。
(function () {
  var TOKEN_MESSAGE_TYPES = ['NUMIND_XHS_SCRIPT_EXT_TOKEN', 'NUMIND_XHS_EXT_TOKEN'];

  window.addEventListener('message', function (e) {
    if (e.source !== window) return;                 // 只信本页面
    if (e.origin !== window.location.origin) return; // 同源(有数授权页)才信
    var d = e.data;
    if (d && TOKEN_MESSAGE_TYPES.indexOf(d.type) !== -1 && typeof d.token === 'string' && d.token) {
      try {
        chrome.runtime.sendMessage({ type: 'YOUSHU_SET_TOKEN', token: d.token });
      } catch (err) { /* 插件上下文失效时静默 */ }
    }
  });
})();
