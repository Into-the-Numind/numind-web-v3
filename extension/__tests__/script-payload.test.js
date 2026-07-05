// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import Parse from '../lib/parse.js'
import ScriptPayload from '../lib/script-payload.js'

const NOTE_ID = '66aabbccddeeff0011223344'
const NOTE_URL = `https://www.xiaohongshu.com/explore/${NOTE_ID}?xsec_token=abc`

describe('lib/script-payload.js — 口播稿视频上送限制', () => {
  it('图文笔记即使混入杂散 video_url 也不允许上送', () => {
    const payload = Parse.parseNoteFromHtml(
      `
        <div class="note-detail-container">
          <div class="note-content">
            <div class="title">图文案例</div>
            <div class="note-text"><span>这是一篇图文笔记</span></div>
          </div>
          <div class="swiper-slide" data-index="0">
            <img src="https://sns-img.xhscdn.com/cover.jpg" />
          </div>
        </div>
      `,
      null,
      NOTE_URL,
      { videoUrl: 'https://sns-video.xhscdn.com/stream/other-note.mp4' }
    )

    const result = ScriptPayload.validateForScriptUpload(payload)

    expect(payload.note_type).toBe('normal')
    expect(payload.video_url).toBe('')
    expect(result).toEqual({ ok: false, error: '当前只支持视频笔记' })
  })

  it('视频笔记必须带 video_url 才允许上送', () => {
    const payload = Parse.parseNoteFromHtml(
      `
        <div class="note-detail-container">
          <div class="media-container"><video src="blob:https://www.xiaohongshu.com/local"></video></div>
          <div class="note-content">
            <div class="title">视频案例</div>
            <div class="note-text"><span>这是一条口播视频</span></div>
          </div>
        </div>
      `,
      {
        note: {
          currentNoteId: NOTE_ID,
          noteDetailMap: {
            [NOTE_ID]: {
              note: {
                type: 'video',
                video: {
                  media: {
                    stream: {
                      h264: [
                        {
                          master_url:
                            'https://sns-video.xhscdn.com/stream/script-video.mp4?sign=ok'
                        }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      },
      NOTE_URL
    )

    const result = ScriptPayload.validateForScriptUpload(payload)

    expect(payload.note_type).toBe('video')
    expect(payload.video_url).toBe('https://sns-video.xhscdn.com/stream/script-video.mp4?sign=ok')
    expect(result).toEqual({ ok: true })
  })
})
