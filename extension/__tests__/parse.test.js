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
})
