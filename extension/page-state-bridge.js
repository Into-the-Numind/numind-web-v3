/**
 * Runs in the page's MAIN world so it can read Xiaohongshu's runtime state.
 * The isolated content script talks to this file through DOM events with
 * stringified JSON payloads, which keeps cross-world data access predictable.
 */
(function () {
  'use strict';

  const REQUEST_EVENT = 'YOUSHU_XHS_READ_PAGE_STATE_REQUEST';
  const RESPONSE_EVENT = 'YOUSHU_XHS_READ_PAGE_STATE_RESPONSE';

  function normalizeHttpUrl(value) {
    const s = String(value || '').trim();
    if (!s) return '';
    if (s.indexOf('//') === 0) return 'https:' + s;
    return s.replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
  }

  function isDirectUrl(value) {
    const u = normalizeHttpUrl(value);
    return /^https?:\/\//i.test(u) && !/^blob:/i.test(u) && !/^data:/i.test(u);
  }

  function pickFirstDirectUrl(value, seen) {
    if (!value) return '';
    const visited = seen || [];
    if (typeof value === 'string') {
      const u = normalizeHttpUrl(value);
      return isDirectUrl(u) ? u : '';
    }
    if (typeof value !== 'object') return '';
    if (visited.indexOf(value) >= 0) return '';
    visited.push(value);

    const preferred = [
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
    for (let i = 0; i < preferred.length; i++) {
      const key = preferred[i];
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        const u = pickFirstDirectUrl(value[key], visited);
        if (u) return u;
      }
    }
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const u = pickFirstDirectUrl(value[i], visited);
        if (u) return u;
      }
    }
    return '';
  }

  function pickVideoUrlFromStream(stream) {
    if (!stream) return '';
    const tryStreamGroup = (items) => {
      if (!Array.isArray(items)) return '';
      for (let i = 0; i < items.length; i++) {
        const u = pickFirstDirectUrl(items[i]);
        if (u) return u;
      }
      return '';
    };
    const knownGroupKeys = ['h264', 'h265', 'h266', 'av1'];
    for (let i = 0; i < knownGroupKeys.length; i++) {
      const u = tryStreamGroup(stream[knownGroupKeys[i]]);
      if (u) return u;
    }
    // Xiaohongshu may use opaque stream group keys (for example EF4 / EF5)
    // instead of a codec name. Each group still contains the usual MP4 URLs.
    const groupKeys = Object.keys(stream);
    for (let i = 0; i < groupKeys.length; i++) {
      if (knownGroupKeys.indexOf(groupKeys[i]) >= 0) continue;
      const u = tryStreamGroup(stream[groupKeys[i]]);
      if (u) return u;
    }
    return pickFirstDirectUrl(stream);
  }

  function pickVideoUrlFromContainer(container) {
    if (!container || typeof container !== 'object') return '';
    const media = container.media || container;
    const mediaVideo = media && media.video;
    return (
      pickVideoUrlFromStream(media && media.stream) ||
      pickVideoUrlFromStream(container.stream) ||
      pickFirstDirectUrl(mediaVideo && mediaVideo.opaque1) ||
      pickFirstDirectUrl(container.opaque1) ||
      pickFirstDirectUrl(container)
    );
  }

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
    for (let i = 0; i < containers.length; i++) {
      const u = pickVideoUrlFromContainer(containers[i]);
      if (u) return u;
    }
    return '';
  }

  function cloneLimited(value, depth, seen) {
    if (value == null || typeof value !== 'object') return value;
    if (depth <= 0) return null;
    const visited = seen || [];
    if (visited.indexOf(value) >= 0) return null;
    visited.push(value);

    if (Array.isArray(value)) {
      return value.slice(0, 40).map((item) => cloneLimited(item, depth - 1, visited));
    }

    const out = {};
    const keys = Object.keys(value).slice(0, 120);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const v = value[key];
      if (typeof v === 'function' || typeof v === 'symbol') continue;
      out[key] = cloneLimited(v, depth - 1, visited);
    }
    return out;
  }

  function slimNote(note) {
    if (!note || typeof note !== 'object') return null;
    return {
      noteId: note.noteId || note.id || note.note_id || '',
      id: note.id || note.noteId || note.note_id || '',
      type: note.type || note.noteType || note.note_type || '',
      title: note.title || note.displayTitle || '',
      desc: note.desc || note.description || note.content || '',
      interactInfo: cloneLimited(note.interactInfo || note.interact_info || {}, 4),
      tagList: cloneLimited(note.tagList || note.tag_list || [], 4),
      user: cloneLimited(note.user || note.author || {}, 4),
      time: note.time || note.publishTime || note.publish_time || note.lastUpdateTime || '',
      cover: cloneLimited(note.cover || {}, 4),
      imageList: cloneLimited(note.imageList || note.image_list || [], 4),
      video: cloneLimited(note.video || {}, 7),
      video_info_v2: cloneLimited(note.video_info_v2 || note.videoInfoV2 || note.video_info || note.videoInfo || {}, 7)
    };
  }

  function noteFromWrapper(wrapper) {
    if (!wrapper || typeof wrapper !== 'object') return null;
    return wrapper.note || wrapper.noteData || wrapper.data || wrapper;
  }

  function findNoteInState(state, noteId) {
    if (!state || typeof state !== 'object') return null;
    const id = String(noteId || '').trim();
    const noteRoot = state.note || null;
    if (noteRoot && typeof noteRoot === 'object') {
      const map = noteRoot.noteDetailMap || noteRoot.note_detail_map || null;
      if (id && map && map[id]) return noteFromWrapper(map[id]);
      if (id && map) {
        const keys = Object.keys(map);
        for (let i = 0; i < keys.length; i++) {
          const note = noteFromWrapper(map[keys[i]]);
          if (note && (note.noteId === id || note.id === id || note.note_id === id)) return note;
        }
      }
      if (noteRoot.currentNoteId && (!id || noteRoot.currentNoteId === id) && noteRoot.note) {
        return noteRoot.note;
      }
      if (map) {
        const keys = Object.keys(map);
        if (!id && keys.length === 1) return noteFromWrapper(map[keys[0]]);
      }
      if (!id && noteRoot.note) return noteRoot.note;
    }

    const nd = state.noteData && state.noteData.data && state.noteData.data.noteData;
    if (nd && (!id || nd.noteId === id || nd.id === id || nd.note_id === id)) return nd;
    return null;
  }

  function readState(noteId) {
    const states = [];
    if (window.__INITIAL_STATE__) states.push(window.__INITIAL_STATE__);
    if (window.__SETUP_SERVER_STATE__) states.push(window.__SETUP_SERVER_STATE__);

    for (let i = 0; i < states.length; i++) {
      const note = findNoteInState(states[i], noteId);
      const noteIdFromNote = note && (note.noteId || note.id || note.note_id);
      const resolvedId = String(noteId || noteIdFromNote || '').trim();
      if (!note || !resolvedId) continue;

      const slim = slimNote(note);
      if (!slim) continue;
      const state = { note: { currentNoteId: resolvedId, noteDetailMap: {} } };
      state.note.noteDetailMap[resolvedId] = { note: slim };
      return {
        stateJson: JSON.stringify(state),
        videoUrl: pickVideoUrlFromNote(note) || pickVideoUrlFromNote(slim)
      };
    }
    return { stateJson: '', videoUrl: '' };
  }

  document.addEventListener(REQUEST_EVENT, function (event) {
    let request = null;
    try {
      request = JSON.parse(String(event.detail || '{}'));
    } catch (_) {
      request = null;
    }
    if (!request || !request.requestId) return;

    let result = { stateJson: '', videoUrl: '' };
    try {
      result = readState(request.noteId || '');
    } catch (_) {
      result = { stateJson: '', videoUrl: '' };
    }

    const response = {
      requestId: request.requestId,
      stateJson: result.stateJson || '',
      videoUrl: result.videoUrl || ''
    };
    document.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: JSON.stringify(response) }));
  });
})();
