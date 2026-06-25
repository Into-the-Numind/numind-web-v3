/**
 * 有数选题采集 — 纯函数解析模块
 *
 * 设计目标：
 *  - 不依赖 chrome.* / 网络 / 全局可变状态，便于 vitest 单测。
 *  - 输入是「DOM 容器元素 + 页面 __INITIAL_STATE__ 对象」，输出归一化的 NotePayload。
 *  - 解析手法移植自 plugin3.2.1：
 *      列表卡片 section.note-item / a.cover.mask.ld / .like-wrapper .count
 *      详情 .note-detail-container / .note-content .note-text span / .comment-item
 *      视频直链 __INITIAL_STATE__.note.noteDetailMap[noteId].note.video.media.stream.h264[0].master_url
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

  /**
   * 从一条 note 对象里取视频直链。
   * 路径：note.video.media.stream.h264[0].master_url（或 masterUrl），h265 兜底。
   */
  function pickVideoUrlFromNote(note) {
    if (!note || typeof note !== 'object' || !note.video) return '';
    const media = note.video.media;
    const stream = media && media.stream;
    if (!stream) return '';
    const tryCodec = (arr) => {
      if (!Array.isArray(arr) || !arr.length) return '';
      const first = arr[0] || {};
      const u = first.master_url || first.masterUrl || first.backup_urls?.[0] || '';
      return u ? decodeJsonUrlEscapes(u) : '';
    };
    return tryCodec(stream.h264) || tryCodec(stream.h265) || tryCodec(stream.av1) || '';
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
      if (noteId && noteRoot.noteDetailMap && noteRoot.noteDetailMap[noteId]) {
        const wrap = noteRoot.noteDetailMap[noteId];
        if (wrap && wrap.note) return wrap.note;
      }
      if (noteRoot.currentNoteId && noteRoot.note) {
        if (!noteId || noteRoot.currentNoteId === noteId) return noteRoot.note;
      }
      // noteDetailMap 只有一条时直接取
      if (noteRoot.noteDetailMap) {
        const keys = Object.keys(noteRoot.noteDetailMap);
        if (keys.length === 1 && noteRoot.noteDetailMap[keys[0]]) {
          return noteRoot.noteDetailMap[keys[0]].note || null;
        }
        if (noteId && noteRoot.noteDetailMap[noteId]) {
          return noteRoot.noteDetailMap[noteId].note || null;
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

    if (note.title) out.title = String(note.title).trim();
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
    return { author: author || '', text: text || '', likes };
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

  /**
   * 从页面 HTML 文本扫视频直链（移植 plugin3.2.1：读 SSR __INITIAL_STATE__ 文本，CSP 安全）。
   * 优先按 noteId 锚点切片避免命中 feed 里其它笔记，兜底取整页第一条 h264。只返回 https mp4。
   */
  function extractVideoUrlFromHtmlText(html, noteId) {
    if (!html || typeof html !== 'string') return '';
    const id = (noteId || '').trim();
    if (id) {
      const anchors = [
        '"' + id + '":', // noteDetailMap 以 noteId 为 key —— 最精准锚点
        'video_feed/' + id,
        '/explore/' + id,
        '/discovery/item/' + id,
        '"noteId":"' + id + '"',
        '"id":"' + id + '"'
      ];
      for (const anchor of anchors) {
        let pos = 0;
        while (pos < html.length) {
          const idx = html.indexOf(anchor, pos);
          if (idx < 0) break;
          const u = extractVideoStreamUrlFromText(html.slice(idx, idx + 25000));
          if (u && /^https?:\/\//i.test(u)) return u;
          pos = idx + anchor.length;
        }
      }
      return ''; // 有 noteId 但其片段内无视频 → 图文笔记，绝不回落整页(否则抓到别的笔记的视频)
    }
    const u = extractVideoStreamUrlFromText(html);
    return u && /^https?:\/\//i.test(u) ? u : '';
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
    // note_type 由 DOM(<video>/xgplayer)或 state 决定，绝不由"扫到的 master_url"决定——
    // 图文笔记页面里常混着其它笔记/推荐视频的 master_url，否则会把图文误判成视频。
    const isVideo = videoDom || sf.note_type === 'video';
    const noteType = isVideo ? 'video' : 'normal';
    // 视频直链只在确认是视频笔记时才采用（图文笔记一律不塞 video_url）。
    let videoUrl = '';
    if (isVideo) {
      if (isDirectStreamUrl(o.videoUrl)) videoUrl = o.videoUrl;
      else if (isDirectStreamUrl(stateVideo)) videoUrl = stateVideo;
    }

    const payload = {
      xhs_note_id: noteId || '',
      note_type: noteType,
      title: domTitle || sf.title || '',
      content: domContent || sf.content || '',
      tags: domTags && domTags.length ? domTags : (sf.tags || []),
      cover_url: domCover || sf.cover_url || '',
      images: domImages.length ? domImages : (domCover ? [domCover] : []),
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
    pickVideoUrlFromNote,
    findNoteInState,
    extractVideoUrlFromState,
    extractVideoStreamUrlFromText,
    extractVideoUrlFromHtmlText,
    extractFieldsFromState,
    formatPublishedAt,
    parseDateText,
    resolveImgUrl,
    isVideoNote,
    parseOneComment,
    parseComments,
    parseNoteDetail,
    parseNoteFromHtml
  };
});
