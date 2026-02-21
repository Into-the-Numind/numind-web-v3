<template>
  <MainLayout>
    <div class="workspace-section">
      <div class="workspace-section-title">已上线</div>
      <div class="cards-grid">
        <button
          v-for="workflow in onlineWorkflows"
          :key="workflow.key"
          type="button"
          class="card"
          :class="{ loading: launchingWorkflowKey === workflow.key }"
          :disabled="launchingWorkflowKey === workflow.key"
          @click="handleWorkflowClick(workflow)"
        >
          <svg class="workflow-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="6" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.5" fill="none" />
            <path
              d="M14 11H18M18 11C18 13.2091 19.7909 15 22 15C24.2091 15 26 13.2091 26 11C26 8.79086 24.2091 7 22 7C19.7909 7 18 8.79086 18 11Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
            <path d="M22 11H26" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <circle cx="7" cy="25" r="3" stroke="currentColor" stroke-width="1.5" fill="none" />
            <path d="M10 25H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <rect x="14" y="22" width="10" height="6" rx="1" stroke="currentColor" stroke-width="1.5" fill="none" />
          </svg>
          <div class="card-title">{{ workflow.title }}</div>
          <div class="card-subtitle">{{ workflow.subtitle }}</div>
        </button>
      </div>
    </div>

    <div class="workspace-section">
      <div class="workspace-section-title">本月上线</div>
      <div class="cards-grid">
        <div v-for="workflow in comingSoonWorkflows" :key="workflow.title" class="card disabled">
          <svg class="workflow-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="6" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.5" fill="none" />
            <path
              d="M14 11H18M18 11C18 13.2091 19.7909 15 22 15C24.2091 15 26 13.2091 26 11C26 8.79086 24.2091 7 22 7C19.7909 7 18 8.79086 18 11Z"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
            <path d="M22 11H26" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <circle cx="7" cy="25" r="3" stroke="currentColor" stroke-width="1.5" fill="none" />
            <path d="M10 25H14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <rect x="14" y="22" width="10" height="6" rx="1" stroke="currentColor" stroke-width="1.5" fill="none" />
          </svg>
          <div class="card-title">{{ workflow.title }}</div>
          <div class="card-subtitle">{{ workflow.subtitle }}</div>
        </div>
      </div>
    </div>
  </MainLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import request from '@/api/request'
import MainLayout from '@/components/layout/MainLayout.vue'

interface SopTemplate {
  ID?: number
  id?: number
  Id?: number
  name?: string
  description?: string
}

interface OnlineWorkflow {
  key: string
  type: 'agent' | 'sop'
  title: string
  subtitle: string
  templateId?: number
}

const router = useRouter()

const templateWorkflows = ref<OnlineWorkflow[]>([])
const launchingWorkflowKey = ref<string | null>(null)

const salesWorkflow: OnlineWorkflow = {
  key: 'agent-sales',
  type: 'agent',
  title: '销售智能体',
  subtitle: 'AI驱动的智能销售助手，支持客户管理和多风格回复'
}

const onlineWorkflows = computed<OnlineWorkflow[]>(() => [salesWorkflow, ...templateWorkflows.value])

const getTemplateId = (template: SopTemplate): number | null => {
  const rawId = template.ID ?? template.id ?? template.Id
  const numericId = Number(rawId)
  if (!Number.isFinite(numericId) || numericId <= 0) {
    return null
  }
  return numericId
}

const checkTemplatePermission = async (templateId: number): Promise<boolean> => {
  try {
    const res = await request.get(`/v1/sop/templates/${templateId}/check-permission`)
    const permission = (res as any)?.data?.has_permission
    return permission === true
  } catch (error) {
    console.error(`检查模板 ${templateId} 权限失败:`, error)
    return false
  }
}

const fetchTemplates = async () => {
  try {
    const res = await request.get('/v1/sop/templates')
    const payload = (res as any)?.data
    const templates: SopTemplate[] = Array.isArray(payload?.templates)
      ? payload.templates
      : Array.isArray(payload)
        ? payload
        : []

    const workflows: OnlineWorkflow[] = []
    for (const template of templates) {
      const templateId = getTemplateId(template)
      if (!templateId) {
        continue
      }

      workflows.push({
        key: `sop-${templateId}`,
        type: 'sop',
        title: template.name || '未命名SOP',
        subtitle: template.description || '',
        templateId
      })
    }

    templateWorkflows.value = workflows
  } catch (error) {
    console.error('获取SOP模板失败:', error)
    templateWorkflows.value = []
  }
}

const handleWorkflowClick = async (workflow: OnlineWorkflow) => {
  if (launchingWorkflowKey.value) {
    return
  }

  launchingWorkflowKey.value = workflow.key

  try {
    if (workflow.type === 'agent') {
      await router.push('/sales')
      return
    }

    if (!workflow.templateId) {
      return
    }

    const hasPermission = await checkTemplatePermission(workflow.templateId)
    if (!hasPermission) {
      window.alert('未开通该 SOP 的运行权限，请联系管理员')
      return
    }

    await router.push({
      path: '/sop/run',
      query: { templateId: String(workflow.templateId) }
    })
  } finally {
    launchingWorkflowKey.value = null
  }
}

onMounted(() => {
  void fetchTemplates()
})

const comingSoonWorkflows = [
  {
    title: 'AI生成剪辑脚本',
    subtitle: '一键生成脚本，视频剪辑快人一步'
  },
  {
    title: 'AI销售成交指导',
    subtitle: '专业话术引导，搞定最终成交'
  },
  {
    title: 'AI朋友圈：晒学员战绩',
    subtitle: '花式晒好评，用口碑刺激成交'
  },
  {
    title: 'AI文稿创作：营销选题口播稿',
    subtitle: '打造置顶广告牌，精准捕捞成交'
  },
  {
    title: 'AI文稿创作：人设选题口播稿',
    subtitle: '用经历引共鸣，吸引同频客户'
  },
  {
    title: 'AI文稿创作：案例选题口播稿',
    subtitle: '拆解成功案例，让客户看见你的专业'
  },
  {
    title: 'AI找选题',
    subtitle: '挖掘跨行爆款，直接对标拿来即用'
  },
  {
    title: 'AI生成图文笔记',
    subtitle: '告别制作痛苦，一键生成获客图文'
  },
  {
    title: 'AI私域发售全案策划',
    subtitle: '全套发售SOP，引爆批量收钱'
  }
]
</script>

<style scoped>
.workspace-section {
  margin-bottom: 40px;
}

.workspace-section-title {
  font-family: var(--font-sans);
  font-size: 20px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 20px;
  max-width: 1600px;
  margin-left: auto;
  margin-right: auto;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 40px;
  max-width: 1600px;
  margin: 0 auto;
  justify-items: center;
}

.card {
  appearance: none;
  background-color: var(--surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  padding: 32px 24px;
  box-shadow: var(--shadow-card);
  position: relative;
  transition: all 0.25s ease;
  cursor: pointer;
  text-decoration: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  width: 100%;
  text-align: center;
  font-family: var(--font-sans);
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  background-color: var(--accent-soft);
  border-color: var(--accent);
}

.card.loading {
  opacity: 0.75;
  pointer-events: none;
}

.card.disabled {
  cursor: not-allowed;
  opacity: 0.7;
  pointer-events: none;
}

.card.disabled:hover {
  transform: none;
  box-shadow: var(--shadow-card);
  background-color: var(--surface);
  border-color: var(--border-light);
}

.workflow-icon {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  opacity: 0.6;
  color: hsl(158, 64%, 70%);
  transition: opacity 0.2s ease, color 0.2s ease;
}

.card:hover .workflow-icon {
  opacity: 0.9;
  color: hsl(158, 64%, 50%);
}

.card-title {
  font-family: var(--font-sans);
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  text-align: center;
  margin-bottom: 8px;
}

.card-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: center;
}

.card-meta {
  display: none;
}

@media (max-width: 1400px) {
  .cards-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 1024px) {
  .cards-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 24px;
  }
}

@media (max-width: 768px) {
  .cards-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
</style>
