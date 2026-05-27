<!--
  SkillTemplateBrowse — 官方预置技能模板市场
  极奢毛玻璃拟态网格卡片展示 + 一键克隆导入资产
-->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Sparkles, ArrowLeft, Terminal, CheckCircle2 } from 'lucide-vue-next'
import { useSkillStore } from '@/stores/skill'
import { useNotificationsStore } from '@/stores/notifications'
import { listSkillTemplates } from '@/api/skill'
import AppButton from '@/components/common/AppButton.vue'

interface TemplateItem {
  id: number
  name: string
  description: string
  icon_url?: string
  category_tags?: string[] | string
  questionnaire_answers?: Record<string, any>
  default_tool_flags?: Record<string, any>
  display_order?: number
}

const router = useRouter()
const skillStore = useSkillStore()
const notifications = useNotificationsStore()

const templates = ref<TemplateItem[]>([])
const loading = ref(false)
const importingId = ref<number | null>(null)
const error = ref('')

onMounted(async () => {
  loading.value = true
  error.value = ''
  try {
    const res = await listSkillTemplates()
    // 归一化 category_tags 字段
    templates.value = (res.list || []).map((item) => {
      let tags: string[] = []
      if (item.category_tags) {
        if (typeof item.category_tags === 'string') {
          try {
            tags = JSON.parse(item.category_tags)
          } catch {
            tags = []
          }
        } else if (Array.isArray(item.category_tags)) {
          tags = item.category_tags
        }
      }
      
      let tools: Record<string, any> = {}
      if (item.default_tool_flags) {
        if (typeof item.default_tool_flags === 'string') {
          try {
            tools = JSON.parse(item.default_tool_flags)
          } catch {
            tools = {}
          }
        } else {
          tools = item.default_tool_flags
        }
      }

      return {
        ...item,
        category_tags: tags,
        default_tool_flags: tools
      }
    })
  } catch (e) {
    error.value = (e as Error).message || '加载模板库失败'
    notifications.error(error.value)
  } finally {
    loading.value = false
  }
})

// 一键导入技能
async function handleImport(tpl: TemplateItem) {
  if (importingId.value !== null) return
  importingId.value = tpl.id
  try {
    await skillStore.importTemplate(tpl.id)
    notifications.success(`🌟 导入成功！已克隆「${tpl.name}」到您的技能库`)
    setTimeout(() => {
      router.push('/config/skills')
    }, 800)
  } catch (e) {
    notifications.error((e as Error).message || '导入模板失败')
  } finally {
    importingId.value = null
  }
}

function goBack() {
  router.push('/config/skills')
}
</script>

<template>
  <div class="template-browse">
    <!-- 顶部面包屑与标题 -->
    <header class="template-browse__header">
      <div class="template-browse__title-block">
        <AppButton variant="text" size="sm" @click="goBack" class="back-btn">
          <ArrowLeft :size="16" class="mr-1" /> 返回我的技能
        </AppButton>
        <div class="title-with-badge">
          <h2>官方技能模板库</h2>
          <span class="gradient-badge">
            <Sparkles :size="12" class="mr-1" /> Preset Library
          </span>
        </div>
        <p class="subtitle">
          由 Numind 官方出品的高水平预置技能，一键即可克隆为本机构的独立技能资产并装载到 AI 智能体。
        </p>
      </div>
    </header>

    <!-- 加载中/错误展示 -->
    <div v-if="loading" class="template-browse__state">
      <div class="skeleton-grid">
        <div v-for="n in 6" :key="n" class="skeleton-card"></div>
      </div>
    </div>
    <div v-else-if="error" class="template-browse__state error">
      <span>{{ error }}</span>
      <AppButton variant="primary" @click="router.go(0)" class="mt-4">刷新重试</AppButton>
    </div>
    <div v-else-if="templates.length === 0" class="template-browse__state">
      暂无官方推荐模板
    </div>

    <!-- 模板卡片网格 -->
    <div v-else class="template-grid">
      <div v-for="tpl in templates" :key="tpl.id" class="template-card">
        <!-- 装饰渐变光晕背景 -->
        <div class="card-glow"></div>
        
        <div class="card-header">
          <div class="icon-wrapper">
            🌟
          </div>
          <div class="title-section">
            <h4>{{ tpl.name }}</h4>
            <div class="tags">
              <span v-for="tag in tpl.category_tags" :key="tag" class="tag-badge">
                {{ tag }}
              </span>
            </div>
          </div>
        </div>

        <p class="card-description">{{ tpl.description }}</p>

        <!-- 工具和配置概览 -->
        <div class="card-meta">
          <div class="meta-section">
            <span class="meta-section-title">
              <Terminal :size="12" class="mr-1" /> 预设工具
            </span>
            <div class="tools-list">
              <template v-if="tpl.default_tool_flags">
                <span
                  v-for="(val, tool) in tpl.default_tool_flags"
                  v-show="val"
                  :key="tool"
                  class="tool-tag"
                >
                  {{ tool }}
                </span>
              </template>
              <span v-else class="empty-meta">无预设工具</span>
            </div>
          </div>
        </div>

        <!-- 导入动作 -->
        <div class="card-actions">
          <AppButton
            variant="primary"
            class="import-btn"
            :loading="importingId === tpl.id"
            :disabled="importingId !== null"
            @click="handleImport(tpl)"
          >
            <template #icon>
              <CheckCircle2 v-if="importingId !== tpl.id" :size="14" />
            </template>
            {{ importingId === tpl.id ? '正在克隆导入...' : '克隆到我的技能' }}
          </AppButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-browse {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-6);
  min-height: 100vh;
}

.template-browse__header {
  border-bottom: 1px solid rgba(169, 180, 185, 0.1);
  padding-bottom: var(--space-4);
}

.template-browse__title-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.back-btn {
  align-self: flex-start;
  color: var(--text-secondary);
}

.title-with-badge {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-1);
}

.title-with-badge h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text);
  background: linear-gradient(135deg, var(--text) 0%, rgba(100, 116, 139, 0.8) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.gradient-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  background: linear-gradient(135deg, rgba(147, 51, 234, 0.1) 0%, rgba(79, 70, 229, 0.1) 100%);
  border: 1px solid rgba(147, 51, 234, 0.2);
  color: #7c3aed;
  border-radius: 14px;
  font-size: 11px;
  font-weight: 600;
}

.subtitle {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
  max-width: 700px;
  line-height: 1.6;
}

.template-browse__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12);
  color: var(--text-secondary);
}

.template-browse__state.error {
  color: var(--danger, #dc2626);
}

/* 骨架屏 */
.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-6);
  width: 100%;
}

.skeleton-card {
  height: 240px;
  background: linear-gradient(90deg, var(--surface) 25%, var(--surface-tint) 50%, var(--surface) 75%);
  background-size: 200% 100%;
  animation: loading-shimmer 1.5s infinite;
  border-radius: var(--radius-md);
  border: 1px solid rgba(169, 180, 185, 0.1);
}

@keyframes loading-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* 模板卡片网格 */
.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: var(--space-6);
}

.template-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5);
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.template-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
  border-color: rgba(147, 51, 234, 0.2);
}

.card-glow {
  position: absolute;
  top: -50px;
  right: -50px;
  width: 150px;
  height: 150px;
  background: radial-gradient(circle, rgba(147, 51, 234, 0.06) 0%, rgba(255, 255, 255, 0) 70%);
  z-index: 0;
  pointer-events: none;
  transition: all 0.3s ease;
}

.template-card:hover .card-glow {
  transform: scale(1.2);
  background: radial-gradient(circle, rgba(147, 51, 234, 0.1) 0%, rgba(255, 255, 255, 0) 70%);
}

.card-header {
  display: flex;
  gap: var(--space-3);
  z-index: 1;
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%);
  border: 1px solid rgba(168, 85, 247, 0.15);
  font-size: 1.25rem;
}

.title-section {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.title-section h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-badge {
  padding: 1px 6px;
  background: var(--surface-tint);
  border: 1px solid rgba(169, 180, 185, 0.1);
  color: var(--text-secondary);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 500;
}

.card-description {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.5;
  min-height: 48px;
  z-index: 1;
}

.card-meta {
  border-top: 1px solid rgba(169, 180, 185, 0.08);
  padding-top: var(--space-3);
  margin-top: auto;
  z-index: 1;
}

.meta-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.meta-section-title {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

.tools-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tool-tag {
  padding: 2px 6px;
  background: rgba(79, 70, 229, 0.05);
  color: #4f46e5;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
}

.empty-meta {
  font-size: 10px;
  color: var(--text-muted);
  font-style: italic;
}

.card-actions {
  z-index: 1;
  margin-top: var(--space-2);
}

.import-btn {
  width: 100%;
  justify-content: center;
  background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
  border: none;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
  transition: all 0.3s ease;
}

.import-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.35);
  filter: brightness(1.05);
}

/* 适配暗黑模式 */
@media (prefers-color-scheme: dark) {
  .template-card {
    background: rgba(20, 24, 33, 0.7);
    border-color: rgba(255, 255, 255, 0.05);
  }
  .icon-wrapper {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%);
    border-color: rgba(168, 85, 247, 0.25);
  }
}
</style>
