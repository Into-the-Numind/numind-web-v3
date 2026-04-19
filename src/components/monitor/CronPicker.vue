<template>
  <div class="cron-picker">
    <!-- Crawl type: simple dropdown -->
    <template v-if="type === 'crawl'">
      <select v-model="selectedCrawl" class="cron-select" @change="emitCrawl">
        <option v-for="opt in crawlOptions" :key="opt.cron" :value="opt.cron">
          {{ opt.label }}
        </option>
      </select>
    </template>

    <!-- Briefing type: hour + minute + frequency -->
    <template v-else>
      <div class="briefing-row">
        <select v-model="briefingHour" class="cron-select time-select" @change="emitBriefing">
          <option v-for="h in 24" :key="h - 1" :value="h - 1">
            {{ String(h - 1).padStart(2, '0') }} 时
          </option>
        </select>
        <select v-model="briefingMinute" class="cron-select time-select" @change="emitBriefing">
          <option v-for="m in minuteOptions" :key="m" :value="m">
            {{ String(m).padStart(2, '0') }} 分
          </option>
        </select>
        <select v-model="briefingFreq" class="cron-select freq-select" @change="emitBriefing">
          <option value="daily">每天</option>
          <option value="weekly">每周一</option>
        </select>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{
  modelValue: string
  type: 'crawl' | 'briefing'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// ==================== Crawl ====================
const crawlOptions = [
  { label: '每 4 小时', cron: '0 */4 * * *' },
  { label: '每 6 小时', cron: '0 */6 * * *' },
  { label: '每 8 小时', cron: '0 */8 * * *' },
  { label: '每 12 小时', cron: '0 */12 * * *' },
  { label: '每天 1 次', cron: '0 9 * * *' }
]

const selectedCrawl = ref(crawlOptions[0].cron)

function emitCrawl() {
  emit('update:modelValue', selectedCrawl.value)
}

// ==================== Briefing ====================
const minuteOptions = [0, 15, 30, 45]
const briefingHour = ref(9)
const briefingMinute = ref(0)
const briefingFreq = ref<'daily' | 'weekly'>('daily')

function emitBriefing() {
  const m = briefingMinute.value
  const h = briefingHour.value
  const cron = briefingFreq.value === 'daily' ? `${m} ${h} * * *` : `${m} ${h} * * 1`
  emit('update:modelValue', cron)
}

// ==================== Parse incoming value ====================
function parseModelValue() {
  const val = props.modelValue
  if (!val) return

  if (props.type === 'crawl') {
    const match = crawlOptions.find((o) => o.cron === val)
    if (match) {
      selectedCrawl.value = match.cron
    }
  } else {
    // Parse briefing cron: "M H * * *" or "M H * * 1"
    const parts = val.split(/\s+/)
    if (parts.length >= 5) {
      const m = parseInt(parts[0], 10)
      const h = parseInt(parts[1], 10)
      if (!isNaN(m)) briefingMinute.value = minuteOptions.includes(m) ? m : 0
      if (!isNaN(h) && h >= 0 && h <= 23) briefingHour.value = h
      briefingFreq.value = parts[4] === '1' ? 'weekly' : 'daily'
    }
  }
}

onMounted(parseModelValue)
</script>

<style scoped>
.cron-picker {
  display: inline-flex;
  align-items: center;
}

.cron-select {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--text);
  background: var(--surface);
  cursor: pointer;
  outline: none;
  transition: border-color var(--transition-fast);
}

.cron-select:focus {
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
}

.briefing-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.time-select {
  min-width: 90px;
}

.freq-select {
  min-width: 100px;
}
</style>
