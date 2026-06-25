<!--
  XhsNoteDrawer — 选题库笔记详情（居中弹窗）

  顺序对齐小红书阅读习惯：图片 → 标题(可点击跳原帖) → 作者(可点击跳主页) → 正文
  → 视频转写 → 数据(赞/藏/评，带图标，靠右) → 标签 → 评论(含回复) → 时间。
  数据由父组件通过 :note 传入；loading 态由 :loading 控制。
-->
<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { X, ExternalLink, ChevronLeft, ChevronRight, Heart, Star, MessageCircle } from 'lucide-vue-next'
import { formatDateTime, formatXhsPublishAt } from '@/utils/datetime'
import type { NoteItem } from '@/api/xhs'

function isHttpUrl(u?: string): boolean {
  return !!u && (u.startsWith('https://') || u.startsWith('http://'))
}

// 小红书视频直链多为 http://，prod(https) 内嵌播放会被混合内容拦 → 统一升 https(CDN 同时支持)。
function httpsUrl(u?: string): string {
  return (u || '').replace(/^http:\/\//i, 'https://')
}

interface Props {
  modelValue: boolean
  note: NoteItem | null
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function close() {
  emit('update:modelValue', false)
}

// 图片：优先全部图片，回退封面。
const galleryImages = computed<string[]>(() => {
  const n = props.note
  if (!n) return []
  if (n.images && n.images.length) return n.images
  return n.cover_url ? [n.cover_url] : []
})

// 左右滑动 + 当前页指示
const strip = ref<HTMLElement | null>(null)
const currentPage = ref(0)
function scrollStrip(dir: number) {
  const el = strip.value
  if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' })
}
function onStripScroll() {
  const el = strip.value
  if (el && el.clientWidth) currentPage.value = Math.round(el.scrollLeft / el.clientWidth)
}

// 看大图：支持左右翻页 + 键盘 ←/→/Esc
const zoomOpen = ref(false)
const zoomIndex = ref(0)
function openZoom(i: number) {
  zoomIndex.value = i
  zoomOpen.value = true
}
function closeZoom() {
  zoomOpen.value = false
}
function zoomPrev() {
  if (zoomIndex.value > 0) zoomIndex.value--
}
function zoomNext() {
  if (zoomIndex.value < galleryImages.value.length - 1) zoomIndex.value++
}
function onZoomKey(e: KeyboardEvent) {
  if (!zoomOpen.value) return
  if (e.key === 'ArrowLeft') zoomPrev()
  else if (e.key === 'ArrowRight') zoomNext()
  else if (e.key === 'Escape') closeZoom()
}
watch(zoomOpen, (open) => {
  if (open) window.addEventListener('keydown', onZoomKey)
  else window.removeEventListener('keydown', onZoomKey)
})
watch(
  () => props.note,
  () => {
    currentPage.value = 0
  }
)
onBeforeUnmount(() => window.removeEventListener('keydown', onZoomKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="modal-overlay" @click.self="close">
        <Transition name="modal-pop">
          <div v-if="modelValue" class="modal-card" role="dialog" aria-modal="true">
            <header class="modal__header">
              <h2 class="modal__title">笔记详情</h2>
              <button class="modal__close" aria-label="关闭" @click="close">
                <X :size="20" />
              </button>
            </header>

            <!-- loading 态 -->
            <div v-if="loading" class="modal__body">
              <div v-for="i in 5" :key="i" class="skeleton-line" />
            </div>

            <!-- empty 态 -->
            <div v-else-if="!note" class="modal__body modal__empty">
              <p>未能加载笔记详情</p>
            </div>

            <!-- success 态 -->
            <div v-else class="modal__body">
              <!-- ① 视频笔记：banner 内嵌播放器(全屏/进度/音量由原生 controls 提供) -->
              <div v-if="note.note_type === 'video' && isHttpUrl(note.video_url)" class="gallery">
                <video
                  class="gallery__video"
                  :src="httpsUrl(note.video_url)"
                  controls
                  playsinline
                  preload="metadata"
                  referrerpolicy="no-referrer"
                ></video>
              </div>

              <!-- 图文笔记：图片左右滑动 + 点击看大图 -->
              <div v-else-if="galleryImages.length" class="gallery">
                <button
                  v-if="galleryImages.length > 1"
                  class="gallery__nav gallery__nav--prev"
                  aria-label="上一张"
                  @click="scrollStrip(-1)"
                >
                  <ChevronLeft :size="20" />
                </button>
                <div ref="strip" class="gallery__strip" @scroll="onStripScroll">
                  <img
                    v-for="(img, gi) in galleryImages"
                    :key="gi"
                    :src="img"
                    :alt="note.title"
                    class="gallery__img"
                    referrerpolicy="no-referrer"
                    @click="openZoom(gi)"
                  />
                </div>
                <button
                  v-if="galleryImages.length > 1"
                  class="gallery__nav gallery__nav--next"
                  aria-label="下一张"
                  @click="scrollStrip(1)"
                >
                  <ChevronRight :size="20" />
                </button>
                <span v-if="galleryImages.length > 1" class="gallery__counter">
                  {{ currentPage + 1 }} / {{ galleryImages.length }}
                </span>
              </div>

              <!-- 数据（赞/藏/评，带图标，靠右；图片与标题之间）-->
              <div class="stats-bar">
                <span class="stat-icon"><Heart :size="19" class="ic ic--like" /> {{ note.like_count }}</span>
                <span class="stat-icon"><Star :size="19" class="ic ic--collect" /> {{ note.collect_count }}</span>
                <span class="stat-icon"><MessageCircle :size="19" class="ic ic--comment" /> {{ note.comment_count }}</span>
              </div>

              <!-- ② 标题（可点击跳原帖）-->
              <a
                v-if="isHttpUrl(note.note_url)"
                :href="note.note_url"
                target="_blank"
                rel="noopener noreferrer"
                class="note-title note-title--link"
              >
                {{ note.title || '（无标题）' }}
              </a>
              <h3 v-else class="note-title">{{ note.title || '（无标题）' }}</h3>

              <!-- ③ 作者（可点击跳主页）-->
              <div class="author-row">
                <a
                  v-if="isHttpUrl(note.author_link)"
                  :href="note.author_link"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="author-row__name"
                >
                  {{ note.author_name || '未知作者' }}
                  <ExternalLink :size="13" />
                </a>
                <span v-else class="author-row__name author-row__name--plain">
                  {{ note.author_name || '未知作者' }}
                </span>
              </div>

              <!-- ④ 正文 -->
              <p v-if="note.content" class="note-content">{{ note.content }}</p>

              <!-- 视频转写（视频笔记）-->
              <section v-if="note.note_type === 'video'" class="block">
                <h4 class="block__title">视频转写</h4>
                <p v-if="note.video_transcript" class="note-content">{{ note.video_transcript }}</p>
                <p v-else-if="note.enrich_status === 'enriching'" class="muted">
                  逐字稿转写中，请稍候…（视频越长越久，可稍后刷新查看）
                </p>
                <p v-else-if="note.enrich_status === 'insufficient_credits'" class="muted">积分不足，未转写</p>
                <p v-else-if="note.enrich_status === 'partial'" class="muted">转写未完成（视频直链可能已失效）</p>
                <p v-else-if="note.enrich_status === 'failed'" class="muted">转写失败</p>
                <p v-else-if="!isHttpUrl(note.video_url)" class="muted">未采到视频直链，无法转写</p>
                <p v-else class="muted">暂无转写文本</p>
              </section>

              <!-- ⑥ 标签 -->
              <div v-if="note.tags && note.tags.length" class="tags">
                <span v-for="t in note.tags" :key="t" class="tag">#{{ t }}</span>
              </div>

              <!-- ⑦ 评论（含回复）-->
              <section v-if="note.comments && note.comments.length" class="block">
                <h4 class="block__title">评论（{{ note.comments.length }}）</h4>
                <ul class="comments">
                  <li v-for="(c, i) in note.comments" :key="`${c.author}-${i}`" class="comment">
                    <div class="comment__head">
                      <span class="comment__author">{{ c.author }}</span>
                    </div>
                    <p class="comment__text">{{ c.text }}</p>
                    <ul v-if="c.replies && c.replies.length" class="comment-replies">
                      <li
                        v-for="(r, j) in c.replies"
                        :key="`r-${i}-${j}`"
                        class="comment comment--reply"
                      >
                        <div class="comment__head">
                          <span class="comment__author">{{ r.author }}</span>
                        </div>
                        <p class="comment__text">{{ r.text }}</p>
                      </li>
                    </ul>
                  </li>
                </ul>
              </section>

              <!-- ⑧ 时间 -->
              <div class="timestamps">
                <div><span>发布时间</span>{{ formatXhsPublishAt(note.published_at) }}</div>
                <div><span>采集时间</span>{{ formatDateTime(note.collected_at) }}</div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

    <Transition name="modal-fade">
      <div v-if="zoomOpen" class="zoom-overlay" @click.self="closeZoom">
        <button class="zoom-close" aria-label="关闭" @click="closeZoom"><X :size="24" /></button>
        <div class="zoom-stage" @click.self="closeZoom">
          <button
            v-if="galleryImages.length > 1"
            class="zoom-nav"
            :disabled="zoomIndex === 0"
            aria-label="上一张"
            @click="zoomPrev"
          ><ChevronLeft :size="28" /></button>
          <img :src="galleryImages[zoomIndex]" alt="" class="zoom-img" referrerpolicy="no-referrer" />
          <button
            v-if="galleryImages.length > 1"
            class="zoom-nav"
            :disabled="zoomIndex === galleryImages.length - 1"
            aria-label="下一张"
            @click="zoomNext"
          ><ChevronRight :size="28" /></button>
        </div>
        <div v-if="galleryImages.length > 1" class="zoom-counter">{{ zoomIndex + 1 }} / {{ galleryImages.length }}</div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.modal-card {
  width: 720px;
  max-width: 94vw;
  max-height: 88vh;
  background: var(--surface, #fff);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid rgba(169, 180, 185, 0.18);
  flex-shrink: 0;
}

.modal__title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text, #1a1d26);
}

.modal__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-muted, #6b7085);
  transition: background 0.15s;
}

.modal__close:hover {
  background: rgba(169, 180, 185, 0.14);
}

.modal__body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.modal__empty {
  text-align: center;
  color: var(--text-muted, #6b7085);
  padding-top: 60px;
}

.skeleton-line {
  height: 16px;
  margin-bottom: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, #f0f1f5 25%, #e4e6ee 50%, #f0f1f5 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ① 图片轮播 */
.gallery {
  position: relative;
  margin-bottom: 18px;
}

.gallery__video {
  width: 100%;
  max-height: 60vh;
  border-radius: 12px;
  background: #000;
  display: block;
}

.gallery__strip {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: thin;
  border-radius: 12px;
}

.gallery__img {
  flex: 0 0 auto;
  width: 100%;
  max-width: 100%;
  height: 360px;
  object-fit: contain;
  background: #f6f7f9;
  border-radius: 12px;
  scroll-snap-align: center;
  cursor: zoom-in;
}

.gallery__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 2;
  opacity: 0;
  transition: opacity 0.18s, background 0.15s;
}

.gallery:hover .gallery__nav {
  opacity: 1;
}

.gallery__nav:hover {
  background: rgba(0, 0, 0, 0.65);
}

.gallery__nav--prev { left: 8px; }
.gallery__nav--next { right: 8px; }

/* ② 标题 */
.note-title {
  display: block;
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--text, #1a1d26);
  text-decoration: none;
}

.note-title--link {
  color: var(--primary, #10b981);
  cursor: pointer;
  transition: opacity 0.15s;
}

.note-title--link:hover {
  text-decoration: underline;
  opacity: 0.85;
}

/* ③ 作者 */
.author-row {
  margin-bottom: 14px;
}

.author-row__name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  font-size: 14px;
  color: var(--primary, #10b981);
  text-decoration: none;
}

.author-row__name:hover {
  text-decoration: underline;
}

.author-row__name--plain {
  color: var(--text, #1a1d26);
}

/* ④ 正文 */
.note-content {
  margin: 0 0 16px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text, #1a1d26);
  white-space: pre-wrap;
}

.block {
  margin-bottom: 22px;
}

.block__title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted, #6b7085);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.meta-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--primary, #10b981);
  text-decoration: none;
}

.meta-link:hover {
  text-decoration: underline;
}

.muted {
  font-size: 13px;
  color: var(--text-muted, #9ea1b1);
  margin: 0;
}

/* ⑤ 数据条（图标 + 数字，靠右）*/
.stats-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 24px;
  margin: 0 0 14px;
}

.stat-icon {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 17px;
  font-weight: 600;
  color: var(--text, #1a1d26);
}

.ic {
  flex-shrink: 0;
}

.ic--like {
  color: #ff2442;
  fill: #ff2442;
}

.ic--collect {
  color: #f5a623;
  fill: #f5a623;
}

.ic--comment {
  color: #8b93a7;
}

/* ⑥ 标签 */
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 22px;
}

.tag {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #4b5563;
}

/* ⑦ 评论 */
.comments {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.comment {
  background: #f6f7f9;
  border-radius: 10px;
  padding: 10px 12px;
}

.comment__head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.comment__author {
  font-size: 13px;
  font-weight: 600;
  color: var(--text, #1a1d26);
}

.comment-replies {
  list-style: none;
  margin: 8px 0 0;
  padding: 0 0 0 14px;
  border-left: 2px solid var(--border, #e5e7eb);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.comment--reply {
  opacity: 0.95;
  background: #eef0f3;
}

.comment__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary, #4b5563);
}

/* ⑧ 时间 */
.timestamps {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--text, #1a1d26);
}

.timestamps span {
  display: inline-block;
  width: 80px;
  color: var(--text-muted, #6b7085);
}


.gallery__counter {
  position: absolute;
  top: 10px;
  right: 12px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  z-index: 2;
}

/* 看大图浮层（支持翻页）*/
.zoom-overlay {
  position: fixed;
  inset: 0;
  z-index: 20000;
  background: rgba(0, 0, 0, 0.86);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.zoom-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  max-width: 94vw;
}

.zoom-img {
  max-width: 76vw;
  max-height: 86vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.zoom-close {
  position: absolute;
  top: 24px;
  right: 24px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s;
}

.zoom-close:hover {
  background: rgba(255, 255, 255, 0.32);
}

.zoom-nav {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s;
}

.zoom-nav:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.34);
}

.zoom-nav:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.zoom-counter {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  padding: 5px 14px;
  border-radius: 999px;
}

/* transitions */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.22s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-pop-enter-active {
  transition: transform 0.26s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.26s ease;
}

.modal-pop-leave-active {
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.modal-pop-enter-from,
.modal-pop-leave-to {
  transform: scale(0.94);
  opacity: 0;
}
</style>
