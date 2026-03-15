/**
 * SOP Detail Legacy Logic
 * 从 sop-detail.html 提取并适配为 V3 legacy 模块
 */
(function () {
    'use strict';

    // ===== V3 兼容层 =====
    // V3 中 token 存储 key 为 'token'，原版 auth.js 使用 'auth_token'
    var TOKEN_STORAGE_KEY = 'token';
    // V3 中 API_BASE_URL 由 Pinia store 设置到 window 上
    var API_BASE_URL = window.API_BASE_URL || '/api';

    // 导航回调（由 __sopLegacyInit 注入）
    var __sopOnNavigateHome = null;
    var __sopOnSwitchRun = null;

    // 跟踪 document 级别事件监听器（用于 cleanup）
    var __sopDocListeners = [];
    function __sopAddDocListener(event, handler) {
        document.addEventListener(event, handler);
        __sopDocListeners.push({ event: event, handler: handler });
    }

    // crypto.randomUUID polyfill for older browsers
    if (!crypto.randomUUID) {
        crypto.randomUUID = function () {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        };
    }


    // API配置
    // TOKEN_STORAGE_KEY 和 API_BASE_URL 已在兼容层中定义

    // SOP 运行相关常量
    const SOP_RUN_ID_KEY = 'sop_current_run_id';
    let SOP_NAME = '爆款口播仿写';

    // 模板自定义配置
    const TEMPLATE_CONFIGS = {
        '1': {
            sopName: '爆款口播仿写',
            steps: {
                '1': {
                    title: '第 1 步：AI 拆解产品和服务',
                    description: '请输入你的产品服务介绍或上传相关文档',
                    inputLabel: '产品服务介绍',
                    placeholder: '请输入产品服务介绍内容，或点击"上传文件"'
                },
                '2': {
                    title: '第 2 步：AI 学习口播语言风格',
                    description: '在下方输入或上传你的历史爆款口播文稿 或 直播公开课逐字稿（二选一）',
                    inputLabel: '你的历史爆款口播文稿或直播公开课逐字稿',
                    tip: '💡 请提供最符合你表达习惯的文案，文案风格越贴合本人，输出文稿的语言风格就越真实',
                    placeholder: '请输入或上传你的历史爆款口播文稿 或 直播公开课逐字稿（二选一）'
                },
                '3': {
                    title: '第 3 步：AI 拆解爆款文案',
                    description: '在下方输入或上传爆款文案',
                    inputLabel: '爆款文案',
                    tip: '💡 提供一篇完整的对标文案，需包含开头、正文和结尾，以便AI 掌握完整结构',
                    placeholder: '请输入爆款文案内容，或点击"上传文件"'
                },
                '4': {
                    title: '第 4 步：AI 进行口播文稿创作',
                    description: '在下方输入仿写文稿主题、观点和案例',
                    tip: `💡 请从以下角度进行输入：<br>
主题：【如：知识IP，回答这3个问题，未来3年生意更好做】<br>
观点案例：【如：第一个观点，其实就是未来三年知识 ip 的本质，它不是输出内容，而是输出立场。因为在 ai 的时代下，大家现在是不缺信息的，获取信息的速度特别快，但是大家想要知道的是，你的立场和你的观点跟我一不一样，是否同频，举个简单的例子...】`,
                    placeholder: '请输入仿写文稿主题、观点和案例'
                }
            }
        },
        '2': {
            sopName: '爆款朋友圈仿写',
            steps: {
                '1': {
                    title: '第 1 步：AI 拆解产品和服务',
                    description: '请输入你的产品服务介绍或上传相关文档',
                    inputLabel: '产品服务介绍',
                    placeholder: '请输入产品服务介绍内容，或点击"上传文件"'
                },
                '2': {
                    title: '第 2 步：AI 朋友圈语言风格学习',
                    inputLabel: '历史朋友圈文案',
                    tip: '💡 请提供3条以上最符合你真实表达习惯的朋友圈文案。语言表达越贴合本人，输出的朋友圈文案越真实',
                    placeholder: '请输入你的历史朋友圈文案，或上传历史朋友圈截图'
                },
                '3': {
                    title: '第 3 步：AI 拆解爆款朋友圈文案',
                    description: '在下方输入或上传对标爆款朋友圈文案',
                    inputLabel: '对标朋友圈文案',
                    tip: '💡 请提供一篇完整的对标朋友圈文案，需包含开头、正文和结尾，以便AI 掌握完整结构',
                    placeholder: '请输入对标爆款朋友圈文案内容，或点击"上传文件"'
                },
                '4': {
                    title: '第 4 步：AI 进行朋友圈创作',
                    description: '开始创作前，请补充创作朋友圈的背景信息，这是生成高质量朋友圈的基础',
                    tipTitle: '💡 朋友圈生成背景信息：',
                    placeholder: '请输入创作朋友圈的背景信息'
                }
            }
        }
    };

    const STEP_NAME_MAP = {
        step1: '产品拆解',
        step2: '拆解语言',
        step3: '拆解风格',
        step4: '创作文稿'
    };

    // 当前 SOP 运行实例 ID（从URL参数获取）
    let currentRunId = null;
    let currentConversationId = null;
    let isDraftRun = false;

    // 保存节点数据，用于获取node_id
    let nodesData = [];

    // 节点状态管理
    let nodeStatus = {
        completedNodeIds: [],  // 已完成的节点ID列表
        completedNodesMap: {}, // 已完成节点的详细信息（包含is_accessible字段）Map: node_id -> node_info
        nextNodeId: null,      // 下一个要运行的节点ID（从getNextNode获取）
        statusData: null       // 完整的状态数据
    };

    // 存储每个步骤的原始输入值（用于输入修改检测）
    // 结构: { stepNumber: originalInputValue }
    let originalInputValues = {};

    // 用户滚动位置状态
    let isUserAtBottom = true;
    let lastUserScrollTop = 0;
    let lastScrollHeight = 0;
    let lastChatbotScrollHeight = 0;

    // 检查用户是否在滚动容器底部
    function checkIfUserAtBottom() {
        const mainContent = document.querySelector('.main-content');
        if (!mainContent) {
            return true; // 如果找不到容器，默认返回 true
        }

        const scrollTop = mainContent.scrollTop;
        const scrollHeight = mainContent.scrollHeight;
        const clientHeight = mainContent.clientHeight;

        // 允许 5px 的误差范围，判断是否在底部
        const threshold = 5;
        return scrollTop + clientHeight >= scrollHeight - threshold;
    }

    /**
     * 应用模板自定义 UI
     */
    function applyTemplateCustomization(templateId) {
        const config = TEMPLATE_CONFIGS[templateId];
        if (!config) return;

        console.log(`正在应用模板 ${templateId} 的自定义配置...`);

        // 更新全局 SOP 名称
        if (config.sopName) {
            SOP_NAME = config.sopName;
            // 同步更新顶部导航栏标题
            const topBarTitle = document.getElementById('sop-top-bar-title');
            if (topBarTitle) topBarTitle.textContent = config.sopName;
        }

        // 遍历并应用步骤配置
        Object.keys(config.steps).forEach(stepNum => {
            const stepConfig = config.steps[stepNum];
            const stepContent = document.getElementById(`step-${stepNum}`);
            if (!stepContent) return;

            // 修改标题
            if (stepConfig.title) {
                const titleEl = stepContent.querySelector('.step-content-title');
                if (titleEl) titleEl.textContent = stepConfig.title;
            }

            // 修改描述
            if (stepConfig.description) {
                const descEl = stepContent.querySelector('.step-content-description');
                if (descEl) descEl.textContent = stepConfig.description;
            }

            // 修改 Tip
            if (stepConfig.tip) {
                const tipEl = stepContent.querySelector('.page-tip');
                if (tipEl) tipEl.innerHTML = stepConfig.tip;
            }

            // 修改 Tip 标题 (针对有列表的情况)
            if (stepConfig.tipTitle) {
                const tipEl = stepContent.querySelector('.page-tip');
                if (tipEl && tipEl.childNodes.length > 0) {
                    const firstNode = tipEl.childNodes[0];
                    if (firstNode.nodeType === Node.TEXT_NODE) {
                        firstNode.textContent = stepConfig.tipTitle;
                    }
                }
            }

            // 修改输入框 Label
            if (stepConfig.inputLabel) {
                const labelEl = stepContent.querySelector('.input-label span');
                if (labelEl) labelEl.textContent = stepConfig.inputLabel;
            }

            // 修改 Placeholder
            if (stepConfig.placeholder) {
                const textarea = stepContent.querySelector('textarea');
                if (textarea) textarea.placeholder = stepConfig.placeholder;
            }
        });
    }

    // 初始化运行实例 ID（从URL参数获取）
    let currentTemplateId = null;

    // [V3] initRunId 已由 __sopLegacyInit 通过 options 参数设置
    // currentRunId 和 currentTemplateId 在 IIFE 顶部声明，由 init 注入

    // ===== 输入内容持久化功能 (针对刷新后内容保留) =====
    const PERSISTENT_INPUT_IDS = ['product-input', 'script-input', 'style-input', 'theme-input', 'chatbot-input'];

    function saveInputPersistence(id, value) {
        // [优化] 如果没有 runId，则使用 templateId 作为草稿标识
        const idTag = currentRunId || `draft_${currentTemplateId}`;
        if (!idTag) return;

        const key = `sop_input_${idTag}_${id}`;
        if (value && value.trim()) {
            localStorage.setItem(key, value);
        } else {
            localStorage.removeItem(key);
        }
    }

    function loadInputPersistence() {
        const idTag = currentRunId || `draft_${currentTemplateId}`;
        if (!idTag) return;

        PERSISTENT_INPUT_IDS.forEach(id => {
            const textarea = document.getElementById(id);
            if (textarea) {
                const key = `sop_input_${idTag}_${id}`;
                const savedValue = localStorage.getItem(key);
                // 如果本地有保存的内容，且当前输入框为空（可能是刚刷新），则加载
                if (savedValue && savedValue.trim() && !textarea.value.trim()) {
                    textarea.value = savedValue;
                    // 触发一次 input 事件以更新相关 UI
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        });
    }

    function initInputPersistence() {
        // [优化] 在新建模式下也需要初始化持久化逻辑
        if (!currentRunId && !currentTemplateId) return;

        // 1. 延迟加载一次，确保其他初始化工作（如从服务器恢复已完成步骤的输入）完成后，再作为补充加载
        // 这里使用 setTimeout 确保在 DOM 构建完成后执行
        setTimeout(() => {
            loadInputPersistence();
        }, 100);

        // 2. 监听所有目标输入框的变化
        PERSISTENT_INPUT_IDS.forEach(id => {
            const textarea = document.getElementById(id);
            if (textarea) {
                // 监听手动输入
                textarea.addEventListener('input', (e) => {
                    saveInputPersistence(id, e.target.value);
                });
                // 监听某些程序化改变事件
                textarea.addEventListener('change', (e) => {
                    saveInputPersistence(id, e.target.value);
                });
            }
        });
    }

    // 初始化持久化逻辑
    initInputPersistence();

    // 各步骤最近一次生成的内容（Markdown 或纯文本）
    const latestStepContent = {
        step1: '',
        step2: '',
        step3: '',
        step4: ''
    };

    // 从API获取已保存的SOP文档
    async function getStoredDocs() {
        try {
            const token = localStorage.getItem(TOKEN_STORAGE_KEY);
            if (!token) {
                console.error('未找到认证Token');
                return [];
            }

            // TODO: 根据实际API端点调用获取SOP文档列表
            // 这里需要根据实际的API文档来实现
            // const response = await fetch(`${API_BASE_URL}/v1/sop/docs`, {
            //     method: 'GET',
            //     headers: {
            //         'Authorization': `Bearer ${token}`
            //     }
            // });
            // if (!response.ok) return [];
            // const data = await response.json();
            // return data.data || [];

            // 暂时返回空数组，等待API实现
            return [];
        } catch (error) {
            console.error('获取 SOP 文档失败：', error);
            return [];
        }
    }

    // 通过API保存SOP文档
    async function saveStoredDocs(docData) {
        try {
            const token = localStorage.getItem(TOKEN_STORAGE_KEY);
            if (!token) {
                throw new Error('未找到认证Token');
            }

            // TODO: 根据实际API端点调用保存SOP文档
            // 这里需要根据实际的API文档来实现
            // const response = await fetch(`${API_BASE_URL}/v1/sop/docs`, {
            //     method: 'POST',
            //     headers: {
            //         'Content-Type': 'application/json',
            //         'Authorization': `Bearer ${token}`
            //     },
            //     body: JSON.stringify(docData)
            // });
            // if (!response.ok) throw new Error('保存失败');
            // const data = await response.json();
            // return data;

            // 暂时提示用户，等待API实现
            if (typeof showToast === 'function') {
                showToast('保存功能需要API支持，请联系开发人员');
            }
        } catch (error) {
            console.error('保存 SOP 文档失败：', error);
            if (typeof showToast === 'function') {
                showToast('保存失败：' + error.message);
            }
        }
    }

    // 计算指定 SOP+步骤的下一个版本号
    async function getNextVersion(sopName, stepId) {
        const docs = await getStoredDocs();
        const related = docs.filter(doc => doc.sopName === sopName && doc.stepId === stepId);
        const maxVersion = related.reduce((max, doc) => {
            const v = typeof doc.version === 'number' ? doc.version : 0;
            return v > max ? v : max;
        }, 0);
        const next = maxVersion + 1;
        return next > 0 ? next : 1;
    }

    // 保存当前步骤的 AI 结果为 SOP 文档
    async function saveAIResult(stepId) {
        const stepContentMap = {
            step1: 'analysis-content',
            step2: 'script-analysis-content',
            step3: 'style-analysis-content',
            step4: 'generated-script'
        };

        const targetElementId = stepContentMap[stepId];
        if (!targetElementId) {
            console.error('未知的步骤 ID：', stepId);
            return;
        }

        // 优先使用最新的缓存内容，其次回退到页面上的文本
        let content = latestStepContent[stepId] || '';
        if (!content.trim()) {
            const element = document.getElementById(targetElementId);
            if (element) {
                content = element.textContent || '';
            }
        }

        content = content.trim();
        if (!content) {
            showToast('暂无可保存的内容，请先生成 AI 结果');
            return;
        }

        const stepName = STEP_NAME_MAP[stepId] || stepId;
        const version = await getNextVersion(SOP_NAME, stepId);
        const fileName = `${SOP_NAME}_${stepName}_${version}`;

        const doc = {
            id: Date.now(),
            runId: currentRunId,  // 当前运行实例 ID
            sopName: SOP_NAME,
            stepId,
            stepName,
            version,
            fileName,
            content,
            createdAt: Date.now()
        };

        await saveStoredDocs(doc);

        showToast(`已保存为「${fileName}」`);
    }

    // 当前步骤
    let currentStep = 1;
    // 记录第五步是否有用户交互（发送了问题）
    let hasStep5Interaction = false;

    // 检查第五步是否有用户交互（发送了问题）
    async function checkStep5Interaction() {
        if (!currentRunId) return;
        try {
            const messages = await loadChatMessages(currentRunId);
            // 如果有任何用户消息，则标记为已交互
            if (messages && messages.some(m => {
                const role = (m.role || '').toLowerCase();
                return role === 'user';
            })) {
                hasStep5Interaction = true;
                console.log('[状态更新] 检测到第五步已有用户交互');
            }
        } catch (e) {
            console.warn('检查第五步交互失败:', e);
        }
    }

    // 记录当前节点是否是最后一个节点（has_next: false）
    let isCurrentStepLastNode = false;

    // 获取SOP运行状态
    async function getSOPRunStatus(runId) {
        try {
            const token = localStorage.getItem(TOKEN_STORAGE_KEY);
            if (!token) {
                console.error('未找到认证Token');
                return null;
            }

            const response = await fetch(`${API_BASE_URL}/v1/sop/runs/${runId}/status`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                console.error(`获取run ${runId} 状态失败: ${response.status}`);
                return null;
            }

            const data = await response.json();
            // 兼容不同的返回格式：
            // 1. { code: 0, data: { status, completed_nodes, ... } }
            // 2. 直接返回对象 { status, ... }
            if (data.code === 0 && data.data && typeof data.data === 'object') {
                return data.data;
            } else if (data.data && typeof data.data === 'object') {
                return data.data;
            } else if (typeof data === 'object' && (data.status !== undefined || data.completed_nodes !== undefined)) {
                return data;
            }
            console.warn(`无法解析run ${runId}的状态数据:`, data);
            return null;
        } catch (error) {
            console.error(`获取 SOP run ${runId} 状态失败：`, error);
            return null;
        }
    }

    // [Optimization] 节点输出请求缓存，防止并发冗余请求
    const nodeOutputPromises = new Map();
    async function getNodeOutput(runId, nodeId) {
        if (!runId || !nodeId) return null;

        const cacheKey = `${runId}_${nodeId}`;
        if (nodeOutputPromises.has(cacheKey)) {
            console.log(`[getNodeOutput] 复用正在进行的请求: ${cacheKey}`);
            return nodeOutputPromises.get(cacheKey);
        }

        const fetchPromise = (async () => {
            try {
                const token = localStorage.getItem(TOKEN_STORAGE_KEY);
                if (!token) {
                    console.error('未找到认证Token');
                    return null;
                }

                const response = await fetch(`${API_BASE_URL}/v1/sop/runs/${runId}/nodes/${nodeId}/output`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    // 404错误时静默失败，不显示警告（节点输出可能不存在）
                    if (response.status !== 404) {
                        console.warn(`获取节点 ${nodeId} 输出失败: ${response.status}`);
                    }
                    return null;
                }

                const data = await response.json();
                // 兼容不同的返回格式
                if (data.code === 0 && data.data) {
                    return data.data.output || data.data.content || data.data.result || '';
                } else if (data.output || data.content || data.result) {
                    return data.output || data.content || data.result;
                }
                return '';
            } catch (error) {
                console.error(`获取节点 ${nodeId} 输出失败：`, error);
                return null;
            } finally {
                // 请求结束后，延迟清理缓存，允许短时间内的复用
                setTimeout(() => {
                    if (nodeOutputPromises.get(cacheKey) === fetchPromise) {
                        nodeOutputPromises.delete(cacheKey);
                    }
                }, 2000);
            }
        })();

        nodeOutputPromises.set(cacheKey, fetchPromise);
        return fetchPromise;
    }

    // 历史记录相关函数
    async function openHistoryModal() {
        const overlay = document.getElementById('history-modal-overlay');
        const container = document.getElementById('history-card-container');

        if (!overlay || !container) {
            console.error('历史记录弹窗元素未找到');
            return;
        }

        // 显示弹窗
        overlay.classList.add('show');

        // 显示加载状态
        container.innerHTML = `
                <div class="history-loading">
                    <div class="history-loading-spinner"></div>
                    <div>正在获取历史任务...</div>
                </div>
            `;

        // 加载历史记录数据
        try {
            await loadHistoryRecords();
        } catch (error) {
            console.error('加载历史记录失败:', error);
            container.innerHTML = `
                    <div class="history-empty">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 48px; height: 48px; color: #ef4444; margin-bottom: 16px;">
                            <path d="M12 9V11M12 15H12.01M5.07183 19H18.9282C20.4678 19 21.4301 17.3333 20.6603 16L13.7321 4C12.9623 2.66667 11.0378 2.66667 10.268 4L3.33975 16C2.56993 17.3333 3.53223 19 5.07183 19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <div style="font-weight: 600; color: var(--text);">加载失败</div>
                        <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">${error.message}</div>
                        <button onclick="openHistoryModal()" style="margin-top: 20px; padding: 10px 24px; background: var(--accent); color: white; border: none; border-radius: var(--radius-md); font-weight: 600; cursor: pointer;">重试</button>
                    </div>
                `;
        }
    }

    function closeHistoryModal() {
        const overlay = document.getElementById('history-modal-overlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
        // 关闭弹窗后，currentHistoryRunId仍然保留，可以在需要时使用
    }

    function closeHistoryModalOnOverlay(event) {
        if (event.target.id === 'history-modal-overlay') {
            closeHistoryModal();
        }
    }

    // 加载历史记录数据 - [优化] 获取所有模板的记录
    async function loadHistoryRecords() {
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (!token) {
            throw new Error('未找到认证Token，请先登录');
        }

        // [修改] 使用全局执行记录 API，不再局限于单一模板
        const response = await fetch(`${API_BASE_URL}/v1/sop/templates/executed`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // 解析全局数据格式
        let runs = [];
        if (data.code === 0 && data.data && Array.isArray(data.data.templates)) {
            // 转换 API 数据格式以适配渲染器
            runs = data.data.templates.map(record => ({
                id: record.run_id,
                template_id: record.template_id,
                template_name: record.template_name,
                status: record.run_status,
                created_at: record.executed_at,
                completed_count: record.completed_count || 0,
                total_nodes: record.total_nodes || 4
            }));
        }

        // 过滤掉 pending 和 failed 的记录
        runs = runs.filter(run => {
            const status = run.status || '';
            return status !== 'pending' && status !== 'failed';
        });

        // 渲染历史记录
        renderHistoryRecords(runs);
    }

    // 渲染历史记录
    function renderHistoryRecords(runs) {
        const container = document.getElementById('history-card-container');
        if (!container) return;

        if (!runs || runs.length === 0) {
            container.innerHTML = `
                    <div class="history-empty">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 48px; height: 48px; color: var(--text-muted); margin-bottom: 16px;">
                            <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        <div style="font-weight: 600; color: var(--text);">暂无运行记录</div>
                        <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">开始执行步骤后，记录将显示在此处</div>
                    </div>
                `;
            return;
        }

        // 获取当前页面运行的 runId
        const urlParams = new URLSearchParams(window.location.search);
        const currentRunId = urlParams.get('runId');

        // 按创建时间倒序排列
        runs.sort((a, b) => {
            const timeA = new Date(a.created_at || a.createdAt || 0);
            const timeB = new Date(b.created_at || b.createdAt || 0);
            return timeB - timeA;
        });

        container.innerHTML = runs.map((run, index) => {
            const runId = run.id || run.ID;
            const tplId = run.template_id;
            const tplName = run.template_name || '未命名模板';
            const createdAt = run.created_at || '';
            const completedCount = run.completed_count || 0;
            const totalNodes = run.total_nodes || 4;
            const progressPercent = Math.min(100, Math.round((completedCount / totalNodes) * 100));
            const isCompleted = completedCount >= totalNodes;
            const isActive = String(runId) === String(currentRunId);

            const timeStr = formatDateTimeFull(createdAt);
            const displayName = `${tplName} #${runId}`;

            const statusText = run.status === 'succeeded' ? '已完成' : '进行中';

            // 返回卡片HTML，加入ID以便异步更新
            return `
                    <div class="history-run-card ${isActive ? 'active' : ''}" onclick="if(!event.target.closest('.history-run-delete')) switchSOPRun(${runId}, ${tplId})">
                        <div class="history-run-card-info">
                            <div class="history-run-card-title">
                                ${escapeHtml(displayName)}
                                <span class="history-status-badge ${isCompleted ? 'completed' : 'running'}">
                                    ${isCompleted ? '已完成' : '进行中'}
                                </span>
                            </div>
                            <div class="history-run-card-meta">
                                <span>创建时间: ${timeStr}</span>
                            </div>
                            <div class="history-run-card-progress">
                                <div class="history-progress-bar">
                                    <div class="history-progress-fill" id="history-progress-bar-${runId}" style="width: ${progressPercent}%"></div>
                                </div>
                                <span class="history-progress-text" id="history-progress-text-${runId}">${completedCount}/${totalNodes}</span>
                            </div>
                        </div>
                        <button class="history-run-delete" title="物理删除此记录" onclick="deleteHistoryRun(event, '${runId}')">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                            </svg>
                        </button>
                    </div>
                `;
        }).join('');

        // [异步更新] 如果进度不是 100%，尝试获取详细进度并更新
        runs.forEach(run => {
            const runId = run.id || run.ID;
            const completedCount = run.completed_count || 0;
            const totalNodes = run.total_nodes || 4;
            if (completedCount < totalNodes) {
                (async (id) => {
                    try {
                        const statusData = await getSOPRunStatus(id);
                        if (statusData) {
                            let realCompletedCount = 0;
                            if (Array.isArray(statusData.completed_nodes)) {
                                realCompletedCount = statusData.completed_nodes.length;
                            } else if (typeof statusData.completed_count === 'number') {
                                realCompletedCount = statusData.completed_count;
                            }
                            const realTotalNodes = statusData.total_nodes || 4;

                            const progressBar = document.getElementById(`history-progress-bar-${id}`);
                            const progressText = document.getElementById(`history-progress-text-${id}`);
                            if (progressBar && realTotalNodes > 0) {
                                const progress = Math.min(100, Math.round((realCompletedCount / realTotalNodes) * 100));
                                progressBar.style.width = `${progress}%`;
                            }
                            if (progressText) {
                                progressText.textContent = `${realCompletedCount}/${realTotalNodes}`;
                            }
                        }
                    } catch (err) {
                        console.warn(`[历史记录进度异步更新失败] runId: ${id}`, err);
                    }
                })(runId);
            }
        });
    }

    // 切换运行记录
    function switchSOPRun(runId, templateId) {
        if (!runId || !templateId) return;
        // [V3] 使用回调更新 Vue Router，而非整页跳转
        if (__sopOnSwitchRun) {
            __sopOnSwitchRun(String(runId), String(templateId));
        } else {
            window.location.href = `sop-detail.html?runId=${runId}&templateId=${templateId}`;
        }
    }

    // 删除历史运行记录
    async function deleteHistoryRun(event, runId) {
        if (event) event.stopPropagation();

        showConfirmDialog('确认操作', '确认删除记录吗？此操作不可恢复', async () => {
            try {
                const token = localStorage.getItem(TOKEN_STORAGE_KEY);
                const response = await fetch(`${API_BASE_URL}/v1/sop/runs/${runId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const urlParams = new URLSearchParams(window.location.search);
                    const currentRunId = urlParams.get('runId');

                    if (String(runId) === String(currentRunId)) {
                        if (typeof showToast === 'function') showToast('记录已删除，将返回首页');
                        else alert('当前任务已删除，将返回首页');

                        setTimeout(() => {
                            if (__sopOnNavigateHome) { __sopOnNavigateHome(); } else { window.location.href = '/'; }
                        }, 1000);
                        return;
                    }

                    if (typeof showToast === 'function') showToast('删除成功');
                    else if (typeof toastr !== 'undefined') toastr.success('删除成功');
                    else alert('删除成功');

                    // 重新刷新历史列表
                    if (typeof openHistoryModal === 'function') openHistoryModal();
                } else {
                    const error = await response.json();
                    alert('删除失败: ' + (error.message || '未知错误'));
                }
            } catch (error) {
                console.error('删除请求失败:', error);
                alert('请求失败，请检查网络');
            }
        });
    }

    // 切换Run详情展开/收起
    function toggleRunDetails(runId) {
        const runItem = document.querySelector(`.history-run-item[data-run-id="${runId}"]`);
        if (runItem) {
            runItem.classList.toggle('expanded');
        }
    }

    // 获取状态文本
    function getStatusText(status) {
        const statusMap = {
            'succeeded': '已完成',
            'completed': '已完成',  // 兼容旧格式
            'running': '运行中',
            'failed': '失败',
            'pending': '等待中'
        };
        return statusMap[status] || status;
    }

    // 格式化日期时间为完整格式 yyyy-mm-dd hh:mm:ss
    function formatDateTimeFull(dateStr) {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hour = String(date.getHours()).padStart(2, '0');
            const minute = String(date.getMinutes()).padStart(2, '0');
            const second = String(date.getSeconds()).padStart(2, '0');

            return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
        } catch (e) {
            return dateStr;
        }
    }

    // 格式化日期时间（相对时间，用于其他地方）
    function formatDateTime(dateStr) {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            const now = new Date();
            const diff = now - date;
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);

            if (minutes < 1) return '刚刚';
            if (minutes < 60) return `${minutes}分钟前`;
            if (hours < 24) return `${hours}小时前`;
            if (days < 7) return `${days}天前`;

            // 超过7天显示具体日期
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hour = String(date.getHours()).padStart(2, '0');
            const minute = String(date.getMinutes()).padStart(2, '0');

            if (year === now.getFullYear()) {
                return `${month}-${day} ${hour}:${minute}`;
            } else {
                return `${year}-${month}-${day} ${hour}:${minute}`;
            }
        } catch (e) {
            return dateStr;
        }
    }

    // HTML转义
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // [Input Change Detection] 处理输入框内容变化
    function handleInputChange(stepNumber) {
        const stepContentIdMap = {
            1: { inputId: 'product-input' },
            2: { inputId: 'script-input' },
            3: { inputId: 'style-input' },
            4: { inputId: 'theme-input' }
        };

        const inputElement = document.getElementById(stepContentIdMap[stepNumber]?.inputId);
        if (!inputElement) return;

        const currentValue = inputElement.value;
        const originalValue = originalInputValues[stepNumber] || '';

        // 使用trim()比较，忽略首尾空格差异
        const isModified = currentValue.trim() !== originalValue.trim();

        console.log(`[输入检测] 步骤 ${stepNumber} 输入${isModified ? '已修改' : '未修改'}`);

        // 更新重新生成按钮文本
        updateRegenerateButton(stepNumber, isModified);
    }

    // [Input Change Detection] 更新重新生成按钮文本
    function updateRegenerateButton(stepNumber, isModified) {
        const regenBtn = document.querySelector(`.chatbot-regenerate-btn[data-step="${stepNumber}"]`);
        if (!regenBtn) return;

        const btnText = regenBtn.querySelector('span');
        if (!btnText) return;

        if (isModified) {
            btnText.textContent = '重新生成';
            // 保持与其他按钮一致的样式，不特殊突出
            regenBtn.style.background = '';
            regenBtn.style.color = '';
        } else {
            // 检查是否来自书签
            const nodeId = nodesData[stepNumber - 1]?.node_id || nodesData[stepNumber - 1]?.id;
            const nodeInfo = nodeStatus.completedNodesMap[nodeId];
            const fromBookmark = nodeInfo?.from_bookmark || false;

            if (fromBookmark) {
                btnText.textContent = '重新生成（将删除书签）';
                regenBtn.style.background = '';
                regenBtn.style.color = '';
            } else {
                btnText.textContent = '重新生成';
                regenBtn.style.background = '';
                regenBtn.style.color = '';
            }
        }
    }

    // [Regenerate Feature] 为步骤 AI 生成区域添加操作按钮（复制、重新生成）
    function addStepActions(stepNumber, contentElement, showRegenerate = true) {
        try {
            console.log(`[StepActions] Adding actions for Step ${stepNumber}${showRegenerate ? ' (with regenerate)' : ''} `);

            // 移除当前步骤的旧容器（如果已存在）
            const oldContainer = document.getElementById(`step-actions-container-${stepNumber}`);
            if (oldContainer) oldContainer.remove();

            // 原有逻辑：全局只有一个“重新生成”按钮。如果要显示新的 regen 按钮，移除其他的
            if (showRegenerate && !hasStep5Interaction) {
                document.querySelectorAll('.chatbot-regenerate-btn').forEach(btn => {
                    if (btn.dataset.step != stepNumber) {
                        btn.remove();
                    }
                });
            }

            // 创建新的动作容器
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'regenerate-container step-actions-container'; // 复用样式
            actionsContainer.id = `step-actions-container-${stepNumber}`;

            // 统一 UI：使用和第五步一致的按钮样式
            actionsContainer.innerHTML = `
                    <div class="regenerate-divider"></div>
                        <div class="regenerate-btn-container" style="display: flex; gap: 12px; justify-content: flex-start;">
                        <!-- 复制按钮 -->
                            <button class="chatbot-copy-btn step-copy-btn" data-step="${stepNumber}">
                                <i data-lucide="copy" class="chatbot-copy-icon"></i>
                                <span>复制</span>
                            </button>
                        </div>
                `;

            // 重新生成按钮 (条件显示)
            if (showRegenerate && !hasStep5Interaction) {
                const btnContainer = actionsContainer.querySelector('.regenerate-btn-container');
                const regenBtn = document.createElement('button');
                regenBtn.className = 'chatbot-copy-btn chatbot-regenerate-btn chat-regenerate-btn';
                regenBtn.dataset.step = stepNumber;
                regenBtn.innerHTML = `
                    <i data-lucide="rotate-ccw" class="chatbot-copy-icon"></i>
                        <span>重新生成</span>
                `;
                regenBtn.onclick = () => handleRegenerateStep(stepNumber);
                btnContainer.appendChild(regenBtn);

                // [Input Change Detection] 初始化按钮文本（检测输入是否已修改）
                // 需要延迟调用，确保DOM已更新
                setTimeout(() => {
                    const stepContentIdMap = {
                        1: { inputId: 'product-input' },
                        2: { inputId: 'script-input' },
                        3: { inputId: 'style-input' },
                        4: { inputId: 'theme-input' }
                    };
                    const inputElement = document.getElementById(stepContentIdMap[stepNumber]?.inputId);
                    if (inputElement && originalInputValues[stepNumber] !== undefined) {
                        const currentValue = inputElement.value;
                        const originalValue = originalInputValues[stepNumber] || '';
                        const isModified = currentValue.trim() !== originalValue.trim();
                        updateRegenerateButton(stepNumber, isModified);
                    }
                }, 100);
            }

            // 保存生成记录按钮 (只在步骤1-4显示)
            if (stepNumber <= 4) {
                const btnContainer = actionsContainer.querySelector('.regenerate-btn-container');
                const bookmarkBtn = document.createElement('button');
                bookmarkBtn.className = 'chatbot-copy-btn step-bookmark-btn';
                bookmarkBtn.dataset.step = stepNumber;
                bookmarkBtn.dataset.bookmarked = 'false';
                bookmarkBtn.innerHTML = `
                        <i data-lucide="bookmark" class="chatbot-copy-icon"></i>
                        <span>保存生成记录</span>
                    `;
                bookmarkBtn.onclick = function () { toggleNodeBookmark(stepNumber, this); };
                btnContainer.appendChild(bookmarkBtn);

                // 检查该节点是否已有书签
                checkNodeBookmarkStatus(stepNumber, bookmarkBtn);
            }

            // 复制按钮逻辑
            const copyBtn = actionsContainer.querySelector('.step-copy-btn');
            copyBtn.onclick = () => {
                const textToCopy = contentElement.dataset.rawContent || contentElement.innerText || contentElement.textContent;

                const originalHTML = copyBtn.innerHTML;
                const showSuccess = () => {
                    copyBtn.innerHTML = `
                    <i data-lucide="check" class="chatbot-copy-icon"></i>
                        <span>已复制</span>
                `;
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                    setTimeout(() => {
                        copyBtn.innerHTML = originalHTML;
                        if (typeof lucide !== 'undefined') lucide.createIcons();
                    }, 2000);
                    showToast('内容已复制到剪贴板！');
                };

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(textToCopy).then(showSuccess).catch(err => {
                        console.error('Clipboard copy failed:', err);
                        fallbackCopy(textToCopy);
                        showSuccess();
                    });
                } else {
                    fallbackCopy(textToCopy);
                    showSuccess();
                }
            };

            // 将容器添加到内容后面
            if (contentElement.parentNode) {
                contentElement.parentNode.appendChild(actionsContainer);
            }

            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch (e) {
            console.error('[StepActions] Failed to add buttons:', e);
        }
    }

    // 恢复已完成节点的内容
    async function restoreCompletedNodeContent(stepNumber) {
        console.log(`[恢复内容] 开始恢复步骤 ${stepNumber} 的内容`);

        // 只处理后端节点（步骤编号小于等于节点数量）
        if (stepNumber > nodesData.length) {
            console.log(`[恢复内容] 步骤 ${stepNumber} 超出节点数量 ${nodesData.length}，跳过`);
            return;
        }

        const nodeIndex = stepNumber - 1;
        if (nodeIndex < 0 || nodeIndex >= nodesData.length) {
            console.warn(`[恢复内容] 步骤 ${stepNumber} 的节点索引 ${nodeIndex} 超出范围`);
            return;
        }

        const node = nodesData[nodeIndex];
        const nodeId = node.node_id || node.id || node.ID || node.nodeId;
        if (!nodeId) {
            console.warn(`[恢复内容] 步骤 ${stepNumber} 的节点缺少ID字段`);
            return;
        }

        console.log(`[恢复内容] 步骤 ${stepNumber} 对应节点 ID: ${nodeId}`);

        // 检查节点是否已完成 - 修复类型比较问题，统一转换为字符串
        const nodeIdStr = String(nodeId);
        const isCompleted = nodeStatus.completedNodeIds.some(id => String(id) === nodeIdStr);

        console.log(`[恢复内容] 节点 ${nodeId} 完成状态: ${isCompleted}, completedNodeIds: [${nodeStatus.completedNodeIds.map(id => String(id)).join(', ')}]`);

        if (!isCompleted) {
            console.log(`[恢复内容] 步骤 ${stepNumber} (节点 ${nodeId}) 尚未完成，跳过`);
            return;
        }

        if (!currentRunId) {
            console.warn(`[恢复内容] 未找到runId，无法恢复步骤 ${stepNumber} `);
            return;
        }

        // 获取步骤的内容元素
        const stepContent = document.getElementById(`step-${stepNumber}`);
        if (!stepContent) {
            console.warn(`[恢复内容] 未找到步骤容器 step-${stepNumber}`);
            return;
        }

        // 定义步骤编号到内容元素ID的映射
        const stepContentIdMap = {
            1: {
                contentId: 'analysis-content',
                resultId: 'result-message',
                loadingId: 'loading-message',
                chatContainerId: 'product-chat',
                inputId: 'product-input'
            },
            2: {
                contentId: 'script-analysis-content',
                resultId: 'script-result-message',
                loadingId: 'script-loading-message',
                chatContainerId: 'script-chat',
                inputId: 'script-input'
            },
            3: {
                contentId: 'style-analysis-content',
                resultId: 'style-result-message',
                loadingId: 'style-loading-message',
                chatContainerId: 'style-chat',
                inputId: 'style-input'
            },
            4: {
                contentId: 'generated-script',
                resultId: 'final-result-message',
                loadingId: 'final-loading-message',
                chatContainerId: 'final-chat',
                inputId: 'final-input'
            }
        };

        // 查找结果消息容器和内容元素
        let resultMessage = null;
        let contentElement = null;
        let loadingMessage = null;

        if (stepContentIdMap[stepNumber]) {
            // 使用映射表精确查找
            const mapping = stepContentIdMap[stepNumber];
            resultMessage = stepContent.querySelector(`#${mapping.resultId}`);
            contentElement = stepContent.querySelector(`#${mapping.contentId}`);
            loadingMessage = stepContent.querySelector(`#${mapping.loadingId}`);
        }

        // 如果映射查找失败，尝试通用查找
        if (!contentElement) {
            resultMessage = stepContent.querySelector('#result-message') ||
                stepContent.querySelector('#script-result-message') ||
                stepContent.querySelector('#style-result-message') ||
                stepContent.querySelector('#final-result-message');

            contentElement = stepContent.querySelector('#analysis-content') ||
                stepContent.querySelector('#script-analysis-content') ||
                stepContent.querySelector('#style-analysis-content') ||
                stepContent.querySelector('#generated-script');

            if (resultMessage && !contentElement) {
                contentElement = resultMessage.querySelector('.message-content');
            }

            if (!contentElement) {
                contentElement = stepContent.querySelector('.message-content');
            }
        }

        if (!loadingMessage) {
            loadingMessage = stepContent.querySelector('#loading-message') ||
                stepContent.querySelector('#script-loading-message') ||
                stepContent.querySelector('#style-loading-message') ||
                stepContent.querySelector('#final-loading-message');
        }

        if (!contentElement) {
            console.warn(`[恢复内容] 步骤 ${stepNumber} 未找到内容元素`);
            console.log(`[恢复内容] stepContent内容: `, stepContent.innerHTML.substring(0, 200));
            return;
        }

        // 检查内容是否已经存在（避免重复加载）
        // 注意：即使内容元素有内容，也要检查是否真的有效内容（不只是空白字符或HTML标签）
        const existingContent = contentElement.textContent.trim() || contentElement.innerHTML.trim();
        // 如果已有有效内容（超过10个字符），跳过恢复
        if (existingContent.length > 10) {
            console.log(`[恢复内容] 步骤 ${stepNumber} 已有内容（长度: ${existingContent.length}），跳过恢复`);
            return;
        }

        console.log(`[恢复内容] 开始获取步骤 ${stepNumber} (节点 ${nodeId}) 的输出内容`);

        // 首先尝试从status数据中获取节点输出和输入（completed_nodes中可能包含output和input）
        let output = null;
        let input = null;
        let thinkingContent = null;
        if (nodeStatus.statusData && nodeStatus.statusData.completed_nodes) {
            console.log(`[恢复内容] status数据中已完成节点数量: ${nodeStatus.statusData.completed_nodes.length}`);
            const completedNode = nodeStatus.statusData.completed_nodes.find(n => {
                const id = n.node_id || n.id || n.ID || n.nodeId;
                const match = String(id) === nodeIdStr;
                if (match) {
                    console.log(`[恢复内容] 找到匹配的已完成节点:`, n);
                }
                return match;
            });

            if (completedNode) {
                // API返回的是output字段（完整输出），优先使用output
                output = completedNode.output ||
                    completedNode.output_preview || // 保留作为fallback（如果后端同时提供）
                    completedNode.outputPreview ||
                    completedNode.content ||
                    completedNode.result ||
                    null;

                // 获取用户输入
                input = completedNode.input || completedNode.text || null;

                if (output) {
                    console.log(`[恢复内容] 从status数据获取到输出，长度: ${output.length} `);
                } else {
                    console.log(`[恢复内容] status数据中的节点没有输出字段`);
                    console.log(`[恢复内容] completedNode keys: `, Object.keys(completedNode));
                }

                if (input) {
                    console.log(`[恢复内容] 从status数据获取到输入，长度: ${input.length} `);
                }

                // 获取思考内容
                thinkingContent = completedNode.thinking_content || completedNode.reasoning_content || completedNode.thinking || null;
                if (thinkingContent) {
                    console.log(`[恢复内容] 从status数据获取到思考内容，长度: ${thinkingContent.length} `);
                }
            } else {
                console.warn(`[恢复内容] 在completed_nodes中未找到节点 ${nodeId} `);
                console.log(`[恢复内容] completed_nodes中的节点ID: `,
                    nodeStatus.statusData.completed_nodes.map(n => n.node_id || n.id || n.ID || n.nodeId));
            }
        } else {
            console.warn(`[恢复内容] statusData或completed_nodes不存在`);
        }

        // 如果从status数据中没有获取到输出，尝试从API获取完整输出
        // 改进：总是尝试从API获取，因为status数据中的输出可能不完整或为空
        if (!output || !output.trim()) {
            console.log(`[恢复内容] status数据无输出，尝试从API获取完整输出...`);
            try {
                const apiOutput = await getNodeOutput(currentRunId, nodeId);
                if (apiOutput && apiOutput.trim()) {
                    console.log(`[恢复内容] ✅ API返回输出，长度: ${apiOutput.length}`);
                    output = apiOutput;
                } else {
                    console.log(`[恢复内容] ⚠️ API未返回有效输出`);
                }
            } catch (apiError) {
                console.error(`[恢复内容] API请求失败:`, apiError);
            }
        } else {
            console.log(`[恢复内容] 使用status数据中的输出，长度: ${output.length}`);
        }

        // 恢复用户输入框内容
        if (input && input.trim() && stepContentIdMap[stepNumber] && stepContentIdMap[stepNumber].inputId) {
            const inputElement = document.getElementById(stepContentIdMap[stepNumber].inputId);
            if (inputElement) {
                inputElement.value = input;
                // 保存原始输入值用于输入修改检测
                originalInputValues[stepNumber] = input;
                console.log(`[恢复内容] ✅ 已恢复步骤 ${stepNumber} 的用户输入`);

                // 添加输入变化监听器（检测输入修改）
                // 移除旧监听器避免重复
                const oldListener = inputElement.inputChangeListener;
                if (oldListener) {
                    inputElement.removeEventListener('input', oldListener);
                }

                // 添加新监听器
                const inputChangeListener = function () {
                    handleInputChange(stepNumber);
                };
                inputElement.inputChangeListener = inputChangeListener;
                inputElement.addEventListener('input', inputChangeListener);
            }
        }

        // 如果有输出内容，显示它
        if (output && output.trim()) {
            console.log(`[恢复内容] 准备显示内容，长度: ${output.length} `);

            // 显示chat容器（这是关键，让用户能看到AI回复区域）
            if (stepContentIdMap[stepNumber] && stepContentIdMap[stepNumber].chatContainerId) {
                const chatContainer = document.getElementById(stepContentIdMap[stepNumber].chatContainerId);
                if (chatContainer) {
                    chatContainer.classList.add('show');
                    console.log(`[恢复内容] ✅ 已显示步骤 ${stepNumber} 的chat容器`);
                }
            }

            // 隐藏加载状态
            if (loadingMessage) {
                loadingMessage.style.display = 'none';
            }

            // 显示结果消息
            if (resultMessage) {
                resultMessage.style.display = 'block';
                const messageHeader = resultMessage.querySelector('.message-header');
                if (messageHeader) {
                    messageHeader.style.display = 'flex';
                }
            }

            // 渲染Markdown内容
            if (typeof marked !== 'undefined' && marked.parse) {
                try {
                    contentElement.innerHTML = marked.parse(output);
                    console.log(`[恢复内容] ✅ 已恢复步骤 ${stepNumber} (节点 ${nodeId}) 的内容`);
                } catch (error) {
                    console.error(`[恢复内容] Markdown 渲染失败：`, error);
                    contentElement.textContent = output;
                }
            } else {
                contentElement.textContent = output;
                console.log(`[恢复内容] ✅ 已恢复步骤 ${stepNumber} (节点 ${nodeId}) 的内容（纯文本）`);
            }

            // 如果有思考内容，显示它
            if (thinkingContent && thinkingContent.trim()) {
                console.log(`[恢复内容] 准备显示思考内容`);
                // 确保先显示thinking容器
                const thinkingElement = createOrUpdateThinkingElement(contentElement, thinkingContent);
                if (thinkingElement) {
                    // 标记为已完成
                    markThinkingFinished(contentElement);
                }
            }
        } else {
            console.warn(`[恢复内容] ⚠️ 步骤 ${stepNumber} (节点 ${nodeId}) 没有可恢复的输出内容`);
        }

        // [Fix] 同时标记该步骤为已分析/已生成状态，防止点击“下一步”重新生成
        if (stepNumber === 1) step1Analyzed = true;
        else if (stepNumber === 2) step2Analyzed = true;
        else if (stepNumber === 3) step3Analyzed = true;
        else if (stepNumber === 4) step4Generated = true;

        // [Regenerate Feature] 恢复操作按钮（Copy 按钮对所有已完成步骤显示，Regen 仅对最新步骤显示）
        if (stepNumber >= 1 && stepNumber <= 4) {
            // 计算当前已完成且可访问的最大步骤
            // 注意：只有可访问的节点才能作为"最新步骤"，不可访问的书签节点不算
            let maxCompletedStep = 0;
            if (nodesData && nodesData.length > 0) {
                nodeStatus.completedNodeIds.forEach(id => {
                    const idx = nodesData.findIndex(n => {
                        const nid = n.id || n.node_id || n.ID || n.nodeId;
                        return nid == id || parseInt(nid) == parseInt(id);
                    });
                    if (idx !== -1) {
                        // 检查该节点是否可访问
                        const nodeInfo = nodeStatus.completedNodesMap[id] ||
                            nodeStatus.completedNodesMap[String(id)];
                        const isAccessible = nodeInfo?.is_accessible !== false;
                        if (isAccessible) {
                            maxCompletedStep = Math.max(maxCompletedStep, idx + 1);
                        }
                    }
                });
            }
            const isLatestStep = (stepNumber === maxCompletedStep);

            // 判断是否可以编辑和显示重新生成按钮
            // 规则：只有最新步骤 && 第5步没有交互 才可以
            const canEdit = isLatestStep && !hasStep5Interaction;

            // 禁用非最新步骤的输入框（或第5步有交互时禁用所有1-4步输入框）
            const inputId = stepContentIdMap[stepNumber]?.inputId;
            if (inputId) {
                const inputElement = document.getElementById(inputId);
                if (inputElement) {
                    inputElement.disabled = !canEdit;
                    inputElement.title = canEdit ? '' : '只能在最新步骤修改输入';
                    inputElement.style.opacity = canEdit ? '1' : '0.6';
                    inputElement.style.cursor = canEdit ? 'text' : 'not-allowed';
                }
            }

            // 显示操作按钮（只有 canEdit 时才显示重新生成按钮）
            addStepActions(stepNumber, contentElement, canEdit);
        }
    }

    // 恢复所有已完成节点的内容
    async function restoreAllCompletedNodes() {
        if (!nodeStatus || !nodeStatus.completedNodeIds || nodeStatus.completedNodeIds.length === 0) {
            console.log('[Restore] 没有已完成的节点需要恢复');
            return;
        }

        console.log('[Restore] 开始恢复已完成节点，数量:', nodeStatus.completedNodeIds.length);

        for (let i = 0; i < nodesData.length; i++) {
            const node = nodesData[i];
            const nodeId = node.id || node.node_id || node.ID || node.nodeId;
            const nodeIdInt = parseInt(nodeId);

            const isCompleted = nodeStatus.completedNodeIds.includes(nodeId) ||
                nodeStatus.completedNodeIds.includes(nodeIdInt);

            if (isCompleted) {
                const stepNumber = i + 1;
                console.log(`[Restore] 恢复第 ${stepNumber} 步的内容`);

                try {
                    await restoreCompletedNodeContent(stepNumber);

                    const stepElement = document.querySelector(`[data-step="${stepNumber}"]`);
                    if (stepElement) {
                        // 检查节点是否可访问，只有可访问的节点才标记为completed
                        const nodeInfo = nodeStatus.completedNodesMap[nodeIdStr];
                        const isAccessible = nodeInfo?.is_accessible !== false;

                        if (isAccessible) {
                            stepElement.classList.add('completed');
                            console.log(`[Restore] 第 ${stepNumber} 步标记为completed（可访问）`);
                        } else {
                            console.log(`[Restore] 第 ${stepNumber} 步不可访问，不标记为completed`);
                        }

                        const completedNode = nodeStatus.completedNodes?.find(n =>
                            (n.node_id === nodeId || n.node_id === nodeIdInt)
                        );
                        if (completedNode && completedNode.from_bookmark) {
                            stepElement.classList.add('from-bookmark');
                            console.log(`[Restore] 第 ${stepNumber} 步来自书签`);
                        }
                    }
                } catch (error) {
                    console.error(`[Restore] 恢复第 ${stepNumber} 步失败:`, error);
                }
            }
        }

        console.log('[Restore] 所有节点恢复完成');
    }

    // 更新节点状态
    async function updateNodeStatus() {
        if (!currentRunId) {
            console.warn('未找到runId，无法更新节点状态');
            return;
        }

        // [New] 检查第五步是否有用户交互
        await checkStep5Interaction();

        try {
            const statusData = await getSOPRunStatus(currentRunId);

            if (statusData) {
                nodeStatus.statusData = statusData;
                // 提取已完成的节点ID列表和详细信息
                const completedNodes = statusData.completed_nodes || [];
                nodeStatus.completedNodeIds = completedNodes.map(node => {
                    return node.node_id || node.id || node.ID || node.nodeId;
                }).filter(id => id !== null && id !== undefined);

                // 保存每个节点的详细信息（包含is_accessible字段）
                nodeStatus.completedNodesMap = {};
                completedNodes.forEach(node => {
                    const nodeId = node.node_id || node.id || node.ID || node.nodeId;
                    if (nodeId) {
                        nodeStatus.completedNodesMap[nodeId] = {
                            node_id: nodeId,
                            is_accessible: node.is_accessible !== undefined ? node.is_accessible : true, // 默认为true以保持兼容性
                            from_bookmark: node.from_bookmark || false,
                            input: node.input || '',
                            output: node.output || ''
                        };
                        console.log(`[状态更新] 节点${nodeId}: is_accessible(后端)=${node.is_accessible}, from_bookmark=${node.from_bookmark}`);
                    }
                });

                // [Fix] 前端重新计算is_accessible，不依赖后端返回值（后端计算可能有bug）
                // 规则：只有当节点之前的所有节点都已完成时，该节点才可访问
                console.log('[状态更新] 准备开始重算, nodesData:', nodesData, 'length:', nodesData ? nodesData.length : 'undefined');
                if (nodesData && nodesData.length > 0) {
                    console.log('[状态更新] 开始前端重新计算is_accessible，nodesData长度:', nodesData.length);
                    for (let i = 0; i < nodesData.length; i++) {
                        const node = nodesData[i];
                        const nodeId = node.id || node.node_id || node.ID || node.nodeId;
                        const nodeIdStr = String(nodeId); // 统一转为字符串，与completedNodesMap的键格式一致

                        console.log(`[状态更新] 处理节点 i=${i}, nodeId=${nodeId}(${typeof nodeId}), nodeIdStr=${nodeIdStr}`);

                        // 检查该节点是否已完成
                        const isCompleted = nodeStatus.completedNodeIds.includes(nodeId) ||
                            nodeStatus.completedNodeIds.includes(Number(nodeId));

                        console.log(`[状态更新] 节点${nodeId} isCompleted=${isCompleted}, 在map中=${!!nodeStatus.completedNodesMap[nodeIdStr]}`);

                        if (isCompleted && nodeStatus.completedNodesMap[nodeIdStr]) {
                            // 检查前面所有节点是否都已完成
                            let isAccessible = true;
                            console.log(`[状态更新] 节点${nodeId}(步骤${i + 1}): 开始检查前置节点，总共${i}个`);

                            for (let j = 0; j < i; j++) {
                                const prevNode = nodesData[j];
                                const prevNodeId = prevNode.id || prevNode.node_id || prevNode.ID || prevNode.nodeId;

                                const prevCompleted = nodeStatus.completedNodeIds.includes(prevNodeId) ||
                                    nodeStatus.completedNodeIds.includes(Number(prevNodeId));

                                console.log(`[状态更新]   检查前置节点${prevNodeId}(步骤${j + 1}): completed=${prevCompleted}`);

                                if (!prevCompleted) {
                                    isAccessible = false;
                                    console.log(`[状态更新] ❌ 节点${nodeId}不可访问：前置节点${prevNodeId}(步骤${j + 1})未完成`);
                                    break;
                                }
                            }

                            if (isAccessible) {
                                console.log(`[状态更新] ✅ 节点${nodeId}(步骤${i + 1}): 所有${i}个前置节点都已完成，可访问`);
                            }

                            // 更新前端计算的is_accessible（使用字符串键）
                            const oldValue = nodeStatus.completedNodesMap[nodeIdStr].is_accessible;
                            nodeStatus.completedNodesMap[nodeIdStr].is_accessible = isAccessible;
                            console.log(`[状态更新] 节点${nodeId}: is_accessible(前端重算)=${isAccessible} (后端=${oldValue})`);
                        } else if (!isCompleted) {
                            console.log(`[状态更新] ⏭️ 节点${nodeId}(步骤${i + 1}): 未完成，跳过重算`);
                        }
                    }
                    console.log('[状态更新] 前端重新计算完成，最终completedNodesMap:', nodeStatus.completedNodesMap);
                } else {
                    console.warn('[状态更新] ⚠️ 跳过重算：nodesData不可用', {
                        nodesData: nodesData,
                        hasNodesData: !!nodesData,
                        length: nodesData ? nodesData.length : 'N/A',
                        type: typeof nodesData
                    });
                }

                // 保存next_node信息（从status API直接获取，不需要单独调用next-node API）
                // 注意：总是使用status API返回的next_node来更新，因为这是最新的状态
                if (statusData.next_node && statusData.next_node.node_id) {
                    nodeStatus.nextNodeId = statusData.next_node.node_id;
                } else {
                    // 如果没有next_node，但是运行是新创建的（没有完成的节点），应该设置第一个节点为nextNodeId
                    if (statusData.completed_count === 0 && nodesData && nodesData.length > 0) {
                        const firstNode = nodesData[0];
                        const firstNodeId = firstNode.id || firstNode.node_id || firstNode.ID || firstNode.nodeId;
                        if (firstNodeId) {
                            nodeStatus.nextNodeId = firstNodeId;
                            console.log(`[状态更新] 新创建的运行，设置第一个节点 ${firstNodeId} 为nextNodeId`);
                        } else {
                            nodeStatus.nextNodeId = null;
                        }
                    } else {
                        nodeStatus.nextNodeId = null;
                    }
                }

                console.log('[状态更新] 节点状态已更新:', {
                    completedCount: nodeStatus.completedNodeIds.length,
                    totalNodes: statusData.total_nodes,
                    completedNodeIds: nodeStatus.completedNodeIds,
                    nextNodeId: nodeStatus.nextNodeId,
                    status: statusData.status,
                    current_node_sort: statusData.current_node_sort,
                    completedNodes: completedNodes.map(n => ({
                        id: n.node_id || n.id || n.ID || n.nodeId,
                        hasOutput: !!(n.output || n.output_preview || n.outputPreview || n.content || n.result)
                    }))
                });
            }
        } catch (error) {
            console.error('更新节点状态失败:', error);
        }
    }

    // ==================== 书签相关函数 ====================

    // 切换节点书签状态（保存/取消保存）
    async function toggleNodeBookmark(stepNumber, btnElement) {
        console.log('[Bookmark Toggle] 开始切换书签状态, stepNumber:', stepNumber);

        // 优先使用传入的按钮元素，否则通过选择器查找
        let bookmarkBtn = btnElement || document.querySelector(`.step-bookmark-btn[data-step="${stepNumber}"]`);

        // 如果还没找到，尝试遍历所有书签按钮
        if (!bookmarkBtn) {
            const allBtns = document.querySelectorAll('.step-bookmark-btn');
            console.log('[Bookmark Toggle] 找不到按钮，遍历所有书签按钮，数量:', allBtns.length);
            allBtns.forEach(btn => {
                console.log('[Bookmark Toggle] 按钮 data-step:', btn.dataset.step, 'data-bookmarked:', btn.dataset.bookmarked);
                if (String(btn.dataset.step) === String(stepNumber)) {
                    bookmarkBtn = btn;
                }
            });
        }

        if (!bookmarkBtn) {
            showToast('未找到书签按钮', 'error');
            console.error('[Bookmark Toggle] 未找到书签按钮, stepNumber:', stepNumber);
            return;
        }

        console.log('[Bookmark Toggle] 使用按钮, dataset:', JSON.stringify({
            step: bookmarkBtn.dataset.step,
            bookmarked: bookmarkBtn.dataset.bookmarked,
            bookmarkId: bookmarkBtn.dataset.bookmarkId
        }));

        const isBookmarked = bookmarkBtn.dataset.bookmarked === 'true';
        console.log('[Bookmark Toggle] isBookmarked:', isBookmarked);

        if (isBookmarked) {
            // 如果已保存，则删除书签
            console.log('[Bookmark Toggle] 执行删除书签操作');
            await deleteNodeBookmark(stepNumber, bookmarkBtn);
        } else {
            // 如果未保存，则保存书签
            console.log('[Bookmark Toggle] 执行保存书签操作');
            await saveNodeBookmark(stepNumber, bookmarkBtn);
        }
    }

    // 保存节点为书签
    async function saveNodeBookmark(stepNumber, btnElement) {
        try {
            const nodeIndex = stepNumber - 1;
            if (nodeIndex < 0 || nodeIndex >= nodesData.length) {
                showToast('无效的步骤编号', 'error');
                return;
            }

            if (!currentRunId) {
                showToast('未找到运行记录', 'error');
                return;
            }

            const node = nodesData[nodeIndex];
            const nodeId = node.id || node.node_id || node.ID || node.nodeId;

            // 确保转换为数字类型
            const runIdNum = parseInt(currentRunId);
            const nodeIdNum = parseInt(nodeId);

            const requestBody = {
                run_id: runIdNum,
                node_id: nodeIdNum
            };

            console.log('[Bookmark] 开始保存书签');
            console.log('[Bookmark] Request Body:', JSON.stringify(requestBody));
            console.log('[Bookmark] runId type:', typeof runIdNum, 'value:', runIdNum);
            console.log('[Bookmark] nodeId type:', typeof nodeIdNum, 'value:', nodeIdNum);

            const token = localStorage.getItem(TOKEN_STORAGE_KEY);
            const response = await fetch(`${API_BASE_URL}/v1/sop/bookmarks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();
            console.log('[Bookmark] 保存响应:', data);

            if (data.code === 0) {
                // 更新按钮状态，并存储书签 ID
                // 优先使用传入的按钮元素
                const bookmarkBtn = btnElement || document.querySelector(`.step-bookmark-btn[data-step="${stepNumber}"]`);
                if (bookmarkBtn) {
                    bookmarkBtn.dataset.bookmarked = 'true';
                    // 存储书签 ID 用于后续删除
                    if (data.data && data.data.id) {
                        bookmarkBtn.dataset.bookmarkId = data.data.id;
                    }
                    bookmarkBtn.classList.add('bookmarked');
                    bookmarkBtn.innerHTML = `
                            <i data-lucide="bookmark-check" class="chatbot-copy-icon"></i>
                            <span>已保存</span>
                        `;
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
                showToast('书签保存成功！', 'success');
            } else {
                throw new Error(data.message || '保存失败');
            }
        } catch (error) {
            console.error('[Bookmark] 保存书签失败:', error);
            showToast('保存失败: ' + error.message, 'error');
        }
    }

    // 删除节点书签
    async function deleteNodeBookmark(stepNumber, btnElement) {
        try {
            // 优先使用传入的按钮元素
            const bookmarkBtn = btnElement || document.querySelector(`.step-bookmark-btn[data-step="${stepNumber}"]`);
            if (!bookmarkBtn) {
                showToast('未找到书签按钮', 'error');
                return;
            }

            const bookmarkId = bookmarkBtn.dataset.bookmarkId;
            if (!bookmarkId) {
                // 如果没有存储书签 ID，需要先获取
                const nodeIndex = stepNumber - 1;
                if (nodeIndex < 0 || nodeIndex >= nodesData.length) {
                    showToast('无效的步骤编号', 'error');
                    return;
                }

                const node = nodesData[nodeIndex];
                const nodeId = node.id || node.node_id || node.ID || node.nodeId;

                // 从模板书签列表中查找书签 ID
                const token = localStorage.getItem(TOKEN_STORAGE_KEY);
                if (!token || !currentTemplateId) {
                    showToast('未找到认证信息', 'error');
                    return;
                }

                const listResponse = await fetch(`${API_BASE_URL}/v1/sop/templates/${currentTemplateId}/bookmarks`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                const listData = await listResponse.json();
                if (listData.code === 0 && listData.data && listData.data.bookmarks) {
                    const bookmark = listData.data.bookmarks.find(b => b.node_id == nodeId);
                    if (bookmark && bookmark.id) {
                        bookmarkBtn.dataset.bookmarkId = bookmark.id;
                    } else {
                        showToast('未找到对应的书签记录', 'error');
                        return;
                    }
                } else {
                    showToast('获取书签信息失败', 'error');
                    return;
                }
            }

            const finalBookmarkId = bookmarkBtn.dataset.bookmarkId;
            console.log('[Bookmark] 开始删除书签, bookmarkId:', finalBookmarkId);

            const token = localStorage.getItem(TOKEN_STORAGE_KEY);
            const response = await fetch(`${API_BASE_URL}/v1/sop/bookmarks/${finalBookmarkId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();
            console.log('[Bookmark] 删除响应:', data);

            if (data.code === 0) {
                // 更新按钮状态
                bookmarkBtn.dataset.bookmarked = 'false';
                delete bookmarkBtn.dataset.bookmarkId;
                bookmarkBtn.classList.remove('bookmarked');
                bookmarkBtn.innerHTML = `
                        <i data-lucide="bookmark" class="chatbot-copy-icon"></i>
                        <span>保存生成记录</span>
                    `;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                showToast('已取消保存书签', 'success');
            } else {
                throw new Error(data.message || '删除失败');
            }
        } catch (error) {
            console.error('[Bookmark] 删除书签失败:', error);
            showToast('取消保存失败: ' + error.message, 'error');
        }
    }

    // 获取当前节点的 node_run_id
    async function getCurrentNodeRunId(nodeId) {
        try {
            if (!currentRunId) {
                console.error('[Bookmark] currentRunId 不存在');
                return null;
            }

            console.log('[Bookmark] 开始获取 node_run_id, nodeId:', nodeId, 'runId:', currentRunId);

            const token = localStorage.getItem(TOKEN_STORAGE_KEY);
            const response = await fetch(`${API_BASE_URL}/v1/sop/runs/${currentRunId}/status`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();
            console.log('[Bookmark] Status API 返回:', JSON.stringify(data, null, 2));

            if (data.code === 0 && data.data) {
                const completedNodes = data.data.completed_nodes || [];
                console.log('[Bookmark] 已完成节点数量:', completedNodes.length);

                if (completedNodes.length > 0) {
                    console.log('[Bookmark] 第一个已完成节点示例:', JSON.stringify(completedNodes[0], null, 2));
                }

                const nodeRun = completedNodes.find(n => {
                    const nid = n.node_id || n.id || n.ID || n.nodeId;
                    const match = nid == nodeId || parseInt(nid) == parseInt(nodeId);
                    console.log('[Bookmark] 比较节点 ID:', nid, '==', nodeId, '?', match);
                    return match;
                });

                if (nodeRun) {
                    console.log('[Bookmark] 找到匹配的 nodeRun:', JSON.stringify(nodeRun, null, 2));
                    // 兼容多种可能的字段名
                    const runId = nodeRun.node_run_id || nodeRun.nodeRunId || nodeRun.NodeRunID || nodeRun.id;
                    console.log('[Bookmark] 提取的 node_run_id:', runId);
                    return runId;
                } else {
                    console.error('[Bookmark] 未找到匹配的节点, 查找的 nodeId:', nodeId);
                    console.error('[Bookmark] 所有已完成节点的 IDs:', completedNodes.map(n => n.node_id || n.id));
                }
            }
            return null;
        } catch (error) {
            console.error('[Bookmark] 获取节点运行ID失败:', error);
            return null;
        }
    }

    // 检查节点书签状态
    async function checkNodeBookmarkStatus(stepNumber, bookmarkBtn) {
        console.log('[Bookmark Check] 开始检查书签状态, stepNumber:', stepNumber);
        try {
            const nodeIndex = stepNumber - 1;
            if (nodeIndex < 0 || nodeIndex >= nodesData.length) {
                console.log('[Bookmark Check] nodeIndex 无效:', nodeIndex);
                return;
            }

            const node = nodesData[nodeIndex];
            const nodeId = node.id || node.node_id || node.ID || node.nodeId;
            console.log('[Bookmark Check] nodeId:', nodeId);

            const token = localStorage.getItem(TOKEN_STORAGE_KEY);
            if (!token || !currentTemplateId) {
                console.log('[Bookmark Check] token 或 currentTemplateId 不存在');
                return;
            }

            // 获取模板的所有书签
            console.log('[Bookmark Check] 获取模板书签列表, templateId:', currentTemplateId);
            const response = await fetch(`${API_BASE_URL}/v1/sop/templates/${currentTemplateId}/bookmarks`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();
            console.log('[Bookmark Check] API 响应:', data);

            if (data.code === 0 && data.data && data.data.bookmarks) {
                console.log('[Bookmark Check] 书签列表:', data.data.bookmarks);
                const bookmark = data.data.bookmarks.find(b => b.node_id == nodeId);
                console.log('[Bookmark Check] 匹配的书签:', bookmark);

                if (bookmark) {
                    console.log('[Bookmark Check] 找到书签，设置 bookmarked = true');
                    bookmarkBtn.dataset.bookmarked = 'true';
                    // 存储书签 ID 用于后续删除
                    if (bookmark.id) {
                        bookmarkBtn.dataset.bookmarkId = bookmark.id;
                        console.log('[Bookmark Check] 设置 bookmarkId:', bookmark.id);
                    }
                    bookmarkBtn.classList.add('bookmarked');
                    bookmarkBtn.innerHTML = `
                            <i data-lucide="bookmark-check" class="chatbot-copy-icon"></i>
                            <span>已保存</span>
                        `;
                    if (typeof lucide !== 'undefined') lucide.createIcons();

                    console.log('[Bookmark Check] 按钮状态已更新, dataset:', {
                        step: bookmarkBtn.dataset.step,
                        bookmarked: bookmarkBtn.dataset.bookmarked,
                        bookmarkId: bookmarkBtn.dataset.bookmarkId
                    });
                } else {
                    console.log('[Bookmark Check] 未找到匹配的书签');
                }
            } else {
                console.log('[Bookmark Check] API 响应格式不正确或无书签数据');
            }
        } catch (error) {
            console.error('[Bookmark Check] 检查书签状态失败:', error);
        }
    }

    // 应用书签到当前节点
    async function applyBookmarkToNode(stepNumber, bookmarkId) {
        try {
            const nodeIndex = stepNumber - 1;
            if (nodeIndex < 0 || nodeIndex >= nodesData.length) {
                showToast('无效的步骤编号', 'error');
                return;
            }

            const node = nodesData[nodeIndex];
            const nodeId = node.id || node.node_id || node.ID || node.nodeId;

            const token = localStorage.getItem(TOKEN_STORAGE_KEY);
            const response = await fetch(`${API_BASE_URL}/v1/sop/runs/${currentRunId}/nodes/${nodeId}/apply-bookmark`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    bookmark_id: bookmarkId
                })
            });

            const data = await response.json();
            if (data.code === 0) {
                // 更新节点状态
                await updateNodeStatus();

                // 恢复节点内容
                await restoreCompletedNodeContent(stepNumber);

                // 标记步骤为已完成
                const stepElement = document.querySelector(`[data-step="${stepNumber}"]`);
                if (stepElement) {
                    stepElement.classList.add('completed', 'from-bookmark');
                }

                showToast('已应用书签', 'success');

                // 跳转到下一个节点
                const nextNodeData = await getNextNode();
                if (nextNodeData && nextNodeData.node_id) {
                    jumpToNode(nextNodeData.node_id);
                }
            } else {
                throw new Error(data.message || '应用书签失败');
            }
        } catch (error) {
            console.error('应用书签失败:', error);
            showToast('应用失败: ' + error.message, 'error');
        }
    }

    // 获取下一个准备执行的节点
    async function getNextNode() {
        try {
            if (!currentRunId) {
                throw new Error('未找到runId，请确保从正确的入口进入');
            }

            const token = localStorage.getItem(TOKEN_STORAGE_KEY);
            if (!token) {
                throw new Error('未找到认证Token，请先登录');
            }

            const response = await fetch(`${API_BASE_URL}/v1/sop/runs/${currentRunId}/next-node`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `获取下一个节点失败 (${response.status})`);
            }

            const data = await response.json();

            if (data.code !== 0) {
                throw new Error(data.message || '获取下一个节点失败');
            }

            const nextNodeData = data.data; // { node_id, node_name, sort, is_first, has_next }

            // 更新下一个节点ID
            if (nextNodeData && nextNodeData.node_id) {
                nodeStatus.nextNodeId = nextNodeData.node_id;
            }

            // 调用status API更新节点状态
            await updateNodeStatus();

            return nextNodeData;
        } catch (error) {
            console.error('获取下一个节点失败:', error);
            throw error;
        }
    }

    // 根据 node_id 跳转到对应的步骤
    function jumpToNode(nodeId, isLastNode = false) {
        if (!nodesData || nodesData.length === 0) {
            console.warn('节点数据未加载，无法跳转');
            return false;
        }

        // 在 nodesData 中查找对应的节点
        const nodeIndex = nodesData.findIndex(node => {
            const id = node.id || node.node_id || node.ID || node.nodeId;
            return id === nodeId || id === parseInt(nodeId);
        });

        if (nodeIndex === -1) {
            console.warn(`未找到 node_id 为 ${nodeId} 的节点`);
            return false;
        }

        // nodeIndex 是从0开始的，步骤是从1开始的
        const targetStep = nodeIndex + 1;

        if (targetStep < 1 || targetStep > nodesData.length) {
            console.warn(`目标步骤 ${targetStep} 超出范围`);
            return false;
        }

        // 跳转到对应步骤
        setActiveStep(targetStep);
        console.log(`已跳转到步骤 ${targetStep} (node_id: ${nodeId})`);

        // 记录当前节点是否是最后一个节点
        isCurrentStepLastNode = isLastNode;

        // 如果是最后一个节点，但不立即更新按钮（因为用户可能还需要执行操作）
        // 按钮会在用户完成操作后更新（在各步骤的处理函数中）

        return true;
    }

    // 将指定步骤的"下一步"按钮改为"完成"按钮
    function updateButtonToComplete(stepNumber) {
        const buttonId = `step${stepNumber}-next-btn`;
        const nextBtn = document.getElementById(buttonId);
        if (nextBtn) {
            // 更新按钮文本和功能
            nextBtn.textContent = '完成';
            nextBtn.onclick = function () {
                // 跳转到首页
                if (__sopOnNavigateHome) { __sopOnNavigateHome(); } else { window.location.href = '/'; }
            };

            console.log(`步骤 ${stepNumber} 的按钮已更新为"完成"`);
        } else {
            console.warn(`未找到按钮 ${buttonId}`);
        }
    }


    // 显示页面加载遮罩
    function showPageLoadingOverlay() {
        const overlay = document.getElementById('page-loading-overlay');
        if (overlay) {
            overlay.classList.add('show');
        }
    }

    // 隐藏页面加载遮罩
    function hidePageLoadingOverlay() {
        const overlay = document.getElementById('page-loading-overlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
    }

    // 显示"正在进入下一步..."的加载提示
    function showNextStepLoading() {
        const overlay = document.getElementById('page-loading-overlay');
        const loadingText = overlay?.querySelector('.loading-text');
        if (overlay) {
            if (loadingText) {
                loadingText.textContent = '正在进入下一步...';
            }
            overlay.classList.add('show');
        }
    }

    // 隐藏"正在进入下一步..."的加载提示
    function hideNextStepLoading() {
        const overlay = document.getElementById('page-loading-overlay');
        const loadingText = overlay?.querySelector('.loading-text');
        if (overlay) {
            overlay.classList.remove('show');
            // 恢复默认文本
            if (loadingText) {
                loadingText.textContent = '刷新中...';
            }
        }
    }

    // 根据API返回的节点数据更新步骤条
    async function updateStepperFromNodes() {
        // 显示加载遮罩
        showPageLoadingOverlay();

        try {
            // 从URL参数获取templateId
            const urlParams = new URLSearchParams(window.location.search);
            const templateId = urlParams.get('templateId');

            if (!templateId) {
                console.log('未找到templateId参数，使用默认步骤条');
                return;
            }

            // 从API获取节点数据
            const token = localStorage.getItem(TOKEN_STORAGE_KEY);
            if (!token) {
                console.error('未找到认证Token，请先登录');
                return;
            }

            const response = await fetch(`${API_BASE_URL}/v1/sop/templates/${templateId}/nodes`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                console.error('获取节点数据失败:', response.status);
                return;
            }

            const responseData = await response.json();
            const nodes = responseData.data?.nodes || [];

            if (nodes.length === 0) {
                console.log('节点数据为空，使用默认步骤条');
                return;
            }

            // 保存节点数据供后续使用
            nodesData = nodes;

            // [优化] 如果是懒加载模式（无 runId），预设第一个节点为下一个节点，以便 canAccessStep 允许访问第一步
            if (!currentRunId && nodes.length > 0) {
                const firstNode = nodes[0];
                nodeStatus.nextNodeId = firstNode.id || firstNode.node_id || firstNode.ID || firstNode.nodeId;
                console.log(`[初始化] 懒加载模式，预设第一个节点 ${nodeStatus.nextNodeId} 为 nextNodeId`);
            }

            // 获取步骤条容器
            const stepper = document.querySelector('.stepper');
            if (!stepper) {
                console.error('未找到步骤条容器');
                return;
            }

            // 清空现有步骤
            stepper.innerHTML = '';

            // 根据节点数据创建步骤
            nodes.forEach((node, index) => {
                const stepNumber = index + 1;
                const step = document.createElement('div');
                step.className = 'step';
                step.setAttribute('data-step', stepNumber);
                step.onclick = () => {
                    // 【强制清理】切换步骤时立即重置底部跟随状态，防止上一步的残留箭头出现在下一步
                    if (typeof scrollFollowManager !== 'undefined' && scrollFollowManager.reset) {
                        scrollFollowManager.reset();
                    }

                    if (canAccessStep(stepNumber)) {
                        setActiveStep(stepNumber);
                    } else {
                        showToast('该步骤尚未完成，无法访问');
                    }
                };

                // 如果是最后一个后端节点，添加特殊class用于虚线连接（适用于所有templateId）
                if (index === nodes.length - 1) {
                    step.classList.add('step-before-chat');
                }

                const stepNumberDiv = document.createElement('div');
                stepNumberDiv.className = 'step-number';
                stepNumberDiv.textContent = stepNumber;

                const stepLabelDiv = document.createElement('div');
                stepLabelDiv.className = 'step-label';
                // 使用节点的name字段，如果没有则尝试其他可能的字段名
                stepLabelDiv.textContent = node.name || node.title || node.label || node.node_name || `步骤 ${stepNumber}`;

                step.appendChild(stepNumberDiv);
                step.appendChild(stepLabelDiv);
                stepper.appendChild(step);
            });

            // 手动添加AI聊天步骤（前端特殊节点）- 步骤编号为后端节点数量+1，适用于所有templateId
            const chatStepNumber = nodes.length + 1;
            const step5 = document.createElement('div');
            step5.className = 'step step-chat';
            step5.setAttribute('data-step', chatStepNumber.toString());
            step5.onclick = () => {
                if (canAccessStep(chatStepNumber)) {
                    setActiveStep(chatStepNumber);
                } else {
                    showToast('该步骤尚未完成，无法访问');
                }
            };

            const step5NumberDiv = document.createElement('div');
            step5NumberDiv.className = 'step-number';
            step5NumberDiv.textContent = chatStepNumber.toString();

            const step5LabelDiv = document.createElement('div');
            step5LabelDiv.className = 'step-label';
            step5LabelDiv.textContent = 'AI 聊天';

            step5.appendChild(step5NumberDiv);
            step5.appendChild(step5LabelDiv);
            stepper.appendChild(step5);

            // 重新添加分隔线 + 历史记录按钮（动态重建后恢复）
            const divider = document.createElement('div');
            divider.className = 'stepper-divider';
            stepper.appendChild(divider);

            const historyBtn = document.createElement('button');
            historyBtn.className = 'stepper-history-btn';
            historyBtn.onclick = () => openHistoryModal();
            historyBtn.title = '历史记录';
            historyBtn.innerHTML = '<svg class="history-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg><span class="stepper-history-label">历史记录</span>';
            stepper.appendChild(historyBtn);

            // 初始化节点状态（在获取节点数据后）
            await updateNodeStatus();

            // 获取status数据（updateNodeStatus已经保存到nodeStatus.statusData）
            const statusData = nodeStatus.statusData;

            // 根据下一个节点设置初始活动步骤
            let targetStep = 1; // 默认第一步
            // chatStepNumber已经在上面声明了，这里不需要重复声明

            // 使用statusData中的next_node信息
            if (statusData && statusData.next_node && statusData.next_node.node_id) {
                // 有下一个节点，跳转到下一个节点对应的步骤
                const nextNodeIndex = nodesData.findIndex(node => {
                    const id = node.id || node.node_id || node.ID || node.nodeId;
                    return id === statusData.next_node.node_id || id === parseInt(statusData.next_node.node_id);
                });

                if (nextNodeIndex !== -1) {
                    targetStep = nextNodeIndex + 1;
                    console.log(`[初始化] 检测到下一个节点，跳转到步骤 ${targetStep}`);
                } else {
                    // 如果找不到对应的节点，查找第一个可访问的步骤
                    for (let i = 1; i <= nodes.length + 1; i++) {
                        if (canAccessStep(i)) {
                            targetStep = i;
                            break;
                        }
                    }
                    // 如果找不到可访问的步骤，默认使用第一步（新创建或懒加载模式）
                    if (targetStep === 1 && !canAccessStep(1) && (!currentRunId || (statusData && statusData.completed_count === 0))) {
                        // 对于新创建或懒加载的运行，即使 canAccessStep 返回 false，也应该允许访问第一步
                        console.log(`[初始化] 新创建或懒加载模型，允许访问第一步`);
                        targetStep = 1;
                    }
                }
            } else if (statusData && statusData.completed_count === statusData.total_nodes) {
                // 所有后端节点都完成了，应该显示第五步（AI聊天）
                targetStep = chatStepNumber;
                console.log(`[初始化] 所有后端节点已完成，跳转到第五步（AI聊天）`);
            } else {
                // 如果没有下一个节点且不是全部完成，查找第一个可访问的步骤
                // 这种情况可能发生在状态异常时，使用fallback逻辑
                for (let i = 1; i <= nodes.length + 1; i++) {
                    if (canAccessStep(i)) {
                        targetStep = i;
                        break;
                    }
                }
                // 如果找不到可访问的步骤，且是新创建的运行（没有完成的节点），默认使用第一步
                if (targetStep === 1 && !canAccessStep(1) && statusData && statusData.completed_count === 0) {
                    console.log(`[初始化] 新创建的运行，允许访问第一步`);
                    targetStep = 1;
                }
            }

            // [Fix] 优先尝试从 sessionStorage 恢复用户上次停留的步骤
            if (currentRunId) {
                const savedStep = sessionStorage.getItem(`sop_step_${currentRunId}`);
                if (savedStep) {
                    const savedStepInt = parseInt(savedStep);
                    // 确保保存的步骤是有效的，且用户有权限访问（已完成或是下一个节点）
                    if (savedStepInt >= 1 && savedStepInt <= chatStepNumber && canAccessStep(savedStepInt)) {
                        targetStep = savedStepInt;
                        console.log(`[初始化] 从 sessionStorage 恢复步骤: ${targetStep}`);
                    }
                }
            }

            currentStep = targetStep;
            // setActiveStep(targetStep); // [优化] 延迟到内容恢复后再执行，防止闪烁

            console.log(`[初始化] 准备恢复已完成节点的内容，已完成节点数量: ${nodeStatus.completedNodeIds.length}`);
            console.log(`[初始化] 已完成节点ID列表:`, nodeStatus.completedNodeIds);

            // setActiveStep 已经处理了第五步聊天内容的恢复逻辑，此处不再重复调用

            // 恢复所有已完成节点的内容（始终恢复，不管当前步骤是什么）
            const restorePromises = [];
            if (nodeStatus.completedNodeIds.length > 0) {
                nodeStatus.completedNodeIds.forEach((completedNodeId) => {
                    const completedNodeIndex = nodesData.findIndex(node => {
                        const nid = node.node_id || node.id || node.ID || node.nodeId;
                        const id = node.id || node.node_id || node.ID || node.nodeId;
                        const nidInt = parseInt(nid);
                        const idInt = parseInt(id);
                        const completedIdInt = parseInt(completedNodeId);

                        return String(nid) === String(completedNodeId) ||
                            String(id) === String(completedNodeId) ||
                            nidInt === completedIdInt ||
                            idInt === completedIdInt;
                    });

                    if (completedNodeIndex !== -1) {
                        const completedStep = completedNodeIndex + 1;
                        console.log(`[初始化] 准备恢复步骤 ${completedStep} (节点 ${completedNodeId})`);

                        // 创建恢复任务
                        const promise = (async () => {
                            try {
                                // 如果不是当前步骤，稍微延迟以避免阻塞
                                if (completedStep !== targetStep) {
                                    await new Promise(resolve => setTimeout(resolve, 50 * completedStep));
                                }
                                await restoreCompletedNodeContent(completedStep);
                            } catch (error) {
                                console.error(`[初始化] 恢复步骤 ${completedStep} 失败:`, error);
                            }
                        })();

                        restorePromises.push(promise);
                    } else {
                        console.warn(`[初始化] 未找到节点 ${completedNodeId} 在nodesData中的索引`);
                    }
                });
            }

            // 等待所有内容恢复完成
            if (restorePromises.length > 0) {
                Promise.all(restorePromises).then(() => {
                    console.log(`[初始化] ✅ 所有节点内容恢复完成`);
                    // 所有内容恢复后，再跳转到目标步骤
                    setActiveStep(targetStep);
                    applyTemplateCustomization(templateId);
                }).catch(error => {
                    console.error(`[初始化] 部分节点内容恢复失败:`, error);
                    // 即使出错也尝试跳转
                    setActiveStep(targetStep);
                    applyTemplateCustomization(templateId);
                });
            } else {
                console.log(`[初始化] 没有需要恢复的内容`);
                setActiveStep(targetStep);
                applyTemplateCustomization(templateId);
            }


            console.log('步骤条已根据节点数据更新:', nodes.length, '个后端节点 + 1个前端特殊节点（AI聊天）');
        } catch (error) {
            console.error('更新步骤条失败:', error);
        } finally {
            // 等待一小段时间确保DOM更新和内容渲染完成，然后隐藏加载遮罩
            setTimeout(() => {
                hidePageLoadingOverlay();
            }, 200);
        }
    }

    // 执行节点API调用（使用当前步骤，支持流式输出）
    async function executeNode(textContent, files, contentElement) {
        try {
            // [优化] 如果当前没有 runId（新建模式），则先创建一个
            if (!currentRunId) {
                console.log('检测到新建模式，正在执行懒加载创建 Run...');
                await lazyCreateSOPRun();
            }

            // 清除draft标志（首次执行节点时）
            if (isDraftRun) {
                console.log('[Draft] 首次执行节点，draft 状态将转为 running');
                isDraftRun = false;
            }

            // 使用全局变量 currentStep 获取当前步骤对应的节点（步骤从1开始，数组从0开始）
            const nodeIndex = currentStep - 1;
            if (nodeIndex < 0 || nodeIndex >= nodesData.length) {
                throw new Error(`当前步骤 ${currentStep} 对应的节点不存在`);
            }

            const node = nodesData[nodeIndex];
            // 获取node_id，尝试多个可能的字段名
            const nodeId = node.id || node.node_id || node.ID || node.nodeId;
            if (!nodeId) {
                throw new Error(`当前节点缺少ID字段`);
            }

            const token = localStorage.getItem(TOKEN_STORAGE_KEY);
            if (!token) {
                throw new Error('未找到认证Token，请先登录');
            }

            // 构建FormData
            const formData = new FormData();

            // 添加文件（如果有）
            if (files && files.length > 0) {
                for (let i = 0; i < files.length; i++) {
                    formData.append('files', files[i]);
                }
            }

            // 添加文本框内容（如果有）
            if (textContent && textContent.trim()) {
                formData.append('text', textContent);
            }

            console.log(`正在执行当前步骤 ${currentStep} 的节点 (node_id: ${nodeId}, run_id: ${currentRunId})...`);

            const response = await fetch(`${API_BASE_URL}/v1/sop/runs/${currentRunId}/nodes/${nodeId}/execute`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                    // 注意：不要手动设置Content-Type，让浏览器自动设置multipart/form-data的boundary
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `执行节点失败 (${response.status})`);
            }

            // 检查响应是否为流式输出
            // 优先检查是否有contentElement，如果有则尝试流式处理
            // 同时检查Content-Type是否为流式格式
            const contentType = (response.headers && typeof response.headers.get === 'function') ? (response.headers.get('content-type') || '') : '';
            const isStreaming = contentType.includes('text/event-stream') ||
                contentType.includes('text/plain') ||
                contentType.includes('application/x-ndjson') ||
                contentType.includes('text/html'); // 有些后端可能返回text/html

            // 如果有contentElement，优先使用流式处理（即使Content-Type不匹配）
            if (contentElement) {
                // 流式输出处理
                console.log('使用流式处理，Content-Type:', contentType);
                return await handleStreamingResponse(response, contentElement);
            } else if (isStreaming) {
                // 流式输出但没有contentElement，返回完整数据
                return await handleStreamingResponse(response, null);
            } else {
                // 非流式输出，返回完整数据
                const data = await response.json();
                console.log('节点执行成功:', data);
                return data;
            }

        } catch (error) {
            console.error('执行节点失败:', error);

            // 错误自动恢复：如果run不存在，自动重建
            if (error.message && error.message.includes('不存在')) {
                console.log('[Draft] Run不存在，自动重建...');
                showToast('会话已过期，正在重新创建...', 'info');

                try {
                    currentRunId = null;
                    isDraftRun = false;

                    await lazyCreateSOPRun();
                    await updateNodeStatus();
                    await restoreAllCompletedNodes();

                    return await executeNode(textContent, files, contentElement);
                } catch (retryError) {
                    showToast('重新创建失败: ' + retryError.message, 'error');
                    throw retryError;
                }
            }

            throw error;
        }
    }

    // 懒加载创建 SOP Run
    async function lazyCreateSOPRun() {
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (!token) {
            throw new Error('未找到认证Token，请先登录');
        }

        if (!currentTemplateId) {
            throw new Error('缺失 Template ID，无法创建 SOP Run');
        }

        // 默认自动应用书签
        const autoApplyBookmarks = true;

        const response = await fetch(`${API_BASE_URL}/v1/sop/runs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                template_id: parseInt(currentTemplateId),
                text: '', // 初始文本为空，后续执行会带上
                auto_apply_bookmarks: autoApplyBookmarks // 新增：是否自动应用书签
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || '创建 SOP 记录失败');
        }

        const data = await response.json();
        // 兼容后端返回的 id 或 ID 字段
        const runId = data.data && (data.data.id || data.data.ID);
        if (data.code === 0 && runId) {
            const newRunId = runId;
            const oldDraftTag = `draft_${currentTemplateId}`;

            // 1. 设置新 ID
            currentRunId = newRunId;
            isDraftRun = true;
            console.log('懒加载创建 Run 成功，新 ID:', currentRunId, 'Draft 模式');

            // 2. 显示自动应用书签的提示
            if (data.data.auto_applied_count && data.data.auto_applied_count > 0) {
                showToast(`已自动恢复 ${data.data.auto_applied_count} 个步骤的书签`, 'success');
            }

            // 3. 静态迁移本地持久化草稿 (将 draft_xxx 重命名为实际的 runId_xxx)
            PERSISTENT_INPUT_IDS.forEach(id => {
                const oldKey = `sop_input_${oldDraftTag}_${id}`;
                const newKey = `sop_input_${currentRunId}_${id}`;
                const val = localStorage.getItem(oldKey);
                if (val) {
                    localStorage.setItem(newKey, val);
                    localStorage.removeItem(oldKey);
                }
            });

            // 4. [V3] 更新 URL（通过 Vue Router 回调或 pushState）
            if (__sopOnSwitchRun) {
                __sopOnSwitchRun(String(currentRunId), String(currentTemplateId));
            } else {
                const url = new URL(window.location.href);
                url.searchParams.set('runId', currentRunId);
                window.history.pushState({}, '', url.toString());
            }
        } else {
            throw new Error('后端返回的数据格式不正确，无法获取 Run ID');
        }
    }

    // ==================== 跟随底部管理器（全新重写） ====================
    const scrollFollowManager = {
        streamingElements: new Set(),
        isFollowing: true, // 全局跟随状态
        followButton: null,
        lastScrollTop: new Map(), // 记录每个容器最后的滚动位置，用于判断用户操作
        elementStates: new Map(), // 保持兼容性，防止其他地方调用报错
        containerToElements: new Map(), // 保持兼容性
        isProgrammaticScrolling: false, // 标记是否是程序触发的滚动
        checkInterval: null,


        init() {
            this.createFollowButton();
            this.setupEventListeners();
        },

        startPeriodicCheck() {
            if (this.checkInterval) return;
            this.checkInterval = setInterval(() => {
                this.streamingElements.forEach(element => {
                    this.checkAndScroll(element);
                });
            }, 100);
        },

        stopPeriodicCheck() {
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
            }
        },

        createFollowButton() {
            if (this.followButton) return;
            this.followButton = document.createElement('button');
            this.followButton.className = 'scroll-follow-button';
            this.followButton.innerHTML = `
                    <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 2L8 14M8 14L2 8M8 14L14 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                `;
            this.followButton.title = '跟随底部';
            this.followButton.addEventListener('click', () => this.resumeFollowing());
            document.body.appendChild(this.followButton);
        },

        // 注册流式元素（开始生成时调用）
        registerStreamingElement(element) {
            if (!element) return;

            // 如果已经注册过，直接返回，不再重置全局跟随状态
            if (this.streamingElements.has(element)) return;

            this.streamingElements.add(element);
            this.isFollowing = true; // 仅在第一次注册新元素时开启跟随
            this.hideFollowButton();

            // 初始化位置记录并立即强制滚动一次，确保锚定到底部
            const containers = this.findAllScrollContainers(element);
            containers.forEach(c => {
                this.scrollToBottomInternal(c, 'auto');
                this.lastScrollTop.set(c, this.getScrollTop(c));
            });
        },

        // 注销流式元素（生成结束时调用）
        unregisterStreamingElement(element) {
            this.streamingElements.delete(element);
            if (this.streamingElements.size === 0) {
                this.reset(); // 只要没有流式元素，立即进入彻底静默状态
            }
        },

        // 强制重置状态并隐藏 UI（用于切换步骤或生成意外中断）
        reset() {
            this.streamingElements.clear();
            this.isFollowing = true;
            this.isProgrammaticScrolling = false;
            this.stopPeriodicCheck();
            if (this.followButton) {
                this.followButton.style.display = 'none';
                this.followButton.style.opacity = '0';
            }
        },

        // 核心检查与滚动函数
        checkAndScroll(element) {
            if (!element || !this.isFollowing || this.streamingElements.size === 0) return;

            const containers = this.findAllScrollContainers(element);

            // 使用 requestAnimationFrame 确保在浏览器重绘前执行，减少抖动
            requestAnimationFrame(() => {
                // 如果在回调执行时，已经不再跟随，则退出
                if (!this.isFollowing) return;

                containers.forEach(container => {
                    if (this.isElementNearOrBelowBottom(element, container)) {
                        this.scrollToBottomInternal(container, 'auto'); // 流式过程中使用 auto 避开动画堆栈
                    }
                });
            });
        },

        // 恢复跟随
        resumeFollowing() {
            this.isFollowing = true;
            this.hideFollowButton();

            // 瞬间定位并平滑滚动到最新的底部
            this.streamingElements.forEach(element => {
                const containers = this.findAllScrollContainers(element);
                containers.forEach(c => this.scrollToBottomInternal(c, 'smooth'));
            });
        },

        // 内部滚动实现
        scrollToBottomInternal(container, behavior) {
            if (!this.isFollowing) return;

            const currentTop = this.getScrollTop(container);
            const targetHeight = this.getScrollHeight(container);
            const clientHeight = (container === window) ? window.innerHeight : container.clientHeight;

            // 真正的“到底了”的目标滚动位置
            const maxScroll = Math.max(0, targetHeight - clientHeight);
            let targetTop = maxScroll;

            // 用户要求：向下滚动的幅度减小为现在的三分之二
            // 只有在流式过程中的自动跟随（behavior === 'auto'）才应用此逻辑
            if (behavior === 'auto' && this.streamingElements.size > 0) {
                const delta = maxScroll - currentTop;
                if (delta > 30) { // 只有间距较大时才使用 2/3 缓冲，小间距直接到底以保持稳定
                    targetTop = currentTop + (delta * 0.667);
                }
            }

            this.isProgrammaticScrolling = true;
            if (container === window) {
                window.scrollTo({ top: targetTop, behavior });
            } else {
                container.scrollTo({ top: targetTop, behavior });
            }

            // 更新记录值，避免被误判为用户滚动
            // 使用 setTimeout 是为了确保滚动事件触发时 isProgrammaticScrolling 依然为 true
            const delay = behavior === 'smooth' ? 300 : 60;
            setTimeout(() => {
                this.lastScrollTop.set(container, this.getScrollTop(container));
                this.isProgrammaticScrolling = false;
            }, delay);
        },

        // 监听用户操作，实现“向上滚动一点点就立刻打断”
        setupEventListeners() {
            let lastY = 0;
            window.addEventListener('touchstart', (e) => {
                if (e.touches.length > 0) lastY = e.touches[0].clientY;
            }, { passive: true });

            const handleUserScrollIntent = (e) => {
                if (this.streamingElements.size === 0 || !this.isFollowing) return;

                // 1. 滚轮/触控板向上操作
                if (e.type === 'wheel' && e.deltaY < 0) {
                    this.interruptFollowing();
                    return;
                }

                // 2. 移动端滑动检测 (手指由上向下划 = 页面向上滚动)
                if (e.type === 'touchmove' && e.touches.length > 0) {
                    const currentY = e.touches[0].clientY;
                    if (currentY > lastY + 5) { // 手指向下移动，页面向上移动
                        this.interruptFollowing();
                    }
                    lastY = currentY;
                }
            };

            const handleActualScroll = (e) => {
                if (this.streamingElements.size === 0 || this.isProgrammaticScrolling) return;

                const container = e.target === document ? window : e.target;
                const currentTop = this.getScrollTop(container);
                const lastTop = (this.lastScrollTop && typeof this.lastScrollTop.get === 'function') ? (this.lastScrollTop.get(container) || 0) : 0;

                if (currentTop < lastTop - 5) { // 增加容错阈值
                    this.interruptFollowing();
                }

                // 始终同步位置，防止误差累积
                this.lastScrollTop.set(container, currentTop);
            };

            window.addEventListener('wheel', handleUserScrollIntent, { passive: true, capture: true });
            document.addEventListener('scroll', handleActualScroll, { passive: true, capture: true });
            // 移动端支持
            window.addEventListener('touchmove', handleUserScrollIntent, { passive: true, capture: true });
        },

        interruptFollowing() {
            if (!this.isFollowing) return;
            console.log('🚫 检测到用户向上操作，打断自动跟随');
            this.isFollowing = false;
            this.showFollowButton();
        },

        // 公开的滚动到底部方法（强制滚动到绝对底部）
        scrollToBottom(element, behavior = 'smooth') {
            if (!element) return;
            const containers = this.findAllScrollContainers(element);
            requestAnimationFrame(() => {
                containers.forEach(container => {
                    this.scrollToBottomInternal(container, behavior);
                });
            });
        },

        // 判定元素是否已经超出视口底部（需要滚动）
        isElementNearOrBelowBottom(element, container) {
            const rect = element.getBoundingClientRect();
            const viewportBottom = (container === window) ? window.innerHeight : container.getBoundingClientRect().bottom;

            // 特殊逻辑：针对第五步的输入框偏移补偿
            const inputArea = document.getElementById('chatbot-input-area');
            let offset = 20;
            if (inputArea && document.body.contains(inputArea)) {
                const inputRect = inputArea.getBoundingClientRect();
                // 如果元素在聊天区域内，基准线应该是输入框的顶部
                if (element.closest('#chatbot-container, #chatbot-messages')) {
                    return rect.bottom > inputRect.top - offset;
                }
            }

            return rect.bottom > viewportBottom - offset;
        },

        // 辅助工具函数
        findAllScrollContainers(element) {
            const containers = [];
            let p = element.parentElement;
            while (p && p !== document.body && p !== document.documentElement) {
                const style = window.getComputedStyle(p);
                if (/(auto|scroll)/.test(style.overflowY) && p.scrollHeight > p.clientHeight) {
                    containers.push(p);
                }
                p = p.parentElement;
            }
            containers.push(window);
            return containers;
        },

        getScrollTop(c) {
            return c === window ? (window.pageYOffset || document.documentElement.scrollTop) : c.scrollTop;
        },

        getScrollHeight(c) {
            return c === window ? document.documentElement.scrollHeight : c.scrollHeight;
        },

        showFollowButton() {
            if (!this.followButton || this.streamingElements.size === 0) return;
            this.followButton.style.display = 'flex';
            requestAnimationFrame(() => {
                if (this.followButton) this.followButton.style.opacity = '1';
            });
        },

        hideFollowButton() {
            if (!this.followButton) return;
            this.followButton.style.opacity = '0';
            setTimeout(() => {
                // 如果已经注销了流式元素，或者已经恢复了跟随，则彻底隐藏
                if (this.isFollowing || this.streamingElements.size === 0) {
                    if (this.followButton) this.followButton.style.display = 'none';
                }
            }, 300);
        },

        // 保持 API 兼容
        startPeriodicCheck() { /* 逻辑已整合 */ },
        stopPeriodicCheck() { /* 逻辑已整合 */ }
    };

    // 初始化管理器
    scrollFollowManager.init();

    // [Fix] 全局存储每个输入框的图片识别结果，防止在并发上传或分级上传时相互覆盖
    const textareaImageResults = new Map();
    // [Fix] 存储每个输入框的非图片内容（如手动输入或PDF解析结果），确保不会被图片结果覆盖
    const textareaBaseText = new Map();

    // 深度思考模式状态（全局声明）
    window.isDeepThinking = false;

    // [V3] 认证已由 Vue Router 守卫处理，此处跳过 authManager.init
    // 深度思考按钮事件监听在 __sopDOMContentLoadedChat 中统一处理

    // 创建或更新思维链显示区域的辅助函数
    function createOrUpdateThinkingElement(contentElement, thinkingContent) {
        if (!contentElement) return null;

        // 如果thinking内容不为空，移除加载提示（如果存在）
        if (thinkingContent && thinkingContent.trim()) {
            const loadingMessage = contentElement.querySelector('.loading-message');
            if (loadingMessage) {
                loadingMessage.remove();
            }
        }

        // 尝试找到现有的思维链容器
        let thinkingContainer = null;
        const parent = contentElement.parentElement;

        if (parent) {
            thinkingContainer = parent.querySelector('.thinking-container');
        }

        // 如果没有找到，创建一个新的思维链容器
        if (!thinkingContainer) {
            thinkingContainer = document.createElement('div');
            thinkingContainer.className = 'thinking-container';

            thinkingContainer.innerHTML = `
                    <div class="thinking-header">
                        <div class="thinking-title">
                            <i data-lucide="chevron-down" class="thinking-icon"></i>
                            <span>已思考完毕</span>
                        </div>
                    </div>
                    <div class="thinking-content"></div>
                `;

            // 重新初始化 Lucide 图标以处理新生成的按钮/容器
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }

            const header = thinkingContainer.querySelector('.thinking-header');
            const titleSpan = header.querySelector('.thinking-title span');
            header.addEventListener('click', function () {
                thinkingContainer.classList.toggle('collapsed');
            });

            // 初始状态为“思考中...”
            titleSpan.textContent = '正在思考中...';

            // 插入到contentElement之前
            if (parent) {
                parent.insertBefore(thinkingContainer, contentElement);
            } else {
                contentElement.parentNode.insertBefore(thinkingContainer, contentElement);
            }
        }

        const thinkingContentDiv = thinkingContainer.querySelector('.thinking-content');
        thinkingContentDiv.textContent = thinkingContent;

        // 每次更新内容时，如果还在思考阶段，确保标题是正确的
        const titleSpan = thinkingContainer.querySelector('.thinking-title span');
        if (titleSpan) {
            if (titleSpan.textContent !== '正在思考中...' && !thinkingContainer.classList.contains('finished')) {
                titleSpan.textContent = '正在思考中...';
            }
        }

        return thinkingContainer;
    }

    // 标记思维链完成的辅助函数
    function markThinkingFinished(contentElement) {
        if (!contentElement) return;
        const parent = contentElement.parentElement;
        if (parent) {
            const thinkingContainer = parent.querySelector('.thinking-container');
            if (thinkingContainer) {
                const titleSpan = thinkingContainer.querySelector('.thinking-title span');
                if (titleSpan) {
                    console.log('🏁 标记思维链完成: 正在思考中... -> 深度思考');
                    titleSpan.textContent = '深度思考';
                    thinkingContainer.classList.add('finished', 'collapsed');
                }
            }
        }
    }

    // 处理流式响应（支持三种事件类型：thinking、普通消息、done）
    // 注意：使用 fetch + ReadableStream 而不是 EventSource，因为需要支持 POST 请求和文件上传
    // 实现要点：
    // 1. 正确解析 SSE 格式：event: thinking / data: "{JSON字符串化的字符串}"
    // 2. data 字段是 JSON 字符串化的字符串，需要 JSON.parse() 解析（例如：data: "\"思考内容\"" → "思考内容"）
    // 3. 必须正确识别 event: thinking 事件类型（不能只使用默认的 message 事件）
    // 4. 累积多个 thinking chunk 片段并实时显示
    async function handleStreamingResponse(response, contentElement) {
        console.log('开始处理流式响应，contentElement:', contentElement);

        if (!contentElement) {
            console.error('contentElement 为空，无法显示流式内容');
            throw new Error('contentElement 为空');
        }

        // 确保元素可见
        if (contentElement) {
            contentElement.style.display = 'block';
            contentElement.style.visibility = 'visible';
        }

        // 注册流式输出元素，开始跟随底部
        const trackedElements = new Set();
        if (contentElement) {
            scrollFollowManager.registerStreamingElement(contentElement);
            trackedElements.add(contentElement);
        }
        scrollFollowManager.startPeriodicCheck();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        // 分别累积思维链和消息内容
        let thinkingContent = '';
        let messageContent = '';

        // 状态标记
        let isThinkingPhase = true; // 标记当前是否在思维链阶段
        let isDone = false;
        let isFirstToken = true; // 标记是否是第一个token（用于显示UI）
        let currentEvent = null; // 当前事件类型
        let pendingUpdate = null; // 待处理的更新任务

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                // 解码数据块
                buffer += decoder.decode(value, { stream: true });

                // 处理SSE格式：每个消息以 \n\n 结尾
                // 先按 \n\n 分割，然后按行处理每个消息
                const messages = buffer.split('\n\n');
                buffer = messages.pop() || ''; // 保留最后一个不完整的消息

                for (const message of messages) {
                    if (!message.trim()) continue;

                    const lines = message.split('\n');
                    let eventType = null;
                    let dataValue = null;

                    // 解析SSE消息格式
                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (!trimmedLine) continue;

                        // 忽略心跳（以 : 开头的行）
                        if (trimmedLine.startsWith(':')) {
                            continue;
                        }

                        // 解析 event 字段（关键：必须正确识别 event 类型）
                        if (trimmedLine.startsWith('event: ')) {
                            eventType = trimmedLine.substring(7).trim();
                            currentEvent = eventType;
                            console.log('📌 识别到事件类型:', eventType);
                            continue;
                        }

                        // 解析 data 字段
                        if (trimmedLine.startsWith('data: ')) {
                            const dataStr = trimmedLine.substring(6).trim();
                            try {
                                // 注意：data 字段是 JSON 字符串化的字符串，需要 JSON.parse() 解析
                                // 例如：data: "\"思考内容\"" → JSON.parse(dataStr) → "思考内容"
                                dataValue = JSON.parse(dataStr);
                                console.log('✅ 成功解析data字段:', typeof dataValue, eventType || 'message');
                            } catch (e) {
                                // 如果解析失败，记录错误并尝试备用方案
                                console.warn('⚠️ JSON解析失败，尝试备用方案:', e.message, '原始数据:', dataStr);
                                // 处理被双引号包裹的字符串
                                if (dataStr.startsWith('"') && dataStr.endsWith('"')) {
                                    try {
                                        dataValue = JSON.parse(dataStr);
                                    } catch (e2) {
                                        // 如果还是解析失败，去掉外层引号
                                        dataValue = dataStr.slice(1, -1);
                                    }
                                } else {
                                    // 直接使用字符串（可能不是JSON格式）
                                    dataValue = dataStr;
                                }
                            }
                            continue;
                        }
                    }

                    // 处理完成事件
                    if (eventType === 'done') {
                        isDone = true;
                        console.log('收到完成事件');
                        // 检查 data 中是否有 status
                        if (dataValue && typeof dataValue === 'object' && dataValue.status === 'completed') {
                            console.log('流式传输完成');
                        }
                        continue;
                    }

                    // 处理思维链事件（关键检查点：必须正确识别 thinking 事件）
                    if (eventType === 'thinking') {
                        if (typeof dataValue === 'string') {
                            // 如果是第一个thinking事件，立即隐藏加载提示，显示结果容器和助手名称
                            if (isFirstToken) {
                                isFirstToken = false;
                                // 隐藏加载提示（确保执行）
                                hideLoadingMessage(contentElement);

                                // 确保结果消息容器已显示
                                const resultMessage = contentElement.closest('.chat-message') ||
                                    document.getElementById('result-message') ||
                                    document.getElementById('script-result-message') ||
                                    document.getElementById('style-result-message') ||
                                    document.getElementById('final-result-message');
                                if (resultMessage) {
                                    resultMessage.style.display = 'block';
                                    // 显示助手名称
                                    const messageHeader = resultMessage.querySelector('.message-header');
                                    if (messageHeader) {
                                        messageHeader.style.display = 'flex';
                                    }
                                }
                            }

                            thinkingContent += dataValue;
                            console.log('💭 收到思维链片段，当前累积长度:', thinkingContent.length, '本次chunk长度:', dataValue.length);

                            // 实时显示思维链内容
                            const thinkingElement = createOrUpdateThinkingElement(contentElement, thinkingContent);

                            // 如果思维链元素存在且未注册，注册到滚动管理器
                            if (thinkingElement && !trackedElements.has(thinkingElement)) {
                                scrollFollowManager.registerStreamingElement(thinkingElement);
                                trackedElements.add(thinkingElement);
                            }

                            // 检查并滚动到底部
                            requestAnimationFrame(() => {
                                if (thinkingElement) {
                                    scrollFollowManager.checkAndScroll(thinkingElement);
                                }
                                scrollFollowManager.checkAndScroll(contentElement);
                            });
                        } else {
                            console.warn('⚠️ thinking事件的数据不是字符串类型:', typeof dataValue, dataValue);
                        }
                        continue;
                    }

                    // 处理普通消息事件（无 event 字段或 event 为 message/空）
                    // 当收到第一个包含实际数据的普通消息时，思维链阶段结束
                    if (!eventType || eventType === '' || eventType === 'message') {
                        // 关键修复：只有当 dataValue 不为 null 时（即非心跳/空消息），才认为正文开始了
                        if (dataValue !== null) {
                            if (isThinkingPhase) {
                                isThinkingPhase = false;
                                console.log('思维链阶段结束，开始接收正文消息');
                                markThinkingFinished(contentElement);
                            }
                        }

                        if (typeof dataValue === 'string') {
                            messageContent += dataValue;

                            // 更新UI（只显示消息内容，不显示思维链）
                            if (contentElement) {
                                // 取消之前的待处理更新（如果有）
                                if (pendingUpdate) {
                                    cancelAnimationFrame(pendingUpdate);
                                    pendingUpdate = null;
                                }

                                // 立即同步更新UI，确保实时显示
                                try {
                                    // 如果是第一个普通消息token，立即隐藏加载提示，显示结果容器和助手名称
                                    // 使用 messageContent.length === dataValue.length 来判断是否是第一个token
                                    const isFirstMessageToken = (messageContent.length === dataValue.length);

                                    if (isFirstToken || isFirstMessageToken) {
                                        isFirstToken = false;
                                        // 隐藏加载提示（确保执行）
                                        hideLoadingMessage(contentElement);

                                        // 确保结果消息容器已显示
                                        const resultMessage = contentElement.closest('.chat-message') ||
                                            document.getElementById('result-message') ||
                                            document.getElementById('script-result-message') ||
                                            document.getElementById('style-result-message') ||
                                            document.getElementById('final-result-message');
                                        if (resultMessage) {
                                            resultMessage.style.display = 'block';
                                            // 显示助手名称
                                            const messageHeader = resultMessage.querySelector('.message-header');
                                            if (messageHeader) {
                                                messageHeader.style.display = 'flex';
                                            }
                                        }
                                    }

                                    // 只显示消息内容，不显示思维链
                                    updateContentElement(contentElement, messageContent);

                                    // 检查并滚动到底部
                                    requestAnimationFrame(() => {
                                        scrollFollowManager.checkAndScroll(contentElement);
                                    });

                                    console.log('✅ 更新UI成功 - token:', dataValue.substring(0, 30) + (dataValue.length > 30 ? '...' : ''), '总长度:', messageContent.length, '元素:', contentElement.id);
                                } catch (updateError) {
                                    console.error('❌ 更新UI失败:', updateError, '元素:', contentElement);
                                }
                            }
                        }
                        continue;
                    }
                }

                // 如果收到结束标志，提前退出
                if (isDone) {
                    break;
                }
            }

            // 处理剩余的buffer（处理最后一个不完整的消息）
            if (buffer.trim() && !isDone) {
                // 尝试解析剩余的buffer
                const lines = buffer.split('\n');
                let remainingEventType = null;
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine) continue;

                    // 忽略心跳
                    if (trimmedLine.startsWith(':')) {
                        continue;
                    }

                    // 检查是否是完成事件
                    if (trimmedLine.startsWith('event: ')) {
                        const eventType = trimmedLine.substring(7).trim();
                        if (eventType === 'done') {
                            isDone = true;
                        } else {
                            remainingEventType = eventType;
                        }
                        continue;
                    }

                    // 处理剩余的data
                    if (trimmedLine.startsWith('data: ')) {
                        const dataStr = trimmedLine.substring(6).trim();
                        try {
                            // 注意：data 字段是 JSON 字符串化的字符串，需要 JSON.parse() 解析
                            const dataValue = JSON.parse(dataStr);
                            if (typeof dataValue === 'string') {
                                if (remainingEventType === 'thinking') {
                                    thinkingContent += dataValue;
                                    console.log('💭 处理剩余buffer - 思维链片段，累积长度:', thinkingContent.length);
                                    const thinkingElement = createOrUpdateThinkingElement(contentElement, thinkingContent);
                                    if (thinkingElement) {
                                        scrollFollowManager.registerStreamingElement(thinkingElement);
                                        trackedElements.add(thinkingElement);
                                        requestAnimationFrame(() => {
                                            scrollFollowManager.checkAndScroll(thinkingElement);
                                        });
                                    }
                                } else if (isThinkingPhase) {
                                    // 如果没有明确的event类型，但还在thinking阶段
                                    thinkingContent += dataValue;
                                    const thinkingElement = createOrUpdateThinkingElement(contentElement, thinkingContent);
                                    if (thinkingElement) {
                                        scrollFollowManager.registerStreamingElement(thinkingElement);
                                        trackedElements.add(thinkingElement);
                                        requestAnimationFrame(() => {
                                            scrollFollowManager.checkAndScroll(thinkingElement);
                                        });
                                    }
                                } else {
                                    messageContent += dataValue;
                                }
                            }
                        } catch (e) {
                            // 解析失败，记录日志但继续处理
                            console.warn('⚠️ 处理剩余buffer - JSON解析失败:', e.message);
                        }
                    }
                }
            }

            // 取消待处理的更新任务，直接进行最终更新
            if (pendingUpdate) {
                cancelAnimationFrame(pendingUpdate);
                pendingUpdate = null;
            }

            // 最终更新一次，确保所有内容都显示（只显示消息内容）
            updateContentElement(contentElement, messageContent);

            // 最后一次检查并滚动
            requestAnimationFrame(() => {
                scrollFollowManager.checkAndScroll(contentElement);
            });

            // 最后确保思维链状态已更新
            // 如果直到流结束都没有接收到普通消息，说明没有正文内容或者思维链就是全部内容
            if (isThinkingPhase && thinkingContent.length > 0) {
                console.log('流已结束，兜底标记思维链完成');
                markThinkingFinished(contentElement);
            }

            // 返回完整内容（包括思维链和消息，可根据需要调整）

            // [Regenerate Feature] 如果是步骤1-4，添加操作按钮（复制按钮常驻，重新生成按钮仅在此处添加，表示最新）
            if (currentStep >= 1 && currentStep <= 4) {
                addStepActions(currentStep, contentElement, true);

                // 禁用前面步骤的输入框，并移除它们的重新生成按钮
                const stepInputIds = {
                    1: 'product-input',
                    2: 'script-input',
                    3: 'style-input',
                    4: 'theme-input'
                };
                for (let prevStep = 1; prevStep < currentStep; prevStep++) {
                    const prevInputId = stepInputIds[prevStep];
                    if (prevInputId) {
                        const prevInputElement = document.getElementById(prevInputId);
                        if (prevInputElement) {
                            prevInputElement.disabled = true;
                            prevInputElement.title = '只能在最新步骤修改输入';
                            prevInputElement.style.opacity = '0.6';
                            prevInputElement.style.cursor = 'not-allowed';
                        }
                    }
                    // 移除前面步骤的重新生成按钮
                    const prevRegenBtn = document.querySelector(`.chatbot-regenerate-btn[data-step="${prevStep}"]`);
                    if (prevRegenBtn) {
                        prevRegenBtn.remove();
                    }
                }
            }

            return {
                data: messageContent,
                thinking: thinkingContent // 可选：如果需要返回思维链内容
            };
        } catch (error) {
            throw error;
        } finally {
            reader.releaseLock();

            console.log('🧹 开始清理流式元素，跟踪数量:', trackedElements.size);

            // 统一注销所有跟踪的流式元素
            for (const element of trackedElements) {
                if (element && scrollFollowManager.streamingElements.has(element)) {
                    // 在注销之前，如果还在跟随底部状态，滚动到底部
                    if (scrollFollowManager.isFollowing) {
                        try {
                            scrollFollowManager.scrollToBottom(element, 'auto');
                        } catch (e) {
                            console.warn('Final scroll to bottom failed:', e);
                        }
                    }
                    // 注销元素
                    scrollFollowManager.unregisterStreamingElement(element);
                }
            }

            if (scrollFollowManager.streamingElements.size === 0) {
                scrollFollowManager.stopPeriodicCheck();
            }
        }
    }

    // [Regenerate Feature] 处理步骤重新生成
    window.handleRegenerateStep = handleRegenerateStep;
    async function handleRegenerateStep(stepNumber) {
        console.log(`[Regenerate] Handling regenerate for Step ${stepNumber}`);





        let inputId, contentId, fileInputId, loadingId, resultId;

        // 根据步骤映射ID
        switch (stepNumber) {
            case 1:
                inputId = 'product-input';
                contentId = 'analysis-content';
                fileInputId = 'product-file-input';
                loadingId = 'loading-message';
                resultId = 'result-message';
                break;
            case 2:
                inputId = 'script-input';
                contentId = 'script-analysis-content';
                fileInputId = 'script-file-input';
                loadingId = 'script-loading-message';
                resultId = 'script-result-message';
                break;
            case 3:
                inputId = 'style-input';
                contentId = 'style-analysis-content';
                fileInputId = 'style-file-input';
                loadingId = 'style-loading-message';
                resultId = 'style-result-message';
                break;
            case 4:
                inputId = 'theme-input';
                contentId = 'generated-script'; // 注意：第四步的内容ID是 generated-script
                fileInputId = 'theme-file-input';
                loadingId = 'final-loading-message';
                resultId = 'final-result-message';
                break;
            default:
                console.error('[Regenerate] Unknown step:', stepNumber);
                return;
        }

        const inputElement = document.getElementById(inputId);
        const contentElement = document.getElementById(contentId);
        const loadingElement = document.getElementById(loadingId);
        const resultElement = document.getElementById(resultId);

        if (!inputElement || !contentElement) {
            console.error('[Regenerate] Missing elements:', { inputId, contentId });
            showToast('无法找到必要的页面元素');
            return;
        }

        // 获取输入内容
        const inputValue = inputElement.value;
        let files = [];
        if (fileInputId) {
            const fileInput = document.getElementById(fileInputId);
            if (fileInput && fileInput.files) {
                files = fileInput.files;
            }
        }

        // UI 状态重置
        // 1. 删除当前步骤的工具栏（包括复制、重新生成、保存生成记录等按钮）
        const actionsContainer = document.getElementById(`step-actions-container-${stepNumber}`);
        if (actionsContainer) {
            actionsContainer.remove();
            console.log(`[Regenerate] 已删除步骤 ${stepNumber} 的工具栏`);
        }

        // 1.5 删除该节点的书签（如果存在）
        // 重新生成应该清除原有的保存记录，因为内容将会改变
        try {
            const nodeIndex = stepNumber - 1;
            if (nodeIndex >= 0 && nodeIndex < nodesData.length) {
                const node = nodesData[nodeIndex];
                const nodeId = node.id || node.node_id || node.ID || node.nodeId;

                if (nodeId) {
                    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
                    if (token && currentTemplateId) {
                        console.log(`[Regenerate] 检查步骤 ${stepNumber} 是否有书签需要删除`);

                        // 获取模板的书签列表
                        const listResponse = await fetch(`${API_BASE_URL}/v1/sop/templates/${currentTemplateId}/bookmarks`, {
                            method: 'GET',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });

                        const listData = await listResponse.json();
                        if (listData.code === 0 && listData.data && listData.data.bookmarks) {
                            const bookmark = listData.data.bookmarks.find(b => b.node_id == nodeId);

                            if (bookmark && bookmark.id) {
                                console.log(`[Regenerate] 找到书签 ID: ${bookmark.id}，正在删除...`);

                                // 删除书签
                                const deleteResponse = await fetch(`${API_BASE_URL}/v1/sop/bookmarks/${bookmark.id}`, {
                                    method: 'DELETE',
                                    headers: {
                                        'Authorization': `Bearer ${token}`
                                    }
                                });

                                const deleteData = await deleteResponse.json();
                                if (deleteData.code === 0) {
                                    console.log(`[Regenerate] 已成功删除步骤 ${stepNumber} 的书签`);
                                } else {
                                    console.warn(`[Regenerate] 删除书签失败:`, deleteData);
                                }
                            } else {
                                console.log(`[Regenerate] 步骤 ${stepNumber} 没有书签，无需删除`);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[Regenerate] 删除书签时出错:', error);
            // 即使删除书签失败，也继续进行重新生成
        }

        // 2. 清空现有内容
        contentElement.innerHTML = '';

        // 3. 显示加载状态
        if (loadingElement) loadingElement.style.display = 'block';
        if (resultElement) resultElement.style.display = 'none';

        // 3.5 移除可能存在的思维链容器
        if (contentElement && contentElement.parentElement) {
            const thinkingContainer = contentElement.parentElement.querySelector('.thinking-container');
            if (thinkingContainer) thinkingContainer.remove();
        }

        // 4. 执行节点
        try {
            // 如果结果容器需要显示才能流式输出
            if (contentElement) {
                contentElement.style.display = 'block';
            }

            await executeNode(inputValue, files, contentElement);

            // [Input Change Detection] 重新生成成功后，更新原始输入值
            originalInputValues[stepNumber] = inputValue;
            console.log(`[输入检测] 步骤 ${stepNumber} 重新生成成功，已更新原始输入值`);

        } catch (error) {
            console.error('[Regenerate] Failed:', error);

            // 错误处理：恢复UI
            if (loadingElement) loadingElement.style.display = 'none';
            if (resultElement) {
                resultElement.style.display = 'block';
            }
            contentElement.innerHTML = `<div class="text-error">重新生成失败: ${error.message}</div>`;
        }
    }

    // 隐藏加载消息（根据contentElement的ID确定要隐藏哪个loading-message）
    function hideLoadingMessage(contentElement) {
        if (!contentElement) {
            console.warn('⚠️ hideLoadingMessage: contentElement 为空');
            return;
        }

        const elementId = contentElement.id || '';
        let loadingMessageId = '';

        console.log('🔍 hideLoadingMessage: elementId =', elementId);

        // 根据contentElement的ID确定对应的loading-message ID
        if (elementId.includes('analysis-content') && !elementId.includes('script') && !elementId.includes('style')) {
            loadingMessageId = 'loading-message';
        } else if (elementId.includes('script-analysis-content')) {
            loadingMessageId = 'script-loading-message';
        } else if (elementId.includes('style-analysis-content')) {
            loadingMessageId = 'style-loading-message';
        } else if (elementId.includes('generated-script')) {
            loadingMessageId = 'final-loading-message';
        }

        if (loadingMessageId) {
            const loadingElement = document.getElementById(loadingMessageId);
            if (loadingElement) {
                loadingElement.style.display = 'none';
                console.log('✅ 隐藏加载提示:', loadingMessageId, '元素ID:', elementId);
            } else {
                console.warn('⚠️ 未找到加载提示元素:', loadingMessageId);
            }
        } else {
            console.warn('⚠️ 无法确定加载提示ID，elementId:', elementId);
        }
    }


    // 更新内容元素（支持Markdown实时渲染）
    function updateContentElement(element, content) {
        if (!element) {
            console.error('updateContentElement: element 为空');
            return;
        }

        // 确保元素可见
        element.style.display = 'block';
        element.style.visibility = 'visible';

        // 判断元素是否需要Markdown渲染
        const elementId = element.id || '';
        const needsMarkdown = elementId.includes('analysis-content') ||
            elementId.includes('script-analysis-content') ||
            elementId.includes('style-analysis-content') ||
            elementId.includes('generated-script'); // 第4步也可能需要markdown

        console.log('updateContentElement - 元素ID:', elementId, '需要Markdown:', needsMarkdown, '内容长度:', content.length);

        if (needsMarkdown && typeof marked !== 'undefined' && marked.parse) {
            try {
                // 确保元素有prose类以应用样式
                if (!element.classList.contains('prose')) {
                    element.classList.add('prose');
                }

                // 清理内容：移除可能的控制字符，但保留正常的markdown格式
                let cleanContent = content;
                // 移除可能导致问题的控制字符（保留换行符和制表符）
                cleanContent = cleanContent.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

                // 实时渲染Markdown（即使内容不完整也会渲染）
                // marked.js可以处理不完整的markdown语法
                const html = marked.parse(cleanContent);
                element.innerHTML = html;

                // 确保样式正确应用
                element.style.whiteSpace = 'normal';
                element.style.wordWrap = 'break-word';
                element.style.overflowWrap = 'break-word';

                console.log('✅ Markdown渲染成功，HTML长度:', html.length);
            } catch (e) {
                console.warn('❌ Markdown渲染失败，使用纯文本:', e);
                // 如果markdown解析失败，降级为纯文本
                element.textContent = content;
                element.style.whiteSpace = 'pre-wrap';
            }
        } else {
            // 纯文本元素直接更新
            element.textContent = content;
            // 保存原始内容以供复制
            element.dataset.rawContent = content;
            console.log('✅ 纯文本更新成功');
        }

        // 保存原始内容以供复制
        element.dataset.rawContent = content;

        // 如果元素正在流式输出，检查并滚动
        if (scrollFollowManager.streamingElements.has(element)) {
            requestAnimationFrame(() => {
                scrollFollowManager.checkAndScroll(element);
            });
        }
    }

    // 提示词相关代码已删除

    // 点击弹窗外部关闭
    // [V3] 转换为命名函数，由 __sopLegacyInit 调用
    async function __sopDOMContentLoadedMain() {
        // 初始化聊天输入框的显示状态（默认隐藏，仅在步骤5显示）
        const chatbotInputArea = document.getElementById('chatbot-input-area');
        if (chatbotInputArea) {
            if (currentStep === 5) {
                chatbotInputArea.classList.add('show');
            } else {
                chatbotInputArea.classList.remove('show');
            }
        }
        // updateStepperFromNodes(); // 移到初始化函数内部，确保在所有操作之前完成

        // 跳转到正确步骤的辅助函数（需要先定义，后面会用到）
        async function jumpToCorrectStep() {
            try {
                // 尝试从 sessionStorage 恢复上次停留的步骤
                const savedStep = sessionStorage.getItem(`sop_step_${currentRunId}`);
                if (savedStep && !isNaN(parseInt(savedStep))) {
                    const stepNum = parseInt(savedStep);
                    if (canAccessStep(stepNum)) {
                        console.log('[Init] 恢复到上次停留的步骤:', stepNum);
                        setActiveStep(stepNum);
                        return;
                    }
                }

                // 如果无法恢复上次步骤，获取下一个需要执行的节点
                const nextNodeData = await getNextNode();

                if (nextNodeData && nextNodeData.node_id) {
                    // 跳转到下一个节点
                    const jumped = jumpToNode(nextNodeData.node_id, !nextNodeData.has_next);
                    if (jumped) {
                        console.log('[Init] 已跳转到下一个节点:', nextNodeData.node_id);
                    } else {
                        // 如果跳转失败，默认跳转到第一步
                        console.warn('[Init] 跳转失败，默认显示第一步');
                        setActiveStep(1);
                    }
                } else {
                    // 如果所有节点都已完成，跳转到最后一步
                    console.log('[Init] 所有节点已完成，显示最后一步');
                    if (nodesData && nodesData.length > 0) {
                        setActiveStep(nodesData.length);
                    } else {
                        setActiveStep(1);
                    }
                }
            } catch (error) {
                console.error('[Init] 跳转到正确步骤失败:', error);
                // 失败时默认显示第一步
                setActiveStep(1);
            }
        }

        // [Draft Mode] 初始化逻辑：处理新建和刷新两种场景
        (async function () {
            try {
                // [Fix] 确保 nodesData 在所有操作之前被加载
                await updateStepperFromNodes();
                console.log('[Init] nodesData 已加载，长度:', nodesData.length);

                if (currentRunId) {
                    // 场景 1：已有 runId（刷新或从历史进入）
                    console.log('[Init] 检测到已有 runId，恢复运行状态:', currentRunId);

                    // 先检查 run 是否存在
                    const runStatus = await getSOPRunStatus(currentRunId);

                    if (!runStatus) {
                        // run 不存在（返回 500 或其他错误）
                        console.warn('[Init] Run 不存在（可能已被删除），需要重新创建 draft...');

                        if (currentTemplateId) {
                            // 清除旧的 runId，准备重新创建
                            const oldRunId = currentRunId;
                            currentRunId = null;
                            isDraftRun = false;

                            // 重新创建 draft
                            console.log('[Init] 开始重新创建 draft run...');
                            await lazyCreateSOPRun();

                            if (currentRunId) {
                                console.log('[Init] Draft run 重新创建成功，新 ID:', currentRunId, '旧 ID:', oldRunId);

                                // 更新节点状态
                                await updateNodeStatus();

                                // 跳转到第一个需要手动操作的步骤
                                await jumpToCorrectStep();

                                // 恢复书签内容
                                await restoreAllCompletedNodes();
                                console.log('[Init] 书签内容恢复完成');
                            }
                        } else {
                            console.error('[Init] 无法重新创建 draft：缺少 templateId');
                            showToast('页面初始化失败：缺少模板信息', 'error');
                        }
                    } else {
                        // run 存在，正常恢复
                        // 1. 更新节点状态
                        await updateNodeStatus();
                        console.log('[Init] 节点状态已更新');

                        // 2. 跳转到正确的步骤
                        await jumpToCorrectStep();

                        // 3. 恢复已完成节点的内容
                        await restoreAllCompletedNodes();
                        console.log('[Init] 已完成节点内容已恢复');
                    }

                } else if (currentTemplateId) {
                    // 场景 2：无 runId 但有 templateId（新建 draft）
                    console.log('[Draft Mode] 开始创建草稿 run 并加载书签');

                    // 1. 创建 draft run
                    await lazyCreateSOPRun();

                    if (currentRunId) {
                        console.log('[Draft Mode] 草稿 run 创建成功，ID:', currentRunId);

                        // 2. 更新节点状态
                        await updateNodeStatus();

                        // 3. 跳转到第一个需要手动操作的步骤
                        await jumpToCorrectStep();

                        // 4. 恢复书签内容
                        await restoreAllCompletedNodes();
                        console.log('[Draft Mode] 书签内容恢复完成');
                    }
                }
            } catch (error) {
                console.error('[Init] 初始化失败:', error);
                showToast('页面初始化失败: ' + error.message, 'error');
            }
        })();

        // 初始化用户位置状态
        // 页面加载时，假设用户在底部（因为还没有内容）
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            // 初始化用户位置
            isUserAtBottom = true;
            lastUserScrollTop = mainContent.scrollTop;
            // 初始化lastScrollHeight
            lastScrollHeight = mainContent.scrollHeight;

            // 延迟检查一次，确保状态正确
            setTimeout(() => {
                isUserAtBottom = checkIfUserAtBottom();
                lastUserScrollTop = mainContent.scrollTop;
                lastScrollHeight = mainContent.scrollHeight;
            }, 100);
        }

        // 初始化聊天容器的滚动高度
        const chatbotContainer = document.getElementById('chatbot-container');
        if (chatbotContainer) {
            lastChatbotScrollHeight = chatbotContainer.scrollHeight;
        }
    }

    // 提示词弹窗点击外部关闭事件监听器已删除

    // 检查步骤是否可以访问（已完成的节点或下一个要运行的节点）
    function canAccessStep(stepNumber) {
        const totalBackendNodes = nodesData.length;
        const chatStepNumber = totalBackendNodes + 1;

        // AI聊天步骤（最后一步）只有在所有后端节点都完成后才可以访问
        if (stepNumber === chatStepNumber) {
            // 检查所有后端节点是否都已完成
            if (nodesData.length === 0) {
                return false;
            }
            // 检查所有后端节点的ID是否都在completedNodeIds中
            const allNodesCompleted = nodesData.every(node => {
                const nodeId = node.id || node.node_id || node.ID || node.nodeId;
                if (!nodeId) return false;
                const nodeIdInt = parseInt(nodeId);
                return nodeStatus.completedNodeIds.includes(nodeId) ||
                    nodeStatus.completedNodeIds.includes(nodeIdInt);
            });
            return allNodesCompleted;
        }

        // 检查步骤是否在有效范围内
        if (stepNumber < 1 || stepNumber > totalBackendNodes) {
            return false;
        }

        // 获取步骤对应的节点
        const nodeIndex = stepNumber - 1;
        if (nodeIndex < 0 || nodeIndex >= nodesData.length) {
            return false;
        }

        const node = nodesData[nodeIndex];
        const nodeId = node.id || node.node_id || node.ID || node.nodeId;
        if (!nodeId) {
            return false;
        }

        // 检查节点是否已完成
        const nodeIdInt = parseInt(nodeId);
        const isCompleted = nodeStatus.completedNodeIds.includes(nodeId) ||
            nodeStatus.completedNodeIds.includes(nodeIdInt);

        // 检查节点是否是下一个要运行的节点
        const isNextNode = (nodeStatus.nextNodeId === nodeId ||
            nodeStatus.nextNodeId === nodeIdInt);

        // 检查节点的可访问性（is_accessible字段）
        let isAccessible = true; // 默认为true以保持向后兼容性
        let nodeInfo = null;
        if (isCompleted) {
            // 如果节点已完成，检查其is_accessible字段
            // 尝试多种键格式来查找节点信息
            nodeInfo = nodeStatus.completedNodesMap[nodeId] ||
                nodeStatus.completedNodesMap[nodeIdInt] ||
                nodeStatus.completedNodesMap[String(nodeId)] ||
                nodeStatus.completedNodesMap[String(nodeIdInt)];

            console.log(`[canAccessStep] 查找节点信息: nodeId=${nodeId}(${typeof nodeId}), nodeIdInt=${nodeIdInt}(${typeof nodeIdInt}), found=${!!nodeInfo}`);
            console.log(`[canAccessStep] completedNodesMap keys:`, Object.keys(nodeStatus.completedNodesMap));

            if (nodeInfo && nodeInfo.is_accessible !== undefined) {
                isAccessible = nodeInfo.is_accessible;
            } else if (nodeInfo) {
                console.warn(`[canAccessStep] 节点${nodeId}信息中没有is_accessible字段，使用默认值true`);
            } else {
                console.warn(`[canAccessStep] 未找到节点${nodeId}的信息，使用默认值is_accessible=true`);
            }
        }

        console.log(`[canAccessStep] 步骤${stepNumber} 节点${nodeId}: isCompleted=${isCompleted}, isAccessible=${isAccessible}, isNextNode=${isNextNode}, nodeInfo:`, nodeInfo);

        // 允许访问：(1)已完成且可访问的节点 或 (2)下一个要运行的节点
        return (isCompleted && isAccessible) || isNextNode;
    }

    // 设置活动步骤
    function setActiveStep(stepNumber) {
        // 检查是否可以访问该步骤
        // 特殊处理：对于新创建的运行，第一步即使canAccessStep返回false也应该允许访问
        const isFirstStep = stepNumber === 1;
        const isNewRun = nodeStatus.statusData && nodeStatus.statusData.completed_count === 0 &&
            (!nodeStatus.statusData.next_node || !nodeStatus.statusData.next_node.node_id);
        if (!canAccessStep(stepNumber) && !(isFirstStep && isNewRun)) {
            console.warn(`步骤 ${stepNumber} 不可访问（既未完成也不是下一个要运行的节点）`);
            showToast('该步骤尚未完成，无法访问');
            return;
        }

        // [Fix] 切换步骤时，强制重置滚动跟随状态，避免绿色的跟随按钮错误显示
        if (typeof scrollFollowManager !== 'undefined') {
            scrollFollowManager.reset();
        }

        currentStep = stepNumber;

        // [Fix] 保存当前停留的步骤到 sessionStorage，以便刷新后恢复
        if (currentRunId) {
            sessionStorage.setItem(`sop_step_${currentRunId}`, stepNumber);
        }

        // 更新步骤条样式
        const allSteps = document.querySelectorAll('.step');
        allSteps.forEach((step, index) => {
            const stepNum = parseInt(step.getAttribute('data-step'));
            step.classList.remove('active', 'completed', 'step-disabled-link');

            // 检查步骤是否可以访问
            const canAccess = canAccessStep(stepNum);

            // 检查下一个步骤是否可以访问（用于连线样式）
            const nextStepNum = stepNum + 1;
            const nextStepCanAccess = canAccessStep(nextStepNum);

            // 如果当前步骤不可访问，或者下一个步骤不可访问，连线只连接到圆周
            if ((!canAccess || !nextStepCanAccess) && stepNum < allSteps.length) {
                step.classList.add('step-disabled-link');
            }

            if (stepNum === stepNumber) {
                // 当前步骤：只有可访问时才标记为active
                if (canAccess) {
                    step.classList.add('active');
                }
            } else if (stepNum < stepNumber) {
                // 之前的步骤：只有已完成且可访问的才标记为completed
                const nodeIndex = stepNum - 1;
                if (nodeIndex >= 0 && nodeIndex < nodesData.length) {
                    const node = nodesData[nodeIndex];
                    const nodeId = node.id || node.node_id || node.ID || node.nodeId;
                    if (nodeId) {
                        const nodeIdInt = parseInt(nodeId);
                        const isCompleted = nodeStatus.completedNodeIds.includes(nodeId) ||
                            nodeStatus.completedNodeIds.includes(nodeIdInt);

                        // 只有已完成且可访问的节点才标记为completed
                        if (isCompleted && canAccess) {
                            step.classList.add('completed');
                        }
                    }
                }
            }

            // 对于不可访问的步骤，添加禁用样式
            if (!canAccess && stepNum !== stepNumber) {
                step.style.opacity = '0.5';
                step.style.cursor = 'not-allowed';
            } else {
                step.style.opacity = '';
                step.style.cursor = '';
            }
        });

        // 控制主内容区域的滚动：聊天步骤时禁用页面滚动，只保留聊天区域滚动
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            const totalBackendNodes = nodesData.length;
            const chatStepNumber = totalBackendNodes + 1;
            if (stepNumber === chatStepNumber) {
                mainContent.classList.add('step-5-active');
            } else {
                mainContent.classList.remove('step-5-active');
            }
        }

        // 更新内容显示
        document.querySelectorAll('.step-content').forEach(content => {
            content.classList.remove('active');
        });
        const stepContent = document.getElementById(`step-${stepNumber}`);
        if (stepContent) {
            stepContent.classList.add('active');

            // 如果是后端节点且已完成，恢复其内容和工具栏
            if (stepNumber <= nodesData.length) {
                const nodeIndex = stepNumber - 1;
                if (nodeIndex >= 0 && nodeIndex < nodesData.length) {
                    const node = nodesData[nodeIndex];
                    const nodeId = node.id || node.node_id || node.ID || node.nodeId;
                    if (nodeId) {
                        const nodeIdInt = parseInt(nodeId);
                        const isCompleted = nodeStatus.completedNodeIds.includes(nodeId) ||
                            nodeStatus.completedNodeIds.includes(nodeIdInt);

                        if (isCompleted) {
                            // 恢复节点内容
                            restoreCompletedNodeContent(stepNumber).then(() => {
                                // 确保工具栏存在（修复从第5步返回时工具栏消失的问题）
                                const existingActions = document.getElementById(`step-actions-container-${stepNumber}`);
                                if (!existingActions) {
                                    console.log(`[setActiveStep] 步骤 ${stepNumber} 工具栏不存在，正在恢复...`);

                                    // 获取内容元素
                                    const stepContentIdMap = {
                                        1: { contentId: 'analysis-content' },
                                        2: { contentId: 'script-analysis-content' },
                                        3: { contentId: 'style-analysis-content' },
                                        4: { contentId: 'generated-script' }
                                    };

                                    const contentId = stepContentIdMap[stepNumber]?.contentId;
                                    if (contentId) {
                                        const contentElement = document.getElementById(contentId);
                                        if (contentElement) {
                                            // 计算是否可以显示重新生成按钮（只有最新步骤且第5步无交互时才显示）
                                            let maxCompletedStep = 0;
                                            nodeStatus.completedNodeIds.forEach(id => {
                                                const idx = nodesData.findIndex(n => {
                                                    const nid = n.id || n.node_id || n.ID || n.nodeId;
                                                    return nid == id || parseInt(nid) == parseInt(id);
                                                });
                                                if (idx !== -1) {
                                                    const nodeInfo = nodeStatus.completedNodesMap[id] ||
                                                        nodeStatus.completedNodesMap[String(id)];
                                                    const isAccessible = nodeInfo?.is_accessible !== false;
                                                    if (isAccessible) {
                                                        maxCompletedStep = Math.max(maxCompletedStep, idx + 1);
                                                    }
                                                }
                                            });
                                            const isLatestStep = (stepNumber === maxCompletedStep);
                                            const canEdit = isLatestStep && !hasStep5Interaction;

                                            // 添加工具栏
                                            addStepActions(stepNumber, contentElement, canEdit);
                                            console.log(`[setActiveStep] 已恢复步骤 ${stepNumber} 的工具栏`);
                                        }
                                    }
                                }
                            });
                        } else {
                            // 节点未完成，只需要恢复内容（如果有的话）
                            restoreCompletedNodeContent(stepNumber);
                        }
                    }
                }
            }
        }

        // 控制聊天输入框的显示（仅在聊天步骤显示）
        const chatbotInputArea = document.getElementById('chatbot-input-area');
        if (chatbotInputArea) {
            const totalBackendNodes = nodesData.length;
            const chatStepNumber = totalBackendNodes + 1;
            if (stepNumber === chatStepNumber) {
                // 使用class控制显示，避免display变化导致的重排
                chatbotInputArea.classList.add('show');

                // 从第四步进入第五步时，自动将第四步的内容载入到对话区域
                loadStep4ContentToChat();

                // [Fix] 恢复聊天记录（如果尚未加载）
                if (currentRunId) {
                    restoreChatMessages(currentRunId).catch(error => {
                        console.error('[setActiveStep] 恢复聊天记录失败:', error);
                    });
                }
            } else {
                chatbotInputArea.classList.remove('show');
            }
        }

        // 滚动到顶部
        if (mainContent) {
            mainContent.scrollTop = 0;
        }
    }

    // 下一步
    function nextStep() {
        if (currentStep < 5) {
            setActiveStep(currentStep + 1);
        }
    }

    // 上一步
    function prevStep() {
        if (currentStep > 1) {
            setActiveStep(currentStep - 1);
        }
    }

    // 判断文件类型
    function isImageFile(file) {
        const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'];
        return imageTypes.includes(file.type) || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(file.name);
    }

    function isTextFile(file) {
        const textTypes = ['application/pdf', 'text/plain', 'text/markdown', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
        return textTypes.includes(file.type) || /\.(pdf|txt|md|docx|doc|rtf)$/i.test(file.name);
    }

    // 限制文本长度为最多两万字，超出部分会被丢弃
    function limitTextToMaxLength(text, maxLength = 80000) {
        if (!text || typeof text !== 'string') {
            return '';
        }
        if (text.length <= maxLength) {
            return text;
        }
        // 超出部分直接丢弃
        return text.substring(0, maxLength);
    }

    // 处理文件上传
    async function handleFileUpload(event, targetTextareaId) {
        let files = [];
        if (event.type === 'drop') {
            files = Array.from(event.dataTransfer.files || []);
        } else {
            files = Array.from(event.target.files || []);
        }

        if (files.length === 0) return;

        // 获取目标textarea元素
        const targetTextarea = document.getElementById(targetTextareaId);
        if (!targetTextarea) {
            console.error('找不到目标textarea:', targetTextareaId);
            return;
        }

        // [Fix] 提前检查内容字数是否已达上限（80000字）
        if (targetTextarea.value.length >= 80000) {
            showToast('输入框内容已达上限（80000字），无法继续处理');
            if (event.type !== 'drop') event.target.value = '';
            return;
        }

        // [Fix] 防止重复触发：如果已经在处理中（textarea被禁用），则忽略新的文件
        if (targetTextarea.disabled) {
            console.log('正在处理中，忽略新的拖拽或选择');
            return;
        }

        // [Fix] 懒加载支持：如果还没有 runId（新建模式），则先创建一个，打破附件上传死循环
        if (!currentRunId) {
            console.log('检测到新建模式上传附件，正在执行前置懒加载创建 Run...');
            try {
                await lazyCreateSOPRun();
                console.log('前置创建 Run 成功，ID:', currentRunId);
            } catch (err) {
                console.error('前置创建 Run 失败:', err);
                const errMsg = err.message || '';
                if (errMsg.includes('权限') || errMsg.includes('permission')) {
                    showToast('您没有权限运行此SOP');
                } else {
                    showToast('初始化记录失败，请刷新重试: ' + errMsg);
                }
                if (event.type !== 'drop') event.target.value = '';
                return;
            }
        }

        // 获取图片预览容器
        const imagePreviewContainer = document.getElementById(`${targetTextareaId}-image-preview`);
        const imagePreviewList = imagePreviewContainer?.querySelector('.image-preview-list');
        const imagePreviewStatus = imagePreviewContainer?.querySelector('.image-preview-status');

        // 获取认证token
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (!token) {
            showToast('未找到认证Token，请先登录');
            if (event.type !== 'drop') event.target.value = ''; // 清空文件选择
            return;
        }

        // 分离文本文件和图片文件
        const textFiles = files.filter(f => isTextFile(f));
        const imageFiles = files.filter(f => isImageFile(f));

        // [Fix] 验证累计图片数量（当前节点一共只能支持9张）
        const existingImageCount = imagePreviewList ? imagePreviewList.children.length : 0;
        const totalImageCount = existingImageCount + imageFiles.length;

        if (imageFiles.length > 0 && totalImageCount > 9) {
            if (existingImageCount > 0) {
                showToast(`当前已上传 ${existingImageCount} 张图片，本次最多还能上传 ${9 - existingImageCount} 张`);
            } else {
                showToast('最多只能上传9张图片');
            }
            if (event.type !== 'drop') event.target.value = ''; // 清空文件选择
            return;
        }

        // 如果同时选择了文本文件和图片文件，提示用户
        if (textFiles.length > 0 && imageFiles.length > 0) {
            showToast('请分别上传文本文件或图片文件，不能同时上传');
            if (event.type !== 'drop') event.target.value = ''; // 清空文件选择
            return;
        }

        // 处理文本文件
        if (textFiles.length > 0) {
            // 限制一次最多上传3个
            if (textFiles.length > 3) {
                showToast('一次最多只能上传3个文本文件');
                if (event.type !== 'drop') event.target.value = '';
                return;
            }

            // 获取文件上传加载提示元素
            const fileUploadLoading = document.getElementById(`${targetTextareaId}-file-loading`);

            // 显示加载动画
            if (fileUploadLoading) {
                fileUploadLoading.classList.add('show');
            }

            // 显示加载提示
            const originalPlaceholder = targetTextarea.placeholder;
            targetTextarea.placeholder = `正在解析 ${textFiles.length} 个文件，请稍候...`;
            targetTextarea.disabled = true;

            try {
                // 获取当前步骤对应的node_id
                let nodeId = null;
                if (currentStep > 0 && currentStep <= nodesData.length) {
                    const nodeIndex = currentStep - 1;
                    const node = nodesData[nodeIndex];
                    if (node) {
                        nodeId = node.id || node.node_id || node.ID || node.nodeId;
                    }
                }

                // 并发处理所有文件
                const uploadPromises = textFiles.map(async (file) => {
                    const formData = new FormData();
                    formData.append('file', file);
                    if (currentRunId) formData.append('run_id', currentRunId);
                    if (nodeId) formData.append('node_id', nodeId);

                    const response = await fetch(`${API_BASE_URL}/v1/pdf/convert-to-text`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        body: formData
                    });

                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({}));
                        throw new Error(`文件 ${file.name} 解析失败: ${errorData.message || '请上传文本型文件'}`);
                    }

                    const result = await response.json();
                    if (result.code !== 0) {
                        throw new Error(`文件 ${file.name} 解析失败: ${result.message || '请上传文本型文件'}`);
                    }

                    let parsedText = '';
                    if (result.data && typeof result.data === 'string') {
                        parsedText = result.data;
                    } else if (result.data && typeof result.data === 'object') {
                        parsedText = JSON.stringify(result.data, null, 2);
                    }
                    return parsedText;
                });

                // 等待所有请求完成
                const results = await Promise.all(uploadPromises);

                // 拼接内容
                const combinedText = results.join('\n\n'); // 使用换行符分隔不同文件的内容

                // [Critcal Fix] 先恢复状态，再赋值，确保UI更新正确
                targetTextarea.disabled = false;
                targetTextarea.placeholder = originalPlaceholder;

                if (!combinedText) {
                    showToast('文件中未解析出有效文本');
                    return;
                }

                // [Fix] 以输入框实际内容为准进行追加（用户手动清空时不会残留旧内容）
                const existingText = targetTextarea.value.trim();
                const mergedText = existingText ? (existingText + '\n\n' + combinedText) : combinedText;

                // 限制文本长度为最多八万字
                const limitedText = limitTextToMaxLength(mergedText, 80000);

                // 将解析后的文本填充到textarea
                targetTextarea.value = limitedText;

                // 同时更新基础内容存储，这样后续添加图片时会在此基础上追加
                textareaBaseText.set(targetTextareaId, limitedText);

                // 强制重绘（虽然通常不需要，但为了保险）
                targetTextarea.style.display = 'none';
                targetTextarea.offsetHeight; // trigger reflow
                targetTextarea.style.display = 'block';

                // 提示
                if (combinedText.length > 80000) {
                    showToast(`文件解析成功，内容已填充到输入框（已自动保留前80000字）`);
                } else {
                    showToast(`成功解析 ${textFiles.length} 个文件，内容已填充到输入框`);
                }

                // 确保textarea可见并聚焦
                // targetTextarea.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); // 移除滚动，避免干扰用户
                targetTextarea.focus();

                // 将光标移到文本末尾
                setTimeout(() => {
                    targetTextarea.setSelectionRange(limitedText.length, limitedText.length);
                }, 0);

                // 触发input和change事件
                targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                targetTextarea.dispatchEvent(new Event('change', { bubbles: true }));

                console.log(`文件解析成功，已填充到 ${targetTextareaId}，原始总长度: ${combinedText.length}，截断后长度: ${limitedText.length}`);

            } catch (error) {
                console.error('文件上传解析失败:', error);
                showToast(error.message || '解析失败，请重试');
            } finally {
                // 隐藏加载动画
                if (fileUploadLoading) {
                    fileUploadLoading.classList.remove('show');
                }

                // 确保状态恢复（防止 try 中途出错）
                if (targetTextarea.disabled) {
                    targetTextarea.placeholder = originalPlaceholder;
                    targetTextarea.disabled = false;
                }

                // 清空文件选择
                if (event.type !== 'drop') event.target.value = '';
            }
            return;
        }

        // 处理图片文件
        if (imageFiles.length > 0) {
            // 显示图片预览容器
            if (imagePreviewContainer) {
                imagePreviewContainer.classList.add('has-images');
            }

            // [Fix] 使用全局持久化存储每个文本域的图片结果
            if (!textareaImageResults.has(targetTextareaId)) {
                textareaImageResults.set(targetTextareaId, new Map());
                // [Fix] 第一次添加图片时，将当前输入框的内容暂存为“基础文本”，以便后续追加
                // 如果已经是第二次拖入图片，则不覆盖 BaseText
                textareaBaseText.set(targetTextareaId, targetTextarea.value || '');
            }
            const imageResults = textareaImageResults.get(targetTextareaId);

            // 更新文本内容的辅助函数
            const updateTextareaContent = () => {
                const sortedResults = Array.from(imageResults.entries())
                    .sort((a, b) => a[0] - b[0])
                    .map(entry => entry[1]);

                const baseText = textareaBaseText.get(targetTextareaId) || '';
                const imageText = sortedResults.map(r => r.content).join('\n\n');

                let combined = baseText;
                if (imageText) {
                    combined = baseText ? (baseText + '\n\n' + imageText) : imageText;
                }

                // 限制总长度为最多八万字
                const limitedText = limitTextToMaxLength(combined, 80000);
                targetTextarea.value = limitedText;

                if (combined.length > 80000) {
                    console.log(`内容已触及 80000 字上限，已被截断`);
                }

                // 触发事件以更新UI状态
                targetTextarea.dispatchEvent(new Event('input', { bubbles: true }));
                targetTextarea.dispatchEvent(new Event('change', { bubbles: true }));
            };

            // 记录本批次的上传状态
            let completedInThisBatch = 0;
            const batchSize = imageFiles.length;

            // 为每张图片创建预览和处理
            for (let i = 0; i < imageFiles.length; i++) {
                const file = imageFiles[i];
                // [Fix] 索引应基于当前已存在的预览项数量，确保分批上传不冲突
                const fileIndex = (imagePreviewList ? imagePreviewList.children.length : 0);

                // 创建图片预览项
                const previewItem = document.createElement('div');
                previewItem.className = 'image-preview-item';
                previewItem.dataset.fileIndex = fileIndex;

                // 创建图片元素
                const img = document.createElement('img');
                img.src = URL.createObjectURL(file);
                img.alt = file.name;

                // 创建处理中遮罩
                const processingOverlay = document.createElement('div');
                processingOverlay.className = 'image-processing';
                processingOverlay.innerHTML = `
                        <div class="spinner"></div>
                        <div>处理中...</div>
                    `;

                // 创建删除按钮
                const removeBtn = document.createElement('button');
                removeBtn.className = 'image-remove-btn';
                removeBtn.innerHTML = '×';
                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    const currentIdx = parseInt(previewItem.dataset.fileIndex);
                    imageResults.delete(currentIdx);
                    previewItem.remove();
                    URL.revokeObjectURL(img.src);

                    // [Fix] 如果图片删光了，移除样式类以隐藏容器边框
                    if (imagePreviewList && imagePreviewList.children.length === 0) {
                        imagePreviewContainer?.classList.remove('has-images');
                    }

                    if (imagePreviewList) {
                        Array.from(imagePreviewList.children).forEach((item, idx) => {
                            const oldIndex = parseInt(item.dataset.fileIndex);
                            if (oldIndex !== idx) {
                                item.dataset.fileIndex = idx;
                                if (imageResults.has(oldIndex)) {
                                    const res = imageResults.get(oldIndex);
                                    imageResults.delete(oldIndex);
                                    imageResults.set(idx, res);
                                }
                            }
                        });
                    }
                    updateImagePreviewStatus(imagePreviewList, imagePreviewStatus, Array.from(imageResults.values()));
                    updateTextareaContent();

                    // [Fix] 如果图片删光了，清除记录，以便下次上传时重新获取 BaseText
                    if (imageResults.size === 0) {
                        textareaImageResults.delete(targetTextareaId);
                    }
                };

                previewItem.appendChild(img);
                previewItem.appendChild(processingOverlay);
                previewItem.appendChild(removeBtn);

                if (imagePreviewList) {
                    imagePreviewList.appendChild(previewItem);
                }

                // 更新状态（正在处理 X/Y）
                updateImagePreviewStatus(imagePreviewList, imagePreviewStatus, Array.from(imageResults.values()));

                // 上传并处理图片
                (async (index, currentFile) => {
                    try {
                        // 获取节点ID
                        let nodeId = null;
                        if (currentStep > 0 && currentStep <= nodesData.length) {
                            const nodeIndex = currentStep - 1;
                            const node = nodesData[nodeIndex];
                            if (node) nodeId = node.id || node.node_id || node.ID || node.nodeId;
                        }

                        const formData = new FormData();
                        formData.append('file', currentFile);
                        formData.append('prompt', '请识别并提取图片中的主要文字内容。如果图片包含社交媒体属性（如微信朋友圈、微博截图等），请仅提取正文部分，忽略用户ID、时间戳、点赞数、评论内容等无关信息。对于提取的正文部分，必须保持一字不差的原始内容，不得进行任何修改、润色或总结。直接输出提取的文字，不要包含任何自我介绍、前言或后续解释（如“好的，我已为您提取”等）。');
                        if (currentRunId) formData.append('run_id', currentRunId);
                        if (nodeId) formData.append('node_id', nodeId);

                        const response = await fetch(`${API_BASE_URL}/v1/ali/vision/analyze`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: formData
                        });

                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({}));
                            throw new Error(`分析失败 (${response.status})`);
                        }

                        const result = await response.json();
                        if (result.code !== 0) throw new Error(result.message || '分析失败');

                        const content = result.data?.content || '';

                        // [Fix] 检查图片是否还存在于 DOM 中（如果已经被用户点叉删除，则不加载结果）
                        if (!previewItem.parentElement) {
                            console.log(`图片 ${currentFile.name} 已被删除，放弃加载识别内容`);
                            return;
                        }

                        if (!content) throw new Error('后端返回的数据中没有找到可用的文本内容');

                        // [Fix] 始终获取最新的索引（因为可能在上传过程中发生了删除导致索引前移）
                        const activeIndex = parseInt(previewItem.dataset.fileIndex);

                        // 保存结果
                        imageResults.set(activeIndex, {
                            fileName: currentFile.name,
                            content: content
                        });

                        // 移除处理中遮罩
                        processingOverlay.remove();

                        // 更新状态
                        updateImagePreviewStatus(imagePreviewList, imagePreviewStatus, Array.from(imageResults.values()));
                        // 更新文本内容
                        updateTextareaContent();

                        // 如果本批次全部结束，显示成功提示
                        completedInThisBatch++;
                        if (completedInThisBatch === batchSize) {
                            let toastMessage = `处理完成，内容已填充`;
                            showToast(toastMessage);
                            targetTextarea.focus();
                        }

                    } catch (error) {
                        console.error('图片识别失败:', error);
                        processingOverlay.innerHTML = `
                                <div style="color: #dc2626;">错误</div>
                                <div style="font-size: 11px; margin-top: 4px;">失败</div>
                            `;
                        showToast(`图片识别失败：${error.message}`);
                        // [Fix] 失败也需要更新状态，避免一直显示“正在处理 1/2”
                        updateImagePreviewStatus(imagePreviewList, imagePreviewStatus, Array.from(imageResults.values()));

                        completedInThisBatch++;
                    }
                })(fileIndex, file);
            }

            // 清空文件选择
            if (event.type !== 'drop') event.target.value = '';
            return;
        }

        // 如果既不是文本文件也不是图片文件
        showToast('不支持的文件类型');
        if (event.type !== 'drop') event.target.value = ''; // 清空文件选择
    }

    // 更新图片预览状态
    function updateImagePreviewStatus(imagePreviewList, imagePreviewStatus, successResults) {
        if (!imagePreviewStatus) return;

        const totalImages = imagePreviewList ? imagePreviewList.children.length : 0;
        const successCount = successResults.length;

        // 查找 DOM 中标记为失败的图片数量
        const failedCount = imagePreviewList ? imagePreviewList.querySelectorAll('.image-processing div[style*="color: #dc2626"]').length : 0;
        const finishedCount = successCount + failedCount;

        if (finishedCount === totalImages && totalImages > 0) {
            if (failedCount > 0) {
                imagePreviewStatus.textContent = `已处理 ${totalImages} 张图片 (成功 ${successCount}，失败 ${failedCount})`;
            } else {
                imagePreviewStatus.textContent = `已处理 ${totalImages} 张图片`;
            }
        } else if (totalImages > 0) {
            imagePreviewStatus.textContent = `正在处理 ${finishedCount}/${totalImages} 张图片...`;
        } else {
            imagePreviewStatus.textContent = '';
        }
    }

    // 关闭质量检测结果
    function closeQualityResult() {
        document.getElementById('quality-result').classList.remove('show');
        document.getElementById('quality-loading').style.display = 'none';
    }



    // 检测产品介绍质量
    async function checkProductQuality() {
        const input = document.getElementById('product-input').value;

        if (!input.trim()) {
            showToast('请先输入产品介绍再进行质量检测');
            return;
        }

        // 获取认证token
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (!token) {
            showToast('未找到认证Token，请先登录');
            return;
        }

        // 隐藏之前的结果
        document.getElementById('quality-result').classList.remove('show');

        // 显示加载状态
        document.getElementById('quality-loading').style.display = 'block';

        // 滚动到加载区域
        document.getElementById('quality-loading').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // 清空内容容器
        const contentDiv = document.getElementById('quality-content');
        contentDiv.innerHTML = '';

        // 用于累积接收到的内容
        let accumulatedContent = '';

        // 注册流式输出元素，开始跟随底部
        scrollFollowManager.registerStreamingElement(contentDiv);
        scrollFollowManager.startPeriodicCheck();

        try {
            // 使用fetch配合ReadableStream接收SSE数据
            window.__sopSseAbortController = new AbortController();
            const response = await fetch(`${API_BASE_URL}/v1/sop/text/edit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'text/event-stream'
                },
                body: JSON.stringify({
                    original_text: input,
                    user_message: '请检测这段产品介绍的质量，分析其完整性、准确性和可用性，并提供改进建议。',
                    deep_thinking: true
                }),
                signal: window.__sopSseAbortController.signal
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `质量检测失败 (${response.status})`);
            }

            // 读取SSE流
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let isDone = false;
            let isFirstToken = true; // 标记是否是第一个token
            let thinkingContent = ''; // 添加思维链内容累积变量

            // 获取结果容器引用（但先不显示）
            const resultDiv = document.getElementById('quality-result');

            while (!isDone) {
                const { done, value } = await reader.read();

                if (done) {
                    isDone = true;
                    break;
                }

                // 解码数据
                buffer += decoder.decode(value, { stream: true });

                // SSE格式：每个消息以 \n\n 结尾
                // 处理完整的SSE消息
                let messageEnd;
                while ((messageEnd = buffer.indexOf('\n\n')) !== -1) {
                    const message = buffer.substring(0, messageEnd);
                    buffer = buffer.substring(messageEnd + 2);

                    // 按行处理消息
                    const lines = message.split('\n');
                    let eventType = null; // 初始化为null，只有明确指定时才设置
                    let data = '';
                    let dataValue = null;

                    for (const line of lines) {
                        // 忽略心跳（单独的冒号或以:开头的行）
                        if (line.trim() === ':' || line.trim().startsWith(':')) {
                            continue;
                        }

                        // 处理 event: 行（关键：必须正确识别 event 类型）
                        if (line.startsWith('event: ')) {
                            eventType = line.substring(7).trim();
                            console.log('📌 质量检测 - 识别到事件类型:', eventType);
                        }
                        // 处理 data: 行（SSE规范允许多行data，会被连接）
                        else if (line.startsWith('data: ')) {
                            const chunk = line.substring(6); // 移除 "data: " 前缀，保留原始格式
                            data += chunk;
                        }
                    }

                    // 在所有行处理完后，尝试解析data
                    if (data) {
                        try {
                            // 注意：data 字段是 JSON 字符串化的字符串，需要 JSON.parse() 解析
                            // 例如：data: "\"思考内容\"" → JSON.parse(data.trim()) → "思考内容"
                            dataValue = JSON.parse(data.trim());
                            if (typeof dataValue === 'string') {
                                data = dataValue;
                            }
                            console.log('✅ 质量检测 - 成功解析data字段:', typeof dataValue, eventType || 'message');
                        } catch (e) {
                            // 如果解析失败，记录错误并尝试备用方案
                            console.warn('⚠️ 质量检测 - JSON解析失败，尝试备用方案:', e.message, '原始数据:', data.trim());
                            // 如果不是JSON，直接使用字符串（去除可能的引号）
                            dataValue = data.trim();
                            if (dataValue.startsWith('"') && dataValue.endsWith('"')) {
                                try {
                                    dataValue = JSON.parse(dataValue);
                                } catch (e2) {
                                    // 解析失败，去掉引号
                                    dataValue = dataValue.slice(1, -1);
                                }
                            }
                            data = dataValue;
                        }
                    }

                    // 处理 done 事件
                    if (eventType === 'done') {
                        console.log('SSE流传输完成');
                        isDone = true;
                        break;
                    }

                    // 处理 thinking 事件（关键检查点：必须正确识别 thinking 事件）
                    if (eventType === 'thinking') {
                        if (dataValue && typeof dataValue === 'string') {
                            // 如果是第一个thinking事件，立即显示结果容器并隐藏加载状态
                            if (isFirstToken) {
                                isFirstToken = false;
                                document.getElementById('quality-loading').style.display = 'none';
                                resultDiv.classList.add('show');
                                resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            }

                            thinkingContent += dataValue;
                            console.log('💭 质量检测 - 收到思维链片段，当前累积长度:', thinkingContent.length, '本次chunk长度:', dataValue.length);

                            // 实时显示思维链内容
                            const thinkingElement = createOrUpdateThinkingElement(contentDiv, thinkingContent);

                            // 如果思维链元素存在，注册到滚动管理器
                            if (thinkingElement) {
                                scrollFollowManager.registerStreamingElement(thinkingElement);
                            }

                            // 检查并滚动到底部
                            requestAnimationFrame(() => {
                                if (thinkingElement) {
                                    scrollFollowManager.checkAndScroll(thinkingElement);
                                }
                                scrollFollowManager.checkAndScroll(contentDiv);
                            });
                        } else {
                            console.warn('⚠️ 质量检测 - thinking事件的数据不是字符串类型:', typeof dataValue, dataValue);
                        }
                        continue;
                    }

                    // 处理数据内容（普通消息，eventType为null或'message'或空）
                    if (data && (eventType === 'message' || !eventType)) {
                        // 如果是第一个token，隐藏加载状态，显示结果容器
                        if (isFirstToken) {
                            isFirstToken = false;
                            markThinkingFinished(contentDiv);
                            document.getElementById('quality-loading').style.display = 'none';
                            resultDiv.classList.add('show');
                            resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }

                        // 使用已解析的dataValue，如果没有则使用data
                        let parsedChunk = dataValue || data;
                        accumulatedContent += parsedChunk;

                        // 实时渲染markdown内容
                        if (typeof marked !== 'undefined' && marked.parse) {
                            try {
                                contentDiv.innerHTML = marked.parse(accumulatedContent);
                            } catch (error) {
                                console.error('Markdown渲染错误:', error);
                                // 如果渲染失败，降级为纯文本
                                contentDiv.textContent = accumulatedContent;
                            }
                        } else {
                            // 如果没有marked.js，使用纯文本显示
                            contentDiv.textContent = accumulatedContent;
                        }

                        // 检查并滚动到底部
                        requestAnimationFrame(() => {
                            scrollFollowManager.checkAndScroll(contentDiv);
                        });
                    }
                }
            }

            // 如果流结束时还没有收到任何数据，也要隐藏加载状态
            if (isFirstToken) {
                document.getElementById('quality-loading').style.display = 'none';
            }

            // 确保最终内容完整渲染
            if (accumulatedContent) {
                if (typeof marked !== 'undefined' && marked.parse) {
                    try {
                        contentDiv.innerHTML = marked.parse(accumulatedContent);
                    } catch (error) {
                        console.error('Markdown渲染错误:', error);
                        contentDiv.textContent = accumulatedContent;
                    }
                } else {
                    contentDiv.textContent = accumulatedContent;
                }
            }

            // 最后一次检查并滚动
            requestAnimationFrame(() => {
                scrollFollowManager.checkAndScroll(contentDiv);
            });

        } catch (error) {
            console.error('质量检测失败:', error);
            showToast('质量检测失败：' + (error.message || '未知错误，请重试'));

            // 隐藏加载状态
            document.getElementById('quality-loading').style.display = 'none';
        } finally {
            if (contentDiv && scrollFollowManager.streamingElements.has(contentDiv)) {
                if (scrollFollowManager.isFollowing) {
                    scrollFollowManager.scrollToBottom(contentDiv, 'auto');
                }
            }
            // 注销流式输出元素，停止跟随底部
            scrollFollowManager.unregisterStreamingElement(contentDiv);

            // 注销思维链元素（如果存在）
            if (contentDiv && contentDiv.parentElement) {
                const thinkingElement = contentDiv.parentElement.querySelector('.thinking-content');
                if (thinkingElement) {
                    scrollFollowManager.unregisterStreamingElement(thinkingElement);
                }
            }

            if (scrollFollowManager.streamingElements.size === 0) {
                scrollFollowManager.stopPeriodicCheck();
            }
        }
    }

    // 步骤分析状态标记
    let step1Analyzed = false;
    let step2Analyzed = false;
    let step3Analyzed = false;
    let step4Generated = false;

    async function handleStep1Next() {
        const input = document.getElementById('product-input').value;
        const fileInput = document.getElementById('product-file-input');
        const files = fileInput?.files || [];

        if (!input.trim() && files.length === 0) {
            alert('请先输入产品介绍或上传文件');
            return;
        }

        // 如果还没有分析过，先调用API执行节点
        if (!step1Analyzed) {
            try {
                // 显示聊天容器
                const chatContainer = document.getElementById('product-chat');
                chatContainer.classList.add('show');

                // 滚动到聊天容器
                chatContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                // 显示加载状态，隐藏结果消息（避免同时显示）
                document.getElementById('loading-message').style.display = 'block';
                document.getElementById('result-message').style.display = 'none';

                // 禁用按钮
                const nextBtn = document.getElementById('step1-next-btn');
                if (nextBtn) {
                    nextBtn.disabled = true;
                    nextBtn.textContent = '处理中...';
                }

                // 获取内容元素
                const contentElement = document.getElementById('analysis-content');

                // [Fix] 显式清空旧内容和思维链容器，确保重新生成时 UI 清洁
                if (contentElement) {
                    contentElement.innerHTML = '';
                    // 移除可能存在的思维链容器
                    const thinkingContainer = contentElement.parentElement?.querySelector('.thinking-container');
                    if (thinkingContainer) thinkingContainer.remove();

                    contentElement.style.display = 'block';
                    contentElement.style.visibility = 'visible';
                }

                // 调用API执行节点（使用当前步骤，支持流式输出）
                const result = await executeNode(input, files, contentElement);

                // 隐藏加载状态，显示结果消息和助手名称
                document.getElementById('loading-message').style.display = 'none';
                const resultMessage = document.getElementById('result-message');
                if (resultMessage) {
                    resultMessage.style.display = 'block';
                    const messageHeader = resultMessage.querySelector('.message-header');
                    if (messageHeader) {
                        messageHeader.style.display = 'flex';
                    }
                }

                // 处理API返回的结果（如果是非流式输出）
                if (result && result.data && typeof result.data !== 'string') {
                    let markdownContent = '';
                    if (result.data.content) {
                        markdownContent = result.data.content;
                    } else if (result.data.result) {
                        markdownContent = result.data.result;
                    } else {
                        markdownContent = JSON.stringify(result.data, null, 2);
                    }

                    // 缓存本次生成的内容
                    latestStepContent.step1 = markdownContent;

                    // 如果不是流式输出，使用模拟流式效果
                    await streamText(contentElement, markdownContent, 15);
                } else {
                    // 流式输出已经在handleStreamingResponse中处理，这里只需要缓存最终内容
                    latestStepContent.step1 = contentElement.innerHTML || contentElement.textContent || '';
                }

                // 标记步骤为已完成
                document.querySelector('[data-step="1"]').classList.add('completed');
                step1Analyzed = true;

                // [Fix] 立即同步后端状态，确保点击“下一步”时 canAccessStep 联轴器能识别
                await updateNodeStatus();

                // 恢复按钮
                if (nextBtn) {
                    nextBtn.disabled = false;
                    // 如果这是最后一个节点，按钮应该显示"完成"
                    if (isCurrentStepLastNode) {
                        updateButtonToComplete(1);
                    } else {
                        nextBtn.textContent = '下一步';
                    }
                }
                // 注意：不自动跳转，等待用户再次点击"下一步"按钮
            } catch (error) {
                console.error('执行节点失败:', error);
                alert(`执行失败: ${error.message}`);

                // 恢复按钮
                const nextBtn = document.getElementById('step1-next-btn');
                if (nextBtn) {
                    nextBtn.disabled = false;
                    nextBtn.textContent = '下一步';
                }
            }
        } else {
            // 已经分析过，用户再次点击"下一步"，此时才获取下一个节点并跳转
            try {
                // 显示加载提示
                showNextStepLoading();

                const nextNodeData = await getNextNode();
                if (nextNodeData && nextNodeData.node_id) {
                    // 跳转到下一个节点，如果 has_next 为 false，说明这是最后一个节点
                    jumpToNode(nextNodeData.node_id, !nextNodeData.has_next);
                    // 跳转成功后延迟隐藏加载提示，确保页面已经完成跳转
                    setTimeout(() => {
                        hideNextStepLoading();
                    }, 300);
                } else {
                    // 如果没有返回 node_id，说明真的没有下一个节点了
                    // 将当前步骤的按钮改为"完成"
                    updateButtonToComplete(currentStep);
                    showToast('所有步骤已完成');
                    // 隐藏加载提示
                    hideNextStepLoading();
                }
            } catch (error) {
                console.error('获取下一个节点失败:', error);
                // 隐藏加载提示
                hideNextStepLoading();
                // [Fix] 不再重置 step1Analyzed，防止进入死循环重复生成
                // 仅提示用户手动切换或重试
                showToast('获取后续步骤失败，请刷新页面重试');
            }
        }
    }

    // 第 2 步的下一步按钮处理
    async function handleStep2Next() {
        const input = document.getElementById('script-input').value;
        const fileInput = document.getElementById('script-file-input');
        const files = fileInput?.files || [];

        if (!input.trim() && files.length === 0) {
            showToast('请先输入口播文稿或上传文件');
            return;
        }

        // 如果还没有分析过，先调用API执行节点
        if (!step2Analyzed) {
            try {
                // 显示聊天容器
                const chatContainer = document.getElementById('script-chat');
                chatContainer.classList.add('show');

                // 滚动到聊天容器
                chatContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                // 显示加载状态，隐藏结果消息（避免同时显示）
                document.getElementById('script-loading-message').style.display = 'block';
                document.getElementById('script-result-message').style.display = 'none';

                // 禁用按钮
                const nextBtn = document.getElementById('step2-next-btn');
                if (nextBtn) {
                    nextBtn.disabled = true;
                    nextBtn.textContent = '处理中...';
                }

                // 获取内容元素
                const contentElement = document.getElementById('script-analysis-content');

                // [Fix] 显式清空旧内容和思维链容器，确保重新生成时 UI 清洁
                if (contentElement) {
                    contentElement.innerHTML = '';
                    // 移除可能存在的思维链容器
                    const thinkingContainer = contentElement.parentElement?.querySelector('.thinking-container');
                    if (thinkingContainer) thinkingContainer.remove();

                    contentElement.style.display = 'block';
                    contentElement.style.visibility = 'visible';
                }

                // 调用API执行节点（使用当前步骤，支持流式输出）
                const result = await executeNode(input, files, contentElement);

                // 隐藏加载状态，显示结果消息和助手名称
                document.getElementById('script-loading-message').style.display = 'none';
                const scriptResultMessage = document.getElementById('script-result-message');
                if (scriptResultMessage) {
                    scriptResultMessage.style.display = 'block';
                    const messageHeader = scriptResultMessage.querySelector('.message-header');
                    if (messageHeader) {
                        messageHeader.style.display = 'flex';
                    }
                }

                // 处理API返回的结果（如果是非流式输出）
                if (result && result.data && typeof result.data !== 'string') {
                    let markdownContent = '';
                    if (result.data.content) {
                        markdownContent = result.data.content;
                    } else if (result.data.result) {
                        markdownContent = result.data.result;
                    } else {
                        markdownContent = JSON.stringify(result.data, null, 2);
                    }

                    // 缓存本次生成的内容
                    latestStepContent.step2 = markdownContent;

                    // 如果不是流式输出，使用模拟流式效果
                    await streamText(contentElement, markdownContent, 15);
                } else {
                    // 流式输出已经在handleStreamingResponse中处理，这里只需要缓存最终内容
                    latestStepContent.step2 = contentElement.innerHTML || contentElement.textContent || '';
                }

                // 标记步骤为已完成
                document.querySelector('[data-step="2"]').classList.add('completed');
                step2Analyzed = true;

                // [Fix] 立即同步后端状态
                await updateNodeStatus();

                // 恢复按钮
                if (nextBtn) {
                    nextBtn.disabled = false;
                    // 如果这是最后一个节点，按钮应该显示"完成"
                    if (isCurrentStepLastNode) {
                        updateButtonToComplete(2);
                    } else {
                        nextBtn.textContent = '下一步';
                    }
                }
                // 注意：不自动跳转，等待用户再次点击"下一步"按钮
            } catch (error) {
                console.error('执行节点失败:', error);
                alert(`执行失败: ${error.message}`);

                // 恢复按钮
                const nextBtn = document.getElementById('step2-next-btn');
                if (nextBtn) {
                    nextBtn.disabled = false;
                    nextBtn.textContent = '下一步';
                }
            }
        } else {
            // 已经分析过，用户再次点击"下一步"，此时才获取下一个节点并跳转
            try {
                // 显示加载提示
                showNextStepLoading();

                const nextNodeData = await getNextNode();
                if (nextNodeData && nextNodeData.node_id) {
                    // 跳转到下一个节点，如果 has_next 为 false，说明这是最后一个节点
                    jumpToNode(nextNodeData.node_id, !nextNodeData.has_next);
                    // 跳转成功后延迟隐藏加载提示，确保页面已经完成跳转
                    setTimeout(() => {
                        hideNextStepLoading();
                    }, 300);
                } else {
                    // 如果没有返回 node_id，说明真的没有下一个节点了
                    // 将当前步骤的按钮改为"完成"
                    updateButtonToComplete(currentStep);
                    showToast('所有步骤已完成');
                    // 隐藏加载提示
                    hideNextStepLoading();
                }
            } catch (error) {
                console.error('获取下一个节点失败:', error);
                // 隐藏加载提示
                hideNextStepLoading();
                // [Fix] 不再重置 step2Analyzed
                showToast('获取后续步骤失败，请刷新页面重试');
            }
        }
    }



    // 第 3 步的下一步按钮处理
    async function handleStep3Next() {
        const input = document.getElementById('style-input').value;
        const fileInput = document.getElementById('style-file-input');
        const files = fileInput?.files || [];

        if (!input.trim() && files.length === 0) {
            showToast('请先输入爆款文案或上传文件');
            return;
        }

        // 如果还没有分析过，先调用API执行节点
        if (!step3Analyzed) {
            try {
                // 显示聊天容器
                const chatContainer = document.getElementById('style-chat');
                chatContainer.classList.add('show');

                // 滚动到聊天容器
                chatContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                // 显示加载状态，隐藏结果消息（避免同时显示）
                document.getElementById('style-loading-message').style.display = 'block';
                document.getElementById('style-result-message').style.display = 'none';

                // 禁用按钮
                const nextBtn = document.getElementById('step3-next-btn');
                if (nextBtn) {
                    nextBtn.disabled = true;
                    nextBtn.textContent = '处理中...';
                }

                // 获取内容元素
                const contentElement = document.getElementById('style-analysis-content');

                // [Fix] 显式清空旧内容和思维链容器，确保重新生成时 UI 清洁
                if (contentElement) {
                    contentElement.innerHTML = '';
                    // 移除可能存在的思维链容器
                    const thinkingContainer = contentElement.parentElement?.querySelector('.thinking-container');
                    if (thinkingContainer) thinkingContainer.remove();

                    contentElement.style.display = 'block';
                    contentElement.style.visibility = 'visible';
                }

                // 调用API执行节点（使用当前步骤，支持流式输出）
                const result = await executeNode(input, files, contentElement);

                // 隐藏加载状态，显示结果消息和助手名称
                document.getElementById('style-loading-message').style.display = 'none';
                const styleResultMessage = document.getElementById('style-result-message');
                if (styleResultMessage) {
                    styleResultMessage.style.display = 'block';
                    const messageHeader = styleResultMessage.querySelector('.message-header');
                    if (messageHeader) {
                        messageHeader.style.display = 'flex';
                    }
                }

                // 处理API返回的结果（如果是非流式输出）
                if (result && result.data && typeof result.data !== 'string') {
                    let markdownContent = '';
                    if (result.data.content) {
                        markdownContent = result.data.content;
                    } else if (result.data.result) {
                        markdownContent = result.data.result;
                    } else {
                        markdownContent = JSON.stringify(result.data, null, 2);
                    }

                    // 缓存本次生成的内容
                    latestStepContent.step3 = markdownContent;

                    // 如果不是流式输出，使用模拟流式效果
                    await streamText(contentElement, markdownContent, 15);
                } else {
                    // 流式输出已经在handleStreamingResponse中处理，这里只需要缓存最终内容
                    latestStepContent.step3 = contentElement.innerHTML || contentElement.textContent || '';
                }

                // 标记步骤为已完成
                document.querySelector('[data-step="3"]').classList.add('completed');
                step3Analyzed = true;

                // [Fix] 立即同步后端状态
                await updateNodeStatus();

                // 恢复按钮
                if (nextBtn) {
                    nextBtn.disabled = false;
                    // 如果这是最后一个节点，按钮应该显示"完成"
                    if (isCurrentStepLastNode) {
                        updateButtonToComplete(3);
                    } else {
                        nextBtn.textContent = '下一步';
                    }
                }
                // 注意：不自动跳转，等待用户再次点击"下一步"按钮
            } catch (error) {
                console.error('执行节点失败:', error);
                alert(`执行失败: ${error.message}`);

                // 恢复按钮
                const nextBtn = document.getElementById('step3-next-btn');
                if (nextBtn) {
                    nextBtn.disabled = false;
                    nextBtn.textContent = '下一步';
                }
            }
        } else {
            // 已经分析过，用户再次点击"下一步"，此时才获取下一个节点并跳转
            try {
                // 显示加载提示
                showNextStepLoading();

                const nextNodeData = await getNextNode();
                if (nextNodeData && nextNodeData.node_id) {
                    // 跳转到下一个节点，如果 has_next 为 false，说明这是最后一个节点
                    jumpToNode(nextNodeData.node_id, !nextNodeData.has_next);
                    // 跳转成功后延迟隐藏加载提示，确保页面已经完成跳转
                    setTimeout(() => {
                        hideNextStepLoading();
                    }, 300);
                } else {
                    // 如果没有返回 node_id，说明真的没有下一个节点了
                    // 将当前步骤的按钮改为"完成"
                    updateButtonToComplete(currentStep);
                    showToast('所有步骤已完成');
                    // 隐藏加载提示
                    hideNextStepLoading();
                }
            } catch (error) {
                console.error('获取下一个节点失败:', error);
                // 隐藏加载提示
                hideNextStepLoading();
                // [Fix] 不再重置 step3Analyzed
                showToast('获取后续步骤失败，请刷新页面重试');
            }
        }
    }

    // 第 4 步的生成按钮处理
    async function handleStep4Next() {
        const theme = document.getElementById('theme-input').value;
        const fileInput = document.getElementById('theme-file-input');
        const files = fileInput?.files || [];

        if (!theme.trim() && files.length === 0) {
            showToast('请先输入创作主题或上传文件');
            return;
        }

        // 如果还没有生成过，先调用API执行节点
        if (!step4Generated) {
            try {
                // 显示聊天容器
                const chatContainer = document.getElementById('final-chat');
                chatContainer.classList.add('show');

                // 滚动到聊天容器
                chatContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                // 显示加载状态，隐藏结果消息（避免同时显示）
                document.getElementById('final-loading-message').style.display = 'block';
                document.getElementById('final-result-message').style.display = 'none';

                // 禁用按钮
                const nextBtn = document.getElementById('step4-next-btn');
                if (nextBtn) {
                    nextBtn.disabled = true;
                    nextBtn.textContent = '生成中...';
                }

                // 获取内容元素
                const contentElement = document.getElementById('generated-script');

                // [Fix] 显式清空旧内容和思维链容器，确保重新生成时 UI 清洁
                if (contentElement) {
                    contentElement.innerHTML = '';
                    // 移除可能存在的思维链容器
                    const thinkingContainer = contentElement.parentElement?.querySelector('.thinking-container');
                    if (thinkingContainer) thinkingContainer.remove();

                    contentElement.style.display = 'block';
                    contentElement.style.visibility = 'visible';
                }

                // 调用API执行节点（使用当前步骤，支持流式输出）
                const result = await executeNode(theme, files, contentElement);

                // 隐藏加载状态，显示结果消息和助手名称
                document.getElementById('final-loading-message').style.display = 'none';
                const finalResultMessage = document.getElementById('final-result-message');
                if (finalResultMessage) {
                    finalResultMessage.style.display = 'block';
                    const messageHeader = finalResultMessage.querySelector('.message-header');
                    if (messageHeader) {
                        messageHeader.style.display = 'flex';
                    }
                }

                // 处理API返回的结果（如果是非流式输出）
                if (result && result.data && typeof result.data !== 'string') {
                    let scriptContent = '';
                    if (result.data.content) {
                        scriptContent = result.data.content;
                    } else if (result.data.result) {
                        scriptContent = result.data.result;
                    } else {
                        scriptContent = JSON.stringify(result.data, null, 2);
                    }

                    // 缓存本次生成的内容
                    latestStepContent.step4 = scriptContent;

                    // 如果不是流式输出，使用模拟流式效果
                    await streamTextPlain(contentElement, scriptContent, 30);
                } else {
                    // 流式输出已经在handleStreamingResponse中处理，这里只需要缓存最终内容
                    latestStepContent.step4 = contentElement.textContent || '';
                }

                // 标记步骤为已完成
                document.querySelector('[data-step="4"]').classList.add('completed');
                step4Generated = true;

                // 更新节点状态，确保completedNodeIds包含当前完成的节点
                await updateNodeStatus();

                // 更新按钮状态
                updateStep4Buttons();
                // 注意：不自动跳转，等待用户再次点击"下一步"或"完成"按钮
            } catch (error) {
                console.error('执行节点失败:', error);
                alert(`执行失败: ${error.message}`);

                // 恢复按钮
                const nextBtn = document.getElementById('step4-next-btn');
                if (nextBtn) {
                    nextBtn.disabled = false;
                    nextBtn.textContent = '生成仿写文稿';
                }
            }
        } else {
            // 已经生成过，用户再次点击"下一步"，进入第五步
            // 先调用getNextNode来更新后端状态（即使我们知道下一个是第五步）
            // 这样可以确保后端将第四步标记为完成，并更新节点状态
            try {
                // 显示加载提示
                showNextStepLoading();

                await getNextNode();
            } catch (error) {
                console.error('获取下一个节点失败（可能所有节点已完成）:', error);
                // 即使失败也继续，因为可能所有后端节点都已完成
            }

            // 再次更新节点状态，确保状态是最新的
            await updateNodeStatus();

            const totalBackendNodes = nodesData.length;
            const chatStepNumber = totalBackendNodes + 1;
            setActiveStep(chatStepNumber);

            // 跳转成功后延迟隐藏加载提示，确保页面已经完成跳转
            setTimeout(() => {
                hideNextStepLoading();
            }, 300);
        }
    }

    // 处理第四步的"上一步"按钮
    function handleStep4Prev() {
        if (step4Generated) {
            // 如果第四步已完成，点击后回到主页
            if (__sopOnNavigateHome) { __sopOnNavigateHome(); } else { window.location.href = '/'; }
        } else {
            // 如果第四步未完成，执行正常的上一步操作
            prevStep();
        }
    }

    // 更新第四步的按钮状态
    function updateStep4Buttons() {
        const prevBtn = document.getElementById('step4-prev-btn');
        const nextBtn = document.getElementById('step4-next-btn');

        if (step4Generated) {
            // 第四步已完成
            if (prevBtn) {
                prevBtn.textContent = '完成';
                prevBtn.onclick = handleStep4Prev;
            }
            if (nextBtn) {
                nextBtn.disabled = false;
                nextBtn.textContent = '下一步';
                nextBtn.onclick = handleStep4Next;
            }
        } else {
            // 第四步未完成
            if (prevBtn) {
                prevBtn.textContent = '← 上一步';
                prevBtn.onclick = handleStep4Prev;
            }
            if (nextBtn) {
                nextBtn.textContent = '生成仿写文稿';
                nextBtn.onclick = handleStep4Next;
            }
        }
    }

    // 喜欢/不喜欢按钮状态管理
    const feedbackState = {
        step1: null,
        step2: null,
        step3: null,
        step4: null
    };

    // 切换喜欢状态
    function toggleLike(button, stepId) {
        const group = button.closest('.ai-actions');
        const likeBtn = button;
        const dislikeBtn = group.querySelector('button[onclick*="toggleDislike"]');

        if (feedbackState[stepId] === 'like') {
            // 取消喜欢
            likeBtn.classList.remove('liked');
            feedbackState[stepId] = null;
        } else {
            // 设置喜欢
            likeBtn.classList.add('liked');
            dislikeBtn.classList.remove('disliked');
            feedbackState[stepId] = 'like';

            // 这里可以发送反馈到后端
            console.log(`用户喜欢 ${stepId} 的结果`);
        }
    }

    // 切换不喜欢状态
    function toggleDislike(button, stepId) {
        const group = button.closest('.ai-actions');
        const dislikeBtn = button;
        const likeBtn = group.querySelector('button[onclick*="toggleLike"]');

        if (feedbackState[stepId] === 'dislike') {
            // 取消不喜欢
            dislikeBtn.classList.remove('disliked');
            feedbackState[stepId] = null;
        } else {
            // 设置不喜欢
            dislikeBtn.classList.add('disliked');
            likeBtn.classList.remove('liked');
            feedbackState[stepId] = 'dislike';

            // 这里可以发送反馈到后端
            console.log(`用户不喜欢 ${stepId} 的结果`);
        }
    }

    // 复制AI结果内容
    function copyAIResult(elementId) {
        const element = document.getElementById(elementId);
        let textToCopy = '';

        if (elementId === 'analysis-content' || elementId === 'script-analysis-content' || elementId === 'style-analysis-content') {
            // 前三步的内容（直接是内容元素）
            textToCopy = element.innerText || element.textContent;
        } else {
            // 其他步骤的内容
            const resultContent = document.querySelector(`#${elementId} .result-content`);
            textToCopy = resultContent ? (resultContent.innerText || resultContent.textContent) : '';
        }

        // 使用 Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                showToast('内容已复制到剪贴板！');
            }).catch(err => {
                console.error('复制失败：', err);
                fallbackCopy(textToCopy);
            });
        } else {
            // 降级方案
            fallbackCopy(textToCopy);
        }
    }

    // 复制文稿
    function copyScript() {
        const scriptElement = document.getElementById('generated-script');
        const scriptText = scriptElement ? (scriptElement.innerText || scriptElement.textContent) : '';

        // 使用 Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(scriptText).then(() => {
                showToast('文稿已复制到剪贴板！');
            }).catch(err => {
                console.error('复制失败：', err);
                fallbackCopy(scriptText);
            });
        } else {
            // 降级方案
            fallbackCopy(scriptText);
        }
    }

    // 显示提示信息
    function showToast(message) {
        // 创建toast元素
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 14px;
                z-index: 10000;
                animation: fadeInOut 2s ease-in-out;
            `;

        // 添加到页面
        document.body.appendChild(toast);

        // 2秒后移除
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 2000);
    }

    // 显示自定义确认对话框
    function showConfirmDialog(title, message, onConfirm) {
        const overlay = document.getElementById('confirm-dialog-overlay');
        const titleEl = document.getElementById('confirm-dialog-title');
        const messageEl = document.getElementById('confirm-dialog-message');
        const confirmBtn = document.getElementById('confirm-dialog-confirm-btn');

        if (!overlay || !titleEl || !messageEl || !confirmBtn) {
            // 降级到浏览器原生confirm
            if (confirm(message || '确认删除记录吗？此操作不可恢复')) {
                onConfirm && onConfirm();
            }
            return;
        }

        // 设置标题和消息
        titleEl.textContent = title || '确认操作';
        messageEl.textContent = message || '确认删除记录吗？此操作不可恢复';

        // 移除之前的监听器（如果有）
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        // 添加确认按钮点击事件
        newConfirmBtn.addEventListener('click', () => {
            closeConfirmDialog();
            onConfirm && onConfirm();
        });

        // 显示对话框
        overlay.classList.add('show');
    }

    // 关闭确认对话框
    function closeConfirmDialog() {
        const overlay = document.getElementById('confirm-dialog-overlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
    }

    // 点击遮罩层关闭对话框
    function closeConfirmDialogOnOverlay(event) {
        if (event.target.id === 'confirm-dialog-overlay') {
            closeConfirmDialog();
        }
    }

    // 处理返回首页按钮点击
    function handleBackToHome(event) {
        event.preventDefault();

        // 显示自定义确认对话框
        showConfirmDialog('返回首页', '确定返回首页吗？', () => {
            if (__sopOnNavigateHome) { __sopOnNavigateHome(); } else { window.location.href = '/'; }
        });
    }

    // 降级复制方案
    function fallbackCopy(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();

        try {
            document.execCommand('copy');
            showToast('内容已复制到剪贴板！');
        } catch (err) {
            showToast('复制失败，请手动复制');
        }

        document.body.removeChild(textArea);
    }

    // 重新生成各步骤内容
    async function regenerateStep1() {
        const input = document.getElementById('product-input').value;

        if (!input.trim()) {
            showToast('请先输入产品介绍');
            return;
        }

        // 清空当前内容
        document.getElementById('analysis-content').innerHTML = '';

        // 显示加载状态
        showToast('正在重新生成...');

        // 模拟的 Markdown 格式的分析结果（可以稍微变化）
        const markdownContent = `## 📊 产品核心卖点

- 高效便捷，解决用户痛点
- 品质保证，值得信赖
- 性价比高，适合大众消费

## 👥 目标人群画像

- **年龄**：25-40 岁
- **特征**：注重生活品质，追求高效便捷
- **需求**：希望找到既实用又美观的产品

## 🎯 使用场景

- 日常生活场景
- 工作办公场景
- 休闲娱乐场景

## ⭐ 核心优势

- 创新设计，引领潮流
- 精选材质，经久耐用
- 贴心服务，售后无忧

---

✅ **我已深入了解您的产品，请继续下一步！**`;

        // 使用流式输出效果
        // 缓存本次生成的内容
        latestStepContent.step1 = markdownContent;

        const contentElement = document.getElementById('analysis-content');
        await streamText(contentElement, markdownContent, 15);

        // 这里预留 AI 接口调用位置
        // TODO: 调用 AI API 重新生成产品分析
    }

    async function regenerateStep2() {
        const input = document.getElementById('script-input').value;

        if (!input.trim()) {
            showToast('请先输入你的历史文稿');
            return;
        }

        // 清空当前内容
        document.getElementById('script-analysis-content').innerHTML = '';

        showToast('正在重新生成...');

        // 重新生成内容
        const markdownContent = `## 语言特征

- **语气**：亲切自然，像朋友聊天
- **节奏**：张弛有度，重点突出
- **用词**：简单易懂，接地气

## 表达习惯

- 喜欢用"真的"、"超级"等强调词
- 经常使用反问句增强互动感
- 善于用比喻让复杂概念简单化

## 个人标签

（标签会显示在下方）

---

✅ **我已充分学习您的语言风格，准备开始创作！**`;

        // 缓存本次生成的内容
        latestStepContent.step2 = markdownContent;

        const contentElement = document.getElementById('script-analysis-content');
        await streamText(contentElement, markdownContent, 15);
    }

    async function regenerateStep3() {
        const input = document.getElementById('style-input').value;

        if (!input.trim()) {
            showToast('请先输入爆款文案');
            return;
        }

        // 清空当前内容
        document.getElementById('style-analysis-content').innerHTML = '';

        showToast('正在重新生成...');

        // 重新生成内容
        const markdownContent = `## 开头方式

- 使用悬念式开头，快速抓住注意力
- 直击用户痛点，引发共鸣

## 内容结构

1. 痛点引入（前 3 秒）
2. 产品展示（核心卖点）
3. 使用场景演示
4. 效果对比/用户反馈
5. 行动号召

## 表达特点

- 语言简洁有力，节奏明快
- 多用短句，便于记忆
- 结合视觉画面，强化印象
- 情绪饱满，感染力强

## 关键要素

- **真实性**：真诚分享，避免过度营销
- **共鸣感**：说出用户心声
- **差异化**：突出独特卖点
- **行动力**：清晰的购买引导

---

✅ **我已充分学习这个爆款文案的结构，请继续下一步！**`;

        // 缓存本次生成的内容
        latestStepContent.step3 = markdownContent;

        const contentElement = document.getElementById('style-analysis-content');
        await streamText(contentElement, markdownContent, 15);
    }

    async function regenerateStep4() {
        const theme = document.getElementById('theme-input').value;

        if (!theme.trim()) {
            showToast('请先输入创作主题');
            return;
        }

        // 清空当前内容
        document.getElementById('generated-script').textContent = '';

        showToast('正在重新生成...');

        // 重新生成文稿
        const scriptContent = `姐妹们！今天必须跟你们分享这个我最近超爱的宝贝！

你们是不是也有这种困扰？每次xx的时候就特别麻烦，又费时间又费力气，真的太崩溃了！

但是自从我用了这个之后，天呐，整个人都轻松了！它最大的特点就是xxx，而且xxx，真的超级方便！

我最喜欢的是它可以xxx，这个功能真的太贴心了！平时我都会在xxx的时候用它，效果真的是肉眼可见的好！

关键是性价比还特别高，这个价格能买到这么好用的东西，我觉得真的很值！

如果你也有这样的需求，真的可以试试看！反正我是回购好几次了，真心推荐给你们！

评论区扣1，我把链接放在下面啦～`;

        // 缓存本次生成的内容
        latestStepContent.step4 = scriptContent;

        const contentElement = document.getElementById('generated-script');
        await streamTextPlain(contentElement, scriptContent, 30);
    }

    // 自动滚动函数 - 确保内容在视口中可见
    function autoScrollToElement(element) {
        if (!element) return;

        // 获取可滚动的容器（.main-content）
        const scrollContainer = document.querySelector('.main-content');
        if (!scrollContainer) return;

        // 如果当前在步骤5，不滚动主内容区域
        if (currentStep === 5) {
            return;
        }

        // 获取正在生成内容的元素位置
        const rect = element.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        // 如果元素底部超出视口底部（留出150px的边距让用户能看到正在生成的内容）
        if (rect.bottom > viewportHeight - 150) {
            // 计算需要滚动的距离
            const scrollAmount = rect.bottom - viewportHeight + 200; // 让元素底部距离视口底部200px

            scrollContainer.scrollTo({
                top: scrollContainer.scrollTop + scrollAmount,
                behavior: 'smooth'
            });
        }
    }

    // 流式输出函数 - 模拟打字机效果（Markdown格式）
    function streamText(element, markdownText, speed = 20) {
        return new Promise((resolve) => {
            let index = 0;
            let currentText = '';
            let scrollCounter = 0;

            const interval = setInterval(() => {
                if (index < markdownText.length) {
                    currentText += markdownText[index];
                    // 使用 marked.js 实时渲染 Markdown
                    element.innerHTML = marked.parse(currentText);

                    // 每10个字符检查一次是否需要滚动，避免过于频繁
                    scrollCounter++;
                    if (scrollCounter % 10 === 0) {
                        autoScrollToElement(element);
                    }

                    index++;
                } else {
                    clearInterval(interval);
                    // 最后确保滚动到位
                    autoScrollToElement(element);
                    resolve();
                }
            }, speed);
        });
    }

    // 流式输出函数 - 纯文本（不需要 Markdown 渲染）
    function streamTextPlain(element, text, speed = 30) {
        return new Promise((resolve) => {
            let index = 0;
            let currentText = '';
            let scrollCounter = 0;

            const interval = setInterval(() => {
                if (index < text.length) {
                    currentText += text[index];
                    element.textContent = currentText;

                    // 每10个字符检查一次是否需要滚动，避免过于频繁
                    scrollCounter++;
                    if (scrollCounter % 10 === 0) {
                        autoScrollToElement(element);
                    }

                    index++;
                } else {
                    clearInterval(interval);
                    // 最后确保滚动到位
                    autoScrollToElement(element);
                    resolve();
                }
            }, speed);
        });
    }


    // AI API 调用函数（预留接口）
    // async function callAIAPI(endpoint, data) {
    //     try {
    //         const response = await fetch(`/api/${endpoint}`, {
    //             method: 'POST',
    //             headers: {
    //                 'Content-Type': 'application/json',
    //             },
    //             body: JSON.stringify(data)
    //         });
    //         const result = await response.json();
    //         return result.data;
    //     } catch (error) {
    //         console.error('API 调用失败：', error);
    //         return '抱歉，AI 分析失败，请稍后重试';
    //     }
    // }

    // ===== 第5步：聊天功能 =====

    // 聊天消息数组
    let chatbotMessages = [];

    // 防重复提交标志
    let isSendingMessage = false;

    // 输入法组合输入状态标志（用于处理中文输入法）
    let isComposing = false;

    // 深度思考状态（使用全局变量同步状态）
    window.isDeepThinking = false;

    const CHATBOT_LINE_HEIGHT = 24;
    const CHATBOT_MAX_COLLAPSED_LINES = 3;

    // 调整输入框高度并检测是否需要显示展开按钮
    function adjustChatbotInputHeight(textarea) {
        const expandBtn = document.getElementById('chatbot-expand-btn');
        const wrapper = document.querySelector('.chatbot-input-wrapper');
        if (!expandBtn || !wrapper) return;

        // 如果处于展开状态，不自动调整高度
        if (wrapper.classList.contains('expanded')) {
            return;
        }

        // 重置高度以获取真实scrollHeight
        textarea.style.height = 'auto';
        const scrollHeight = textarea.scrollHeight;
        const lines = Math.ceil(scrollHeight / CHATBOT_LINE_HEIGHT);

        if (lines > CHATBOT_MAX_COLLAPSED_LINES) {
            // 超过3行：限制高度为3行，显示展开按钮
            textarea.style.height = (CHATBOT_MAX_COLLAPSED_LINES * CHATBOT_LINE_HEIGHT) + 'px';
            expandBtn.style.display = 'flex';
        } else {
            // 1-3行：自动调整高度，由于在玻璃态容器中我们希望保持紧凑
            // 只有当有内容时才调整，否则保持最小高度
            if (textarea.value.trim().length > 0) {
                textarea.style.height = scrollHeight + 'px';
            } else {
                textarea.style.height = CHATBOT_LINE_HEIGHT + 'px';
            }
            expandBtn.style.display = 'none';
        }
    }

    // 切换输入框展开/收起状态
    function toggleChatbotInputExpand() {
        const wrapper = document.querySelector('.chatbot-input-wrapper');
        const textarea = document.getElementById('chatbot-input');
        const expandBtn = document.getElementById('chatbot-expand-btn');
        if (!wrapper || !textarea || !expandBtn) return;

        const isCurrentlyExpanded = wrapper.classList.contains('expanded');

        if (isCurrentlyExpanded) {
            // 收起：根据内容行数恢复高度
            wrapper.classList.remove('expanded');

            // 计算当前内容的实际行数
            textarea.style.height = 'auto';
            const scrollHeight = textarea.scrollHeight;
            const lines = Math.ceil(scrollHeight / CHATBOT_LINE_HEIGHT);

            if (lines <= CHATBOT_MAX_COLLAPSED_LINES) {
                // 内容在3行以内：恢复到实际行数高度，隐藏展开按钮
                if (textarea.value.trim().length > 0) {
                    textarea.style.height = scrollHeight + 'px';
                } else {
                    textarea.style.height = CHATBOT_LINE_HEIGHT + 'px';
                }
                expandBtn.style.display = 'none';
            } else {
                // 内容超过3行：恢复到3行高度，保持展开按钮可见
                textarea.style.height = (CHATBOT_MAX_COLLAPSED_LINES * CHATBOT_LINE_HEIGHT) + 'px';
                expandBtn.style.display = 'flex';
            }
            updateChatbotExpandButtonIcon(false);
        } else {
            // 展开
            wrapper.classList.add('expanded');
            textarea.style.height = ''; // 清除内联样式，由CSS控制
            updateChatbotExpandButtonIcon(true);
        }
    }

    // 更新展开按钮图标
    function updateChatbotExpandButtonIcon(isExpanded) {
        const expandBtn = document.getElementById('chatbot-expand-btn');
        if (!expandBtn) return;

        const iconName = isExpanded ? 'minimize-2' : 'maximize-2';
        expandBtn.innerHTML = `<i data-lucide="${iconName}" style="width: 14px; height: 14px;"></i>`;
        if (window.lucide) lucide.createIcons();
    }

    // [V3] 转换为命名函数，由 __sopLegacyInit 调用
    function __sopDOMContentLoadedChat() {
        const chatbotInput = document.getElementById('chatbot-input');
        const chatbotSendBtn = document.getElementById('chatbot-send-btn');
        const deepThinkingBtn = document.getElementById('deep-thinking-btn');
        const expandBtn = document.getElementById('chatbot-expand-btn');

        if (chatbotInput && chatbotSendBtn) {
            // 初始化状态
            updateChatbotSendButton();
            adjustChatbotInputHeight(chatbotInput);

            // 监听输入变化
            chatbotInput.addEventListener('input', function () {
                updateChatbotSendButton();
                adjustChatbotInputHeight(this);
            });

            // 监听输入法状态
            chatbotInput.addEventListener('compositionstart', () => isComposing = true);
            chatbotInput.addEventListener('compositionend', () => {
                isComposing = false;
                updateChatbotSendButton();
                adjustChatbotInputHeight(chatbotInput);
            });

            // 监听键盘事件
            chatbotInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    if (isComposing) return;
                    e.preventDefault();
                    if (!chatbotSendBtn.disabled && !isSendingMessage) {
                        sendChatbotMessage();
                    }
                }
            });

            // 发送按钮点击
            chatbotSendBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (!chatbotSendBtn.disabled && !isSendingMessage) {
                    sendChatbotMessage();
                }
            });
        }

        // 深度思考按钮
        if (deepThinkingBtn) {
            deepThinkingBtn.addEventListener('click', function () {
                window.isDeepThinking = !window.isDeepThinking;
                this.classList.toggle('active', window.isDeepThinking);
            });
        }

        // 展开按钮
        if (expandBtn) {
            expandBtn.addEventListener('click', function (e) {
                e.preventDefault();
                toggleChatbotInputExpand();
            });
        }

        function updateChatbotSendButton() {
            if (chatbotInput && chatbotSendBtn) {
                const hasText = chatbotInput.value.trim().length > 0;
                chatbotSendBtn.disabled = !hasText || isSendingMessage;
            }
        }
    }

    // 发送聊天消息
    async function sendChatbotMessage() {
        // 防止重复提交
        if (isSendingMessage) {
            console.log('⚠️ 消息正在发送中，忽略重复请求');
            return;
        }

        const chatbotInput = document.getElementById('chatbot-input');
        const chatbotSendBtn = document.getElementById('chatbot-send-btn');
        const question = chatbotInput.value.trim();

        if (!question) {
            return;
        }

        if (!currentRunId) {
            showToast('未找到runId，请确保从正确的入口进入');
            return;
        }

        // 设置发送标志，防止重复提交
        isSendingMessage = true;

        // 禁用发送按钮（输入框保持可用，允许继续输入）
        chatbotSendBtn.disabled = true;



        // 添加用户消息
        addChatbotMessage('user', question);

        // 移除原本冲突的手动滚动逻辑，统一由 registerStreamingElement 处理状态同步
        // 以免触发多余的滚动事件干扰跟随判断

        // 清空输入框
        chatbotInput.value = '';
        updateChatbotSendButton();

        // 创建AI消息占位符，显示"AI正在分析中"的加载提示
        const aiMessageElement = addChatbotMessage('ai', '', true);
        const aiContentElement = aiMessageElement ? aiMessageElement.querySelector('.chatbot-bubble-content') : null;

        if (!aiContentElement) {
            console.error('❌ 无法找到AI消息内容元素');
            showToast('界面错误，无法显示回复');
            // 恢复发送状态
            isSendingMessage = false;
            updateChatbotSendButton();
            return;
        }

        // 显示"AI正在分析中"的加载提示（与步骤一相同的样式）
        aiContentElement.innerHTML = `
                <div class="loading-message">
                    <div>
                        <div class="message-name">AI 正在分析中</div>
                        <div class="loading-dots">
                            <div class="loading-dot"></div>
                            <div class="loading-dot"></div>
                            <div class="loading-dot"></div>
                        </div>
                    </div>
                </div>
            `;
        aiContentElement.classList.remove('prose'); // 移除prose类，因为加载提示不需要markdown渲染

        console.log('✅ AI消息元素已创建，准备调用API');
        console.log('📝 用户问题:', question);
        console.log('🎯 目标元素:', aiContentElement);

        try {
            // 调用聊天API
            await callChatAPI(question, aiContentElement);
            console.log('✅ API调用完成');
        } catch (error) {
            console.error('❌ 发送消息失败:', error);
            // 更新AI消息为错误状态
            if (aiContentElement) {
                updateChatbotMessageContent(aiContentElement, `抱歉，发生了错误: ${error.message}`);
            }
            showToast(`发送失败: ${error.message}`);
        } finally {
            // 恢复发送按钮（输入框始终保持可用）
            isSendingMessage = false;
            updateChatbotSendButton();
            chatbotInput.focus();
        }
    }

    // 调用聊天API
    async function callChatAPI(question, contentElement, regenerateMsgId = null) {
        const token = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (!token) {
            throw new Error('未找到认证Token，请先登录');
        }

        // 确保 question 是字符串类型，并且只使用一次
        const questionValue = String(question || '').trim();

        if (!questionValue) {
            throw new Error('问题内容为空');
        }

        const requestBody = {
            run_id: parseInt(currentRunId),
            question: questionValue  // 只使用一次，确保不会重复
        };

        // 添加 conversation_id (如果存在)
        if (currentConversationId) {
            requestBody.conversation_id = currentConversationId;
        }

        // [Regenerate Feature] 如果是重新生成，添加 ID
        if (regenerateMsgId) {
            // 如果是纯数字或数字字符串，转换为整数以满足后端 uint 类型要求
            const numericId = parseInt(regenerateMsgId);
            if (!isNaN(numericId) && String(numericId) === String(regenerateMsgId)) {
                requestBody.regenerate_msg_id = numericId;
            } else {
                requestBody.regenerate_msg_id = regenerateMsgId;
            }
        }

        // 只有在开启时才发送该字段，符合“不提供则为标准聊天”的逻辑
        if (window.isDeepThinking) {
            requestBody.deep_thinking = true;
        }

        console.log('📤 发送聊天请求:', {
            url: `${API_BASE_URL}/v1/sop/chat/stream`,
            body: requestBody,
            questionLength: questionValue.length,
            questionValue: questionValue
        });

        // 验证请求体
        const requestBodyString = JSON.stringify(requestBody);
        console.log('📤 请求体JSON:', requestBodyString);

        window.__sopSseAbortController = new AbortController();
        const response = await fetch(`${API_BASE_URL}/v1/sop/chat/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: requestBodyString,  // 使用已经序列化的字符串，确保不会重复序列化
            signal: window.__sopSseAbortController.signal
        });

        console.log('📥 收到响应:', {
            status: response.status,
            statusText: response.statusText,
            contentType: (response.headers && typeof response.headers.get === 'function') ? response.headers.get('content-type') : 'unknown'
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `API请求失败: ${response.status}`);
        }

        // 处理SSE流式响应
        await handleChatStreamingResponse(response, contentElement);
    }

    // 处理聊天流式响应
    async function handleChatStreamingResponse(response, contentElement) {
        if (!contentElement) {
            throw new Error('contentElement 为空');
        }

        // 注册流式输出元素，开始跟随底部
        scrollFollowManager.registerStreamingElement(contentElement);
        scrollFollowManager.startPeriodicCheck();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        let messageContent = '';
        let thinkingContent = ''; // 添加思维链内容累积变量
        let isDone = false;

        // 跟踪已注册的元素
        const trackedElements = new Set();
        if (contentElement) trackedElements.add(contentElement);

        console.log('🔄 开始处理流式响应');

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    console.log('✅ 流式响应读取完成');
                    break;
                }

                // 解码数据块
                buffer += decoder.decode(value, { stream: true });

                // 处理SSE格式：每个消息以 \n\n 结尾
                const messages = buffer.split('\n\n');
                buffer = messages.pop() || ''; // 保留最后一个不完整的消息

                for (const message of messages) {
                    if (!message.trim()) continue;

                    console.log('📨 收到SSE消息:', message);

                    const lines = message.split('\n');
                    let eventType = null;
                    let dataValue = null;

                    // 解析SSE消息格式
                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (!trimmedLine) continue;

                        // 忽略心跳（以 : 开头的行）
                        if (trimmedLine.startsWith(':')) {
                            continue;
                        }

                        // 解析 event 字段（关键：必须正确识别 event 类型）
                        if (trimmedLine.startsWith('event: ')) {
                            eventType = trimmedLine.substring(7).trim();
                            console.log('📌 聊天机器人 - 识别到事件类型:', eventType);
                            continue;
                        }

                        // 解析 data 字段
                        if (trimmedLine.startsWith('data: ')) {
                            const dataStr = trimmedLine.substring(6).trim();
                            try {
                                // 注意：data 字段是 JSON 字符串化的字符串，需要 JSON.parse() 解析
                                // 例如：data: "\"思考内容\"" → JSON.parse(dataStr) → "思考内容"
                                dataValue = JSON.parse(dataStr);
                                console.log('✅ 聊天机器人 - 成功解析data字段:', typeof dataValue, eventType || 'message');
                            } catch (e) {
                                // 如果解析失败，记录错误并尝试备用方案
                                console.warn('⚠️ 聊天机器人 - JSON解析失败，尝试备用方案:', e.message, '原始数据:', dataStr);
                                // 如果不是JSON，处理字符串
                                if (dataStr.startsWith('"') && dataStr.endsWith('"')) {
                                    try {
                                        dataValue = JSON.parse(dataStr);
                                    } catch (e2) {
                                        dataValue = dataStr.slice(1, -1);
                                    }
                                } else {
                                    // 直接使用字符串
                                    dataValue = dataStr;
                                }
                            }
                            continue;
                        }
                    }

                    // 处理不同的事件类型
                    if (eventType === 'done') {
                        isDone = true;
                        console.log('✅ 收到完成事件');

                        // [New] 从 dataValue 中提取本次生成的消息 ID 和会话 ID
                        if (dataValue) {
                            if (dataValue.message_id) {
                                const messageElement = contentElement.closest('.chatbot-message');
                                if (messageElement) {
                                    messageElement.dataset.msgId = dataValue.message_id;
                                    console.log('✅ 已保存消息ID:', dataValue.message_id);
                                    // 立即刷新操作按钮（如重新生成按钮）
                                    refreshAIMessageActions();
                                }
                            }

                            if (dataValue.conversation_id) {
                                currentConversationId = dataValue.conversation_id;
                                console.log('✅ 已更新会话ID:', currentConversationId);
                            }
                        }

                        // 标记思维链完成
                        markThinkingFinished(contentElement);
                        continue;
                    }

                    if (eventType === 'error') {
                        const errorMsg = typeof dataValue === 'string' ? dataValue : (dataValue?.message || '发生错误');
                        console.error('❌ 收到错误事件:', errorMsg);
                        throw new Error(errorMsg);
                    }

                    if (eventType === 'thinking') {
                        // 思考过程，累积并实时显示思维链（关键检查点：必须正确识别 thinking 事件）
                        if (typeof dataValue === 'string') {
                            thinkingContent += dataValue;
                            console.log('💭 聊天机器人 - 收到思维链片段，当前累积长度:', thinkingContent.length, '本次chunk长度:', dataValue.length);

                            // 实时显示思维链内容
                            const thinkingElement = createOrUpdateThinkingElement(contentElement, thinkingContent);

                            // 确保思维链元素也被跟随
                            if (thinkingElement && !trackedElements.has(thinkingElement)) {
                                scrollFollowManager.registerStreamingElement(thinkingElement);
                                trackedElements.add(thinkingElement);
                            }

                            // 检查并滚动到底部
                            requestAnimationFrame(() => {
                                if (thinkingElement) {
                                    scrollFollowManager.checkAndScroll(thinkingElement);
                                }
                                scrollFollowManager.checkAndScroll(contentElement);
                            });
                        } else {
                            console.warn('⚠️ 聊天机器人 - thinking事件的数据不是字符串类型:', typeof dataValue, dataValue);
                        }
                        continue;
                    }

                    // 处理普通消息片段（没有event字段，只有data字段）
                    // 根据API文档，普通消息格式是：data: "消息内容"（没有event字段）
                    if (!eventType && dataValue !== null) {
                        // 只处理字符串类型的data
                        if (typeof dataValue === 'string') {
                            messageContent += dataValue;
                            console.log('💬 累积消息内容:', messageContent);
                            // 实时更新UI，使用Markdown渲染（会自动移除加载提示）
                            updateChatbotMessageContent(contentElement, messageContent);
                            // 检查并滚动到底部
                            requestAnimationFrame(() => {
                                scrollFollowManager.checkAndScroll(contentElement);
                            });
                        } else {
                            console.log('⚠️ 忽略非字符串data:', dataValue);
                        }
                    } else if (eventType === 'message') {
                        // 如果有明确的message事件
                        if (typeof dataValue === 'string') {
                            messageContent += dataValue;
                            console.log('💬 累积消息内容:', messageContent);
                            // 实时更新UI，使用Markdown渲染（会自动移除加载提示）
                            updateChatbotMessageContent(contentElement, messageContent);
                            // 检查并滚动到底部
                            requestAnimationFrame(() => {
                                scrollFollowManager.checkAndScroll(contentElement);
                            });
                        }
                    } else if (eventType) {
                        // 其他已知事件类型，忽略
                        console.log('ℹ️ 忽略事件类型:', eventType);
                    }
                }
            }
            // 确保思维链被标记为完成
            markThinkingFinished(contentElement);

            // 最终更新一次，使用Markdown渲染
            if (messageContent) {
                console.log('✅ 最终消息内容:', messageContent);
                updateChatbotMessageContent(contentElement, messageContent);
                // 最后一次检查并滚动
                requestAnimationFrame(() => {
                    scrollFollowManager.checkAndScroll(contentElement);
                });
            } else {
                console.warn('⚠️ 没有收到任何消息内容');
                updateChatbotMessageContent(contentElement, '抱歉，没有收到回复');
            }

            // 标记消息完成
            const messageElement = contentElement.closest('.chatbot-message');
            if (messageElement && messageElement.classList.contains('ai')) {
                messageElement.dataset.streaming = 'false';

                // 初始刷新（可能还没 ID，只会有复制按钮）
                refreshAIMessageActions();

                // [Regenerate Feature] 不再需要轮询获取消息ID，已经在 SSE done 事件中处理
                refreshAIMessageActions();
            } else if (messageElement) {
                messageElement.dataset.streaming = 'false';
            }
        } catch (error) {
            console.error('❌ 流式响应处理失败:', error);
            if (messageContent) {
                updateChatbotMessageContent(contentElement, messageContent);
            } else {
                updateChatbotMessageContent(contentElement, `抱歉，发生了错误: ${error.message} `);
            }
            throw error;
        } finally {
            reader.releaseLock();

            // 在注销之前，如果还在跟随底部状态，强制跳转到绝对底部
            if (contentElement && scrollFollowManager.streamingElements.has(contentElement)) {
                if (scrollFollowManager.isFollowing) {
                    scrollFollowManager.scrollToBottom(contentElement, 'auto');
                }
            }

            // 注销流式输出元素，停止跟随底部
            scrollFollowManager.unregisterStreamingElement(contentElement);
            if (scrollFollowManager.streamingElements.size === 0) {
                scrollFollowManager.stopPeriodicCheck();
            }
        }
    }

    // 更新聊天消息内容（支持Markdown实时渲染）
    function updateChatbotMessageContent(contentElement, content) {
        if (!contentElement) return;

        // 存储原始文本，用于后续准确复制
        if (content !== undefined && content !== null) {
            contentElement.dataset.rawContent = content;
        }

        // 检查是否是AI消息（通过查找父元素）
        const messageElement = contentElement.closest('.chatbot-message');
        const isAIMessage = messageElement && messageElement.classList.contains('ai');

        // 如果内容不为空，移除加载提示（如果存在）
        if (content && content.trim()) {
            // 检查是否包含加载提示
            const loadingMessage = contentElement.querySelector('.loading-message');
            if (loadingMessage) {
                // 移除加载提示，准备显示实际内容
                loadingMessage.remove();
            }
        }

        // 对于AI消息，使用Markdown渲染
        if (isAIMessage && typeof marked !== 'undefined' && marked.parse) {
            // 确保有prose类
            if (!contentElement.classList.contains('prose')) {
                contentElement.classList.add('prose');
            }
            try {
                // 使用marked.js实时渲染markdown
                // 如果内容为空，保持加载提示；否则替换为实际内容
                if (content && content.trim()) {
                    contentElement.innerHTML = marked.parse(content || '');
                }
                // 如果内容为空，保持现有的加载提示
            } catch (error) {
                console.error('Markdown渲染失败，使用纯文本:', error);
                if (content && content.trim()) {
                    contentElement.textContent = content;
                }
            }
        } else {
            // 用户消息保持纯文本
            if (content && content.trim()) {
                contentElement.textContent = content;
            }
        }

        // 如果元素正在流式输出，检查并滚动
        if (scrollFollowManager.streamingElements.has(contentElement)) {
            requestAnimationFrame(() => {
                scrollFollowManager.checkAndScroll(contentElement);
            });
        }
    }

    // 加载聊天记录
    async function loadChatMessages(runId) {
        try {
            const token = localStorage.getItem(TOKEN_STORAGE_KEY);
            if (!token) {
                console.error('未找到认证Token');
                return [];
            }

            const response = await fetch(`${API_BASE_URL}/v1/sop/runs/${runId}/chat-messages`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                console.warn(`获取聊天记录失败: ${response.status}`);
                return [];
            }

            const data = await response.json();

            // 解析返回数据（兼容不同的返回格式）
            let messages = [];
            if (data.code === 0 && data.data) {
                // 最新格式: { code: 0, data: { run_id, conversation_id, messages: [...] } }
                messages = Array.isArray(data.data.messages) ? data.data.messages : [];
                if (data.data.conversation_id) {
                    currentConversationId = data.data.conversation_id;
                }
                console.log(`[加载聊天记录] 使用最新格式加载，会话ID: ${currentConversationId}`);
            } else if (data.messages && Array.isArray(data.messages)) {
                // 旧格式兼容: { run_id, conversation_id, messages: [...] }
                messages = data.messages;
                if (data.conversation_id) {
                    currentConversationId = data.conversation_id;
                }
            } else if (Array.isArray(data)) {
                // 极简数组格式兼容
                messages = data;
            }

            // 按 created_at 字段排序，确保消息顺序正确（越早的在越上面，越晚的在越下面）
            messages.sort((a, b) => {
                const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return timeA - timeB;
            });

            console.log(`[加载聊天记录] 成功加载 ${messages.length} 条消息`);
            return messages;
        } catch (error) {
            console.error('加载聊天记录失败:', error);
            return [];
        }
    }

    // 从第四步加载内容到对话区域
    function loadStep4ContentToChat() {
        // 检查是否已经加载过（避免重复添加）
        const messagesContainer = document.getElementById('chatbot-messages');
        if (!messagesContainer) {
            console.error('未找到聊天消息容器');
            return;
        }

        // 检查是否已经有第四步的内容（通过检查是否有特定的标记）
        const existingStep4Message = messagesContainer.querySelector('[data-step4-content="true"]');
        if (existingStep4Message) {
            console.log('[加载第四步内容] 第四步内容已存在，跳过加载');
            return;
        }

        // 尝试从多个来源获取第四步的内容
        let step4Content = '';

        // 1. 从latestStepContent获取
        if (latestStepContent && latestStepContent.step4 && latestStepContent.step4.trim()) {
            step4Content = latestStepContent.step4;
            console.log('[加载第四步内容] 从latestStepContent获取，长度:', step4Content.length);
        }

        // 2. 如果latestStepContent中没有，尝试从DOM元素获取
        if (!step4Content || step4Content.trim() === '') {
            const generatedScriptElement = document.getElementById('generated-script');
            if (generatedScriptElement) {
                // 优先获取innerHTML（保留Markdown格式），如果没有则获取textContent
                step4Content = generatedScriptElement.innerHTML || generatedScriptElement.textContent || '';
                if (step4Content && step4Content.trim()) {
                    console.log('[加载第四步内容] 从DOM元素获取，长度:', step4Content.length);
                }
            }
        }

        // 3. 如果还是没有，尝试从API或状态数据获取（如果后端节点已完成）
        if (!step4Content || step4Content.trim() === '') {
            // 动态获取最后一个后端节点的索引
            const step4NodeIndex = nodesData.length - 1;
            if (step4NodeIndex >= 0 && step4NodeIndex < nodesData.length) {
                const step4Node = nodesData[step4NodeIndex];
                const step4NodeId = step4Node.node_id || step4Node.id || step4Node.ID || step4Node.nodeId;
                console.log(`[加载聊天上下文] 识别到最后一个后端节点: ID=${step4NodeId}, Name=${step4Node.name}`);

                if (step4NodeId) {
                    const step4NodeIdInt = parseInt(step4NodeId);
                    const strId = String(step4NodeId);

                    const isCompleted = nodeStatus.completedNodeIds.some(id =>
                        String(id) === strId || id === step4NodeIdInt
                    ) || (nodeStatus.statusData && nodeStatus.statusData.completed_nodes && nodeStatus.statusData.completed_nodes.some(n => String(n.node_id) === strId));

                    if (isCompleted) {
                        // 优先从 statusData 中获取（同步且已缓存）
                        if (nodeStatus.statusData && nodeStatus.statusData.completed_nodes) {
                            const completedNode = nodeStatus.statusData.completed_nodes.find(n => {
                                const nid = n.node_id || n.id || n.ID || n.nodeId;
                                return String(nid) === strId;
                            });

                            if (completedNode) {
                                const output = completedNode.output ||
                                    completedNode.output_preview ||
                                    completedNode.outputPreview ||
                                    completedNode.content ||
                                    completedNode.result;

                                if (output && output.trim()) {
                                    console.log('[加载第四步内容] 从statusData成功获取内容');
                                    addStep4ContentToChat(output);
                                    return;
                                }
                            }
                        }

                        // 如果statusData中没有，降级到异步API获取
                        getNodeOutput(currentRunId, step4NodeId).then(output => {
                            if (output && output.trim()) {
                                console.log('[加载第四步内容] 从API成功获取内容');
                                addStep4ContentToChat(output);
                            }
                        }).catch(error => {
                            console.warn('[加载第四步内容] 从API获取失败:', error);
                        });
                        return; // 异步获取，先返回
                    }
                }
            }
        }

        // 如果有内容，添加到对话区域
        if (step4Content && step4Content.trim()) {
            addStep4ContentToChat(step4Content);
        } else {
            console.log('[加载第四步内容] 第四步没有可加载的内容');
        }
    }

    // 将第四步内容添加到对话区域
    function addStep4ContentToChat(content) {
        if (!content || !content.trim()) {
            return;
        }



        // 使用addChatbotMessage添加AI消息，并明确传入 step-4 ID
        const messageElement = addChatbotMessage('ai', content.trim(), false, null, 'step-4');

        // 标记这是第四步的内容，避免重复添加
        if (messageElement) {
            messageElement.setAttribute('data-step4-content', 'true');

            // 强制刷新一次，确保识别到 data-step4-content
            refreshAIMessageActions();

            // 滚动到底部，让用户看到内容
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const mc = document.querySelector('.main-content');
                    if (mc) mc.scrollTop = mc.scrollHeight;
                });
            });
        }
    }

    // 记录聊天内容是否已恢复
    let isChatHistoryLoaded = false;

    // 恢复聊天记录到界面
    async function restoreChatMessages(runId) {
        if (!runId) return;

        // 如果已经加载过，且不是强制重新加载，则跳过
        // 我们通过检查容器中除了第四步内容之外是否还有其他消息来判断
        const messagesContainer = document.getElementById('chatbot-messages');

        if (!messagesContainer) {
            console.error('未找到聊天消息容器');
            return;
        }

        // [Fix] 检查是否已经有除了第四步内容以外的消息（防止重复恢复）
        const otherMessages = messagesContainer.querySelectorAll('.chatbot-message:not([data-step4-content="true"])');
        if (otherMessages.length > 0 || isChatHistoryLoaded) {
            console.log('[恢复聊天] 聊天记录已存在或已加载，跳过');
            return;
        }

        // 加载聊天记录
        const messages = await loadChatMessages(runId);

        if (!messages || messages.length === 0) {
            console.log('[恢复聊天] 没有聊天记录需要恢复');
            return;
        }

        // [Fix] 检查是否有用户消息，同步更新交互状态
        if (messages.some(m => (m.role || '').toLowerCase() === 'user')) {
            hasStep5Interaction = true;
            console.log('[恢复聊天] 检测到历史记录中有用户消息，已同步 hasStep5Interaction 状态');
        }


        console.log(`[恢复聊天] 开始恢复 ${messages.length} 条聊天记录`);



        // 按顺序恢复每条消息
        messages.forEach((message, index) => {
            // API返回的role字段: "user" 或 "assistant"
            const role = message.role || 'user';
            const content = message.content || '';
            // 转换为前端使用的类型: 'user' 或 'ai'
            const type = role === 'assistant' ? 'ai' : 'user';

            if (content.trim() || message.thinking_content || message.reasoning_content || message.thinking) {
                // 获取思考内容
                const thinkingContent = message.thinking_content || message.reasoning_content || message.thinking || null;

                // [ID Compatibility] 全面支持各种可能的 ID 字段名，优先取 id
                const msgId = message.id || message.msg_id || message.message_id || message._id || message.ID;

                // 使用现有的addChatbotMessage函数添加消息
                addChatbotMessage(type, content, false, thinkingContent, msgId);
            }
        });

        // 恢复完成后，滚动到底部
        // 使用 requestAnimationFrame 确保DOM更新完成后再滚动
        // 滚动消息列表到底部
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const chatbotMessages = document.getElementById('chatbot-messages');
                if (chatbotMessages) chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
            });
        });

        console.log(`[恢复聊天] ✅ 聊天记录恢复完成`);
        isChatHistoryLoaded = true; // 标记已加载
        refreshAIMessageActions(); // 恢复完成后统一刷新操作栏
    }

    // [Regenerate Feature] 统一更新 AI 消息的操作栏
    function refreshAIMessageActions() {
        const aiMessages = Array.from(document.querySelectorAll('.chatbot-message.ai'));
        console.log(`[Regenerate] Found ${aiMessages.length} AI messages, refreshing actions...`);

        aiMessages.forEach((msg, index) => {
            const isLatest = (index === aiMessages.length - 1);
            // 自动识别 ID
            let msgId = msg.dataset.msgId;

            const contentWrapper = msg.querySelector('.chatbot-content-wrapper');
            if (!contentWrapper) return;

            // 查找或创建操作栏
            let actionsContainer = msg.querySelector('.chatbot-message-actions');
            if (!actionsContainer) {
                actionsContainer = document.createElement('div');
                actionsContainer.className = 'chatbot-message-actions';
                contentWrapper.appendChild(actionsContainer);
            }

            // 清空并重新构建，以确保状态正确（如重新生成按钮仅最新可见）
            actionsContainer.innerHTML = '';

            // 1. 复制按钮 (所有 AI 消息都保留复制按钮)
            const copyBtn = document.createElement('button');
            copyBtn.className = 'chatbot-copy-btn';
            copyBtn.innerHTML = `
                    <i data-lucide="copy" class="chatbot-copy-icon"></i>
                    <span>复制</span>
                `;
            copyBtn.addEventListener('click', () => {
                const bubble = msg.querySelector('.chatbot-bubble-content');
                // 优先使用原始文本，其次使用 innerText (保留换行)，最后 textContent
                const textToCopy = bubble ? (bubble.dataset.rawContent || bubble.innerText || bubble.textContent) : '';

                const performCopy = (text) => {
                    const originalHTML = copyBtn.innerHTML;
                    const showSuccess = () => {
                        copyBtn.innerHTML = `
                                <i data-lucide="check" class="chatbot-copy-icon"></i>
                                <span>已复制</span>
                            `;
                        if (typeof lucide !== 'undefined') {
                            lucide.createIcons();
                        }
                        setTimeout(() => {
                            copyBtn.innerHTML = originalHTML;
                            if (typeof lucide !== 'undefined') {
                                lucide.createIcons();
                            }
                        }, 2000);
                        showToast('内容已复制到剪贴板！');
                    };

                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(text).then(showSuccess).catch(err => {
                            console.error('Clipboard API 复制失败:', err);
                            fallbackCopy(text);
                            showSuccess();
                        });
                    } else {
                        fallbackCopy(text);
                        showSuccess();
                    }
                };

                performCopy(textToCopy);
            });
            actionsContainer.appendChild(copyBtn);

            // 2. 重新生成按钮 (仅最新的一条 AI 消息显示，且排除第四步转移的内容)
            if (isLatest) {
                const isStep4 = (msg.dataset.step4Content === 'true' || msgId === 'step-4');
                console.log(`[Regenerate] Latest message - msgId: ${msgId}, isStep4: ${isStep4}`);

                if (!isStep4 && msgId && msgId !== 'null' && msgId !== 'undefined') {
                    const regenBtn = document.createElement('button');
                    regenBtn.className = 'chatbot-copy-btn chatbot-regenerate-btn chat-regenerate-btn';
                    regenBtn.dataset.msgId = msgId;

                    regenBtn.innerHTML = `
                            <i data-lucide="rotate-ccw" class="chatbot-copy-icon"></i>
                            <span>重新生成</span>
                        `;
                    actionsContainer.appendChild(regenBtn);
                }
            }
        });
        // 重新初始化 Lucide 图标以处理新生成的按钮
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }

    // 添加聊天消息到界面
    function addChatbotMessage(type, content, isStreaming = false, thinkingContent = null, msgId = null) {
        const messagesContainer = document.getElementById('chatbot-messages');
        if (!messagesContainer) {
            console.error('未找到消息容器');
            return null;
        }

        const messageElement = document.createElement('div');
        messageElement.className = `chatbot-message ${type}`;
        messageElement.dataset.streaming = isStreaming ? 'true' : 'false';
        if (msgId) {
            messageElement.dataset.msgId = msgId;
        }

        // 对于AI消息，不使用气泡，不保留头像，直接显示内容；用户消息使用气泡和头像
        if (type === 'ai') {
            // 创建内容包装器（包含内容和操作栏）
            const contentWrapper = document.createElement('div');
            contentWrapper.className = 'chatbot-content-wrapper';

            // 创建内容容器
            const bubbleContent = document.createElement('div');
            bubbleContent.className = 'chatbot-bubble-content';
            // 存储原始文本，用于后续准确复制
            if (content !== undefined && content !== null) {
                bubbleContent.dataset.rawContent = content;
            }

            // 使用Markdown渲染
            if (typeof marked !== 'undefined' && marked.parse) {
                bubbleContent.classList.add('prose');
                try {
                    bubbleContent.innerHTML = marked.parse(content || '');
                } catch (error) {
                    console.error('Markdown渲染失败，使用纯文本:', error);
                    bubbleContent.textContent = content;
                }
            } else {
                bubbleContent.textContent = content;
            }

            contentWrapper.appendChild(bubbleContent);

            // 如果有思维链内容且不是流式输出（流式输出由 handleChatStreamingResponse 处理），则显示它
            if (thinkingContent && thinkingContent.trim() && !isStreaming) {
                // 确保先显示thinking容器
                const thinkingElement = createOrUpdateThinkingElement(bubbleContent, thinkingContent);
                if (thinkingElement) {
                    // 标记为已完成
                    markThinkingFinished(bubbleContent);
                }
            }

            messageElement.appendChild(contentWrapper);
        } else {
            // 用户消息：使用气泡和头像
            const avatar = document.createElement('div');
            avatar.className = `chatbot-message-avatar ${type}`;
            avatar.textContent = '我';

            const bubble = document.createElement('div');
            bubble.className = 'chatbot-bubble';
            const bubbleContent = document.createElement('div');
            bubbleContent.className = 'chatbot-bubble-content';
            bubbleContent.textContent = content;
            bubble.appendChild(bubbleContent);

            messageElement.appendChild(avatar);
            messageElement.appendChild(bubble);
        }
        messagesContainer.appendChild(messageElement);

        // 如果是用户消息，立即滚动到底部，让用户看到自己的消息
        // 注意：第五步中，真正的滚动容器是 chatbot-messages，而不是 chatbot-container
        if (type === 'user') {
            // [Fix] 用户发送了消息，标记第五步已有交互
            hasStep5Interaction = true;
            // 同时主动移除页面上可能存在的步骤1-4的重新生成按钮
            document.querySelectorAll('.regenerate-container').forEach(el => el.remove());

            // 禁用步骤1-4的所有输入框
            const stepInputIds = ['product-input', 'script-input', 'style-input', 'theme-input'];
            stepInputIds.forEach(inputId => {
                const inputElement = document.getElementById(inputId);
                if (inputElement) {
                    inputElement.disabled = true;
                    inputElement.title = '第五步已有对话，无法修改前面步骤';
                    inputElement.style.opacity = '0.6';
                    inputElement.style.cursor = 'not-allowed';
                }
            });

            requestAnimationFrame(() => {
                const chatbotMessages = document.getElementById('chatbot-messages');
                if (chatbotMessages) chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
            });
        }


        // [Regenerate Feature] 统一刷新操作栏
        if (!isStreaming) {
            refreshAIMessageActions();
        }

        return messageElement;
    }

    // 更新发送按钮状态
    function updateChatbotSendButton() {
        const chatbotInput = document.getElementById('chatbot-input');
        const chatbotSendBtn = document.getElementById('chatbot-send-btn');
        if (chatbotInput && chatbotSendBtn) {
            const hasText = chatbotInput.value.trim().length > 0;
            // AI生成时，仅禁用发送按钮，输入框可以继续输入
            chatbotSendBtn.disabled = !hasText || isSendingMessage;
        }
    }
    // [Regenerate Feature] 处理聊天重新生成
    window.handleRegenerateChat = handleRegenerateChat;
    async function handleRegenerateChat(msgId, messageElement) {
        window.handleRegenerateChat = handleRegenerateChat; // Ensure globally available (redundant but safe)
        console.log('[Regenerate] Handling regenerate for message:', msgId);

        // 1. 找到上一条用户消息（向后遍历，防止中间有其他元素干扰）
        let previousElement = messageElement.previousElementSibling;
        while (previousElement) {
            if (previousElement.classList.contains('user')) {
                break;
            }
            previousElement = previousElement.previousElementSibling;
        }

        if (!previousElement) {
            console.error('[Regenerate] Cannot find previous user message');
            showToast('无法找到对应的提问消息');
            return;
        }

        // 获取提问内容
        let question = '';
        const bubbleContent = previousElement.querySelector('.chatbot-bubble-content') || previousElement;
        question = bubbleContent.textContent || bubbleContent.innerText;
        question = question.trim();

        if (!question) {
            showToast('提问内容为空');
            return;
        }



        try {
            // 2. 移除当前 AI 消息和上一条用户消息
            messageElement.remove();
            previousElement.remove();

            // 3. 重新发送消息 (使用 sendChatbotMessage 逻辑的变体)
            // 这里我们直接调用底层的发送逻辑，但需要模拟用户发送的效果

            // 设置状态
            isSendingMessage = true;
            const chatbotInput = document.getElementById('chatbot-input');
            const chatbotSendBtn = document.getElementById('chatbot-send-btn');
            // 仅禁用发送按钮，输入框保持可用
            if (chatbotSendBtn) chatbotSendBtn.disabled = true;

            // 添加用户消息 (UI)
            addChatbotMessage('user', question);

            // 创建 AI 消息占位符
            const aiMessageElement = addChatbotMessage('ai', '', true);
            const aiContentElement = aiMessageElement ? aiMessageElement.querySelector('.chatbot-bubble-content') : null;

            if (!aiContentElement) {
                throw new Error('UI创建失败');
            }

            // 显示加载提示
            aiContentElement.innerHTML = `
                    <div class="loading-message">
                        <div>
                            <div class="message-name">AI 正在分析中</div>
                            <div class="loading-dots">
                                <div class="loading-dot"></div>
                                <div class="loading-dot"></div>
                                <div class="loading-dot"></div>
                            </div>
                        </div>
                    </div>
                `;
            aiContentElement.classList.remove('prose');

            // 调用 API (带 regenerate_msg_id)
            await callChatAPI(question, aiContentElement, msgId);

        } catch (error) {
            console.error('[Regenerate] Failed:', error);
            showToast(`重新生成失败: ${error.message}`);
            // 恢复状态
            isSendingMessage = false;
            updateChatbotSendButton();
        }
    }

    // [Global Event Delegation] 处理重新生成按钮点击
    document.addEventListener('click', function (e) {
        // 1. 处理步骤重新生成 (Step 1-4)
        const stepBtn = e.target.closest('.step-regenerate-btn');
        if (stepBtn) {
            e.preventDefault();
            e.stopPropagation();
            const step = parseInt(stepBtn.dataset.step);
            console.log(`[Delegation] Step regenerate clicked for step ${step}`);
            if (typeof handleRegenerateStep === 'function') {
                handleRegenerateStep(step);
            } else {
                console.error('[Delegation] handleRegenerateStep function not found');
                showToast('功能未就绪，请刷新重试');
            }
            return;
        }

        // 2. 处理聊天重新生成 (Step 5)
        const chatBtn = e.target.closest('.chat-regenerate-btn');
        if (chatBtn) {
            e.preventDefault();
            e.stopPropagation();
            const msgId = chatBtn.dataset.msgId;
            const messageElement = chatBtn.closest('.chatbot-message');

            console.log(`[Delegation] Chat regenerate clicked for msg ${msgId}`);

            if (!messageElement) {
                console.error('[Delegation] Message element not found');
                return;
            }

            if (typeof handleRegenerateChat === 'function') {
                handleRegenerateChat(msgId, messageElement);
            } else {
                console.error('[Delegation] handleRegenerateChat function not found');
                showToast('功能未就绪，请刷新重试');
            }
            return;
        }
    });

    // [Drag and Drop Feature] Setup drag and drop for steps 1, 2, and 3
    function setupDragAndDrop(textareaId, fileInputId) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return;

        // Find the closest input section
        const dropZone = textarea.closest('.input-section');
        if (!dropZone) return;

        // [Fix] 防止重复绑定：如果已经初始化过，则跳过
        if (dropZone.dataset.dragDropInitialized === 'true') return;
        dropZone.dataset.dragDropInitialized = 'true';

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        dropZone.addEventListener('dragenter', highlight, false);
        dropZone.addEventListener('dragover', highlight, false);
        dropZone.addEventListener('dragleave', unhighlight, false);
        dropZone.addEventListener('drop', handleDrop, false);

        function highlight(e) {
            dropZone.classList.add('drag-over');
        }

        function unhighlight(e) {
            dropZone.classList.remove('drag-over');
        }

        function handleDrop(e) {
            unhighlight(e);
            handleFileUpload(e, textareaId);
        }
    }

    // Initialize drag and drop
    // [Fix] 移除重复的 DOMContentLoaded 监听，直接调用。
    // 因为脚本在页面底部，DOM 已经就绪；加之 setupDragAndDrop 内部已新增幂等检查，双重保险。
    setupDragAndDrop('product-input', 'product-file-input');
    setupDragAndDrop('script-input', 'script-file-input');
    setupDragAndDrop('style-input', 'style-file-input');
    setupDragAndDrop('theme-input', 'theme-file-input');



    // [Draft Mode] visibilitychange检测
    let pageHiddenTime = null;
    let draftMaybeExpired = false;

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') {
            pageHiddenTime = Date.now();
            console.log('[Draft] 页面隐藏，记录时间:', new Date(pageHiddenTime));
        } else if (document.visibilityState === 'visible') {
            if (pageHiddenTime && isDraftRun) {
                const hiddenDuration = Date.now() - pageHiddenTime;
                const hours = hiddenDuration / (1000 * 60 * 60);

                console.log('[Draft] 页面重新可见，隐藏时长:', hours.toFixed(2), '小时');

                // 如果隐藏时间超过8小时，draft可能已被后端清理任务删除
                if (hours > 8) {
                    draftMaybeExpired = true;
                    console.log('[Draft] 隐藏时间过长（>8小时），draft可能已被清理');
                }
            }
            pageHiddenTime = null;
        }
    });

    console.log('SOP Detail script loaded successfully - Event listeners attached');

    // ===== V3 Init / Cleanup =====
    window.__sopLegacyInit = async function (options) {
        options = options || {};

        // 更新 API_BASE_URL（可能在 IIFE 执行后由 store 设置）
        API_BASE_URL = window.API_BASE_URL || '/api';

        // 注入导航回调
        __sopOnNavigateHome = options.onNavigateHome || null;
        __sopOnSwitchRun = options.onSwitchRun || null;

        // 设置 URL 参数（替代 initRunId 从 URLSearchParams 读取）
        if (options.templateId) {
            currentTemplateId = options.templateId;
        }
        if (options.runId) {
            currentRunId = options.runId;
        }

        // 应用模板自定义 UI
        if (currentTemplateId) {
            applyTemplateCustomization(currentTemplateId);
        }

        // 触发原本在 DOMContentLoaded 中的初始化逻辑
        await __sopDOMContentLoadedMain();
        __sopDOMContentLoadedChat();

        // ===== 步骤条滚动折叠 =====
        (function initStepperCollapse() {
            const mainContent = document.querySelector('.main-content');
            const stepper = document.querySelector('.stepper');
            if (!mainContent || !stepper) return;

            let ticking = false;
            const SCROLL_THRESHOLD = 60; // px 后触发折叠

            function onScroll() {
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(function () {
                    const scrollTop = mainContent.scrollTop;
                    if (scrollTop > SCROLL_THRESHOLD) {
                        stepper.classList.add('stepper--collapsed');
                    } else {
                        stepper.classList.remove('stepper--collapsed');
                    }
                    ticking = false;
                });
            }

            mainContent.addEventListener('scroll', onScroll, { passive: true });

            // 存储清理引用
            window.__sopStepperCollapseCleanup = function () {
                mainContent.removeEventListener('scroll', onScroll);
            };
        })();

        // 初始化图标
        if (window.lucide) {
            window.lucide.createIcons();
        }
    };

    window.__sopLegacyCleanup = function () {
        // 移除所有 document 级事件监听器
        __sopDocListeners.forEach(function (item) {
            document.removeEventListener(item.event, item.handler);
        });
        __sopDocListeners = [];

        // 重置全局状态
        currentRunId = null;
        currentConversationId = null;
        currentTemplateId = null;
        isDraftRun = false;
        nodesData = [];
        nodeStatus = {
            completedNodeIds: [],
            completedNodesMap: {},
            nextNodeId: null,
            statusData: null
        };
        originalInputValues = {};
        isUserAtBottom = true;

        // 清除步骤条折叠监听
        if (typeof window.__sopStepperCollapseCleanup === 'function') {
            window.__sopStepperCollapseCleanup();
            window.__sopStepperCollapseCleanup = null;
        }

        // 清除 scrollFollowManager 定时器
        if (typeof scrollFollowManager !== 'undefined') {
            if (typeof scrollFollowManager.stopPeriodicCheck === 'function') {
                scrollFollowManager.stopPeriodicCheck();
            }
            if (typeof scrollFollowManager.reset === 'function') {
                scrollFollowManager.reset();
            }
        }

        // 中止进行中的 SSE 请求
        if (window.__sopSseAbortController) {
            window.__sopSseAbortController.abort();
            window.__sopSseAbortController = null;
        }

        // 重置回调
        __sopOnNavigateHome = null;
        __sopOnSwitchRun = null;
    };

    // ===== 暴露 onclick / onchange 引用的函数到 window =====
    window.handleBackToHome = handleBackToHome;
    window.openHistoryModal = openHistoryModal;
    window.closeHistoryModal = closeHistoryModal;
    window.closeHistoryModalOnOverlay = closeHistoryModalOnOverlay;
    window.closeConfirmDialog = closeConfirmDialog;
    window.closeConfirmDialogOnOverlay = closeConfirmDialogOnOverlay;
    window.setActiveStep = setActiveStep;
    window.prevStep = prevStep;
    window.handleStep1Next = handleStep1Next;
    window.handleStep2Next = handleStep2Next;
    window.handleStep3Next = handleStep3Next;
    window.handleStep4Next = handleStep4Next;
    window.handleStep4Prev = handleStep4Prev;
    window.checkProductQuality = checkProductQuality;
    window.closeQualityResult = closeQualityResult;
    window.handleFileUpload = handleFileUpload;
    window.switchSOPRun = switchSOPRun;
    window.deleteHistoryRun = deleteHistoryRun;

})();
