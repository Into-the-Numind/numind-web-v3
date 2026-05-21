import type {
  AgentSkill,
  AgentSkillListResponse,
  AgentRun,
  CreateRunRequest,
  CreateRunResponse,
  CancelRunResponse,
  NarrationEvent,
  NarrationState,
  SessionSnapshot,
  EstimateRequest,
  EstimateResponse,
  RecentSession,
  SupportContact,
  ExtendBudgetRequest,
  FeedbackRequest,
  UploadResponse,
  AgentRunStatus
} from '@/types/agent'

// HMR cleanup — Vite 热更新清理 mock 状态
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _runState.clear()
  })
}

// === Helper：递增时间戳 ===
let _ts = Date.now()
const nextTs = (incrementMs = 500): string => {
  _ts += incrementMs
  return new Date(_ts).toISOString()
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// === DEMO agents ===
const DEMO_AGENTS: AgentSkill[] = [
  {
    id: 1,
    name: '爆款分析师',
    description: '帮你找出笔记里哪些话题、形式、时间发布效果最好',
    emoji: '🤖',
    welcome_message:
      '你好！我是爆款分析师，可以帮你找出你的笔记里哪些话题、形式和发布时间效果最好，让你少走弯路、多出好内容。',
    conversation_starters: ['帮我分析这周的笔记', '找出上周的爆款规律', '我该发什么话题'],
    is_active: true,
    created_at: '2026-05-01T10:00:00+08:00',
    updated_at: '2026-05-20T15:30:00+08:00'
  },
  {
    id: 2,
    name: '数据复盘助手',
    description: '帮你整理本周数据，看看哪里可以改进',
    emoji: '📊',
    welcome_message: '我是数据复盘助手。上传你的数据表，我帮你做一次完整复盘。',
    conversation_starters: ['做本周复盘', '看看哪类内容数据下滑了', '对比上周表现'],
    is_active: true,
    created_at: '2026-05-01T10:00:00+08:00',
    updated_at: '2026-05-19T10:00:00+08:00'
  },
  {
    id: 3,
    name: '作业批改助手',
    description: '给你的作业提供详细点评和改进建议',
    emoji: '📝',
    welcome_message: '把你的作业贴过来，我帮你点评。',
    conversation_starters: ['批改这篇笔记', '看看我的标题', '给我打个分'],
    is_active: true,
    created_at: '2026-05-01T10:00:00+08:00',
    updated_at: '2026-05-18T10:00:00+08:00'
  },
  {
    id: 4,
    name: '学习陪伴者',
    description: '陪你梳理学习进度，遇到瓶颈时一起拆解',
    emoji: '🌱',
    welcome_message: '在学习的路上，遇到困难告诉我。',
    conversation_starters: ['梳理本周学习', '帮我拆解这个目标'],
    is_active: true,
    created_at: '2026-05-01T10:00:00+08:00',
    updated_at: '2026-05-15T10:00:00+08:00'
  }
]

// === Recent sessions mock ===
const DEMO_RECENT: RecentSession[] = [
  {
    session_id: 'mock-sess-1001',
    agent_skill_id: 1,
    agent_name: '爆款分析师',
    agent_emoji: '🤖',
    last_active_at: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    status: 'completed',
    preview_text: '帮我分析了本周 8 篇笔记'
  },
  {
    session_id: 'mock-sess-1002',
    agent_skill_id: 2,
    agent_name: '数据复盘助手',
    agent_emoji: '📊',
    last_active_at: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    status: 'completed',
    preview_text: '整理了 5 月第二周的数据复盘'
  }
]

// === Run state ===
interface RunStateEntry {
  events: NarrationEvent[]
  finalMarkdown?: string
  cursor: number
  status: AgentRunStatus
  credits_used: number
  credits_budget: number
  threshold_state: 'under_60' | 'warning_60' | 'blocked_100'
  agent_skill_id: number
  session_id: string
  created_at: string
}

const _runState = new Map<number, RunStateEntry>()

// === Fixture builders ===
function buildNarrationFixture(
  runId: number,
  req: CreateRunRequest
): { events: NarrationEvent[]; finalMarkdown: string; isLarge: boolean } {
  const text = req.input_text
  // fixture-3 rejected
  if (text.includes('权限')) {
    return {
      events: [
        evt(runId, 'tc-1', 'query_student_data', 'use', '正在查询学员数据...', '准备执行', '', ''),
        evt(
          runId,
          'tc-1',
          'query_student_data',
          'rejected',
          '这个操作需要你先确认',
          '已被拒绝',
          '',
          '权限不足'
        )
      ],
      finalMarkdown: '抱歉，这个任务需要更高权限才能完成。',
      isLarge: false
    }
  }
  // fixture-2 retry
  if (text.includes('重试')) {
    return {
      events: [
        evt(runId, 'tc-1', 'read_excel', 'use', '正在读取 Excel 文件...', '解析', '', ''),
        evt(
          runId,
          'tc-1',
          'read_excel',
          'error',
          '刚才用 Excel 解析方法没成功，换一种方式试试',
          '解析失败',
          '',
          ''
        ),
        evt(runId, 'tc-2', 'read_csv', 'use', '正在用 CSV 方式重新解析...', '解析', '', ''),
        evt(runId, 'tc-2', 'read_csv', 'result', '这次成功了，已读取你的文件内容', '已完成', '', '')
      ],
      finalMarkdown: '## 分析报告\n\n经过重试后，已成功解析文件并完成分析。',
      isLarge: false
    }
  }
  // fixture-4 budget exhaust
  if (text.includes('大任务')) {
    return {
      events: [
        evt(runId, 'tc-1', 'query_student_data', 'use', '正在查询大量历史数据...', '查询', '', ''),
        evt(
          runId,
          'tc-1',
          'query_student_data',
          'progress',
          '已处理 200/500 条',
          '处理中',
          '已处理 200/500 条',
          ''
        ),
        evt(
          runId,
          'tc-1',
          'query_student_data',
          'progress',
          '已处理 400/500 条',
          '处理中',
          '已处理 400/500 条',
          ''
        ),
        evt(
          runId,
          'tc-1',
          'query_student_data',
          'progress',
          '已处理 500/500 条',
          '处理中',
          '已处理 500/500 条',
          ''
        )
      ],
      finalMarkdown: '',
      isLarge: true
    }
  }
  // fixture-1 happy path
  return {
    events: [
      evt(
        runId,
        'tc-1',
        'query_student_activity',
        'use',
        '正在查询你过去 30 天的互动数据...',
        '查询',
        '',
        ''
      ),
      evt(
        runId,
        'tc-1',
        'query_student_activity',
        'result',
        '找到 87 条学习记录',
        '已完成',
        '',
        ''
      ),
      evt(
        runId,
        'tc-2',
        'analyze_post_timing',
        'use',
        '正在分析你的发文时间分布...',
        '分析',
        '',
        ''
      ),
      evt(
        runId,
        'tc-2',
        'analyze_post_timing',
        'result',
        '找到 3 个值得关注的规律',
        '已完成',
        '',
        ''
      ),
      evt(runId, 'tc-3', 'generate_report', 'use', '正在生成可视化报告...', '生成', '', ''),
      evt(runId, 'tc-3', 'generate_report', 'result', '报告已生成', '已完成', '', '')
    ],
    finalMarkdown:
      '## 本周笔记效果分析\n\n你过去 30 天的发文时间从晚 8 点逐渐提前到了下午 4 点，而这个时段正好是流量低谷期。\n\n**主要发现：**\n- 表现最好的是「早餐食谱」话题（平均赞藏比 12.3%）\n- 周二下午 3 点和周五晚 9 点互动最活跃\n- 短视频笔记完播率高于图文\n\n**建议：** 调整发布时间到周二/周五的黄金时段。',
    isLarge: false
  }
}

function evt(
  runId: number,
  tcId: string,
  toolName: string,
  state: NarrationState,
  message: string,
  verb: string,
  detail: string,
  reason: string
): NarrationEvent {
  return {
    run_id: runId,
    tool_call_id: tcId,
    tool_name: toolName,
    state,
    verb,
    detail,
    icon: '',
    message,
    reason,
    timestamp: nextTs(800)
  }
}

// === API mock impls ===
export const listAvailableAgents = async (): Promise<AgentSkillListResponse> => {
  await delay(200)
  return { list: DEMO_AGENTS, total: DEMO_AGENTS.length }
}

export const listRecentSessions = async (limit = 5): Promise<RecentSession[]> => {
  await delay(180)
  return DEMO_RECENT.slice(0, limit)
}

export const listAllHistorySessions = async (): Promise<RecentSession[]> => {
  await delay(220)
  return DEMO_RECENT
}

export const getSessionSnapshot = async (sessionId: string): Promise<SessionSnapshot> => {
  await delay(200)
  const recent = DEMO_RECENT.find((s) => s.session_id === sessionId)
  return {
    session_id: sessionId,
    agent_skill_id: recent?.agent_skill_id ?? 1,
    messages: [],
    compact_summary: recent?.last_active_at
      ? `上次（${new Date(recent.last_active_at).toLocaleString('zh-CN')}）：${recent.preview_text ?? ''}`
      : undefined,
    agent_run_ids: [],
    last_active_at: recent?.last_active_at ?? new Date().toISOString(),
    status: (recent?.status ?? 'completed') as
      | 'running'
      | 'completed'
      | 'failed'
      | 'cancelled'
      | 'timeout'
  }
}

export const estimateRun = async (req: EstimateRequest): Promise<EstimateResponse> => {
  await delay(150)
  const len = req.input_text.length
  const fileCount = req.attachment_meta?.length ?? 0
  const isLarge = len > 200 || fileCount > 0 || req.input_text.includes('大任务')
  return {
    min: isLarge ? 200 : 50,
    max: isLarge ? 500 : 150,
    is_large_task: isLarge
  }
}

export const createRun = async (req: CreateRunRequest): Promise<CreateRunResponse> => {
  await delay(300)
  const runId = Date.now()
  const sessionId = req.session_id ?? `mock-sess-${runId}`
  const { events, finalMarkdown, isLarge } = buildNarrationFixture(runId, req)
  _runState.set(runId, {
    events,
    finalMarkdown,
    cursor: 0,
    status: 'running',
    credits_used: 0,
    credits_budget: isLarge ? 800 : 200,
    threshold_state: 'under_60',
    agent_skill_id: req.agent_skill_id,
    session_id: sessionId,
    created_at: new Date().toISOString()
  })
  return {
    run_id: runId,
    session_id: sessionId,
    estimated_credits_min: isLarge ? 200 : 50,
    estimated_credits_max: isLarge ? 500 : 150
  }
}

export const getRun = async (runId: number): Promise<AgentRun> => {
  await delay(80)
  const state = _runState.get(runId)
  if (!state) {
    return {
      id: runId,
      session_id: `mock-sess-${runId}`,
      user_id: 0,
      agent_skill_id: 1,
      status: 'failed',
      credits_used: 0,
      credits_budget: 0,
      credits_threshold_state: 'under_60',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  }
  return {
    id: runId,
    session_id: state.session_id,
    user_id: 0,
    agent_skill_id: state.agent_skill_id,
    status: state.status,
    credits_used: state.credits_used,
    credits_budget: state.credits_budget,
    credits_threshold_state: state.threshold_state,
    created_at: state.created_at,
    updated_at: new Date().toISOString()
  }
}

export const fetchNarrationEvents = async (
  runId: number,
  sinceTs: string // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<NarrationEvent[]> => {
  await delay(150)
  const state = _runState.get(runId)
  if (!state) return []
  if (state.status !== 'running') return []
  // 每次 poll 释放 1-2 个新事件
  const release = Math.min(state.events.length - state.cursor, 2)
  const out = state.events.slice(state.cursor, state.cursor + release)
  state.cursor += release
  state.credits_used += release * 30
  // 阈值更新
  const ratio = state.credits_used / state.credits_budget
  if (ratio >= 1) {
    state.threshold_state = 'blocked_100'
    if (state.credits_budget >= 800) {
      state.status = 'budget_exhausted'
    }
  } else if (ratio >= 0.6) {
    state.threshold_state = 'warning_60'
  }
  if (state.cursor >= state.events.length && state.status === 'running') {
    state.status = 'completed'
  }
  return out
}

export const cancelRun = async (runId: number): Promise<CancelRunResponse> => {
  await delay(120)
  const state = _runState.get(runId)
  if (state) state.status = 'cancelled'
  return { run_id: runId, status: 'cancelled' }
}

export const extendBudget = async (runId: number, req: ExtendBudgetRequest): Promise<AgentRun> => {
  await delay(120)
  const state = _runState.get(runId)
  if (state) {
    state.credits_budget += req.extra_credits
    state.status = 'running'
    state.threshold_state = 'under_60'
  }
  return getRun(runId)
}

export const submitFeedback = async (
  runId: number, // eslint-disable-line @typescript-eslint/no-unused-vars
  req: FeedbackRequest // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<void> => {
  await delay(150)
}

export const getSupportContact = async (): Promise<SupportContact> => {
  await delay(100)
  return { wechat: 'yousumock_kefu', phone: '400-XXX-XXXX', qr_code_url: null }
}

export const uploadAttachment = async (file: File): Promise<UploadResponse> => {
  await delay(400)
  return {
    id: Math.floor(Math.random() * 100_000),
    filename: file.name,
    url: URL.createObjectURL(file),
    size_bytes: file.size,
    mime: file.type
  }
}
