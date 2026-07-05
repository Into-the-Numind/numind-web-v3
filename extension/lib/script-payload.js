/**
 * 有数口播稿视频采集 — payload gate
 *
 * 小红书口播稿仿写 MVP 只接收视频笔记：必须是 video 类型，且必须有可上送的视频直链。
 */
(function (root, factory) {
  const api = factory();
  if (typeof window !== 'undefined') {
    window.YouShuXhsScriptPayload = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.YouShuXhsScriptPayload = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const IMAGE_NOTE_ERROR = '当前只支持视频笔记';
  const MISSING_VIDEO_URL_ERROR = '未获取到视频地址，请刷新页面后重试';

  function validateForScriptUpload(payload) {
    if (!payload || payload.note_type !== 'video') {
      return { ok: false, error: IMAGE_NOTE_ERROR };
    }
    if (!payload.video_url || typeof payload.video_url !== 'string' || !payload.video_url.trim()) {
      return { ok: false, error: MISSING_VIDEO_URL_ERROR };
    }
    return { ok: true };
  }

  return {
    IMAGE_NOTE_ERROR,
    MISSING_VIDEO_URL_ERROR,
    validateForScriptUpload
  };
});
