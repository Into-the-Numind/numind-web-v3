/**
 * 有数选题采集 — 纯函数解析模块
 *
 * 设计目标：
 *  - 不依赖 chrome.* / 网络 / 全局可变状态，便于 vitest 单测。
 *  - 输入是「DOM 容器元素 + 页面 __INITIAL_STATE__ 对象」，输出归一化的 NotePayload。
 *  - 解析手法移植自 plugin3.2.1：
 *      列表卡片 section.note-item / a.cover.mask.ld / .like-wrapper .count
 *      详情 .note-detail-container / .note-content .note-text span / .comment-item
 *      视频直链 __INITIAL_STATE__.note.noteDetailMap[noteId].note.video/media/video_info_v2
 *      下的 stream codec master_url
 *  - 学手法不照搬业务（飞书 / 卖家后端 / 抖音 / 识别码全部移除）。
 *
 * 同时挂在 globalThis（content.js 以普通脚本引用 window.YouShuXhsParse）和
 * module.exports / export（vitest 直接 import）。
 */
(function (root, factory) {
  const api = factory();
  // 浏览器内容脚本环境
  if (typeof window !== 'undefined') {
    window.YouShuXhsParse = api;
  }
  // CommonJS（vitest 默认）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  // 暴露到 globalThis 兜底
  if (typeof globalThis !== 'undefined') {
    globalThis.YouShuXhsParse = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 基础工具
  // ---------------------------------------------------------------------------

  /** 把小红书的中文互动数（"1.2万" / "3,456" / "赞"）解析为整数。取不到返回 0。 */
  function parseCount(raw) {
    if (raw == null) return 0;
    if (typeof raw === 'number') return Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
    let s = String(raw).trim();
    if (!s) return 0;
    s = s.replace(/,/g, '').replace(/\s+/g, '');
    // 纯非数字文案（如 "赞" / "收藏"）当 0
    const m = s.match(/^([\d.]+)\s*(万|w|W|亿|k|K)?/);
    if (!m) return 0;
    let n = parseFloat(m[1]);
    if (!Number.isFinite(n)) return 0;
    const unit = m[2];
    if (unit === '万' || unit === 'w' || unit === 'W') n *= 10000;
    else if (unit === '亿') n *= 100000000;
    else if (unit === 'k' || unit === 'K') n *= 1000;
    return Math.max(0, Math.round(n));
  }

  /** 从笔记 URL 中提取 noteId（explore / discovery/item）。取不到返回 ''。 */
  function getNoteIdFromUrl(href) {
    if (!href || typeof href !== 'string') return '';
    const m =
      href.match(/\/explore\/([0-9a-fA-F]+)/) ||
      href.match(/\/discovery\/item\/([0-9a-fA-F]+)/) ||
      href.match(/\/search_result\/([0-9a-fA-F]+)/);
    return m ? m[1] : '';
  }

  /** 仅接受 http(s) 直链，过滤 blob: / data:（移植 isDirectXhsStreamUrl）。 */
  function isDirectStreamUrl(u) {
    if (!u || typeof u !== 'string') return false;
    if (/^blob:/i.test(u) || /^data:/i.test(u)) return false;
    return /^https?:\/\//i.test(u);
  }

  function decodeJsonUrlEscapes(s) {
    if (!s || typeof s !== 'string') return s || '';
    return s.replace(/\\u002F/gi, '/').replace(/\\\//g, '/').replace(/\\"/g, '"');
  }

  function normalizeHttpUrl(u) {
    if (!u || typeof u !== 'string') return '';
    const s = u.trim();
    if (!s) return '';
    if (/^\/\//.test(s)) return `https:${s}`;
    return s;
  }

  // ---------------------------------------------------------------------------
  // __INITIAL_STATE__ 解析（视频直链 + 结构化字段）
  // ---------------------------------------------------------------------------

  function pickFirstDirectUrl(value, seen, acceptUrl) {
    if (!value) return '';
    const visited = seen || new Set();
    if (typeof value === 'string') {
      const u = normalizeHttpUrl(decodeJsonUrlEscapes(value));
      return isDirectStreamUrl(u) && (!acceptUrl || acceptUrl(u)) ? u : '';
    }
    if (typeof value !== 'object') return '';
    if (visited.has(value)) return '';
    visited.add(value);

    const preferredKeys = [
      'master_url',
      'masterUrl',
      'backup_url',
      'backupUrl',
      'backup_urls',
      'backupUrls',
      'url',
      'src',
      'originUrl',
      'origin_url',
      'playUrl',
      'play_url',
      'default_screencast_stream',
      'defaultScreencastStream',
      'hd_screencast_stream',
      'hdScreencastStream',
      'hd_screencast_stream_basic',
      'hdScreencastStreamBasic'
    ];
    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const u = pickFirstDirectUrl(value[key], visited, acceptUrl);
        if (u) return u;
      }
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const u = pickFirstDirectUrl(item, visited, acceptUrl);
        if (u) return u;
      }
      return '';
    }
    return '';
  }

  function pickVideoUrlFromStream(stream) {
    if (!stream) return '';
    const tryStreamGroup = (arr) => {
      if (!Array.isArray(arr) || !arr.length) return '';
      for (const item of arr) {
        const u = pickFirstDirectUrl(item, undefined, isLikelyVideoResourceUrl);
        if (u) return u;
      }
      return '';
    };
    const knownGroupKeys = ['h264', 'h265', 'h266', 'av1'];
    for (const key of knownGroupKeys) {
      const u = tryStreamGroup(stream[key]);
      if (u) return u;
    }
    // Xiaohongshu may use opaque stream group keys (for example EF4 / EF5)
    // instead of a codec name. Each group still contains the usual MP4 URLs.
    for (const key of Object.keys(stream)) {
      if (knownGroupKeys.includes(key)) continue;
      const u = tryStreamGroup(stream[key]);
      if (u) return u;
    }
    return pickFirstDirectUrl(stream, undefined, isLikelyVideoResourceUrl);
  }

  function pickVideoUrlFromContainer(container) {
    if (!container || typeof container !== 'object') return '';
    const media = container.media || container;
    const mediaVideo = media && media.video;
    return (
      pickVideoUrlFromStream(media && media.stream) ||
      pickVideoUrlFromStream(container.stream) ||
      pickFirstDirectUrl(mediaVideo && mediaVideo.opaque1, undefined, isLikelyVideoResourceUrl) ||
      pickFirstDirectUrl(container.opaque1, undefined, isLikelyVideoResourceUrl) ||
      pickFirstDirectUrl(container, undefined, isLikelyVideoResourceUrl)
    );
  }

  /**
   * 从一条 note 对象里取视频直链。
   * 候选池只增不删：旧版 note.video.media.stream 继续保留；
   * 新版 video_info_v2/videoInfoV2 作为额外容器加入，降低平台字段漂移造成的单点失效。
   */
  function pickVideoUrlFromNote(note) {
    if (!note || typeof note !== 'object') return '';
    const containers = [
      note.video,
      note.video_info_v2,
      note.videoInfoV2,
      note.video_info,
      note.videoInfo,
      note.video_data,
      note.videoData
    ];
    for (const container of containers) {
      const u = pickVideoUrlFromContainer(container);
      if (u) return u;
    }
    return '';
  }

  function noteFromStateWrapper(wrapper) {
    if (!wrapper || typeof wrapper !== 'object') return null;
    return wrapper.note || wrapper.noteData || wrapper.note_data || wrapper.data || wrapper;
  }

  /**
   * 在 __INITIAL_STATE__ 对象里按 noteId 定位 note 节点，多 fallback：
   *  1. note.noteDetailMap[noteId].note
   *  2. note.currentNoteId === noteId 时的 note.note
   *  3. noteData.data.noteData
   */
  function findNoteInState(state, noteId) {
    if (!state || typeof state !== 'object') return null;
    const noteRoot = state.note;
    if (noteRoot) {
      const detailMap = noteRoot.noteDetailMap || noteRoot.note_detail_map;
      if (noteId && detailMap && detailMap[noteId]) {
        const note = noteFromStateWrapper(detailMap[noteId]);
        if (note) return note;
      }
      if (noteId && detailMap) {
        const keys = Object.keys(detailMap);
        for (const key of keys) {
          const note = noteFromStateWrapper(detailMap[key]);
          if (note && (note.noteId === noteId || note.id === noteId || note.note_id === noteId)) return note;
        }
      }
      if (noteRoot.currentNoteId && noteRoot.note) {
        if (!noteId || noteRoot.currentNoteId === noteId) return noteRoot.note;
      }
      // noteDetailMap 只有一条时直接取
      if (detailMap) {
        const keys = Object.keys(detailMap);
        if (!noteId && keys.length === 1 && detailMap[keys[0]]) {
          return noteFromStateWrapper(detailMap[keys[0]]);
        }
        if (noteId && detailMap[noteId]) {
          return noteFromStateWrapper(detailMap[noteId]);
        }
      }
    }
    if (state.noteData && state.noteData.data && state.noteData.data.noteData) {
      const nd = state.noteData.data.noteData;
      if (!noteId || nd.noteId === noteId || nd.id === noteId) return nd;
    }
    return null;
  }

  /** 从 state 的 note 对象取视频直链（content.js 主世界读取后传入）。 */
  function extractVideoUrlFromState(state, noteId) {
    const note = findNoteInState(state, noteId);
    if (!note) return '';
    const u = pickVideoUrlFromNote(note);
    return isDirectStreamUrl(u) ? u : '';
  }

  /** 从 state 的 note 对象取结构化字段（互动数 / 标签 / 作者粉丝 / 发布时间），DOM 解析的补充与兜底。 */
  function extractFieldsFromState(state, noteId) {
    const note = findNoteInState(state, noteId);
    const out = {};
    if (!note || typeof note !== 'object') return out;

    const title = firstNonEmpty(
      note.title,
      note.displayTitle,
      note.display_title,
      note.shareTitle,
      note.share_title,
      note.cardTitle,
      note.card_title,
      note.name,
      note.titleText,
      note.title_text
    );
    if (title) out.title = title;
    if (note.desc) out.content = String(note.desc).trim();
    if (note.type) out.note_type = note.type === 'video' ? 'video' : 'normal';

    const ic = note.interactInfo || {};
    if (ic.likedCount != null) out.like_count = parseCount(ic.likedCount);
    if (ic.collectedCount != null) out.collect_count = parseCount(ic.collectedCount);
    if (ic.commentCount != null) out.comment_count = parseCount(ic.commentCount);
    if (ic.shareCount != null) out.share_count = parseCount(ic.shareCount);

    if (Array.isArray(note.tagList) && note.tagList.length) {
      out.tags = note.tagList.map((t) => (t && (t.name || t.text)) || '').filter(Boolean);
    }

    const user = note.user || {};
    if (user.nickname) out.author_name = String(user.nickname).trim();
    if (user.userId) out.author_link = `https://www.xiaohongshu.com/user/profile/${user.userId}`;
    // 作者粉丝在详情 state 里通常没有 → 留给 DOM / 置 0
    if (user.fans != null) out.author_followers = parseCount(user.fans);

    if (note.time != null) {
      out.published_at = formatPublishedAt(note.time);
    }

    const cover =
      (note.cover && (note.cover.urlPre || note.cover.urlDefault || note.cover.url)) || '';
    if (cover) out.cover_url = normalizeHttpUrl(decodeJsonUrlEscapes(cover));

    return out;
  }

  /** 时间戳（ms 或 s）转成可读字符串；非数字原样返回。 */
  function formatPublishedAt(t) {
    if (t == null) return '';
    if (typeof t === 'string' && !/^\d+$/.test(t.trim())) return t.trim();
    let ms = Number(t);
    if (!Number.isFinite(ms)) return String(t);
    if (ms < 1e12) ms *= 1000; // 秒 → 毫秒
    const d = new Date(ms);
    if (isNaN(d.getTime())) return String(t);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** 解析 DOM 上的 ".date" 文案（"昨天"/"3天前"/"06-01"/"2026-06-01"）为 YYYY-MM-DD。 */
  function parseDateText(text, now) {
    if (!text || typeof text !== 'string') return '';
    const ref = now instanceof Date ? now : new Date();
    const currentYear = ref.getFullYear();
    const pad = (n) => String(n).padStart(2, '0');
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    // 捕获文本里的 HH:MM(如"昨天 19:49"),有则拼到日期后(上海时间,后端按 +08:00 解析)。
    const tm = text.match(/(\d{1,2}):(\d{2})/);
    const ts = tm ? ` ${pad(parseInt(tm[1], 10))}:${tm[2]}:00` : '';

    const full = text.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (full) return `${full[1]}-${full[2]}-${full[3]}${ts}`;

    // 刚发布的笔记常显示相对时间(刚刚 / X分钟前 / X小时前 / 今天)→ 归为今天。
    if (text.includes('今天') || text.includes('刚刚') || /\d+\s*分钟前/.test(text) || /\d+\s*小时前/.test(text)) {
      return iso(ref) + ts;
    }
    if (text.includes('昨天')) {
      const d = new Date(ref);
      d.setDate(ref.getDate() - 1);
      return iso(d) + ts;
    }
    const daysAgo = text.match(/(\d+)\s*天前/);
    if (daysAgo) {
      const d = new Date(ref);
      d.setDate(ref.getDate() - parseInt(daysAgo[1], 10));
      return iso(d) + ts;
    }
    const md = text.match(/(\d{1,2})-(\d{1,2})/);
    if (md) {
      const month = parseInt(md[1], 10);
      const year = month > ref.getMonth() + 1 ? currentYear - 1 : currentYear;
      return `${year}-${pad(month)}-${pad(parseInt(md[2], 10))}${ts}`;
    }
    return '';
  }

  // ---------------------------------------------------------------------------
  // DOM 解析
  // ---------------------------------------------------------------------------

  function txt(el) {
    return el && el.textContent ? el.textContent.trim() : '';
  }

  function attr(el, name) {
    if (!el || !el.getAttribute) return '';
    const v = el.getAttribute(name);
    return v ? String(v).trim() : '';
  }

  function firstNonEmpty() {
    for (const value of arguments) {
      const text = String(value || '').trim();
      if (text) return text;
    }
    return '';
  }

  /** 解析懒加载图片真实 URL（data-src / srcset / src），跳过 data:/blob:。 */
  function resolveImgUrl(img) {
    if (!img || img.nodeName !== 'IMG') return '';
    const candidates = [
      attr(img, 'data-src'),
      attr(img, 'data-original'),
      attr(img, 'data-url'),
      attr(img, 'data-lazy-src'),
      attr(img, 'data-vision-url')
    ];
    const ss = attr(img, 'srcset');
    if (ss) {
      const parts = ss
        .split(',')
        .map((s) => s.trim().split(/\s+/)[0])
        .filter(Boolean);
      if (parts.length) candidates.push(parts[parts.length - 1]);
    }
    candidates.push(img.currentSrc || img.src || '');
    for (const c of candidates) {
      if (!c || typeof c !== 'string') continue;
      const t = c.trim();
      if (!t || /^data:image/i.test(t) || /^blob:/i.test(t)) continue;
      return normalizeHttpUrl(t);
    }
    return '';
  }

  /** 是否视频笔记容器（有 <video> 或视频播放器结构）。 */
  function isVideoNote(container) {
    if (!container || !container.querySelector) return false;
    return !!(
      container.querySelector('video') ||
      container.querySelector('.xgplayer') ||
      container.querySelector('.video-player') ||
      container.querySelector('.note-detail-mask .player-container')
    );
  }

  /** 从当前详情 DOM 中兜底读取真实视频地址。优先 currentSrc/src，过滤 blob/data。 */
  function extractVideoUrlFromDom(container) {
    if (!container) return '';
    const candidates = [];
    const visit = (node) => {
      if (!node) return;
      if (node.nodeType === 1) {
        const tag = node.tagName ? node.tagName.toLowerCase() : '';
        if (tag === 'video') {
          candidates.push(node.currentSrc || '');
          candidates.push(node.src || '');
          candidates.push(attr(node, 'src'));
          candidates.push(attr(node, 'data-src'));
          candidates.push(attr(node, 'data-url'));
          candidates.push(attr(node, 'data-video-url'));
        } else if (tag === 'source') {
          candidates.push(node.currentSrc || '');
          candidates.push(node.src || '');
          candidates.push(attr(node, 'src'));
          candidates.push(attr(node, 'data-src'));
        }
        if (node.shadowRoot) visit(node.shadowRoot);
      }
      const children = node.children || [];
      for (let i = 0; i < children.length; i++) visit(children[i]);
    };
    visit(container);
    for (const candidate of candidates) {
      const u = normalizeHttpUrl(decodeJsonUrlEscapes(candidate));
      if (isDirectStreamUrl(u)) return u;
    }
    return '';
  }

  /**
   * 从详情容器解析评论。移植 .comment-item，作者/正文/点赞分开取，最多 maxComments 条。
   */
  /** 解析单条 .comment-item 的作者/正文/点赞（取其自身首个匹配，不含嵌套回复）。 */
  function parseOneComment(item) {
    const text =
      txt(item.querySelector('.content .note-text')) ||
      txt(item.querySelector('.content')) ||
      txt(item.querySelector('.note-text'));
    const author =
      txt(item.querySelector('.author .name')) ||
      txt(item.querySelector('.name')) ||
      txt(item.querySelector('.user-name'));
    const likes = parseCount(
      txt(item.querySelector('.like .count')) ||
        txt(item.querySelector('.like-wrapper .count')) ||
        txt(item.querySelector('.count'))
    );
    const normalizedAuthor = author || '';
    const normalizedText = text || '';
    return {
      author: normalizedAuthor,
      text: normalizedText,
      likes,
      nickname: normalizedAuthor,
      content: normalizedText,
      like: likes
    };
  }

  function parseComments(container, maxComments) {
    const limit = typeof maxComments === 'number' ? maxComments : 100;
    const maxReplies = 30;
    const out = [];
    if (!container || !container.querySelectorAll) return out;

    // 小红书结构：每个回复线程是一个 .parent-comment 容器，内第 1 个 .comment-item 是顶层评论，
    // 其余 .comment-item 是该评论默认展开的回复。
    const threads = container.querySelectorAll('.parent-comment');
    if (threads.length) {
      for (const thread of threads) {
        if (out.length >= limit) break;
        const items = thread.querySelectorAll('.comment-item');
        if (!items.length) continue;
        const c = parseOneComment(items[0]);
        if (!c.text) continue;
        const replies = [];
        for (let k = 1; k < items.length; k++) {
          if (replies.length >= maxReplies) break;
          const rc = parseOneComment(items[k]);
          if (rc.text) replies.push(rc);
        }
        c.replies = replies;
        out.push(c);
      }
      return out;
    }

    // 兜底：无 .parent-comment（老结构）时平铺 .comment-item，不再尝试嵌套。
    const all = container.querySelectorAll('.comment-item');
    for (const item of all) {
      if (out.length >= limit) break;
      const c = parseOneComment(item);
      if (!c.text) continue;
      c.replies = [];
      out.push(c);
    }
    return out;
  }

  /**
   * 主入口：从详情容器 + __INITIAL_STATE__ 解析出一条 NotePayload。
   *
   * @param {Object} opts
   * @param {Element} opts.container 详情容器（.note-detail-container / .note-detail-mask）
   * @param {Object}  [opts.state]  window.__INITIAL_STATE__ 对象（主世界读取后传入）
   * @param {string}  [opts.url]    当前笔记 URL
   * @param {string}  [opts.videoUrl] content.js 主世界已解析出的视频直链（最可靠来源）
   * @param {Date}    [opts.now]    用于相对日期解析（测试可注入）
   * @returns {Object} NotePayload
   */
  /** 从一段 script/HTML 文本里正则抓视频直链 master_url（h264/h265 附近），CSP 安全（读文本不注入）。 */
  function extractVideoStreamUrlFromText(text) {
    if (!text) return '';
    if (text.indexOf('master_url') < 0 && text.indexOf('masterUrl') < 0) return '';
    const pickMaster = (seg) => {
      const m =
        seg.match(/"master_url"\s*:\s*"([^"]+)"/) ||
        seg.match(/"masterUrl"\s*:\s*"([^"]+)"/);
      return m ? decodeJsonUrlEscapes(m[1]) : '';
    };
    const i264 = text.indexOf('"h264"');
    const i265 = text.indexOf('"h265"');
    if (i264 >= 0) {
      const end = i265 > i264 ? i265 : text.length;
      const u = pickMaster(text.slice(i264, end));
      if (u) return u;
    }
    if (i265 >= 0) {
      const u = pickMaster(text.slice(i265));
      if (u) return u;
    }
    return pickMaster(text);
  }

  function escapeRegExp(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function pickPreferredVideoUrl(urls) {
    if (!urls || !urls.length) return '';
    const usable = urls.map((u) => normalizeHttpUrl(decodeJsonUrlEscapes(u))).filter(isDirectStreamUrl);
    if (!usable.length) return '';
    const mp4s = usable.filter((u) => /\.mp4(?:[?#]|$)/i.test(u));
    const pool = mp4s.length ? mp4s : usable;
    const h264 = pool.find((u) => /\/110\/259\/|_259\.mp4/i.test(u));
    return h264 || pool[pool.length - 1];
  }

  function extractVideoUrlsFromText(text) {
    if (!text || typeof text !== 'string') return [];
    const urls = [];
    const scan = (regex) => {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const u = normalizeHttpUrl(decodeJsonUrlEscapes(match[1]));
        if (isDirectStreamUrl(u)) urls.push(u);
      }
    };
    scan(/"master_url"\s*:\s*"([^"]+)"/g);
    scan(/"masterUrl"\s*:\s*"([^"]+)"/g);
    scan(/"url"\s*:\s*"([^"]+\.mp4[^"]*)"/g);
    return urls;
  }

  function extractNoteEmbeddedHtmlSegments(html, noteId, displayTitle) {
    const segments = [];
    const id = (noteId || '').trim();
    if (!html || typeof html !== 'string' || !id) return segments;
    const idRegex = new RegExp(
      `(?:\\\\?"id\\\\?"|"id"|"noteId"|"note_id")\\s*:\\s*(?:\\\\?"${escapeRegExp(id)}\\\\?"|"${escapeRegExp(id)}")`,
      'g'
    );
    const hits = Array.from(html.matchAll(idRegex));
    for (const hit of hits) {
      const start = hit.index || 0;
      const rest = html.slice(start + 1);
      const next = rest.match(/(?:\\?"id\\?"|"id"|"noteId"|"note_id")\s*:/);
      const end = next ? start + 1 + (next.index || 0) : Math.min(html.length, start + 120000);
      const segment = html.slice(start, end);
      const title = (displayTitle || '').trim();
      const titleHit =
        !title ||
        segment.includes(`"displayTitle":"${title}"`) ||
        segment.includes(`"title":"${title}"`) ||
        segment.includes(`"displayTitle":"${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`) ||
        segment.includes(`"title":"${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
      const hasVideoHint =
        segment.includes('"h264"') ||
        segment.includes('"h265"') ||
        segment.includes('"av1"') ||
        segment.includes('"h266"') ||
        segment.includes('master_url') ||
        segment.includes('masterUrl') ||
        /"type"\s*:\s*"video"/.test(segment);
      if (titleHit || hasVideoHint) segments.push(segment);
    }
    return segments;
  }

  function extractVideoUrlFromNoteDetailMapInHtml(html, noteId) {
    if (!html || !noteId) return '';
    const marker = `"${noteId}"`;
    let pos = 0;
    while (pos < html.length) {
      const idx = html.indexOf(marker, pos);
      if (idx < 0) break;
      if (!/^\s*:/.test(html.slice(idx + marker.length, idx + marker.length + 12))) {
        pos = idx + marker.length;
        continue;
      }
      const before = html.slice(Math.max(0, idx - 320), idx);
      if (!/noteDetailMap|noteDetail|currentNoteId|"note"\s*:/.test(before)) {
        pos = idx + marker.length;
        continue;
      }
      const after = html.slice(idx + marker.length);
      const nextKey = after.match(/,\s*"[^"]{4,}"\s*:/);
      const end = nextKey
        ? idx + marker.length + (nextKey.index || 0)
        : Math.min(html.length, idx + 90000);
      const segment = html.slice(idx, end);
      const u = pickPreferredVideoUrl(extractVideoUrlsFromText(segment));
      if (u) return u;
      pos = idx + marker.length;
    }
    return '';
  }

  function extractVideoUrlFromInitialStateScriptTag(html, noteId) {
    if (!html || !noteId) return '';
    const re = /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/gi;
    let match;
    while ((match = re.exec(html)) !== null) {
      const u = extractVideoUrlFromNoteDetailMapInHtml(match[1], noteId);
      if (u) return u;
    }
    return '';
  }

  /**
   * 从页面 HTML 文本扫视频直链（移植 plugin3.2.1：读 SSR __INITIAL_STATE__ 文本，CSP 安全）。
   * 优先按 noteId 锚点切片避免命中 feed 里其它笔记，兜底取整页第一条 h264。只返回 https mp4。
   */
  function extractVideoUrlFromHtmlText(html, noteId) {
    if (!html || typeof html !== 'string') return '';
    const id = (noteId || '').trim();
    if (id) {
      const segments = extractNoteEmbeddedHtmlSegments(html, id, '');
      for (const segment of segments) {
        const u = pickPreferredVideoUrl(extractVideoUrlsFromText(segment));
        if (u) return u;
      }
      const fromDetailMap = extractVideoUrlFromNoteDetailMapInHtml(html, id);
      if (fromDetailMap) return fromDetailMap;
      const fromStateTag = extractVideoUrlFromInitialStateScriptTag(html, id);
      if (fromStateTag) return fromStateTag;

      const anchors = [
        'video_feed/' + id,
        '/explore/' + id,
        '/discovery/item/' + id
      ];
      for (const anchor of anchors) {
        let pos = 0;
        while (pos < html.length) {
          const idx = html.indexOf(anchor, pos);
          if (idx < 0) break;
          const segment = html.slice(idx, idx + 25000);
          const preload = segment.match(/h5VideoPreloadInfo=([^&"'<>\s]+)/);
          if (preload) {
            try {
              const decoded = decodeURIComponent(preload[1].replace(/\+/g, '%20'));
              const preloadUrl = pickPreferredVideoUrl(extractVideoUrlsFromText(decoded));
              if (preloadUrl) return preloadUrl;
            } catch (_) {}
          }
          const u = pickPreferredVideoUrl(extractVideoUrlsFromText(segment)) || extractVideoStreamUrlFromText(segment);
          if (u && /^https?:\/\//i.test(u)) return u;
          pos = idx + anchor.length;
        }
      }
      return ''; // 有 noteId 但其片段内无视频 → 图文笔记，绝不回落整页(否则抓到别的笔记的视频)
    }
    const u = pickPreferredVideoUrl(extractVideoUrlsFromText(html)) || extractVideoStreamUrlFromText(html);
    return u && /^https?:\/\//i.test(u) ? u : '';
  }

  function isLikelyVideoResourceUrl(u) {
    if (!isDirectStreamUrl(u)) return false;
    if (/\.(?:jpg|jpeg|png|webp|gif|avif|svg)(?:[?#].*)?$/i.test(u)) return false;
    return /(?:sns-video|xhscdn\.com.*(?:video|stream)|\/stream\/|\.mp4(?:[?#]|$)|\.m3u8(?:[?#]|$))/i.test(u);
  }

  /**
   * 从 PerformanceResourceTiming 列表里取最近加载的视频资源。
   * 小红书有时只把真实视频地址交给播放器，HTML/state 里只剩 blob:，
   * 读取 performance entries 不拦截请求，也不修改页面行为。
   */
  function extractVideoUrlFromResourceEntries(entries, noteId, opts) {
    if (!entries || typeof entries.length !== 'number') return '';
    const id = (noteId || '').trim();
    const options = opts || {};
    const sinceStartTime = Number(options.sinceStartTime || 0);
    const contextText = String(options.contextText || '');
    const urls = [];
    for (const entry of Array.from(entries)) {
      const raw = typeof entry === 'string' ? entry : (entry && entry.name) || '';
      const startTime = typeof entry === 'object' && entry ? Number(entry.startTime || 0) : 0;
      if (sinceStartTime > 0 && startTime > 0 && startTime < sinceStartTime) continue;
      const u = normalizeHttpUrl(decodeJsonUrlEscapes(raw));
      if (isLikelyVideoResourceUrl(u)) urls.push(u);
    }
    if (!urls.length) return '';
    if (contextText) {
      const narrowed = urls.filter((u) => {
        const base = String(u).split('?')[0];
        if (contextText.includes(base)) return true;
        const hexMatches = base.match(/[a-f0-9]{20}/gi) || [];
        return hexMatches.some((hex) => contextText.includes(hex));
      });
      if (narrowed.length) return pickPreferredVideoUrl(narrowed);
    }
    if (id) {
      const matched = urls.find((u) => u.includes(id));
      if (matched) return matched;
    }
    return pickPreferredVideoUrl(urls);
  }

  function extractBalancedJSONObject(text, startAt) {
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = Math.max(0, startAt || 0); i < text.length; i++) {
      const ch = text[i];
      if (start < 0) {
        if (ch === '{') {
          start = i;
          depth = 1;
        }
        continue;
      }
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return '';
  }

  function extractInitialStateFromHtmlText(html) {
    if (!html || typeof html !== 'string') return null;
    const markers = ['window.__INITIAL_STATE__', 'window.__SETUP_SERVER_STATE__'];
    for (const marker of markers) {
      let pos = 0;
      while (pos < html.length) {
        const idx = html.indexOf(marker, pos);
        if (idx < 0) break;
        const eq = html.indexOf('=', idx + marker.length);
        if (eq < 0) break;
        const objectText = extractBalancedJSONObject(html, eq + 1);
        if (objectText) {
          try {
            return JSON.parse(objectText);
          } catch (_) {
            // Continue scanning; some pages keep non-JSON assignments before SSR state.
          }
        }
        pos = idx + marker.length;
      }
    }
    return null;
  }

  function extractVideoUrlFromFetchedNoteHtml(html, pageUrl) {
    const noteId = getNoteIdFromUrl(pageUrl || '');
    if (!noteId) return '';
    return extractVideoUrlFromHtmlText(html || '', noteId);
  }

  function normalizeVideoImages(noteType, domCover, domImages, stateCover) {
    if (noteType !== 'video') {
      return {
        cover: domCover || stateCover || '',
        images: domImages && domImages.length ? domImages : (domCover || stateCover ? [domCover || stateCover] : [])
      };
    }
    // 视频笔记没有多图语义；小红书视频弹层 DOM 常混入推荐/播放器 swiper 图片。
    // 只保留当前 note state 的封面；没有 state 封面时最多保留 DOM 推断的单张封面，避免把几十张杂图镜像到 COS。
    const cover = stateCover || domCover || '';
    return {
      cover,
      images: cover ? [cover] : []
    };
  }

  /** 相对链接转绝对（小红书域）。 */
  function absUrl(href) {
    if (!href) return '';
    if (href.indexOf('//') === 0) return 'https:' + href;
    if (href.indexOf('/') === 0) return 'https://www.xiaohongshu.com' + href;
    return href;
  }

  function parseNoteDetail(opts) {
    const o = opts || {};
    const container = o.container || null;
    const state = o.state || null;
    const url = o.url || '';
    const now = o.now;
    const noteId = getNoteIdFromUrl(url) || (state && state.note && state.note.currentNoteId) || '';

    // --- DOM 字段 ---
    let domTitle = '';
    let domContent = '';
    let domTags = [];
    let domAuthorName = '';
    let domAuthorLink = '';
    let domCover = '';
    let domImages = [];
    let domLikes = 0;
    let domCollects = 0;
    let domComments = 0;
    let domPublishedAt = '';
    let comments = [];
    let videoDom = false;

    if (container && container.querySelector) {
      domTitle = txt(container.querySelector('.title')) || txt(container.querySelector('.note-content .title'));
      domContent = Array.from(container.querySelectorAll('.note-content .note-text span'))
        .map((s) => txt(s))
        .filter(Boolean)
        .join('\n');
      if (!domContent) {
        domContent = txt(container.querySelector('.note-content .note-text')) || txt(container.querySelector('.note-content'));
      }
      domTags = Array.from(container.querySelectorAll('.note-content .tag, .note-text .tag, a.tag'))
        .map((t) => txt(t).replace(/^#/, '').trim())
        .filter((t) => t && t !== '作者');

      domAuthorName =
        txt(container.querySelector('.author-wrapper .username')) ||
        txt(container.querySelector('.username')) ||
        txt(container.querySelector('.user-nickname'));
      domAuthorLink = absUrl(
        attr(container.querySelector('.author-wrapper a.author'), 'href') ||
          attr(container.querySelector('.author-container a'), 'href') ||
          attr(container.querySelector('.author-wrapper a'), 'href') ||
          attr(container.querySelector('.author-wrapper .name'), 'href') ||
          attr(container.querySelector('a.name'), 'href')
      );

      domCover = resolveImgUrl(
        container.querySelector('.swiper-slide[data-index="0"] img') ||
          container.querySelector('.swiper-slide-active img') ||
          container.querySelector('.swiper-wrapper img') ||
          container.querySelector('.cover img') ||
          container.querySelector('img')
      );

      // 采集全部图片（不止封面）。小红书 swiper 为无限循环会克隆 slide，DOM 顺序≠显示顺序
      // （常把最后一张克隆到最前）→ 必须按 data-index/data-swiper-slide-index 真实索引排序 + 跳克隆 + 去重。
      {
        const slides = container.querySelectorAll('.swiper-slide');
        if (slides.length) {
          const seen = {};
          const indexed = [];
          let order = 0;
          for (const slide of slides) {
            if (slide.classList && slide.classList.contains('swiper-slide-duplicate')) continue;
            const img = slide.querySelector('img');
            if (!img) continue;
            const u = resolveImgUrl(img);
            if (!u || seen[u]) continue;
            seen[u] = 1;
            let raw = slide.getAttribute('data-index');
            if (raw === null || raw === '') raw = slide.getAttribute('data-swiper-slide-index');
            const idx = raw === null || raw === '' ? null : parseInt(raw, 10);
            indexed.push({ idx: Number.isNaN(idx) ? null : idx, order: order++, u });
          }
          indexed.sort((a, b) => (a.idx === null || b.idx === null ? a.order - b.order : a.idx - b.idx));
          for (const it of indexed) domImages.push(it.u);
        } else {
          const seen = {};
          const imgEls = container.querySelectorAll('.note-slider-img img, .media-container img, img');
          for (const im of imgEls) {
            const u = resolveImgUrl(im);
            if (u && !seen[u]) {
              seen[u] = 1;
              domImages.push(u);
            }
          }
        }
      }

      domLikes = parseCount(txt(container.querySelector('.interact-container .like-wrapper .count')));
      domCollects = parseCount(txt(container.querySelector('.collect-wrapper .count')));
      domComments = parseCount(txt(container.querySelector('.chat-wrapper .count')));
      domPublishedAt = parseDateText(txt(container.querySelector('.date')), now);

      comments = parseComments(container, 100);
      videoDom = isVideoNote(container);
    }

    // --- state 字段（补充 + 兜底） ---
    const sf = extractFieldsFromState(state, noteId);

    const stateVideo = extractVideoUrlFromState(state, noteId);
    const domVideo = extractVideoUrlFromDom(container);
    // note_type 由 DOM(<video>/xgplayer)或 state 决定，绝不由"扫到的 master_url"决定——
    // 图文笔记页面里常混着其它笔记/推荐视频的 master_url，否则会把图文误判成视频。
    const isVideo = videoDom || sf.note_type === 'video';
    const noteType = isVideo ? 'video' : 'normal';
    // 视频直链只在确认是视频笔记时才采用（图文笔记一律不塞 video_url）。
    let videoUrl = '';
    if (isVideo) {
      if (isDirectStreamUrl(o.videoUrl)) videoUrl = o.videoUrl;
      else if (isDirectStreamUrl(stateVideo)) videoUrl = stateVideo;
      else if (isDirectStreamUrl(domVideo)) videoUrl = domVideo;
    }
    const normalizedImages = normalizeVideoImages(noteType, domCover, domImages, sf.cover_url || '');

    const payload = {
      xhs_note_id: noteId || '',
      note_type: noteType,
      title: domTitle || sf.title || '',
      content: domContent || sf.content || '',
      tags: domTags && domTags.length ? domTags : (sf.tags || []),
      cover_url: normalizedImages.cover,
      images: normalizedImages.images,
      note_url: url || '',
      published_at: domPublishedAt || sf.published_at || '',
      video_url: videoUrl || '',
      like_count: domLikes || sf.like_count || 0,
      collect_count: domCollects || sf.collect_count || 0,
      comment_count: domComments || sf.comment_count || 0,
      share_count: sf.share_count || 0,
      comments: comments || [],
      author_name: domAuthorName || sf.author_name || '',
      author_link: (domAuthorLink && /^https?:\/\//i.test(domAuthorLink) ? domAuthorLink : '') || sf.author_link || '',
      author_followers: sf.author_followers != null ? sf.author_followers : 0,
      collected_at: new Date().toISOString()
    };

    return payload;
  }

  /**
   * 把 HTML 字符串 + state 对象解析成 NotePayload（供单测/离线解析用）。
   * 浏览器内可用 DOMParser；Node/jsdom 环境也可用（vitest jsdom）。
   */
  function parseNoteFromHtml(html, state, url, opts) {
    let container = null;
    try {
      const DP = typeof DOMParser !== 'undefined' ? DOMParser : null;
      if (DP) {
        const doc = new DP().parseFromString(html || '', 'text/html');
        container =
          doc.querySelector('.note-detail-container') ||
          doc.querySelector('.note-detail-mask') ||
          doc.body;
      }
    } catch (_) {
      container = null;
    }
    return parseNoteDetail({
      container,
      state: state || null,
      url: url || '',
      videoUrl: (opts && opts.videoUrl) || '',
      now: opts && opts.now
    });
  }

  return {
    parseCount,
    getNoteIdFromUrl,
    isDirectStreamUrl,
    decodeJsonUrlEscapes,
    normalizeHttpUrl,
    pickFirstDirectUrl,
    pickVideoUrlFromNote,
    findNoteInState,
    extractVideoUrlFromState,
    extractVideoStreamUrlFromText,
    extractVideoUrlsFromText,
    extractNoteEmbeddedHtmlSegments,
    extractVideoUrlFromNoteDetailMapInHtml,
    extractVideoUrlFromHtmlText,
    extractVideoUrlFromFetchedNoteHtml,
    pickPreferredVideoUrl,
    isLikelyVideoResourceUrl,
    extractVideoUrlFromResourceEntries,
    extractInitialStateFromHtmlText,
    extractFieldsFromState,
    formatPublishedAt,
    parseDateText,
    resolveImgUrl,
    isVideoNote,
    extractVideoUrlFromDom,
    parseOneComment,
    parseComments,
    parseNoteDetail,
    parseNoteFromHtml
  };
});
