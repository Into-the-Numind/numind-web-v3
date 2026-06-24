<!--
  XhsNoteDrawer — 选题库笔记详情（居中弹窗）

  居中模态展示一条笔记：数据置顶 → 作者 → 图片(左右滑动+点击看大图) → 标题正文 → 标签
  → 视频转写 → 评论(含回复) → 时间。顺序对齐小红书原版阅读习惯。
  数据由父组件通过 :note 传入；loading 态由 :loading 控制。
-->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { X, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { formatDateTime } from '@/utils/datetime'
import type { NoteItem } from '@/api/xhs'
import ImagePreviewModal from '@/components/sales/ImagePreviewModal.vue'

function isHttpUrl(u?: string): boolean {
  return !!u && (u.startsWith('https://') || u.startsWith('http://'))
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

// 左右滑动
const strip = ref<HTMLElement | null>(null)
function scrollStrip(dir: number) {
  const el = strip.value
  if (el) el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.85, 240), behavior: 'smooth' })
}

// 点击看大图
const zoomOpen = ref(false)
const zoomUrl = ref('')
function openZoom(url: string) {
  zoomUrl.value = url
  zoomOpen.value = true
}
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
              <!-- ① 数据置顶 -->
              <div class="stats">
                <div class="stat"><span>赞</span><strong>{{ note.like_count }}</strong></div>
                <div class="stat"><span>藏</span><strong>{{ note.collect_count }}</strong></div>
                <div class="stat"><span>评</span><strong>{{ note.comment_count }}</strong></div>
                <span class="type-badge" :class="`type-badge--${note.note_type}`">
                  {{ note.note_type === 'video' ? '视频' : '图文' }}
                </span>
                <a
                  v-if="isHttpUrl(note.note_url)"
                  :href="note.note_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="meta-link"
                >
                  查看原帖 <ExternalLink :size="13" />
                </a>
              </div>

              <!-- ② 作者 -->
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

              <!-- ③ 图片：左右滑动 + 点击看大图 -->
              <div v-if="galleryImages.length" class="gallery">
                <button
                  v-if="galleryImages.length > 1"
                  class="gallery__nav gallery__nav--prev"
                  aria-label="上一张"
                  @click="scrollStrip(-1)"
                >
                  <ChevronLeft :size="20" />
                </button>
                <div ref="strip" class="gallery__strip">
                  <img
                    v-for="(img, gi) in galleryImages"
                    :key="gi"
                    :src="img"
                    :alt="note.title"
                    class="gallery__img"
                    @click="openZoom(img)"
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
              </div>

              <!-- ④ 标题 + 正文 -->
              <h3 class="note-title">{{ note.title || '（无标题）' }}</h3>
              <p v-if="note.content" class="note-content">{{ note.content }}</p>

              <!-- 视频转写（视频笔记）-->
              <section v-if="note.note_type === 'video'" class="block">
                <h4 class="block__title">视频转写</h4>
                <a
                  v-if="isHttpUrl(note.video_url)"
                  :href="note.video_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="meta-link"
                >
                  查看视频 <ExternalLink :size="13" />
                </a>
                <p v-if="note.video_transcript" class="note-content">{{ note.video_transcript }}</p>
                <p v-else class="muted">暂无转写文本</p>
              </section>

              <!-- ⑤ 标签 -->
              <div v-if="note.tags && note.tags.length" class="tags">
                <span v-for="t in note.tags" :key="t" class="tag">#{{ t }}</span>
              </div>

              <!-- ⑥ 评论（含回复）-->
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

              <!-- ⑦ 时间 -->
              <div class="timestamps">
                <div><span>发布时间</span>{{ formatDateTime(note.published_at) }}</div>
                <div><span>采集时间</span>{{ formatDateTime(note.collected_at) }}</div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

    <ImagePreviewModal :open="zoomOpen" :image-url="zoomUrl" @close="zoomOpen = false" />
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

/* ① 数据置顶 */
.stats {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.stat {
  background: #f6f7f9;
  border-radius: 10px;
  padding: 8px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 64px;
}

.stat span {
  font-size: 12px;
  color: var(--text-muted, #6b7085);
}

.stat strong {
  font-size: 17px;
  color: var(--text, #1a1d26);
}

.type-badge {
  display: inline-block;
  white-space: nowrap;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
  font-weight: 600;
}

.type-badge--video {
  background: #ede9fe;
  color: #6d28d9;
}

.type-badge--normal {
  background: #dbeafe;
  color: #1d4ed8;
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

/* ② 作者 */
.author-row {
  margin-bottom: 16px;
}

.author-row__name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  font-size: 15px;
  color: var(--primary, #10b981);
  text-decoration: none;
}

.author-row__name:hover {
  text-decoration: underline;
}

.author-row__name--plain {
  color: var(--text, #1a1d26);
}

/* ③ 图片轮播 */
.gallery {
  position: relative;
  margin-bottom: 20px;
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
  transition: background 0.15s;
}

.gallery__nav:hover {
  background: rgba(0, 0, 0, 0.65);
}

.gallery__nav--prev { left: 8px; }
.gallery__nav--next { right: 8px; }

/* ④ 标题正文 */
.note-title {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--text, #1a1d26);
}

.note-content {
  margin: 0 0 20px;
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

.muted {
  font-size: 13px;
  color: var(--text-muted, #9ea1b1);
  margin: 0;
}

/* ⑤ 标签 */
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

/* ⑥ 评论 */
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

/* ⑦ 时间 */
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
