// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import Parse from '../lib/parse.js'

// ---------------------------------------------------------------------------
// Fixtures：模拟一个保存下来的小红书视频笔记详情页 DOM + __INITIAL_STATE__
// ---------------------------------------------------------------------------
const NOTE_ID = 'a1b2c3d4e5f60718293a4b5c'
const NOTE_URL = `https://www.xiaohongshu.com/explore/${NOTE_ID}?xsec_token=abc`

const DETAIL_HTML = `
<div class="note-detail-container">
  <div class="note-detail-mask">
    <div class="author-wrapper">
      <a class="name" href="https://www.xiaohongshu.com/user/profile/u_777">小红薯创作者</a>
      <span class="username">小红薯创作者</span>
    </div>
    <div class="media-container">
      <video class="xgplayer-video" src="blob:https://www.xiaohongshu.com/xxxx"></video>
    </div>
    <div class="swiper-wrapper">
      <div class="swiper-slide" data-index="0">
        <img data-src="https://sns-img.xhscdn.com/cover_0.jpg" />
      </div>
    </div>
    <div class="note-content">
      <div class="title">五分钟搞定爆款选题</div>
      <div class="note-text">
        <span>今天分享一个我屡试不爽的选题方法</span>
        <span>第一步先看评论区</span>
        <a class="tag">#选题技巧</a>
        <a class="tag">#自媒体</a>
      </div>
      <div class="date">编辑于 2026-06-01</div>
    </div>
    <div class="interact-container">
      <span class="like-wrapper"><span class="count">1.2万</span></span>
      <span class="collect-wrapper"><span class="count">3456</span></span>
      <span class="chat-wrapper"><span class="count">789</span></span>
    </div>
    <div class="comments-el">
      <div class="comment-item">
        <div class="author"><span class="name">评论用户A</span></div>
        <div class="content"><span class="note-text">学到了，谢谢分享</span></div>
        <div class="like"><span class="count">88</span></div>
      </div>
      <div class="comment-item">
        <div class="author"><span class="name">评论用户B</span></div>
        <div class="content"><span class="note-text">求更多干货</span></div>
        <div class="like"><span class="count">12</span></div>
      </div>
    </div>
  </div>
</div>
`

const INITIAL_STATE = {
  user: { isLogged: true, userInfo: { _value: { userId: 'me_123' } } },
  note: {
    currentNoteId: NOTE_ID,
    noteDetailMap: {
      [NOTE_ID]: {
        note: {
          noteId: NOTE_ID,
          type: 'video',
          title: '五分钟搞定爆款选题',
          desc: '今天分享一个我屡试不爽的选题方法',
          time: 1748736000000, // 2025-06-01 (ms)
          interactInfo: {
            likedCount: '12000',
            collectedCount: '3456',
            commentCount: '789',
            shareCount: '45'
          },
          tagList: [{ name: '选题技巧' }, { name: '自媒体' }],
          user: { userId: 'u_777', nickname: '小红薯创作者' },
          cover: { urlPre: 'https://sns-img.xhscdn.com/cover_0.jpg' },
          video: {
            media: {
              stream: {
                h264: [
                  {
                    master_url:
                      'https://sns-video.xhscdn.com/stream/110/258/01e_aaa_258.mp4?sign=xxx'
                  }
                ]
              }
            }
          }
        }
      }
    }
  }
}

describe('lib/parse.js — NotePayload 解析', () => {
  const container = (() => {
    const wrap = document.createElement('div')
    wrap.innerHTML = DETAIL_HTML
    return wrap.querySelector('.note-detail-container')
  })()

  const payload = Parse.parseNoteDetail({
    container,
    state: INITIAL_STATE,
    url: NOTE_URL,
    now: new Date('2026-06-23T00:00:00Z')
  })

  it('提取 noteId / 类型 / URL', () => {
    expect(payload.xhs_note_id).toBe(NOTE_ID)
    expect(payload.note_type).toBe('video')
    expect(payload.note_url).toBe(NOTE_URL)
  })

  it('提取标题与正文', () => {
    expect(payload.title).toBe('五分钟搞定爆款选题')
    expect(payload.content).toContain('屡试不爽')
    expect(payload.content).toContain('评论区')
  })

  it('提取标签数组（去 # 去"作者"）', () => {
    expect(payload.tags).toEqual(expect.arrayContaining(['选题技巧', '自媒体']))
    expect(payload.tags).not.toContain('作者')
  })

  it('解析中文互动数（1.2万 → 12000）', () => {
    expect(payload.like_count).toBe(12000)
    expect(payload.collect_count).toBe(3456)
    expect(payload.comment_count).toBe(789)
    expect(payload.share_count).toBe(45) // 来自 state（DOM 没有 share）
  })

  it('视频直链来自 __INITIAL_STATE__ h264 master_url，非 blob', () => {
    expect(payload.video_url).toContain('sns-video.xhscdn.com')
    expect(payload.video_url).not.toMatch(/^blob:/)
    expect(Parse.isDirectStreamUrl(payload.video_url)).toBe(true)
  })

  it('提取封面、作者、发布时间', () => {
    expect(payload.cover_url).toContain('cover_0.jpg')
    expect(payload.author_name).toBe('小红薯创作者')
    expect(payload.author_link).toContain('/user/profile/u_777')
    expect(payload.published_at).toBe('2026-06-01')
  })

  it('提取评论（作者/正文/点赞），≤10 条', () => {
    expect(payload.comments.length).toBe(2)
    expect(payload.comments[0]).toMatchObject({ author: '评论用户A', text: '学到了，谢谢分享', likes: 88 })
    expect(payload.comments.length).toBeLessThanOrEqual(10)
  })

  it('作者粉丝取不到时置 0', () => {
    expect(payload.author_followers).toBe(0)
  })

  it('collected_at 是 ISO8601 字符串', () => {
    expect(typeof payload.collected_at).toBe('string')
    expect(() => new Date(payload.collected_at).toISOString()).not.toThrow()
    expect(payload.collected_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('NotePayload 字段齐全（契约字段全部存在）', () => {
    const required = [
      'xhs_note_id', 'note_type', 'title', 'content', 'tags', 'cover_url',
      'note_url', 'published_at', 'video_url', 'like_count', 'collect_count',
      'comment_count', 'share_count', 'comments', 'author_name', 'author_link',
      'author_followers', 'collected_at'
    ]
    for (const key of required) {
      expect(payload, `缺少字段 ${key}`).toHaveProperty(key)
    }
  })
})

describe('lib/parse.js — 工具函数', () => {
  it('parseCount 解析各种格式', () => {
    expect(Parse.parseCount('1.2万')).toBe(12000)
    expect(Parse.parseCount('3,456')).toBe(3456)
    expect(Parse.parseCount('赞')).toBe(0)
    expect(Parse.parseCount(null)).toBe(0)
    expect(Parse.parseCount('1.5亿')).toBe(150000000)
  })

  it('getNoteIdFromUrl 多形态', () => {
    expect(Parse.getNoteIdFromUrl(`https://www.xiaohongshu.com/explore/${NOTE_ID}`)).toBe(NOTE_ID)
    expect(Parse.getNoteIdFromUrl(`https://www.xiaohongshu.com/discovery/item/${NOTE_ID}`)).toBe(NOTE_ID)
    expect(Parse.getNoteIdFromUrl('https://example.com')).toBe('')
  })

  it('isDirectStreamUrl 过滤 blob/data', () => {
    expect(Parse.isDirectStreamUrl('https://x.mp4')).toBe(true)
    expect(Parse.isDirectStreamUrl('blob:https://x')).toBe(false)
    expect(Parse.isDirectStreamUrl('data:video/mp4;base64,AAA')).toBe(false)
  })

  it('parseNoteFromHtml 从 HTML 字符串 + state 解析（图文笔记，无视频）', () => {
    const imageState = {
      note: {
        currentNoteId: NOTE_ID,
        noteDetailMap: {
          [NOTE_ID]: {
            note: {
              noteId: NOTE_ID,
              type: 'normal',
              title: '图文标题',
              user: { userId: 'u_1', nickname: '作者甲' }
            }
          }
        }
      }
    }
    const html = `<div class="note-detail-container"><div class="note-content"><div class="title">图文标题</div></div></div>`
    const p = Parse.parseNoteFromHtml(html, imageState, NOTE_URL)
    expect(p.note_type).toBe('normal')
    expect(p.video_url).toBe('')
    expect(p.title).toBe('图文标题')
  })

  it('DOM 无 .title 时从 state.displayTitle 兜底标题', () => {
    const displayState = {
      note: {
        currentNoteId: NOTE_ID,
        noteDetailMap: {
          [NOTE_ID]: {
            note: {
              noteId: NOTE_ID,
              type: 'video',
              displayTitle: '从 displayTitle 读取的视频标题',
              desc: '正文描述',
              video: {
                media: {
                  stream: {
                    h264: [{ master_url: 'https://sns-video.xhscdn.com/display-title.mp4' }]
                  }
                }
              }
            }
          }
        }
      }
    }
    const wrap = document.createElement('div')
    wrap.innerHTML = `
      <div class="note-detail-container">
        <div class="media-container"><video src="blob:https://www.xiaohongshu.com/video"></video></div>
        <div class="note-content"><div class="note-text">正文描述</div></div>
      </div>`
    const payload = Parse.parseNoteDetail({
      container: wrap.querySelector('.note-detail-container'),
      state: displayState,
      url: NOTE_URL
    })
    expect(payload.title).toBe('从 displayTitle 读取的视频标题')
  })
})

describe('lib/parse.js — 评论回复嵌套（.parent-comment 分组）', () => {
  it('每个 .parent-comment 首条为顶层、其余为回复', () => {
    const box = document.createElement('div')
    box.innerHTML = `
      <div class="parent-comment">
        <div class="comment-item">
          <div class="author"><span class="name">楼主A</span></div>
          <div class="content"><span class="note-text">顶层评论A</span></div>
        </div>
        <div class="comment-item">
          <div class="author"><span class="name">回复者X</span></div>
          <div class="content"><span class="note-text">回复A-1</span></div>
        </div>
        <div class="comment-item">
          <div class="author"><span class="name">回复者Y</span></div>
          <div class="content"><span class="note-text">回复A-2</span></div>
        </div>
      </div>
      <div class="parent-comment">
        <div class="comment-item">
          <div class="author"><span class="name">楼主B</span></div>
          <div class="content"><span class="note-text">顶层评论B</span></div>
        </div>
      </div>
    `
    const comments = Parse.parseComments(box, 100)
    expect(comments.length).toBe(2)
    expect(comments[0]).toMatchObject({ author: '楼主A', text: '顶层评论A' })
    expect(comments[0].replies.length).toBe(2)
    expect(comments[0].replies[0]).toMatchObject({ author: '回复者X', text: '回复A-1' })
    expect(comments[1].author).toBe('楼主B')
    expect(comments[1].replies.length).toBe(0)
  })
})

describe('lib/parse.js — 视频直链 HTML 文本扫描（CSP 安全）', () => {
  const html = `
    <html><body>
    <script>window.__INITIAL_STATE__={"note":{"noteDetailMap":{"vid123":{"note":{"video":{"media":{"stream":{"h264":[{"master_url":"https:\\u002F\\u002Fsns-video.xhscdn.com\\u002Fvid123_master.mp4?sign=x"}]}}}}}}}}}</script>
    </body></html>`
  it('从 script 文本正则抓 master_url（h264）+ 转义解码', () => {
    const u = Parse.extractVideoUrlFromHtmlText(html, 'vid123')
    expect(u).toBe('https://sns-video.xhscdn.com/vid123_master.mp4?sign=x')
  })
  it('从 script 文本解析 __INITIAL_STATE__ 对象', () => {
    const state = Parse.extractInitialStateFromHtmlText(html)
    expect(state.note.noteDetailMap.vid123.note.video.media.stream.h264[0].master_url).toBe(
      'https://sns-video.xhscdn.com/vid123_master.mp4?sign=x'
    )
    expect(Parse.extractVideoUrlFromState(state, 'vid123')).toBe('https://sns-video.xhscdn.com/vid123_master.mp4?sign=x')
  })
  it('无视频信息时返回空串', () => {
    expect(Parse.extractVideoUrlFromHtmlText('<html><body>纯图文</body></html>', 'x')).toBe('')
  })
  it('传入 noteId 时不回落到页面其它笔记的视频', () => {
    const mixedHtml = `
      <script>window.__INITIAL_STATE__={"note":{"noteDetailMap":{
        "target123":{"note":{"noteId":"target123","type":"normal","title":"图文"}},
        "other456":{"note":{"noteId":"other456","type":"video","video":{"media":{"stream":{"h264":[{"master_url":"https:\\u002F\\u002Fsns-video.xhscdn.com\\u002Fother.mp4"}]}}}}}
      }}}</script>`
    expect(Parse.extractVideoUrlFromHtmlText(mixedHtml, 'target123')).toBe('')
  })
  it('不返回 blob: 本地地址', () => {
    const blobHtml = '<script>{"h264":[{"master_url":"blob:https://www.xiaohongshu.com/abc"}]}</script>'
    expect(Parse.extractVideoUrlFromHtmlText(blobHtml, '')).toBe('')
  })
  it('可解析重新 fetch 当前笔记页 HTML 里的 video_feed 预加载视频', () => {
    const fetchedHtml = `
      <a href="/explore/${NOTE_ID}?h5VideoPreloadInfo=%7B%22h266%22%3A%5B%7B%22master_url%22%3A%22https%3A%5C%2F%5C%2Fsns-video.xhscdn.com%5C%2Ffetched_259.mp4%3Fsign%3Dfetched%22%7D%5D%7D"></a>`
    expect(Parse.extractVideoUrlFromFetchedNoteHtml(fetchedHtml, NOTE_URL)).toBe(
      'https://sns-video.xhscdn.com/fetched_259.mp4?sign=fetched'
    )
  })
})

describe('lib/parse.js — 视频地址兜底解析', () => {
  it('当前小红书 EF4 视频流分组应优先返回 MP4，而不是封面图', () => {
    const state = {
      note: {
        currentNoteId: '6a7993e60000000028032339',
        noteDetailMap: {
          '6a7993e60000000028032339': {
            note: {
              noteId: '6a7993e60000000028032339',
              type: 'video',
              video: {
                image: {
                  thumbnailFileid: 'https://sns-img.xhscdn.com/current-note-cover.webp'
                },
                media: {
                  stream: {
                    EF4: [
                      {
                        master_url:
                          'https://sns-video-qc.xhscdn.com/current-note-ef4.mp4?sign=current'
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    }

    expect(Parse.extractVideoUrlFromState(state, '6a7993e60000000028032339')).toBe(
      'https://sns-video-qc.xhscdn.com/current-note-ef4.mp4?sign=current'
    )
  })

  it('state 视频流迁移到 video_info_v2 时仍可取到直链', () => {
    const state = {
      note: {
        currentNoteId: 'vidinfov2',
        noteDetailMap: {
          vidinfov2: {
            note: {
              noteId: 'vidinfov2',
              type: 'video',
              video_info_v2: {
                media: {
                  stream: {
                    h264: [
                      {
                        master_url: 'https://sns-video.xhscdn.com/vidinfov2_258.mp4?sign=current'
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(Parse.extractVideoUrlFromState(state, 'vidinfov2')).toBe(
      'https://sns-video.xhscdn.com/vidinfov2_258.mp4?sign=current'
    )
  })

  it('state 视频流字段新增 h266 时仍可取到直链', () => {
    const state = {
      note: {
        currentNoteId: 'vidh266',
        noteDetailMap: {
          vidh266: {
            note: {
              noteId: 'vidh266',
              type: 'video',
              video: {
                media: {
                  stream: {
                    h266: [
                      {
                        master_url: 'https://sns-video.xhscdn.com/vidh266_259.mp4?sign=h266'
                      }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(Parse.extractVideoUrlFromState(state, 'vidh266')).toBe(
      'https://sns-video.xhscdn.com/vidh266_259.mp4?sign=h266'
    )
  })

  it('state 路径变化时仍可从 video.url 取到直链', () => {
    const state = {
      note: {
        currentNoteId: 'vidfallback',
        noteDetailMap: {
          vidfallback: {
            note: {
              type: 'video',
              video: {
                media: {
                  stream: {
                    h264: [{ url: 'https://sns-video.xhscdn.com/vidfallback.mp4?sign=u' }]
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(Parse.extractVideoUrlFromState(state, 'vidfallback')).toBe(
      'https://sns-video.xhscdn.com/vidfallback.mp4?sign=u'
    )
  })

  it('state 无直链时从 DOM video/src 兜底获取', () => {
    const wrap = document.createElement('div')
    wrap.innerHTML = `
      <div class="note-detail-container">
        <div class="media-container">
          <video src="https://sns-video.xhscdn.com/dom-video.mp4?sign=dom"></video>
        </div>
      </div>`
    const container = wrap.querySelector('.note-detail-container')
    const payload = Parse.parseNoteDetail({
      container,
      state: null,
      url: 'https://www.xiaohongshu.com/explore/domvideo123'
    })
    expect(payload.note_type).toBe('video')
    expect(payload.video_url).toBe('https://sns-video.xhscdn.com/dom-video.mp4?sign=dom')
  })

  it('从 shadowRoot 里的 video/currentSrc 兜底获取', () => {
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<video src="https://sns-video.xhscdn.com/shadow-video.mp4?sign=shadow"></video>'
    const wrap = document.createElement('div')
    wrap.className = 'note-detail-container'
    wrap.appendChild(host)
    expect(Parse.extractVideoUrlFromDom(wrap)).toBe(
      'https://sns-video.xhscdn.com/shadow-video.mp4?sign=shadow'
    )
  })

  it('从 performance resource entries 取最近加载的视频资源并过滤图片', () => {
    const entries = [
      { name: 'https://sns-img.xhscdn.com/cover.jpg' },
      { name: 'https://sns-video.xhscdn.com/stream/old.mp4?sign=old' },
      { name: 'https://sns-video.xhscdn.com/stream/current.mp4?sign=current' }
    ]
    expect(Parse.extractVideoUrlFromResourceEntries(entries, '')).toBe(
      'https://sns-video.xhscdn.com/stream/current.mp4?sign=current'
    )
  })

  it('performance 资源有上下文时优先取当前上下文匹配的视频', () => {
    const entries = [
      { name: 'https://sns-video.xhscdn.com/stream/old-video-file-aaaaaaaaaaaaaaaaaaaa.mp4?sign=old', startTime: 10 },
      { name: 'https://sns-video.xhscdn.com/stream/current-video-file-bbbbbbbbbbbbbbbbbbbb_259.mp4?sign=current', startTime: 20 }
    ]
    const contextText = '当前笔记 video current-video-file-bbbbbbbbbbbbbbbbbbbb_259.mp4'
    expect(Parse.extractVideoUrlFromResourceEntries(entries, '', { contextText })).toBe(
      'https://sns-video.xhscdn.com/stream/current-video-file-bbbbbbbbbbbbbbbbbbbb_259.mp4?sign=current'
    )
  })
})

describe('lib/parse.js — 视频页图片污染回归', () => {
  it('视频笔记无直链时不把页面杂散 swiper 图片当作正文图片入库', () => {
    const wrap = document.createElement('div')
    wrap.innerHTML = `
      <div class="note-detail-container">
        <div class="media-container">
          <video class="xgplayer-video" src="blob:https://www.xiaohongshu.com/no-direct-url"></video>
        </div>
        <div class="swiper-wrapper">
          <div class="swiper-slide" data-index="0"><img src="https://sns-img.xhscdn.com/recommend_0.jpg"></div>
          <div class="swiper-slide" data-index="1"><img src="https://sns-img.xhscdn.com/recommend_1.jpg"></div>
          <div class="swiper-slide" data-index="2"><img src="https://sns-img.xhscdn.com/recommend_2.jpg"></div>
        </div>
      </div>`
    const state = {
      note: {
        currentNoteId: 'vidwithouturl',
        noteDetailMap: {
          vidwithouturl: {
            note: {
              noteId: 'vidwithouturl',
              type: 'video',
              cover: { url: 'https://sns-img.xhscdn.com/current_video_cover.jpg' },
              video: {}
            }
          }
        }
      }
    }
    const payload = Parse.parseNoteDetail({
      container: wrap.querySelector('.note-detail-container'),
      state,
      url: 'https://www.xiaohongshu.com/explore/vidwithouturl'
    })
    expect(payload.note_type).toBe('video')
    expect(payload.video_url).toBe('')
    expect(payload.cover_url).toBe('https://sns-img.xhscdn.com/current_video_cover.jpg')
    expect(payload.images).toEqual(['https://sns-img.xhscdn.com/current_video_cover.jpg'])
  })
})

describe('lib/parse.js — 图文笔记不被误判为视频(回归)', () => {
  it('无 video DOM + 传入杂散 master_url → 仍判 normal、不塞 video_url', () => {
    const wrap = document.createElement('div')
    wrap.innerHTML = `
      <div class="note-detail-container">
        <div class="title">图文笔记标题</div>
        <div class="note-content"><span class="note-text"><span>正文</span></span></div>
        <div class="swiper-slide" data-index="0"><img src="https://x.com/cover.jpg"></div>
      </div>`
    const container = wrap.querySelector('.note-detail-container')
    // 模拟 content.js 因页面混入其它笔记/推荐视频而扫到的杂散直链
    const payload = Parse.parseNoteDetail({
      container,
      state: null,
      url: 'https://www.xiaohongshu.com/explore/imgnote123?xsec_token=t',
      videoUrl: 'https://sns-video.xhscdn.com/stream/other_note_master.mp4?sign=stray'
    })
    expect(payload.note_type).toBe('normal')
    expect(payload.video_url).toBe('')
  })
})

describe('lib/parse.js — 图片按 swiper 真实索引排序(修复克隆乱序)', () => {
  it('最后一张被克隆到最前时,按 data-swiper-slide-index 复原正确顺序', () => {
    const wrap = document.createElement('div')
    // 模拟 swiper：克隆的"最后一张"在 DOM 最前(duplicate),真实顺序由 data-swiper-slide-index 决定
    wrap.innerHTML = `
      <div class="note-detail-container">
        <div class="swiper-wrapper">
          <div class="swiper-slide swiper-slide-duplicate" data-swiper-slide-index="2"><img src="https://x.com/img2.jpg"></div>
          <div class="swiper-slide" data-swiper-slide-index="0"><img src="https://x.com/img0.jpg"></div>
          <div class="swiper-slide" data-swiper-slide-index="1"><img src="https://x.com/img1.jpg"></div>
          <div class="swiper-slide" data-swiper-slide-index="2"><img src="https://x.com/img2.jpg"></div>
        </div>
      </div>`
    const container = wrap.querySelector('.note-detail-container')
    const payload = Parse.parseNoteDetail({ container, state: null, url: 'https://www.xiaohongshu.com/explore/imgord' })
    expect(payload.images).toEqual([
      'https://x.com/img0.jpg',
      'https://x.com/img1.jpg',
      'https://x.com/img2.jpg'
    ])
  })
})

describe('lib/parse.js — parseDateText 相对时间', () => {
  const now = new Date('2026-06-25T10:00:00Z')
  const today = '2026-06-25'
  it('刚刚 / X分钟前 / X小时前 / 今天 → 今天', () => {
    expect(Parse.parseDateText('刚刚', now)).toBe(today)
    expect(Parse.parseDateText('30分钟前', now)).toBe(today)
    expect(Parse.parseDateText('编辑于 3小时前', now)).toBe(today)
    expect(Parse.parseDateText('今天 21:13', now)).toBe(today + ' 21:13:00')
  })
  it('仍支持 昨天 / N天前 / MM-DD / 全日期', () => {
    expect(Parse.parseDateText('昨天 21:13', now)).toBe('2026-06-24 21:13:00')
    expect(Parse.parseDateText('编辑于 06-08', now)).toBe('2026-06-08')
    expect(Parse.parseDateText('2026-06-19 08:00', now)).toBe('2026-06-19 08:00:00')
  })
})

describe('lib/parse.js — parseDateText 捕获时间', () => {
  const now = new Date('2026-06-26T10:00:00Z')
  it('"编辑于 昨天 19:49 上海" → 2026-06-25 19:49:00', () => {
    expect(Parse.parseDateText('编辑于 昨天 19:49 上海', now)).toBe('2026-06-25 19:49:00')
  })
  it('"今天 09:05" → 今天 09:05:00', () => {
    expect(Parse.parseDateText('今天 09:05', now)).toBe('2026-06-26 09:05:00')
  })
  it('纯日期无时间 → 不加时间', () => {
    expect(Parse.parseDateText('编辑于 06-08', now)).toBe('2026-06-08')
  })
})
