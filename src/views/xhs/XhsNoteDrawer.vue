<!--
  XhsNoteDrawer — 选题库笔记详情抽屉（T8）

  从右侧滑入，展示一条笔记的全部源字段 + 6 个 AI 分析字段 + 评论列表。
  数据由父组件通过 :note 传入（父组件负责调 getNoteDetail 拉详情）。
  loading 态由 :loading 控制（拉详情期间显示骨架）。
-->
<script setup lang="ts">
import { X, ExternalLink } from 'lucide-vue-next'
import { formatDateTime } from '@/utils/datetime'
import type { NoteItem } from '@/api/xhs'

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

</script>

<template>
  <Teleport to="body">
    <Transition name="drawer-fade">
      <div v-if="modelValue" class="drawer-overlay" @click.self="close">
        <Transition name="drawer-slide">
          <aside v-if="modelValue" class="drawer" role="dialog" aria-modal="true">
            <header class="drawer__header">
              <h2 class="drawer__title">笔记详情</h2>
              <button class="drawer__close" aria-label="关闭" @click="close">
                <X :size="20" />
              </button>
            </header>

            <!-- loading 态：骨架 -->
            <div v-if="loading" class="drawer__body">
              <div v-for="i in 5" :key="i" class="skeleton-line" />
            </div>

            <!-- empty 态（详情拉取失败/无数据） -->
            <div v-else-if="!note" class="drawer__body drawer__empty">
              <p>未能加载笔记详情</p>
            </div>

            <!-- success 态 -->
            <div v-else class="drawer__body">
              <!-- 封面 -->
              <img
                v-if="note.cover_url"
                :src="note.cover_url"
                :alt="note.title"
                class="drawer__cover"
              />

              <h3 class="note-title">{{ note.title || '（无标题）' }}</h3>

              <!-- 元信息行 -->
              <div class="meta-row">
                <span class="meta-tag" :class="`meta-tag--${note.note_type}`">
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

              <!-- 互动数据 -->
              <div class="stats">
                <div class="stat">
                  <span>赞</span><strong>{{ note.like_count }}</strong>
                </div>
                <div class="stat">
                  <span>藏</span><strong>{{ note.collect_count }}</strong>
                </div>
                <div class="stat">
                  <span>评</span><strong>{{ note.comment_count }}</strong>
                </div>
              </div>

              <!-- 正文 -->
              <section v-if="note.content" class="block">
                <h4 class="block__title">正文</h4>
                <p class="note-content">{{ note.content }}</p>
              </section>

              <!-- 标签 -->
              <section v-if="note.tags && note.tags.length" class="block">
                <h4 class="block__title">标签</h4>
                <div class="tags">
                  <span v-for="t in note.tags" :key="t" class="tag">#{{ t }}</span>
                </div>
              </section>

              <!-- 视频转写 -->
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
                <p v-if="note.video_transcript" class="note-content">
                  {{ note.video_transcript }}
                </p>
                <p v-else class="ai-empty">暂无转写文本</p>
              </section>

              <!-- 作者 -->
              <section class="block">
                <h4 class="block__title">作者</h4>
                <div class="author">
                  <a
                    v-if="isHttpUrl(note.author_link)"
                    :href="note.author_link"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="author__name"
                  >
                    {{ note.author_name || '未知作者' }}
                  </a>
                  <span v-else class="author__name">{{ note.author_name || '未知作者' }}</span>
                </div>
              </section>

              <!-- 评论 -->
              <section v-if="note.comments && note.comments.length" class="block">
                <h4 class="block__title">评论（{{ note.comments.length }}）</h4>
                <ul class="comments">
                  <li v-for="(c, i) in note.comments" :key="`${c.author}-${i}`" class="comment">
                    <div class="comment__head">
                      <span class="comment__author">{{ c.author }}</span>
                      <span class="comment__likes">赞 {{ c.likes }}</span>
                    </div>
                    <p class="comment__text">{{ c.text }}</p>
                    <ul v-if="c.replies && c.replies.length" class="comment-replies">
                      <li v-for="(r, j) in c.replies" :key="`r-${i}-${j}`" class="comment comment--reply">
                        <div class="comment__head">
                          <span class="comment__author">{{ r.author }}</span>
                          <span class="comment__likes">赞 {{ r.likes }}</span>
                        </div>
                        <p class="comment__text">{{ r.text }}</p>
                      </li>
                    </ul>
                  </li>
                </ul>
              </section>

              <!-- 时间戳 -->
              <section class="block timestamps">
                <div><span>发布时间</span>{{ formatDateTime(note.published_at) }}</div>
                <div><span>采集时间</span>{{ formatDateTime(note.collected_at) }}</div>
                <div><span>抓取时间</span>{{ formatDateTime(note.crawled_at) }}</div>
              </section>
            </div>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  z-index: 9000;
  display: flex;
  justify-content: flex-end;
}

.drawer {
  width: 520px;
  max-width: 92vw;
  height: 100%;
  background: var(--surface, #fff);
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
}

.drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(169, 180, 185, 0.18);
  flex-shrink: 0;
}

.drawer__title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text, #1a1d26);
}

.drawer__close {
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

.drawer__close:hover {
  background: rgba(169, 180, 185, 0.14);
}

.drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.drawer__empty {
  text-align: center;
  color: var(--text-muted, #6b7085);
  padding-top: 80px;
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
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.drawer__cover {
  width: 100%;
  max-height: 280px;
  object-fit: cover;
  border-radius: 12px;
  margin-bottom: 16px;
}

.note-title {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--text, #1a1d26);
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.meta-tag {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  font-weight: 600;
}

.meta-tag--video {
  background: #ede9fe;
  color: #6d28d9;
}

.meta-tag--normal {
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

.stats {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

.stat {
  flex: 1;
  background: #f6f7f9;
  border-radius: 10px;
  padding: 10px 8px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat span {
  font-size: 12px;
  color: var(--text-muted, #6b7085);
}

.stat strong {
  font-size: 16px;
  color: var(--text, #1a1d26);
}

.block {
  margin-bottom: 24px;
}

.block__title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-muted, #6b7085);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ai-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ai-item dt {
  font-size: 12px;
  font-weight: 600;
  color: #047857;
  margin-bottom: 3px;
}

.ai-item dd {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text, #1a1d26);
}

.ai-empty {
  font-size: 13px;
  color: var(--text-muted, #9ea1b1);
  margin: 0;
}

.note-content {
  margin: 0;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text, #1a1d26);
  white-space: pre-wrap;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  background: #f3f4f6;
  color: #4b5563;
}

.author {
  display: flex;
  align-items: center;
  gap: 12px;
}

.author__name {
  font-weight: 600;
  font-size: 14px;
  color: var(--primary, #10b981);
  text-decoration: none;
}

.author__followers {
  font-size: 13px;
  color: var(--text-muted, #6b7085);
}

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

.comment__likes {
  font-size: 12px;
  color: var(--text-muted, #9ea1b1);
}

.comment-replies {
  list-style: none;
  margin: 6px 0 0;
  padding: 0 0 0 14px;
  border-left: 2px solid var(--border, #eee);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.comment--reply {
  opacity: 0.92;
}
.comment__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary, #4b5563);
}

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
.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.25s ease;
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  transform: translateX(100%);
}
</style>
