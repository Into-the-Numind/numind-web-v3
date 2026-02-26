<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import { useSalesStore } from '@/stores/sales'
import type { KbSelection } from '@/api/sales'

const store = useSalesStore()

const KB_CATEGORIES: (keyof KbSelection)[] = ['product', 'cases', 'faq', 'opinion']
interface TagItem {
  type: 'doc' | 'track'
  id: number
  name: string
  category: keyof KbSelection
}

const tags = computed<TagItem[]>(() => {
  const result: TagItem[] = []

  // Collect document tags by category
  for (const cat of KB_CATEGORIES) {
    const docIds = store.kbSelection[cat] || []
    for (const docId of docIds) {
      const doc = store.availableDocuments.find((d) => d.id === docId)
      result.push({
        type: 'doc',
        id: docId,
        name: doc ? doc.name : `文档 #${docId}`,
        category: cat
      })
    }
  }

  // Collect opinion track tags
  for (const trackId of store.opinionTrackSelection) {
    const track = store.availableOpinionTracks.find((t) => t.id === trackId)
    result.push({
      type: 'track',
      id: trackId,
      name: track ? track.name : `赛道 #${trackId}`,
      category: 'opinion'
    })
  }

  return result
})

function removeTag(tag: TagItem) {
  if (tag.type === 'doc') {
    store.removeSelectedKb(tag.id)
  } else {
    store.removeSelectedTrack(tag.id)
  }
}
</script>

<template>
  <div v-if="tags.length > 0" class="kb-tag-strip">
    <div
      v-for="tag in tags"
      :key="`${tag.type}-${tag.id}`"
      class="kb-tag"
      :class="tag.category"
      :title="tag.name"
    >
      <span class="kb-tag-name">{{ tag.name }}</span>
      <div class="kb-tag-remove" title="移除" @click="removeTag(tag)">
        <X :size="12" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb-tag-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0;
}

.kb-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid;
  transition: all 0.2s;
  max-width: 200px;
}

.kb-tag-name {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-tag-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
  opacity: 0.6;
  flex-shrink: 0;
}

.kb-tag-remove:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.1);
}

/* Category colors */
.kb-tag.product {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
  color: #1d4ed8;
}

.kb-tag.cases {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
  color: #047857;
}

.kb-tag.faq {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.3);
  color: #b45309;
}

.kb-tag.opinion {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.3);
  color: #6d28d9;
}
</style>
