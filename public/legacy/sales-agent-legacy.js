/**
 * Sales Agent Logic (Revised)
 */

/* ==================== Config ==================== */
const AppState = {
    currentSessionId: null,
    sessions: [],
    messages: [],
    isLoading: false,
    isDeepThinking: true, // 深度思考模式（默认开启）
    chatMode: 'sales', // 对话模式: 'sales' (销售话术) 或 'free' (自由交流)
    salesStage: '', // 销售阶段: ''(未选择), 初次接触, 了解业务, 方案介绍, 成交推进, 售后服务
    kbSelection: {
        product: [],  // 产品文档 IDs
        cases: [],    // 成功案例 IDs
        faq: [],      // 百问百答 IDs
        opinion: [],  // 观点库 IDs（用户上传）
    },
    opinionTrackSelection: [], // 系统赛道 ID（最多2个）
    documentIds: [], // Deprecated: 仅用于兼容旧代码引用，实际逻辑使用 kbSelection
    // Restored States
    customerProfile: {},
    selectedKb: ['all'],
    sessionLoadCounter: 0, // 用于防止会话切换时的竞态条件
    // 滚动状态管理
    autoScrollEnabled: true,  // 是否启用自动滚动
    userIsScrolling: false,    // 用户是否正在滚动
    // 图片 OCR 状态 (支持多图)
    images: [] // 数组项格式: { file, previewUrl, ocrResult, status: 'pending'|'processing'|'success'|'error' }
};

// Markdown Setup
// highlight 选项已由 salesAgent.ts 通过 marked.use({ renderer }) 配置
// marked v17+ 不再支持 setOptions({ highlight })，此处仅保留基础选项
if (typeof marked !== 'undefined') {
    marked.setOptions({
        gfm: true,
        breaks: true
    });
}

/* ==================== Sales Stage Logic ==================== */
const SalesStageManager = {
    stages: [
        { id: '', label: '未设置阶段', color: '#94a3b8' }, // 空选项 - 默认
        { id: '破冰诊断', label: '破冰诊断', color: '#64748b' }, // Slate
        { id: '价值塑造', label: '价值塑造', color: '#3b82f6' }, // Blue
        { id: '异议处理', label: '异议处理', color: '#8b5cf6' }, // Violet
        { id: '关单追销', label: '关单追销', color: '#f59e0b' } // Amber
    ],

    init() {
        this.renderOptions();
        this.bindEvents();

        // Initial sync with AppState
        // Note: AppState.salesStage might be loaded from session later, so we just set default here
        // The loadSessions() -> switchSession() flow will update AppState and we might need to update UI then.
        // We'll add a updateUI() method that can be called from switchSession.
        this.updateUI();
    },

    renderOptions() {
        const dropdown = document.getElementById('stageDropdown');
        if (!dropdown) return;

        dropdown.innerHTML = this.stages.map(stage => `
            <div class="stage-option" data-id="${stage.id}" onclick="SalesStageManager.handleSelect('${stage.id}')">
                <span>${stage.label}</span>
            </div>
        `).join('');
    },

    _stageDocClickHandler: null,

    bindEvents() {
        const trigger = document.getElementById('stageTrigger');
        if (!trigger) return;

        trigger.addEventListener('click', (e) => {
            if (e.target.closest('.stage-dropdown')) return;
            trigger.classList.toggle('active');
        });

        this._stageDocClickHandler = (e) => {
            if (!trigger.contains(e.target)) {
                trigger.classList.remove('active');
            }
        };
        document.addEventListener('click', this._stageDocClickHandler);
    },

    async handleSelect(stageId) {
        this.setStage(stageId);
        document.getElementById('stageTrigger').classList.remove('active');
        
        // 如果有当前会话，保存到后端
        if (AppState.currentSessionId) {
            await this.saveStageToBackend(stageId);
        }
    },

    async saveStageToBackend(stageId) {
        try {
            await authManager.fetchWithAuth(
                `${API_BASE_URL}/v1/sales-rag/sessions/${AppState.currentSessionId}`,
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ sales_stage: stageId })
                }
            );
        } catch (e) {
            console.error('Failed to update sales stage:', e);
            showToast('保存销售阶段失败', 'error');
        }
    },

    setStage(stageId) {
        AppState.salesStage = stageId;
        if (AppState.customerProfile) {
            AppState.customerProfile.stage = stageId;
        }
        this.updateUI();

        // If we are in a session, trigger a silent update or just wait for next message?
        // For now, client-side state is sufficient as it is sent with next message.
    },

    updateUI() {
        const stageId = AppState.salesStage || '';
        const stage = this.stages.find(s => s.id === stageId) || this.stages[0];

        const txt = document.getElementById('currentStageText');

        if (txt) txt.textContent = stage.label;
        // 指示灯颜色由 CSS 统一控制，不再根据阶段动态设置

        document.querySelectorAll('.stage-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.id === stageId);
        });
    }
};

// 兼容 inline onclick="SalesStageManager.xxx(...)"
window.SalesStageManager = SalesStageManager;




/* ==================== Init ==================== */
window.__salesAgentLegacyInit = async function () {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;
    if (chatContainer.dataset.legacyBound === '1') return;
    chatContainer.dataset.legacyBound = '1';

    if (!window.authManager || !authManager.requireAuth()) return;

    setupEventListeners();
    SalesStageManager.init();

    // 全局 document click 监听：关闭会话菜单（只注册一次）
    document.addEventListener('click', closeAllSessionMenus);

    // Check URL params first to see if we have an intended session
    const urlParams = new URLSearchParams(window.location.search);
    const sid = urlParams.get('session_id');

    await loadSessions();
    initImagePreviewModal(); // 初始化图片预览模态框
    if (window.lucide) lucide.createIcons();

    if (typeof initChatStyleFeature === 'function') {
        initChatStyleFeature();
    }
    if (typeof initCitationModal === 'function') {
        initCitationModal();
    }

    const welcomeScreen = document.getElementById('welcomeScreen');

    if (sid) {
        // If ID in URL, try to switch to it
        switchSession(sid);
    } else if (AppState.sessions.length > 0) {
        // SCENARIO B: If no ID in URL but sessions exist, default to the first one
        switchSession(AppState.sessions[0].id);
    } else {
        // SCENARIO A: If no sessions at all, show welcome screen
        if (welcomeScreen) welcomeScreen.style.display = 'flex';
        // Ensure URL is clean
        updateUrl(null);
    }

    // 初始化深度思考按钮状态
    const deepThinkingBtn = document.getElementById('deepThinkingBtn');
    if (deepThinkingBtn) {
        deepThinkingBtn.classList.toggle('active', AppState.isDeepThinking);
        deepThinkingBtn.onclick = () => {
            AppState.isDeepThinking = !AppState.isDeepThinking;
            deepThinkingBtn.classList.toggle('active', AppState.isDeepThinking);
        };
    }

    // 初始化图片上传逻辑
    initImageUpload();
};

/* ==================== Session Logic ==================== */
async function loadSessions() {
    try {
        const res = await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/sessions`, { method: 'GET' });
        const data = await res.json();
        if (data.code === 0) {
            AppState.sessions = (data.data.sessions || []).map(s => ({
                id: s.ID || s.id,
                title: s.title || '新对话',
                sales_stage: s.sales_stage || '',
                updated_at: s.UpdatedAt || s.updated_at,
                is_pinned: s.is_pinned || false,
                pinned_at: s.pinned_at || null
            }));

            // 排序逻辑：置顶 > 更新时间
            AppState.sessions.sort((a, b) => {
                // 先判断置顶：已置顶的排在前面
                if (a.is_pinned !== b.is_pinned) {
                    return a.is_pinned ? -1 : 1;
                }
                // 再判断更新时间：最新的排在前面
                return new Date(b.updated_at) - new Date(a.updated_at);
            });

            renderSessions();
        }
    } catch (e) {
        console.error('Session load failed', e);
    }
}

function renderSessions() {
    const list = document.getElementById('sessionsList');
    if (!list) return;
    list.innerHTML = '';
    AppState.sessions.forEach(s => {
        const item = document.createElement('div');
        item.className = `session-item ${s.id == AppState.currentSessionId ? 'active' : ''}`;
        const isPinned = s.is_pinned || false;
        item.innerHTML = `
            ${isPinned ? '<i data-lucide="pin" class="pin-indicator"></i>' : '<i data-lucide="message-square"></i>'}
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(s.title)}</span>
            <div class="session-menu-container">
                <button class="session-menu-btn" onclick="event.stopPropagation(); toggleSessionMenu(${s.id})">
                    <i data-lucide="more-vertical"></i>
                </button>
                <div class="session-menu-dropdown" id="session-menu-${s.id}">
                    <button class="session-menu-item" onclick="event.stopPropagation(); togglePinSession(${s.id}, ${isPinned})">
                        <i data-lucide="${isPinned ? 'pin-off' : 'pin'}"></i>
                        <span>${isPinned ? '取消置顶' : '置顶'}</span>
                    </button>
                    <button class="session-menu-item" onclick="event.stopPropagation(); renameSession(${s.id}, '${escapeHtml(s.title).replace(/'/g, "\\'")}')">
                        <i data-lucide="edit-3"></i>
                        <span>重命名</span>
                    </button>
                    <button class="session-menu-item danger" onclick="event.stopPropagation(); deleteSession(${s.id})">
                        <i data-lucide="trash-2"></i>
                        <span>删除</span>
                    </button>
                </div>
            </div>
        `;
        item.onclick = () => switchSession(s.id);
        list.appendChild(item);
    });
    if (window.lucide) lucide.createIcons();

    // 点击外部关闭菜单的监听器已移至 __salesAgentLegacyInit 中统一注册，
    // 避免 renderSessions 每次调用时重复添加

    // Dynamic UI State Management for Empty State
    const inputContainer = document.getElementById('inputContainer');
    const startChatContainer = document.getElementById('startChatContainer');
    const welcomeScreen = document.getElementById('welcomeScreen');

    if (AppState.sessions.length === 0) {
        // Empty State: Hide Input, Show Start Button
        if (inputContainer) inputContainer.style.display = 'none';
        if (startChatContainer) startChatContainer.style.display = 'flex';
        if (welcomeScreen) welcomeScreen.style.display = 'flex';
    } else {
        // Active State: Show Input, Hide Start Button
        if (inputContainer) inputContainer.style.display = 'flex';
        if (startChatContainer) startChatContainer.style.display = 'none';
    }
}

async function createSession(title) {
    try {
        const res = await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/sessions`, {
            method: 'POST',
            body: JSON.stringify({
                title: title.substring(0, 50),
                sales_stage: AppState.salesStage || '',
                document_ids: AppState.documentIds || [], // Backward compatibility
                product_doc_ids: AppState.kbSelection.product || [],
                case_doc_ids: AppState.kbSelection.cases || [],
                faq_doc_ids: AppState.kbSelection.faq || [],
                opinion_doc_ids: AppState.kbSelection.opinion || [],
                opinion_track_ids: AppState.opinionTrackSelection || [],
                deep_thinking: AppState.isDeepThinking || false,
                customer_profile: JSON.stringify(AppState.customerProfile || {})
            })
        });
        const data = await res.json();
        if (data.code === 0 && data.data) {
            const id = data.data.ID || data.data.id;
            AppState.currentSessionId = id;
            document.getElementById('currentSessionTitle').textContent = title.substring(0, 50) || '新对话';
            updateUrl(id); // 新建会话后同步 URL
            await loadSessions(); // 先加载列表并排序
            return id;
        }
    } catch (e) { console.error(e); }
    return null;
}

/**
 * 更新 URL 中的 sessionId，以便刷新后能保留当前会话
 */
function updateUrl(sessionId) {
    const url = new URL(window.location);
    if (sessionId) {
        url.searchParams.set('session_id', sessionId);
    } else {
        url.searchParams.delete('session_id');
    }
    // 使用 replaceState 防止刷新时产生大量历史记录
    window.history.replaceState({ sessionId: sessionId }, '', url);
}

/**
 * 切换会话
 * @param {string|number} id 会话ID
 * @param {boolean} forceWelcome 是否强制显示欢迎语（通常用于刚创建的新会话）
 */
async function switchSession(id, forceWelcome = false) {
    // 如果没有 ID，则显示欢迎界面并清除 URL
    if (!id) {
        AppState.currentSessionId = null;
        const welcomeScreen = document.getElementById('welcomeScreen');
        const chatWrapper = document.getElementById('chatWrapper');
        if (welcomeScreen) welcomeScreen.style.display = 'flex';
        if (chatWrapper) {
            chatWrapper.innerHTML = '';
            chatWrapper.style.display = 'none';
        }
        updateUrl(null);
        document.getElementById('currentSessionTitle').textContent = '新对话';
        renderSessions();
        return;
    }

    // 更新 URL，确保刷新后能回到当前会话 (SCENARIO C)
    updateUrl(id);

    // 如果是当前会话且不强制显示欢迎语，则不重复切换
    if (AppState.currentSessionId == id && !forceWelcome) return;

    // 增加计数器,用于识别最新的请求
    AppState.sessionLoadCounter++;
    const currentLoadId = AppState.sessionLoadCounter;

    // 切换会话时重置自动滚动状态
    AppState.autoScrollEnabled = true;

    AppState.currentSessionId = id;
    renderSessions();

    const chatWrapper = document.getElementById('chatWrapper');
    const welcomeScreen = document.getElementById('welcomeScreen');

    // 立即隐藏消息(除了欢迎语)并显示加载状态
    if (chatWrapper) {
        chatWrapper.innerHTML = `
            <div class="loading-messages">
                <div class="bouncing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <div class="loading-text">加载聊天记录中</div>
            </div>
        `;
        chatWrapper.style.display = 'flex';
    }
    if (welcomeScreen) welcomeScreen.style.display = 'none';

    // Load Session Details (including customer profile and sales stage)
    try {
        const sessionRes = await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/sessions/${id}`, { method: 'GET' });

        // 检查是否还是当前会话
        if (currentLoadId !== AppState.sessionLoadCounter || AppState.currentSessionId !== id) return;

        const sessionData = await sessionRes.json();
        if (sessionData.code === 0 && sessionData.data) {
            const session = sessionData.data;
            AppState.salesStage = session.sales_stage || '';
            SalesStageManager.updateUI();
            document.getElementById('currentSessionTitle').textContent = session.title || '新对话';
            AppState.isDeepThinking = session.deep_thinking || false;
            const dtBtn = document.getElementById('deepThinkingBtn');
            if (dtBtn) dtBtn.classList.toggle('active', AppState.isDeepThinking);

            // Initialize kbSelection
            AppState.kbSelection = { product: [], cases: [], faq: [], opinion: [] };
            AppState.opinionTrackSelection = [];

            // Parse product_doc_ids
            if (session.product_doc_ids) {
                try {
                    const ids = JSON.parse(session.product_doc_ids);
                    AppState.kbSelection.product = Array.isArray(ids) ? ids.map(id => parseInt(id)) : [];
                } catch (e) { console.error('Failed to parse product_doc_ids', e); }
            }

            // Parse case_doc_ids
            if (session.case_doc_ids) {
                try {
                    const ids = JSON.parse(session.case_doc_ids);
                    AppState.kbSelection.cases = Array.isArray(ids) ? ids.map(id => parseInt(id)) : [];
                } catch (e) { console.error('Failed to parse case_doc_ids', e); }
            }

            // Parse faq_doc_ids
            if (session.faq_doc_ids) {
                try {
                    const ids = JSON.parse(session.faq_doc_ids);
                    AppState.kbSelection.faq = Array.isArray(ids) ? ids.map(id => parseInt(id)) : [];
                } catch (e) { console.error('Failed to parse faq_doc_ids', e); }
            }

            // Parse opinion_doc_ids
            if (session.opinion_doc_ids) {
                try {
                    const ids = JSON.parse(session.opinion_doc_ids);
                    AppState.kbSelection.opinion = Array.isArray(ids) ? ids.map(id => parseInt(id)) : [];
                } catch (e) { console.error('Failed to parse opinion_doc_ids', e); }
            }

            // Parse opinion_track_ids
            if (session.opinion_track_ids) {
                try {
                    const ids = JSON.parse(session.opinion_track_ids);
                    AppState.opinionTrackSelection = Array.isArray(ids) ? ids.map(id => parseInt(id)) : [];
                } catch (e) { console.error('Failed to parse opinion_track_ids', e); }
            }

            // Sync documentIds for compatibility (Union of all categories)
            AppState.documentIds = [
                ...AppState.kbSelection.product,
                ...AppState.kbSelection.cases,
                ...AppState.kbSelection.faq,
                ...AppState.kbSelection.opinion
            ];

            // Fallback: if new fields are empty but old document_ids exists (e.g. old sessions)
            if (AppState.documentIds.length === 0 && session.document_ids) {
                try {
                    const parsedIds = JSON.parse(session.document_ids);
                    // Treat all old docs as 'product' or just leave them uncategorized?
                    // Let's put them in 'product' as default migration strategy
                    AppState.kbSelection.product = Array.isArray(parsedIds) ? parsedIds.map(id => parseInt(id)) : [];
                    AppState.documentIds = AppState.kbSelection.product;
                } catch (e) {
                    console.error('[switchSession] Failed to parse backward compat document_ids:', e);
                }
            }

            // Parse customer_profile (现在是 Markdown 字符串)
            if (session.customer_profile) {
                // customer_profile 是 Markdown 字符串，存储到 notes 字段
                AppState.customerProfile = {
                    name: '',
                    stage: session.sales_stage || '',
                    notes: session.customer_profile
                };
            } else {
                AppState.customerProfile = {
                    name: '',
                    stage: session.sales_stage || '',
                    notes: ''
                };
            }
            updateProfileForm();
        }
        renderSelectedDocuments();
    } catch (e) {
        console.error('Failed to load session details', e);
    }

    if (forceWelcome) {
        if (welcomeScreen) welcomeScreen.style.display = 'flex';
        if (chatWrapper) {
            chatWrapper.innerHTML = '';
            chatWrapper.style.display = 'none';
        }
        return;
    }

    // Load Messages
    try {
        console.debug('Fetching messages for session:', id);
        const res = await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/sessions/${id}/messages`, { method: 'GET' });

        // 再次检查是否还是当前会话(防止消息错位)
        if (currentLoadId !== AppState.sessionLoadCounter || AppState.currentSessionId !== id) {
            console.debug('Session switched, aborting message render');
            return;
        }

        const data = await res.json();
        console.debug('Messages response:', data);

        // 清空加载状态
        if (chatWrapper) chatWrapper.innerHTML = '';

        if (data.code === 0) {
            const msgs = data.data.messages || []; // Handle null/undefined
            // 只要消息列表超过0条，就隐藏介绍语
            if (msgs.length > 0) {
                if (welcomeScreen) welcomeScreen.style.display = 'none';
                if (chatWrapper) chatWrapper.style.display = 'flex';
                msgs.forEach(m => {
                    // 解析引用数据（verdict 字段中的 evidence）
                    let citations = null;
                    if (m.verdict && m.role === 'assistant') {
                        try {
                            const verdictData = typeof m.verdict === 'string' ? JSON.parse(m.verdict) : m.verdict;
                            if (verdictData.evidence && Array.isArray(verdictData.evidence) && verdictData.evidence.length > 0) {
                                citations = verdictData.evidence.map(chunk => ({
                                    document_name: chunk.document_name || chunk.DocumentName || '未知文档',
                                    content: chunk.content || chunk.Content || '',
                                    score: chunk.score || chunk.Score || 0
                                }));
                            }
                        } catch (e) {
                        }
                    }

                    // 解析图片列表
                    let images = [];
                    if (m.images) {
                        try {
                            images = typeof m.images === 'string' ? JSON.parse(m.images) : m.images;
                        } catch (e) {
                            console.warn('[loadMessages] Failed to parse images:', e);
                        }
                    }

                    appendMessage(m.role, m.content, false, citations, images);
                });
                scrollToBottom();
            } else {
                console.debug('No messages in session, showing welcome screen');
                if (welcomeScreen) welcomeScreen.style.display = 'flex';
                if (chatWrapper) {
                    chatWrapper.innerHTML = '';
                    chatWrapper.style.display = 'none'; // 没有消息时隐藏包装器，只留介绍语
                }
            }
        } else {
            console.error('Error loading messages:', data.message);
        }
    } catch (e) {
        console.error('Failed to load messages', e);
        // 显示错误提示(仅当仍是当前会话时)
        if (chatWrapper && currentLoadId === AppState.sessionLoadCounter) {
            chatWrapper.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;color:var(--text-muted);">
                    <div style="font-size:14px;color:#ef4444;">加载失败,请重试</div>
                </div>
            `;
        }
    }
}

// ==================== Delete Logic ====================
let sessionIdToDelete = null;

async function deleteSession(id) {
    closeAllSessionMenus();
    sessionIdToDelete = id;
    toggleDeleteModal(true);
}

function toggleDeleteModal(show) {
    const modal = document.getElementById('deleteSessionModal');
    if (show) {
        modal.classList.add('open');
    } else {
        modal.classList.remove('open');
        sessionIdToDelete = null;
    }
}

async function confirmDeleteSession() {
    if (!sessionIdToDelete) return;
    const id = sessionIdToDelete;

    try {
        await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/sessions/${id}`, { method: 'DELETE' });

        const wasCurrent = (id == AppState.currentSessionId);

        await loadSessions();

        if (wasCurrent) {
            if (AppState.sessions.length > 0) {
                // 如果删除的是当前会话，且还有其他会话，切换到第一个
                await switchSession(AppState.sessions[0].id);
            } else {
                // 如果没有其他会话了，清空状态并显示欢迎页
                AppState.currentSessionId = null;
                resetProfileForm();
                await switchSession(null);
            }
        }

        // 显示删除成功提示
        showNotification('删除成功', 'success');
    } catch (e) {
        console.error('Delete session failed', e);
        showNotification('删除失败，请重试', 'error');
    }
    toggleDeleteModal(false);
}

// 切换会话菜单显示/隐藏
function toggleSessionMenu(sessionId) {
    // 关闭其他所有菜单
    document.querySelectorAll('.session-menu-dropdown').forEach(menu => {
        if (menu.id !== `session-menu-${sessionId}`) {
            menu.classList.remove('show');
        }
    });

    // 切换当前菜单
    const menu = document.getElementById(`session-menu-${sessionId}`);
    if (menu) {
        menu.classList.toggle('show');
    }
}

// 关闭所有会话菜单
function closeAllSessionMenus() {
    document.querySelectorAll('.session-menu-dropdown').forEach(menu => {
        menu.classList.remove('show');
    });
}

// 置顶/取消置顶会话
async function togglePinSession(sessionId, isPinned) {
    closeAllSessionMenus();
    try {
        const method = isPinned ? 'DELETE' : 'PUT';
        await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/sessions/${sessionId}/pin`, { method });
        await loadSessions();
    } catch (e) {
        console.error('Failed to toggle pin session', e);
        alert('操作失败，请重试');
    }
}

// ==================== Rename Logic ====================
let sessionIdToRename = null;

async function renameSession(sessionId, currentTitle) {
    closeAllSessionMenus();
    sessionIdToRename = sessionId;
    const input = document.getElementById('renameSessionInput');
    if (input) {
        input.value = currentTitle;
        toggleRenameModal(true);
        setTimeout(() => input.focus(), 50);
    }
}

function toggleRenameModal(show) {
    const modal = document.getElementById('renameSessionModal');
    if (show) {
        modal.classList.add('open');
    } else {
        modal.classList.remove('open');
        sessionIdToRename = null;
    }
}

async function confirmRenameSession() {
    if (!sessionIdToRename) return;
    const input = document.getElementById('renameSessionInput');
    const newTitle = input.value.trim();

    if (!newTitle) return;

    try {
        await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/sessions/${sessionIdToRename}/rename`, {
            method: 'PUT',
            body: JSON.stringify({ title: newTitle })
        });
        await loadSessions();
        if (AppState.currentSessionId == sessionIdToRename) {
            const titleEl = document.getElementById('currentSessionTitle');
            if (titleEl) titleEl.textContent = newTitle;
        }
    } catch (e) {
        console.error('Failed to rename session', e);
        alert('重命名失败，请重试');
    }
    toggleRenameModal(false);
}

/* ==================== Chat Logic ==================== */
/**
 * 使用建议问题填充输入框并发送
 */
function useSuggestion(button) {
    const suggestionText = button.querySelector('.suggestion-text').textContent;
    const input = document.getElementById('chatInput');

    // 填充输入框
    input.value = suggestionText;
    input.focus();

    // 自动调整输入框高度
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';

    // 自动发送消息
    setTimeout(() => {
        sendMessage();
    }, 200);
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const originalText = input.value.trim();
    const sentImages = [...AppState.images];

    if (!originalText && sentImages.length === 0) return;

    let text = originalText;
    // 如果有 OCR 结果，将其拼接到提问中
    const ocrTexts = sentImages
        .filter(img => img.ocrResult)
        .map(img => img.ocrResult);

    if (ocrTexts.length > 0) {
        text = `[图片内容]:\n${ocrTexts.join('\n---\n')}\n\n${originalText}`;
    }

    input.value = '';
    input.style.height = 'auto';
    clearAllImages(); // 发送时立即清除预览图片
    const welcomeScreen = document.getElementById('welcomeScreen');
    if (welcomeScreen) welcomeScreen.style.display = 'none';

    const chatWrapper = document.getElementById('chatWrapper');
    if (chatWrapper) chatWrapper.style.display = 'flex';

    if (!AppState.currentSessionId) {
        const newId = await createSession(text);
        if (!newId) return;
    }

    appendMessage('user', originalText, false, null, sentImages);
    scrollToBottom();
    setLoading(true);

    // 先显示独立的加载状态（不在气泡内）
    showGlobalLoadingStatus('正在准备...');

    // 延迟创建 AI 消息气泡，只有在收到实际内容时才创建
    let aiMessageEl = null;
    let aiBubble = null;
    let bubbleCreated = false;
    let fullContent = '';
    let thinkingContent = ''; // 累积思维链
    let citationsData = []; // 存储知识库引用数据
    let pendingTokenRender = false;   // token 渲染 rAF 标志
    let pendingThinkingRender = false; // thinking 渲染 rAF 标志
    let streamFinished = false;        // 流结束守卫，防止 rAF 回调覆盖最终 HTML

    // 创建气泡的辅助函数
    function ensureBubbleCreated() {
        if (!bubbleCreated) {
            clearGlobalLoadingStatus(); // 清除独立的加载状态
            const result = appendMessageBubble('assistant');
            aiMessageEl = result.messageEl;
            aiBubble = result.bubbleEl;
            bubbleCreated = true;
        }
        return { aiMessageEl, aiBubble };
    }

    try {
        const payload = {
            query: text,
            images: sentImages.map(img => img.previewUrl).filter(url => url && url.startsWith('http')), // 只发送合法的持久化 URL
            sales_stage: AppState.salesStage || '',
            document_ids: AppState.documentIds || [],
            deep_thinking: AppState.isDeepThinking, // 发送深度思考参数
            chat_mode: AppState.chatMode // 'sales' (销售话术) 或 'free' (自由讨论)
        };

        // 获取 token
        const token = authManager.getToken();
        if (!token) {
            clearGlobalLoadingStatus();
            showToast('未登录，请重新登录', 'error');
            setLoading(false);
            return;
        }

        // 使用 fetch 发起 SSE 请求（基于会话的API）
        // AbortController 用于路由切换时取消进行中的 SSE 流
        if (window.__sseAbortController) {
            window.__sseAbortController.abort();
        }
        window.__sseAbortController = new AbortController();
        const response = await fetch(`${API_BASE_URL}/v1/sales-rag/sessions/${AppState.currentSessionId}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload),
            signal: window.__sseAbortController.signal
        });

        if (!response.ok) {
            aiBubble.innerHTML = `❌ 请求失败: ${response.status}`;
            setLoading(false);
            loadSessions();
            return;
        }

        // 使用 ReadableStream 读取 SSE 数据
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // 解析 SSE 事件（格式: "data: {json}\n\n"）
            const chunks = buffer.split('\n\n');
            buffer = chunks.pop() || ''; // 保留未完成的块

            for (const chunk of chunks) {
                const line = chunk.split('\n').find(l => l.startsWith('data: '));
                if (!line) continue;

                const jsonStr = line.slice(6).trim();
                if (!jsonStr) continue;

                try {
                    const event = JSON.parse(jsonStr);

                    switch (event.type) {
                        case 'status':
                            // 显示当前处理阶段（独立的加载状态，不在气泡内）
                            console.debug('[SSE] Status:', event.data);
                            showGlobalLoadingStatus(event.data);
                            scrollToBottom();
                            break;

                        case 'verdict':
                            console.debug('[SSE] Verdict:', event.data);
                            // 从 verdict 中提取知识库引用数据（evidence字段）
                            if (event.data && event.data.evidence && Array.isArray(event.data.evidence)) {
                                citationsData = event.data.evidence.map(chunk => ({
                                    document_name: chunk.document_name || chunk.DocumentName || '未知文档',
                                    content: chunk.content || chunk.Content || '',
                                    score: chunk.score || chunk.Score || 0
                                }));
                                console.debug('[SSE] Citations extracted from verdict:', citationsData);
                            }
                            break;

                        case 'thinking':
                            // 处理思维链 - 此时创建气泡
                            ensureBubbleCreated();
                            thinkingContent += event.data;
                            if (!pendingThinkingRender) {
                                pendingThinkingRender = true;
                                requestAnimationFrame(() => {
                                    if (!streamFinished) {
                                        createOrUpdateThinkingElement(aiBubble, thinkingContent);
                                        scrollToBottom();
                                    }
                                    pendingThinkingRender = false;
                                });
                            }
                            break;

                        case 'token':
                            // 处理正文内容 - 此时创建气泡
                            ensureBubbleCreated();
                            // 在收到第一个 token 时，如果正在思考，标记思维链完成并收起
                            markThinkingFinished(aiBubble);

                            fullContent += event.data;
                            // rAF 批量渲染：合并同一帧内的多个 token，只执行一次 parse + DOM 更新
                            if (!pendingTokenRender) {
                                pendingTokenRender = true;
                                requestAnimationFrame(() => {
                                    if (!streamFinished) {
                                        aiBubble.innerHTML = marked.parse(fullContent);
                                        scrollToBottom();
                                    }
                                    pendingTokenRender = false;
                                });
                            }
                            break;

                        case 'error':
                            console.error('[SSE] Error:', event.data);
                            streamFinished = true;
                            ensureBubbleCreated();
                            fullContent += `\n\n❌ 错误: ${event.data}`;
                            aiBubble.innerHTML = marked.parse(fullContent);
                            break;

                        case 'citations':
                            // 处理知识库引用数据
                            if (event.data && Array.isArray(event.data)) {
                                citationsData = event.data;
                                console.debug('[SSE] Citations received:', citationsData);
                            }
                            break;

                        case 'done':
                            streamFinished = true;
                            if (bubbleCreated) {
                                markThinkingFinished(aiBubble);
                                aiBubble.innerHTML = marked.parse(fullContent);
                            }
                            break;
                    }
                } catch (parseErr) {
                    console.warn('[SSE] Parse error:', parseErr, jsonStr);
                }
            }
        }

        // 终结处理
        streamFinished = true; // 防止残留 rAF 回调覆盖最终 HTML
        clearGlobalLoadingStatus(); // 确保清除全局加载状态

        if (bubbleCreated && aiBubble) {
            markThinkingFinished(aiBubble);
            if (fullContent) {
                aiBubble.innerHTML = marked.parse(fullContent) + `
                    <div class="ai-actions-container">
                         <button class="ai-action-btn" onclick="handleCopyMessage(this)" title="复制"><i data-lucide="copy" width="14"></i> 复制</button>
                         <button class="ai-action-btn" onclick="handleRegenerate()" title="重新生成">重新生成</button>
                    </div>
                `;

                // 如果有引用数据，添加引用按钮
                if (citationsData && citationsData.length > 0 && aiMessageEl) {
                    addCitationButtonToMessage(aiMessageEl, citationsData);
                }

                if (window.lucide) lucide.createIcons();
            } else if (!thinkingContent) {
                aiBubble.innerHTML = '暂无回复';
            }
        } else if (!bubbleCreated) {
            // 如果从未创建气泡（比如请求失败），显示错误提示
            ensureBubbleCreated();
            aiBubble.innerHTML = '暂无回复';
        }

    } catch (e) {
        console.error('[SSE] Network error:', e);
        clearGlobalLoadingStatus();
        ensureBubbleCreated();
        if (aiBubble) {
            aiBubble.innerHTML = '网络错误，请重试。';
        }
    } finally {
        setLoading(false);
        clearGlobalLoadingStatus(); // 确保清除
        clearAllImages(); // 发送成功后清除所有图片
        loadSessions(); // Update summary
    }
}

/**
 * 初始化图片上传相关事件
 */
function initImageUpload() {
    const uploadBtn = document.getElementById('imageUploadBtn');
    const fileInput = document.getElementById('imageInput');

    if (uploadBtn && fileInput) {
        uploadBtn.onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
            const files = Array.from(e.target.files);
            files.forEach(file => handleImageSelect(file));
            fileInput.value = ''; // 重置以允许重复选择同一张图
        };
    }

    // 绑定粘贴事件到输入框 (支持直接粘贴图片)
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('paste', (e) => {
            const items = (e.clipboardData || e.originalEvent.clipboardData).items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) handleImageSelect(file);
                }
            }
        });
    }
}

/**
 * 处理图片选择
 */
async function handleImageSelect(file) {
    if (!file) return;

    // 1. 验证文件类型
    if (!file.type.startsWith('image/')) {
        showNotification('请选择图片文件', 'error');
        return;
    }

    // 2. 创建图片对象并加入状态
    const imageObj = {
        file: file,
        previewUrl: URL.createObjectURL(file),
        ocrResult: '',
        status: 'processing'
    };
    AppState.images.push(imageObj);

    // 3. 渲染预览
    renderImagePreviews();

    // 4. 更新发送按钮状态
    updateSendButtonState();

    // 5. 调用后端进行 OCR
    await startOCR(imageObj);
}

/**
 * 渲染图片预览区域
 */
function renderImagePreviews() {
    const container = document.getElementById('imagePreviewContainer');
    const chatContainer = document.querySelector('.chat-messages');

    if (!container) return;

    // Check if user is near bottom (allow 50px threshold)
    const isAtBottom = chatContainer ?
        (chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 50) : false;

    if (AppState.images.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = AppState.images.map((img, index) => `
        <div class="preview-item">
            <img src="${img.previewUrl}" alt="预览图" onclick="openImageModal('${img.previewUrl}')" style="cursor: zoom-in;">
            <button class="remove-image-btn" onclick="removeImage(${index})" title="移除图片">
                <i data-lucide="x"></i>
            </button>
            <div class="ocr-status" style="display: ${img.status === 'success' ? 'none' : 'flex'}">
                ${img.status === 'processing'
            ? '<i data-lucide="loader-2" class="spin"></i><span>识别中</span>'
            : '<i data-lucide="alert-circle" style="color:#f87171;"></i><span>重试</span>'}
            </div>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();

    // If user was at bottom, scroll to new bottom to avoid blocking view
    if (isAtBottom && chatContainer) {
        requestAnimationFrame(() => {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        });
    }
}

/**
 * 调用后端 OCR 接口
 */
async function startOCR(imageObj) {
    const formData = new FormData();
    formData.append('file', imageObj.file);
    if (AppState.currentSessionId) {
        formData.append('session_id', AppState.currentSessionId);
    }

    try {
        const res = await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/ocr`, {
            method: 'POST',
            body: formData
        });

        const data = await res.json();
        if (data.code === 0 && data.data) {
            imageObj.ocrResult = data.data.text;
            // 使用后端返回的持久化 COS URL 替换本地 Blob URL
            if (data.data.url) {
                imageObj.previewUrl = data.data.url;
            }
            imageObj.status = 'success';
        } else {
            throw new Error(data.message || '识别失败');
        }
    } catch (err) {
        console.error('OCR Failed:', err);
        imageObj.status = 'error';
    }

    // 更新 UI 状态（收起加载图标）
    renderImagePreviews();
}

/**
 * 移除单张图片
 */
function removeImage(index) {
    const [removed] = AppState.images.splice(index, 1);
    if (removed && removed.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
    }
    renderImagePreviews();
    updateSendButtonState();
}

/**
 * 清除所有图片
 */
function clearAllImages() {
    AppState.images.forEach(img => {
        if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
    });
    AppState.images = [];
    renderImagePreviews();
    updateSendButtonState();
}

// --- Citation (知识库引用) Logic ---

// 当前消息的引用数据存储
let currentMessageCitations = [];

/**
 * 切换知识库引用弹窗
 */
window.toggleCitationModal = function (show, citations = null) {
    const modal = document.getElementById('citationModal');
    if (!modal) return;

    if (show) {
        modal.classList.add('open');
        if (citations) {
            renderCitations(citations);
        }
        // 滚动到顶部
        const listContainer = document.getElementById('citationList');
        if (listContainer) {
            listContainer.scrollTop = 0;
        }
    } else {
        modal.classList.remove('open');
    }
}

/**
 * 渲染引用列表到弹窗
 */
function renderCitations(citations) {
    const listContainer = document.getElementById('citationList');
    const countEl = document.getElementById('citationCount');

    if (!listContainer) return;

    // 更新计数
    if (countEl) {
        countEl.textContent = citations.length;
    }

    if (!citations || citations.length === 0) {
        listContainer.innerHTML = `
            <div class="citation-empty">
                <i data-lucide="book-open"></i>
                <div class="citation-empty-text">暂无知识库引用</div>
                <div class="citation-empty-hint">本次回答未引用知识库内容</div>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    listContainer.innerHTML = citations.map((citation, index) => {
        const docName = citation.document_name || citation.docName || '未知文档';
        const content = citation.content || citation.chunk || citation.text || '';
        const score = citation.score || citation.similarity || 0;
        const scorePercent = Math.round((score * 100));

        return `
            <div class="citation-item" style="animation-delay: ${index * 0.05}s">
                <div class="citation-header">
                    <div class="citation-doc-info">
                        <span class="citation-doc-name" title="${escapeHtml(docName)}">
                            <span class="citation-number">${index + 1}</span>
                            ${escapeHtml(docName)}
                        </span>
                    </div>
                    <div class="citation-score" title="相关度: ${scorePercent}%">
                        <span>${scorePercent}%</span>
                    </div>
                </div>
                <div class="citation-content">${escapeHtml(content)}</div>
            </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

/**
 * 为AI消息添加引用按钮
 */
function addCitationButtonToMessage(messageEl, citations) {
    if (!citations || citations.length === 0) return;

    const bubble = messageEl.querySelector('.msg-bubble');
    if (!bubble) return;

    // 创建引用按钮
    const citationBtn = document.createElement('button');
    citationBtn.className = 'citation-btn';
    citationBtn.innerHTML = `
        <i data-lucide="book-open" width="14"></i>
        <span>${citations.length} 个引用</span>
    `;
    citationBtn.onclick = () => toggleCitationModal(true, citations);

    // 插入到复制/重新生成按钮之前
    const actionsContainer = bubble.querySelector('.ai-actions-container');
    if (actionsContainer) {
        actionsContainer.insertBefore(citationBtn, actionsContainer.firstChild);
    } else {
        // 如果没有操作按钮容器，创建一个新的
        const newActionsContainer = document.createElement('div');
        newActionsContainer.className = 'ai-actions-container';
        newActionsContainer.appendChild(citationBtn);
        bubble.appendChild(newActionsContainer);
    }

    if (window.lucide) lucide.createIcons();
}

// --- Thinking Process UI Helpers ---

function createOrUpdateThinkingElement(parentBubble, content) {
    let container = parentBubble.parentElement.querySelector('.thinking-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'thinking-container';
        container.innerHTML = `
            <div class="thinking-header">
                <div class="thinking-title">
                    <i data-lucide="chevron-down" class="thinking-icon"></i>
                    <span>思考中...</span>
                </div>
            </div>
            <div class="thinking-content"></div>
        `;
        // 插入到 bubble 之前
        parentBubble.parentElement.insertBefore(container, parentBubble);

        // 绑定折叠事件
        container.querySelector('.thinking-header').onclick = () => {
            container.classList.toggle('collapsed');
        };

        if (window.lucide) lucide.createIcons({ props: { class: 'thinking-icon' } });
    }

    const contentDiv = container.querySelector('.thinking-content');
    contentDiv.textContent = content;
    return container;
}

function markThinkingFinished(parentBubble) {
    const container = parentBubble.parentElement.querySelector('.thinking-container');
    if (container && !container.classList.contains('finished')) {
        container.classList.add('finished');
        // 默认自动折叠已完成的思考
        container.classList.add('collapsed');
        const titleSpan = container.querySelector('.thinking-title span');
        if (titleSpan) titleSpan.textContent = '已完成思考';
    }
}

/**
 * 在 AI 气泡中显示加载状态
 * @param {HTMLElement} bubble - 气泡元素
 * @param {string} statusText - 状态文字（如"正在分析您的问题..."）
 */
function showLoadingStatus(bubble, statusText) {
    // 检查是否已有加载状态容器
    let statusContainer = bubble.querySelector('.loading-status-container');

    if (!statusContainer) {
        // 创建加载状态容器
        statusContainer = document.createElement('div');
        statusContainer.className = 'loading-status-container';
        statusContainer.innerHTML = `
            <div class="loading-status-animation">
                <div class="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
            <div class="loading-status-text"></div>
        `;
        bubble.appendChild(statusContainer);
    }

    // 更新状态文字
    const textEl = statusContainer.querySelector('.loading-status-text');
    if (textEl) {
        textEl.textContent = statusText;
    }
}

/**
 * 清除 AI 气泡中的加载状态
 * @param {HTMLElement} bubble - 气泡元素
 */
function clearLoadingStatus(bubble) {
    const statusContainer = bubble.querySelector('.loading-status-container');
    if (statusContainer) {
        statusContainer.remove();
    }
}

/**
 * 显示独立的全局加载状态（不在气泡内）
 * @param {string} statusText - 状态文字
 */
function showGlobalLoadingStatus(statusText) {
    const wrapper = document.getElementById('chatWrapper');
    if (!wrapper) return;

    // 检查是否已存在
    let statusContainer = wrapper.querySelector('.global-loading-status');

    if (!statusContainer) {
        statusContainer = document.createElement('div');
        statusContainer.className = 'global-loading-status';
        statusContainer.innerHTML = `
            <div class="loading-status-animation">
                <div class="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
            <div class="loading-status-text"></div>
        `;
        wrapper.appendChild(statusContainer);
    }

    // 更新状态文字
    const textEl = statusContainer.querySelector('.loading-status-text');
    if (textEl) {
        textEl.textContent = statusText;
    }
}

/**
 * 清除全局加载状态
 */
function clearGlobalLoadingStatus() {
    const wrapper = document.getElementById('chatWrapper');
    if (!wrapper) return;

    const statusContainer = wrapper.querySelector('.global-loading-status');
    if (statusContainer) {
        statusContainer.remove();
    }
}

// 创建消息气泡并返回气泡元素（用于流式填充）
function appendMessageBubble(role) {
    const wrapper = document.getElementById('chatWrapper');
    const div = document.createElement('div');
    div.className = `message ${role === 'assistant' ? 'ai' : 'user'}`;

    // AI 消息显示销售阶段（如果不为空）
    const stageHtml = role === 'assistant' && AppState.salesStage 
        ? `<div class="message-stage">当前阶段：${AppState.salesStage}</div>` 
        : '';

    div.innerHTML = `
        <div class="message-content">
            ${stageHtml}
            <div class="msg-bubble markdown-body">
                <div class="message-text"></div>
            </div>
        </div>
    `;
    wrapper.appendChild(div);
    if (window.lucide) lucide.createIcons();

    // 返回消息元素和内容元素，以便后续操作
    return {
        messageEl: div,
        bubbleEl: div.querySelector('.message-text')
    };
}

function appendMessage(role, content, animate = false, citations = null, images = []) {
    const wrapper = document.getElementById('chatWrapper');
    const div = document.createElement('div');
    div.className = `message ${role === 'assistant' ? 'ai' : 'user'}`;

    // 处理图片 HTML
    let imageHtml = '';
    if (images && images.length > 0) {
        imageHtml = `
            <div class="message-img-grid">
                ${images.map(img => {
            const url = typeof img === 'string' ? img : img.previewUrl;
            return `<img src="${url}" class="message-img-item" onclick="openImageModal('${url}')">`;
        }).join('')}
            </div>
        `;
    }

    // 为历史消息处理：如果是用户发送的且包含 OCR，则在展示时隐藏 OCR 原始文本
    let displayContent = content;
    if (role === 'user' && content.startsWith('[图片内容]:')) {
        const parts = content.split('\n\n');
        if (parts.length > 1) {
            displayContent = content.substring(content.indexOf('\n\n') + 2);
        } else {
            // 如果只有 OCR 内容而没有后续文字，展示一个占位符或保持原样
            // 在没有图片持久化的情况下，这里可能会显示为空
            displayContent = '';
        }
    }

    // 检查是否只有图片没有文字
    const isImgOnly = (images.length > 0 && !displayContent.trim());
    const bubbleClass = isImgOnly ? 'msg-bubble markdown-body img-only' : 'msg-bubble markdown-body';

    // AI 消息显示销售阶段（如果不为空）
    const stageHtml = role === 'assistant' && AppState.salesStage
        ? `<div class="message-stage">当前阶段：${AppState.salesStage}</div>`
        : '';

    div.innerHTML = `
        <div class="message-content">
            ${stageHtml}
            ${role === 'user' ? `<button class="user-copy-btn" onclick="handleCopyMessage(this)" title="复制"><i data-lucide="copy"></i></button>` : ''}
            <div class="${bubbleClass}">
                ${imageHtml}
                <div class="message-text">${role === 'user' ? escapeHtml(displayContent) : ''}</div>
            </div>
        </div>
    `;
    wrapper.appendChild(div);
    if (window.lucide) lucide.createIcons();

    if (role === 'user') return; // 用户消息已设置成功

    const textEl = div.querySelector('.message-text');
    if (animate) return typeTextEffect(textEl, displayContent);
    else {
        let finalHtml = marked.parse(displayContent);
        if (role === 'assistant') {
            finalHtml += `
                <div class="ai-actions-container">
                    <button class="ai-action-btn" onclick="handleCopyMessage(this)" title="复制"><i data-lucide="copy" width="14"></i> 复制</button>
                    <button class="ai-action-btn" onclick="handleRegenerate()" title="重新生成">重新生成</button>
                </div>
            `;
        }
        textEl.innerHTML = finalHtml;
        if (window.lucide) lucide.createIcons();

        // 如果有引用数据，添加引用按钮
        if (citations && citations.length > 0) {
            addCitationButtonToMessage(div, citations);
        }
    }
}

function typeTextEffect(el, text) {
    return new Promise(resolve => {
        let i = 0;
        const speed = Math.max(5, Math.min(15, 2000 / text.length));
        const interval = setInterval(() => {
            i += Math.floor(Math.random() * 3) + 1;
            if (i >= text.length) {
                i = text.length;
                clearInterval(interval);
            }
            el.innerHTML = marked.parse(text.substring(0, i));
            scrollToBottom();
            if (i >= text.length) resolve();
        }, speed);
    });
}

/* ==================== Smart Auto-Scroll Logic ==================== */

/**
 * 检测容器是否已滚动到底部
 * @param {HTMLElement} container - 聊天容器
 * @param {number} threshold - 容差阈值（像素），默认150px
 * @returns {boolean}
 */
function isAtBottom(container, threshold = 150) {
    if (!container) return false;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    return scrollHeight - scrollTop - clientHeight <= threshold;
}

/**
 * 智能滚动到底部
 * 只有在自动滚动启用时才执行
 * 考虑知识库引用区域的高度，确保最后一条消息完全可见
 */
function smartScrollToBottom() {
    if (!AppState.autoScrollEnabled) {
        console.debug('[AutoScroll] 跳过自动滚动（用户正在查看历史消息）');
        return;
    }

    const container = document.getElementById('chatContainer');
    if (!container) return;

    // 动态调整 chat-container 的底部 padding
    updateChatContainerPadding();

    // 滚动到底部
    container.scrollTop = container.scrollHeight;
}

/**
 * 动态更新 chat-container 的底部 padding
 * 以前的逻辑是为了防止 input-stage (如果绝对定位) 遮挡消息
 * 现在布局已改为 flex column，input-stage 位于下方，不再需要巨大的 padding
 * 只需保持 CSS 中定义的 padding 即可
 */
function updateChatContainerPadding() {
    const container = document.getElementById('chatContainer');
    if (!container) return;

    // 设置一个适中的固定底部间距
    // 不需要根据 Input 高度计算，因为 Input 在 Flex 布局中不覆盖聊天区域
    // 40px 提供了足够的呼吸感，又不会产生过大的空白
    container.style.paddingBottom = '40px';
}

/**
 * 处理用户滚动行为
 * 检测用户是否主动向上滚动，动态启用/禁用自动跟随
 * 优化：立即响应向上滚动，提升打断体验
 */
function handleUserScroll() {
    const container = document.getElementById('chatContainer');
    if (!container) return;

    const currentScrollTop = container.scrollTop;

    // 检测滚动方向：如果用户向上滚动，立即禁用自动跟随 (增加 10px 容差防止抖动)
    if (window.lastScrollTop !== undefined && currentScrollTop < window.lastScrollTop - 10) {
        // 向上滚动：立即禁用自动跟随（无需等待防抖）
        if (AppState.autoScrollEnabled) {
            AppState.autoScrollEnabled = false;
            console.debug('[AutoScroll] 检测到向上滚动，立即暂停自动跟随');
            // 立即更新按钮状态，不等待防抖
            updateScrollToBottomButton();
        }
    }

    // 更新上次滚动位置
    window.lastScrollTop = currentScrollTop;

    AppState.userIsScrolling = true;

    if (window.scrollDebounceTimer) {
        clearTimeout(window.scrollDebounceTimer);
    }

    // 防抖：30ms 后检测位置（减少延迟，提升响应速度）
    window.scrollDebounceTimer = setTimeout(() => {
        AppState.userIsScrolling = false;

        // 容差阈值提升到 150px，让用户更容易回到底部并恢复自动跟随
        if (isAtBottom(container, 150)) {
            if (!AppState.autoScrollEnabled) {
                AppState.autoScrollEnabled = true;
                console.debug('[AutoScroll] 用户回到底部，恢复自动跟随');
            }
        } else {
            // 如果不在底部且还没禁用，则禁用（处理向下滚动但未到底部的情况）
            if (AppState.autoScrollEnabled) {
                AppState.autoScrollEnabled = false;
                console.debug('[AutoScroll] 用户不在底部，暂停自动跟随');
            }
        }

        // 更新"回到底部"按钮可见性
        updateScrollToBottomButton();
    }, 30);
}

// 保留旧函数名作为别名，兼容现有代码
function scrollToBottom() {
    smartScrollToBottom();
}

/**
 * 更新"回到底部"按钮的可见性
 * 只在流式输出（isLoading）且用户向上滚动时显示
 */
function updateScrollToBottomButton() {
    const btn = document.getElementById('scrollToBottomBtn');
    const container = document.getElementById('chatContainer');

    if (!btn || !container) return;

    // 显示条件：
    // 1. AI 正在回答（isLoading === true）
    // 2. 自动跟随关闭（用户向上滚动了）
    // 3. 距离底部 > 300px
    const shouldShow = AppState.isLoading &&
        !AppState.autoScrollEnabled &&
        !isAtBottom(container, 300);

    if (shouldShow) {
        btn.style.display = 'inline-flex';
        // 使用 requestAnimationFrame 确保 display 生效后再添加 visible 类
        requestAnimationFrame(() => {
            btn.classList.add('visible');
        });
    } else {
        btn.classList.remove('visible');
        // 等待动画结束后再隐藏元素
        setTimeout(() => {
            if (!btn.classList.contains('visible')) {
                btn.style.display = 'none';
            }
        }, 250);
    }
}

/**
 * 处理"回到底部"按钮点击
 */
function handleScrollToBottomClick() {
    const container = document.getElementById('chatContainer');
    if (!container) return;

    // 平滑滚动到底部
    container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
    });

    // 恢复自动跟随
    AppState.autoScrollEnabled = true;
    console.debug('[ScrollToBottom] 用户点击回到底部按钮，恢复自动跟随');

    // 更新按钮状态（会自动隐藏）
    updateScrollToBottomButton();
}

function setLoading(loading) {
    AppState.isLoading = loading;
    const btn = document.getElementById('sendBtn');
    btn.innerHTML = loading ? '<div class="loader-dots">...</div>' : '<i data-lucide="arrow-up"></i>';
    btn.disabled = loading;
    if (!loading && window.lucide) lucide.createIcons();

    // 更新"回到底部"按钮状态（流式输出结束时自动隐藏）
    updateScrollToBottomButton();
}







/* ==================== 输入框模式切换与展开功能 ==================== */

// 切换对话模式（销售话术 <-> 自由讨论）
function toggleChatMode() {
    AppState.chatMode = AppState.chatMode === 'sales' ? 'free' : 'sales';
    updateModeButtonUI();
}

// 更新模式按钮的UI显示
function updateModeButtonUI() {
    const modeToggleBtn = document.getElementById('modeToggleBtn');
    const modeLabel = document.getElementById('modeLabel');
    if (!modeToggleBtn || !modeLabel) return;

    if (AppState.chatMode === 'sales') {
        modeLabel.textContent = '销售话术';
        modeToggleBtn.classList.remove('free-mode');
        modeToggleBtn.classList.add('sales-mode');
    } else {
        modeLabel.textContent = '自由讨论';
        modeToggleBtn.classList.remove('sales-mode');
        modeToggleBtn.classList.add('free-mode');
    }
}

// 常量：行高
const LINE_HEIGHT = 24;
const MAX_COLLAPSED_LINES = 3;

// 调整输入框高度并检测是否需要显示展开按钮
function adjustInputHeight(textarea) {
    const expandBtn = document.getElementById('expandBtn');
    const container = document.getElementById('inputContainer');
    if (!expandBtn || !container) return;

    // 如果处于展开状态，不自动调整高度
    if (container.classList.contains('expanded')) {
        return;
    }

    // 重置高度以获取真实scrollHeight
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const lines = Math.ceil(scrollHeight / LINE_HEIGHT);

    if (lines > MAX_COLLAPSED_LINES) {
        // 超过3行：限制高度为3行，显示展开按钮
        textarea.style.height = (MAX_COLLAPSED_LINES * LINE_HEIGHT) + 'px';
        expandBtn.classList.add('visible');
    } else {
        // 1-3行：自动调整高度，隐藏展开按钮
        textarea.style.height = scrollHeight + 'px';
        expandBtn.classList.remove('visible');
    }
}

// 切换输入框展开/收起状态
function toggleInputExpand() {
    const container = document.getElementById('inputContainer');
    const textarea = document.getElementById('chatInput');
    const expandBtn = document.getElementById('expandBtn');
    if (!container || !textarea || !expandBtn) return;

    const isCurrentlyExpanded = container.classList.contains('expanded');

    if (isCurrentlyExpanded) {
        // 收起：根据内容行数恢复高度
        container.classList.remove('expanded');

        // 计算当前内容的实际行数
        textarea.style.height = 'auto';
        const scrollHeight = textarea.scrollHeight;
        const lines = Math.ceil(scrollHeight / LINE_HEIGHT);

        if (lines <= MAX_COLLAPSED_LINES) {
            // 内容在3行以内：恢复到实际行数高度，隐藏展开按钮
            textarea.style.height = scrollHeight + 'px';
            expandBtn.classList.remove('visible');
        } else {
            // 内容超过3行：恢复到3行高度，保持展开按钮可见
            textarea.style.height = (MAX_COLLAPSED_LINES * LINE_HEIGHT) + 'px';
            expandBtn.classList.add('visible');
        }
        updateExpandButtonIcon(false);
    } else {
        // 展开
        container.classList.add('expanded');
        textarea.style.height = ''; // 清除内联样式，由CSS控制
        updateExpandButtonIcon(true);
    }
}

// 更新展开按钮图标
function updateExpandButtonIcon(isExpanded) {
    const expandBtn = document.getElementById('expandBtn');
    if (!expandBtn) return;

    const iconName = isExpanded ? 'minimize-2' : 'maximize-2';
    expandBtn.innerHTML = `<i data-lucide="${iconName}"></i>`;
    if (window.lucide) lucide.createIcons();
}

// 更新发送按钮状态（输入框为空时禁用）
function updateSendButtonState() {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    if (!chatInput || !sendBtn) return;

    const hasText = chatInput.value.trim().length > 0;
    const hasImages = (AppState.images && AppState.images.length > 0);
    sendBtn.disabled = !(hasText || hasImages);
}

/* ==================== Profile & KB Logic ==================== */
function setupEventListeners() {
    // Send
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.onclick = sendMessage;

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.onkeydown = e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        };
        chatInput.oninput = function () {
            // 自动调整高度，1-3行自动扩展，超过3行显示展开按钮
            adjustInputHeight(this);
            // 更新发送按钮状态
            updateSendButtonState();
        };
        // 初始化发送按钮状态
        updateSendButtonState();
    }

    // 监听聊天容器的滚动事件
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
        chatContainer.addEventListener('scroll', handleUserScroll, { passive: true });
        console.debug('[AutoScroll] 滚动监听已绑定');
    }

    // 绑定"回到底部"按钮
    const scrollToBottomBtn = document.getElementById('scrollToBottomBtn');
    if (scrollToBottomBtn) {
        scrollToBottomBtn.onclick = handleScrollToBottomClick;
    }

    // 模式切换按钮
    const modeToggleBtn = document.getElementById('modeToggleBtn');
    if (modeToggleBtn) {
        modeToggleBtn.onclick = toggleChatMode;
        updateModeButtonUI();
    }

    // 展开/收起按钮
    const expandBtn = document.getElementById('expandBtn');
    if (expandBtn) {
        expandBtn.onclick = toggleInputExpand;
    }

    // Chat Management
    const newChatBtn = document.getElementById('newChatBtn');
    if (newChatBtn) {
        newChatBtn.onclick = () => {
            // 打开客户档案填写弹窗
            openCustomerProfileModal();
        };
    }

    // Customer Profile Modal Form Submit
    const customerProfileForm = document.getElementById('newCustomerProfileForm');
    if (customerProfileForm) {
        customerProfileForm.onsubmit = (e) => {
            e.preventDefault();
            submitCustomerProfile();
        };
    }

    // Profile Modal Toggles
    window.toggleProfileModal = async (show) => {
        const m = document.getElementById('profileModal');
        if (m) {
            m.classList.toggle('open', show);
            if (show) {
                // 从后端加载最新的客户档案
                await loadCustomerProfile();
                updateProfileForm();
            }
        }
    };

    // 切换客户档案弹窗步骤
    window.switchProfileStep = function (stepName) {
        // 隐藏所有步骤
        document.querySelectorAll('.profile-step').forEach(step => {
            step.classList.remove('active');
        });

        // 隐藏所有底部按钮
        document.getElementById('profileFooterDisplay').style.display = 'none';
        document.getElementById('profileFooterInput').style.display = 'none';
        const editFooter = document.getElementById('profileFooterEdit');
        if (editFooter) editFooter.style.display = 'none';

        // 显示对应步骤和按钮
        switch (stepName) {
            case 'display':
                document.getElementById('profileStepDisplay').classList.add('active');
                document.getElementById('profileFooterDisplay').style.display = 'flex';
                document.getElementById('profileModalTitle').textContent = '客户档案';
                break;
            case 'input':
                document.getElementById('profileStepInput').classList.add('active');
                document.getElementById('profileFooterInput').style.display = 'flex';
                document.getElementById('profileModalTitle').textContent = '创建客户档案';
                // 初始化生成按钮状态和互斥状态
                updateGenerateButtonState();
                updateProfileInputExclusion();
                break;
            case 'analyzing':
                document.getElementById('profileStepAnalyzing').classList.add('active');
                document.getElementById('profileModalTitle').textContent = '生成客户档案';
                break;
            case 'edit':
                document.getElementById('profileStepEdit').classList.add('active');
                if (editFooter) editFooter.style.display = 'flex';
                document.getElementById('profileModalTitle').textContent = '编辑客户档案';
                // 加载原始 Markdown 到编辑框
                const textarea = document.getElementById('custNotes');
                const editTextarea = document.getElementById('profileEditTextarea');
                if (textarea && editTextarea) {
                    editTextarea.value = textarea.value || '';
                }
                break;
        }
    };

    // 返回客户档案显示页
    window.returnToDisplayPage = function () {
        // 清空输入
        document.getElementById('profileInputTextarea').value = '';
        clearProfileUploadedFile();
        // 返回显示页
        switchProfileStep('display');
    };

    // 更新生成按钮状态（检查是否有输入）
    window.updateGenerateButtonState = function () {
        const files = currentUploadedFiles;
        const text = document.getElementById('profileInputTextarea').value.trim();
        const generateBtn = document.getElementById('profileGenerateBtn');

        if (generateBtn) {
            generateBtn.disabled = files.length === 0 && !text;
        }
    }

    // 清除已上传的文件
    window.clearProfileUploadedFile = function (event) {
        if (event) event.stopPropagation();
        currentUploadedFiles = [];
        renderProfileUploadedFiles();
        document.getElementById('profileFileInput').value = '';
        // 更新生成按钮状态和互斥状态
        updateGenerateButtonState();
        updateProfileInputExclusion();
    };

    // 开始生成客户档案
    // 开始生成客户档案
    window.startProfileGeneration = async function () {
        console.log('[startProfileGeneration] Called');
        const files = currentUploadedFiles;
        const text = document.getElementById('profileInputTextarea').value.trim();

        console.log('[startProfileGeneration] Files count:', files.length);
        console.log('[startProfileGeneration] Text:', text ? 'has text' : 'no text');

        if (files.length === 0 && !text) {
            showNotification('请上传文件或输入客户信息', 'warning');
            return;
        }

        switchProfileStep('analyzing');

        let profileContent = '';
        let isStreamingMode = false; // 标记是否使用了流式处理
        const profileDisplay = document.getElementById('profileEditorSimple');

        console.log('[startProfileGeneration] Starting try block');

        try {
            if (files.length > 0) {
                console.log('[startProfileGeneration] Processing file upload');
                const formData = new FormData();
                files.forEach(file => {
                    formData.append('files', file); // Use 'files' key for multiple files
                });

                console.log('[analyze-profile] Sending files count:', files.length);

                const response = await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/analyze-profile`, {
                    method: 'POST',
                    body: formData
                });

                console.log('[analyze-profile] Response status:', response.status);
                console.log('[analyze-profile] Content-Type:', response.headers.get('content-type'));

                if (!response.ok) throw new Error('分析请求失败: ' + response.status);

                const contentType = response.headers.get('content-type') || '';

                // 检查是否是 SSE 流式响应（包括 text/event-stream 或 text/plain）
                const isSSE = contentType.includes('text/event-stream') ||
                    contentType.includes('text/plain') ||
                    contentType.includes('application/octet-stream');

                if (isSSE) {
                    console.log('[analyze-profile] Processing as SSE stream, content-type:', contentType);
                    isStreamingMode = true; // 标记使用了流式处理

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    let hasReceivedData = false;
                    let startTime = Date.now();

                    while (true) {
                        const { done, value } = await reader.read();

                        // 超时检查（300秒总超时）
                        if (Date.now() - startTime > 300000) {
                            throw new Error('请求超时，请稍后重试');
                        }

                        if (done) {
                            console.log('[analyze-profile] Stream done');
                            break;
                        }

                        hasReceivedData = true;
                        const decoded = decoder.decode(value, { stream: true });
                        buffer += decoded;

                        console.log('[analyze-profile] Received chunk:', decoded.substring(0, 200));

                        // SSE 事件以 \n\n 分隔，但也可能使用 \n 分隔
                        // 尝试两种分隔符
                        let chunks = buffer.split('\n\n');
                        if (chunks.length === 1) {
                            // 如果没有 \n\n，尝试用 \n 分隔
                            const lines = buffer.split('\n');
                            if (lines.length > 1) {
                                buffer = lines.pop() || '';
                                chunks = lines;
                            }
                        } else {
                            buffer = chunks.pop() || '';
                        }

                        for (const chunk of chunks) {
                            const trimmedChunk = chunk.trim();
                            if (!trimmedChunk) continue;

                            console.log('[analyze-profile] Processing chunk:', trimmedChunk.substring(0, 200));

                            // 找到 data: 开头的行
                            const lines = trimmedChunk.split('\n');
                            for (const line of lines) {
                                const trimmedLine = line.trim();
                                if (!trimmedLine.startsWith('data: ')) continue;

                                const dataStr = trimmedLine.slice(6).trim();
                                if (!dataStr) continue;

                                console.log('[analyze-profile] Data string:', dataStr.substring(0, 200));

                                try {
                                    const event = JSON.parse(dataStr);
                                    console.log('[analyze-profile] Event type:', event.type);

                                    if (event.type === 'token') {
                                        profileContent += event.data;
                                        // 切换到显示页（如果是第一个 token）
                                        if (document.getElementById('profileStepAnalyzing').classList.contains('active')) {
                                            switchProfileStep('display');
                                            // 强制显示内容区域（流式输出开始时立即显示）
                                            const emptyState = document.getElementById('profileDisplayEmpty');
                                            const contentState = document.getElementById('profileDisplayContent');
                                            if (emptyState) emptyState.style.display = 'none';
                                            if (contentState) contentState.style.display = 'flex';
                                        }
                                        // 实时渲染 Markdown（同步更新，立即显示）
                                        if (window.marked) {
                                            profileDisplay.innerHTML = marked.parse(profileContent);
                                        } else {
                                            profileDisplay.textContent = profileContent;
                                        }
                                        // 自动滚动到底部
                                        profileDisplay.scrollTop = profileDisplay.scrollHeight;
                                    } else if (event.type === 'status') {
                                        console.log('[analyze-profile] Status:', event.data);
                                    } else if (event.type === 'done') {
                                        // 注意：event.profile 可能是空字符串，需要用 undefined 判断
                                        if (event.profile !== undefined) {
                                            profileContent = event.profile;
                                            console.log('[analyze-profile] Done event received, profile length:', profileContent.length);
                                        }
                                        // 如果 profile 为空，标记为完成但可能需要报错
                                        if (!profileContent || profileContent.trim() === '') {
                                            console.warn('[analyze-profile] Profile is empty in done event');
                                        }
                                    } else if (event.type === 'error') {
                                        throw new Error(event.data);
                                    }
                                } catch (e) {
                                    console.warn('[analyze-profile] Failed to parse SSE event:', e, dataStr);
                                }
                            }
                        }
                    }

                    // 如果内容为空，报错
                    if (!profileContent || profileContent.trim() === '') {
                        throw new Error('分析结果为空，请检查文件内容或稍后重试');
                    }
                } else {
                    // 非流式响应，按普通 JSON 处理
                    console.log('[analyze-profile] Processing as JSON response');
                    const result = await response.json();
                    console.log('[analyze-profile] JSON result:', result);

                    if (result.code !== 0) {
                        throw new Error(result.message || '分析失败');
                    }

                    profileContent = result.data?.profile || result.data?.analysis || '';
                    switchProfileStep('display');
                }
            } else {
                // 文本输入处理（支持流式）
                console.log('[analyze-profile] Sending text, length:', text.length);

                const response = await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/analyze-profile-text`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text })
                });

                console.log('[analyze-profile] Response status (text input):', response.status);
                console.log('[analyze-profile] Content-Type (text input):', response.headers.get('content-type'));

                if (!response.ok) throw new Error('分析请求失败: ' + response.status);

                const contentType = response.headers.get('content-type') || '';

                // 检查是否是 SSE 流式响应
                const isSSE = contentType.includes('text/event-stream') ||
                    contentType.includes('text/plain') ||
                    contentType.includes('application/octet-stream');

                if (isSSE) {
                    console.log('[analyze-profile] Processing as SSE stream (text input), content-type:', contentType);
                    isStreamingMode = true; // 标记使用了流式处理

                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    let startTime = Date.now();

                    while (true) {
                        const { done, value } = await reader.read();

                        // 超时检查（300秒总超时）
                        if (Date.now() - startTime > 300000) {
                            throw new Error('请求超时，请稍后重试');
                        }

                        if (done) {
                            console.log('[analyze-profile] Stream done (text input)');
                            break;
                        }

                        const decoded = decoder.decode(value, { stream: true });
                        buffer += decoded;

                        console.log('[analyze-profile] Received chunk (text input):', decoded.substring(0, 200));

                        // SSE 事件以 \n\n 分隔
                        let chunks = buffer.split('\n\n');
                        if (chunks.length === 1) {
                            const lines = buffer.split('\n');
                            if (lines.length > 1) {
                                buffer = lines.pop() || '';
                                chunks = lines;
                            }
                        } else {
                            buffer = chunks.pop() || '';
                        }

                        for (const chunk of chunks) {
                            const trimmedChunk = chunk.trim();
                            if (!trimmedChunk) continue;

                            const lines = trimmedChunk.split('\n');
                            for (const line of lines) {
                                const trimmedLine = line.trim();
                                if (!trimmedLine.startsWith('data: ')) continue;

                                const dataStr = trimmedLine.slice(6).trim();
                                if (!dataStr) continue;

                                try {
                                    const event = JSON.parse(dataStr);
                                    console.log('[analyze-profile] Event type (text input):', event.type);

                                    if (event.type === 'token') {
                                        profileContent += event.data;
                                        // 切换到显示页（如果是第一个 token）
                                        if (document.getElementById('profileStepAnalyzing').classList.contains('active')) {
                                            switchProfileStep('display');
                                            // 强制显示内容区域
                                            const emptyState = document.getElementById('profileDisplayEmpty');
                                            const contentState = document.getElementById('profileDisplayContent');
                                            if (emptyState) emptyState.style.display = 'none';
                                            if (contentState) contentState.style.display = 'flex';
                                        }
                                        // 实时渲染 Markdown
                                        if (window.marked) {
                                            profileDisplay.innerHTML = marked.parse(profileContent);
                                        } else {
                                            profileDisplay.textContent = profileContent;
                                        }
                                        // 自动滚动到底部
                                        profileDisplay.scrollTop = profileDisplay.scrollHeight;
                                    } else if (event.type === 'status') {
                                        console.log('[analyze-profile] Status (text input):', event.data);
                                    } else if (event.type === 'done') {
                                        if (event.profile !== undefined) {
                                            profileContent = event.profile;
                                            console.log('[analyze-profile] Done event received (text input), profile length:', profileContent.length);
                                        }
                                    } else if (event.type === 'error') {
                                        throw new Error(event.data);
                                    }
                                } catch (e) {
                                    console.warn('[analyze-profile] Failed to parse SSE event (text input):', e, dataStr);
                                }
                            }
                        }
                    }

                    // 如果内容为空，报错
                    if (!profileContent || profileContent.trim() === '') {
                        throw new Error('分析结果为空，请检查输入内容或稍后重试');
                    }
                } else {
                    // 非流式响应，按普通 JSON 处理
                    console.log('[analyze-profile] Processing as JSON response (text input)');
                    const res = await response.json();

                    if (res.code === 0 && res.data && res.data.profile) {
                        profileContent = res.data.profile;
                        switchProfileStep('display');
                    } else {
                        throw new Error(res.message || '分析失败');
                    }
                }
            }

            // 完成后的统一步骤
            // 只在非流式模式下设置编辑器内容（流式模式已经实时更新了）
            if (!isStreamingMode) {
                setEditorContent(profileContent);
            } else {
                // 流式模式下，需要同步内容到隐藏的 textarea（用于保存）
                const textarea = document.getElementById('custNotes');
                if (textarea) {
                    textarea.value = profileContent;
                }
            }

            const saveSuccess = await persistProfile();
            if (saveSuccess) showNotification('客户档案已同步', 'success');

            document.getElementById('profileInputTextarea').value = '';
            clearProfileUploadedFile();
            updateDisplayPageState();

        } catch (error) {
            console.error('Profile generation failed:', error);
            showNotification('生成失败：' + error.message, 'error');
            switchProfileStep('input');
        }
    };

    const profileBtn = document.getElementById('profileBtn');
    if (profileBtn) profileBtn.onclick = () => toggleProfileModal(true);

    // Legacy drawer triggers removed

    // KB Modal
    const kbBtn = document.getElementById('kbBtn');
    if (kbBtn) kbBtn.onclick = () => toggleKbModal(true);

    // Init Profile Upload
    initProfileUpload();
    // Init Profile Markdown/Editor Toggle
    if (window.initProfileInteraction) initProfileInteraction();
}

// Profile Form Logic
window.saveCustomerProfile = async function () {
    const success = await persistProfile();
    if (success) {
        document.getElementById('profileDrawer').classList.remove('open');
        document.getElementById('drawerBackdrop').classList.remove('open');
    }
};

async function persistProfile() {
    const nameEl = document.getElementById('custName');
    const stageEl = document.getElementById('custStage');
    const notesEl = document.getElementById('custNotes');

    const profile = {
        name: nameEl ? nameEl.value : (AppState.customerProfile.name || ''),
        stage: stageEl ? stageEl.value : (AppState.customerProfile.stage || 'DISCOVERY'),
        notes: notesEl ? notesEl.value : ''
    };

    console.log('[persistProfile] Saving profile:', {
        sessionId: AppState.currentSessionId,
        notesLength: profile.notes.length,
        notesPreview: profile.notes.substring(0, 100)
    });

    AppState.customerProfile = profile;
    AppState.salesStage = profile.stage; // 同步销售阶段

    // Persist to API if session active
    if (AppState.currentSessionId) {
        try {
            // 后端只接收 profile 字段（Markdown 字符串）
            const response = await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/sessions/${AppState.currentSessionId}/customer-profile`, {
                method: 'PUT',
                body: JSON.stringify({ profile: profile.notes })
            });

            if (!response.ok) {
                console.error('[persistProfile] Save failed:', response.status);
                return false;
            }

            console.log('[persistProfile] Customer profile saved successfully');
            return true;
        } catch (e) {
            console.error('Failed to save customer profile', e);
            alert('保存客户档案失败，请重试');
            return false;
        }
    }
    return true; // No session active is considered "success" for UI state
}

// 旧版本的 updateProfileForm - 已被下方的新版本替代，保留此注释以防引用
// function updateProfileForm() { ... }

/**
 * 从后端加载当前会话的客户档案
 */
async function loadCustomerProfile() {
    // 如果没有活动会话，清空客户档案
    if (!AppState.currentSessionId) {
        console.log('[loadCustomerProfile] No active session');
        AppState.customerProfile = {};
        return;
    }

    try {
        console.log('[loadCustomerProfile] Loading profile for session:', AppState.currentSessionId);

        const response = await authManager.fetchWithAuth(
            `${API_BASE_URL}/v1/sales-rag/sessions/${AppState.currentSessionId}`,
            { method: 'GET' }
        );

        if (!response.ok) {
            console.error('[loadCustomerProfile] Failed to load:', response.status);
            return;
        }

        const data = await response.json();

        if (data.code === 0 && data.data) {
            const session = data.data;

            // 解析客户档案
            if (session.customer_profile) {
                try {
                    AppState.customerProfile = JSON.parse(session.customer_profile);
                    console.log('[loadCustomerProfile] Profile loaded:', {
                        notesLength: AppState.customerProfile.notes?.length || 0
                    });
                } catch (e) {
                    console.error('[loadCustomerProfile] Failed to parse customer_profile:', e);
                    // 如果不是 JSON，将其作为 Markdown 文本存储到 notes 字段
                    AppState.customerProfile = {
                        name: '',
                        stage: session.sales_stage || '',
                        notes: session.customer_profile
                    };
                }
            } else {
                console.log('[loadCustomerProfile] No customer_profile in session');
                AppState.customerProfile = {};
            }
        } else {
            console.error('[loadCustomerProfile] Invalid response:', data);
            AppState.customerProfile = {};
        }
    } catch (e) {
        console.error('[loadCustomerProfile] Error:', e);
        // 保持当前状态，不清空
    }
}

function resetProfileForm() {
    AppState.customerProfile = {};
    updateProfileForm();
}

// ==================== Knowledge Document Selection Logic ====================
let availableDocuments = [];
AppState.activeKbTab = 'product'; // Current category being edited
let kbCurrentView = 'overview'; // 'overview' | 'wizard' | 'categoryEdit'
let kbWizardStep = 0; // 0=product, 1=cases, 2=faq, 3=opinion
let availableOpinionTracks = []; // 系统内置观点赛道列表
const KB_CATEGORIES = ['product', 'cases', 'faq', 'opinion'];
const KB_CATEGORY_LABELS = { product: '产品文档', cases: '成功案例', faq: '百问百答', opinion: '观点库' };
const KB_WIZARD_HINTS = {
    product: '请选择产品知识库（最多 3 个）',
    cases: '请选择案例知识库（最多 3 个）',
    faq: '请选择百问百答知识库（最多 3 个）',
    opinion: '系统赛道与自定义赛道合计最多选择 2 个'
};

// --- Modal open/close ---
window.toggleKbModal = async function (show) {
    const m = document.getElementById('kbModal');
    if (show) {
        m.classList.add('open');
        await loadKnowledgeDocuments();
        // Decide which view to show
        const hasSelection = KB_CATEGORIES.some(c => (AppState.kbSelection[c] || []).length > 0) || (AppState.opinionTrackSelection || []).length > 0;
        if (hasSelection) {
            kbShowView('overview');
        } else {
            kbWizardStep = 0;
            kbShowView('wizard');
        }
    } else {
        m.classList.remove('open');
    }
}

// --- View switching ---
function kbShowView(view) {
    kbCurrentView = view;
    ['kbViewOverview', 'kbViewWizard', 'kbViewCategoryEdit'].forEach(id => {
        document.getElementById(id).style.display = 'none';
    });
    const backBtn = document.getElementById('kbBackBtn');
    const title = document.getElementById('kbModalTitle');

    if (view === 'overview') {
        document.getElementById('kbViewOverview').style.display = 'flex';
        backBtn.style.display = 'none';
        title.textContent = '知识库配置';
        renderKbOverview();
    } else if (view === 'wizard') {
        document.getElementById('kbViewWizard').style.display = 'flex';
        backBtn.style.display = 'none';
        title.textContent = '配置知识库';
        kbRenderWizardStep();
    } else if (view === 'categoryEdit') {
        document.getElementById('kbViewCategoryEdit').style.display = 'flex';
        backBtn.style.display = 'flex';
        title.textContent = KB_CATEGORY_LABELS[AppState.activeKbTab];
        const hintSpan = document.getElementById('kbCategoryEditHintText');
        if (hintSpan) {
            hintSpan.textContent = AppState.activeKbTab === 'opinion'
                ? '系统赛道与自定义赛道合计最多选择 2 个'
                : '最多选择 3 个文档';
        }
        const listEl = document.getElementById('kbCategoryDocList');
        if (AppState.activeKbTab === 'opinion') {
            kbRenderOpinionStep(listEl);
        } else {
            kbRenderCategoryDocs(listEl);
        }
    }
    if (window.lucide) lucide.createIcons();
}

// --- Back button ---
window.kbGoBack = function () {
    const hasSelection = KB_CATEGORIES.some(c => (AppState.kbSelection[c] || []).length > 0) || (AppState.opinionTrackSelection || []).length > 0;
    if (kbCurrentView === 'categoryEdit' && hasSelection) {
        kbShowView('overview');
    } else {
        kbShowView('wizard');
    }
}

// --- Overview rendering ---
function renderKbOverview() {
    const grid = document.getElementById('kbOverviewGrid');
    grid.innerHTML = KB_CATEGORIES.map(cat => {
        const docs = (AppState.kbSelection[cat] || []);
        const label = KB_CATEGORY_LABELS[cat];
        const docItems = docs.map(docId => {
            const doc = availableDocuments.find(d => parseInt(d.id || d.ID) === docId);
            const name = doc ? (doc.name || doc.Name) : `文档 #${docId}`;
            const icon = doc ? getDocIcon(name) : 'file';
            return `<div class="kb-overview-doc-item">
                <i data-lucide="${icon}"></i>
                <span class="kb-overview-doc-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
            </div>`;
        }).join('');

        // 观点库额外显示已选的系统赛道
        let trackItems = '';
        if (cat === 'opinion' && AppState.opinionTrackSelection.length > 0) {
            trackItems = AppState.opinionTrackSelection.map(trackId => {
                const track = availableOpinionTracks.find(t => parseInt(t.id || t.ID) === trackId);
                const name = track ? (track.name || track.Name) : `赛道 #${trackId}`;
                return `<div class="kb-overview-doc-item">
                    <i data-lucide="compass"></i>
                    <span class="kb-overview-doc-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                </div>`;
            }).join('');
        }

        const totalCount = cat === 'opinion' ? docs.length + AppState.opinionTrackSelection.length : docs.length;
        const maxCount = cat === 'opinion' ? '2' : '3';
        const emptyHtml = totalCount === 0
            ? `<div class="kb-overview-empty">未选择文档</div>` : '';

        return `<div class="kb-overview-card ${cat}">
            <div class="kb-overview-card-header">
                <div class="kb-overview-card-title">
                    <div class="kb-overview-card-dot"></div>
                    ${label}
                </div>
                <span class="kb-overview-card-count">${totalCount}/${maxCount}</span>
            </div>
            <div class="kb-overview-doc-list">
                ${trackItems}${docItems}${emptyHtml}
            </div>
            <button class="kb-overview-edit-btn" onclick="kbEditCategory('${cat}')">
                <i data-lucide="pencil"></i>
                编辑
            </button>
        </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

window.kbEditCategory = function (cat) {
    AppState.activeKbTab = cat;
    kbShowView('categoryEdit');
}

// --- Wizard logic ---
function kbRenderWizardStep() {
    const cat = KB_CATEGORIES[kbWizardStep];
    AppState.activeKbTab = cat;

    // Update step indicators
    document.querySelectorAll('#kbWizardSteps .kb-step').forEach((el, i) => {
        el.classList.toggle('active', i === kbWizardStep);
        el.classList.toggle('completed', i < kbWizardStep);
    });
    document.querySelectorAll('#kbWizardSteps .kb-step-line').forEach((el, i) => {
        el.classList.toggle('completed', i < kbWizardStep);
    });

    // Update buttons
    const prevBtn = document.getElementById('kbWizardPrevBtn');
    const nextBtn = document.getElementById('kbWizardNextBtn');
    prevBtn.style.display = kbWizardStep === 0 ? 'none' : '';
    nextBtn.querySelector('span').textContent = kbWizardStep === 3 ? '完成' : '下一步';

    // Update hint text
    const hintText = document.getElementById('kbWizardHintText');
    if (hintText) hintText.textContent = KB_WIZARD_HINTS[cat];

    // Render docs for current step
    const docList = document.getElementById('kbDocumentList');
    if (cat === 'opinion') {
        kbRenderOpinionStep(docList);
    } else {
        kbRenderCategoryDocs(docList);
    }
}

window.kbWizardPrev = function () {
    if (kbWizardStep > 0) {
        kbWizardStep--;
        kbRenderWizardStep();
    }
}

window.kbWizardNext = function () {
    if (kbWizardStep < 3) {
        kbWizardStep++;
        kbRenderWizardStep();
    } else {
        // Final step: save and show overview
        saveKbSelection();
    }
}

// --- Shared document list renderer (used by wizard & categoryEdit) ---
function kbRenderCategoryDocs(listContainer) {
    if (!listContainer) return;
    const cat = AppState.activeKbTab;
    const currentSelection = AppState.kbSelection[cat] || [];

    // Filter: only show enabled docs, and docs not selected in OTHER categories
    const otherSelected = new Set();
    KB_CATEGORIES.forEach(c => {
        if (c !== cat) (AppState.kbSelection[c] || []).forEach(id => otherSelected.add(id));
    });

    const enabledDocs = availableDocuments.filter(doc => {
        const isEnabled = doc.is_enabled !== false && doc.IsEnabled !== false;
        const docId = parseInt(doc.id || doc.ID);
        return isEnabled && !otherSelected.has(docId);
    });

    if (enabledDocs.length === 0) {
        listContainer.innerHTML = `
            <div class="kb-empty-state">
                <i data-lucide="inbox" style="width:48px;height:48px;margin-bottom:16px;opacity:0.3;"></i>
                <div style="font-size:14px;color:var(--text-muted);">暂无可选文档</div>
            </div>`;
        if (window.lucide) lucide.createIcons();
        return;
    }

    // Sort: selected first
    const sorted = [...enabledDocs].sort((a, b) => {
        const aId = parseInt(a.id || a.ID);
        const bId = parseInt(b.id || b.ID);
        const aSelected = currentSelection.includes(aId) ? 0 : 1;
        const bSelected = currentSelection.includes(bId) ? 0 : 1;
        return aSelected - bSelected;
    });

    listContainer.innerHTML = sorted.map(doc => {
        const docId = parseInt(doc.id || doc.ID);
        const name = doc.name || doc.Name || 'Untitled';
        const icon = getDocIcon(name);
        const isSelected = currentSelection.includes(docId);
        const size = doc.file_size ? formatFileSize(doc.file_size || doc.FileSize) : '';
        const chunkCount = doc.chunk_count || doc.ChunkCount || 0;
        const date = doc.CreatedAt ? new Date(doc.CreatedAt).toLocaleDateString('zh-CN') : '';

        return `
            <div class="kb-document-item ${isSelected ? 'selected' : ''}"
                 data-doc-id="${docId}" data-enabled="true">
                <div class="kb-checkbox">
                    <i data-lucide="check"></i>
                </div>
                <div class="kb-doc-icon-container">
                    <i data-lucide="${icon}"></i>
                </div>
                <div class="kb-document-info">
                    <div class="kb-document-name">${escapeHtml(name)}</div>
                    <div class="kb-document-meta">
                        ${size ? `<span class="kb-meta-item"><i data-lucide="hard-drive"></i>${size}</span>` : ''}
                        <span class="kb-meta-item"><i data-lucide="layers"></i>${chunkCount} 块</span>
                        ${date ? `<span class="kb-meta-item">${date}</span>` : ''}
                    </div>
                </div>
            </div>`;
    }).join('');

    if (window.lucide) lucide.createIcons();

    // Click handlers
    listContainer.querySelectorAll('.kb-document-item').forEach(item => {
        item.addEventListener('click', function () {
            const docId = parseInt(this.getAttribute('data-doc-id'));
            toggleKbDocument(docId);
            // Re-render this list
            kbRenderCategoryDocs(listContainer);
        });
    });
}

// --- Render opinion step: system tracks + user docs ---
function kbRenderOpinionStep(listContainer) {
    if (!listContainer) return;
    const currentDocSelection = AppState.kbSelection.opinion || [];

    // 系统赛道部分
    let trackHTML = '';
    if (availableOpinionTracks.length > 0) {
        trackHTML = `
            <div class="kb-opinion-section">
                <div class="kb-opinion-section-title">
                    <i data-lucide="compass" style="width:14px;height:14px;"></i>
                    <span>系统赛道</span>
                </div>
                <div class="kb-track-list">
                    ${availableOpinionTracks.map(track => {
                        const trackId = parseInt(track.id || track.ID);
                        const isSelected = AppState.opinionTrackSelection.includes(trackId);
                        return `<div class="kb-track-item ${isSelected ? 'selected' : ''}" data-track-id="${trackId}">
                            <div class="kb-checkbox"><i data-lucide="check"></i></div>
                            <div class="kb-track-info">
                                <div class="kb-track-name">${escapeHtml(track.name || track.Name)}</div>
                                <div class="kb-track-desc">${escapeHtml(track.description || track.Description || '')}</div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
    }

    // 用户文档部分
    const otherSelected = new Set();
    KB_CATEGORIES.forEach(c => {
        if (c !== 'opinion') (AppState.kbSelection[c] || []).forEach(id => otherSelected.add(id));
    });

    const enabledDocs = availableDocuments.filter(doc => {
        const isEnabled = doc.is_enabled !== false && doc.IsEnabled !== false;
        const docId = parseInt(doc.id || doc.ID);
        return isEnabled && !otherSelected.has(docId);
    });

    const sorted = [...enabledDocs].sort((a, b) => {
        const aId = parseInt(a.id || a.ID);
        const bId = parseInt(b.id || b.ID);
        const aSelected = currentDocSelection.includes(aId) ? 0 : 1;
        const bSelected = currentDocSelection.includes(bId) ? 0 : 1;
        return aSelected - bSelected;
    });

    let docHTML = '';
    if (sorted.length > 0) {
        docHTML = `
            <div class="kb-opinion-section" style="margin-top:16px;">
                <div class="kb-opinion-section-title">
                    <i data-lucide="file-plus" style="width:14px;height:14px;"></i>
                    <span>自定义赛道</span>
                </div>
                ${sorted.map(doc => {
                    const docId = parseInt(doc.id || doc.ID);
                    const name = doc.name || doc.Name || 'Untitled';
                    const icon = getDocIcon(name);
                    const isSelected = currentDocSelection.includes(docId);
                    return `<div class="kb-document-item ${isSelected ? 'selected' : ''}" data-doc-id="${docId}" data-enabled="true">
                        <div class="kb-checkbox"><i data-lucide="check"></i></div>
                        <div class="kb-doc-icon-container"><i data-lucide="${icon}"></i></div>
                        <div class="kb-document-info">
                            <div class="kb-document-name">${escapeHtml(name)}</div>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
    }

    listContainer.innerHTML = trackHTML + docHTML;

    if (window.lucide) lucide.createIcons();

    // 使用事件委托（替代逐元素 addEventListener，避免重渲染时监听器累积）
    listContainer.onclick = function (e) {
        const trackItem = e.target.closest('.kb-track-item');
        if (trackItem) {
            const trackId = parseInt(trackItem.getAttribute('data-track-id'));
            const totalSelected = AppState.opinionTrackSelection.length + (AppState.kbSelection.opinion || []).length;
            const idx = AppState.opinionTrackSelection.indexOf(trackId);
            if (idx >= 0) {
                AppState.opinionTrackSelection.splice(idx, 1);
            } else if (totalSelected < 2) {
                AppState.opinionTrackSelection.push(trackId);
            } else {
                showToast('系统赛道与自定义赛道合计最多选择 2 个', 'warning');
                return;
            }
            kbRenderOpinionStep(listContainer);
            return;
        }

        const docItem = e.target.closest('.kb-document-item');
        if (docItem) {
            const docId = parseInt(docItem.getAttribute('data-doc-id'));
            const selection = AppState.kbSelection.opinion || [];
            const totalSelected = AppState.opinionTrackSelection.length + selection.length;
            const idx = selection.indexOf(docId);
            if (idx >= 0) {
                selection.splice(idx, 1);
            } else if (totalSelected < 2) {
                selection.push(docId);
            } else {
                showToast('系统赛道与自定义赛道合计最多选择 2 个', 'warning');
                return;
            }
            kbRenderOpinionStep(listContainer);
        }
    };
}

// --- Finish category edit (back to overview) ---
window.kbFinishCategoryEdit = function () {
    kbShowView('overview');
}

// --- Load documents from API ---
async function loadKnowledgeDocuments() {
    const loadingEl = document.getElementById('kbLoading');
    try {
        if (loadingEl) loadingEl.style.display = 'flex';
        // 并行加载文档列表和系统赛道
        const [docRes, trackRes] = await Promise.all([
            authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/documents`, { method: 'GET' }),
            authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/opinion-tracks`, { method: 'GET' }).catch(() => null)
        ]);
        const data = await docRes.json();
        if (data.code === 0 && data.data) {
            availableDocuments = Array.isArray(data.data) ? data.data : [];
        } else {
            availableDocuments = [];
        }
        // 加载系统赛道
        if (trackRes) {
            const trackData = await trackRes.json();
            if (trackData.code === 0 && trackData.data) {
                availableOpinionTracks = Array.isArray(trackData.data) ? trackData.data : [];
            }
        }
    } catch (e) {
        console.error('Failed to load knowledge documents', e);
        availableDocuments = [];
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

const getDocIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'file-text';
    if (['doc', 'docx'].includes(ext)) return 'file-type-2';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet';
    if (['ppt', 'pptx'].includes(ext)) return 'presentation';
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) return 'image';
    return 'file';
};

// --- Toggle document selection ---
window.toggleKbDocument = function (docId) {
    const numericDocId = parseInt(docId);
    if (isNaN(numericDocId)) return;

    const currentTab = AppState.activeKbTab || 'product';
    if (!AppState.kbSelection) {
        AppState.kbSelection = { product: [], cases: [], faq: [], opinion: [] };
    }
    const currentSelection = AppState.kbSelection[currentTab];
    if (!currentSelection) return;

    const idx = currentSelection.indexOf(numericDocId);
    if (idx > -1) {
        // Deselect
        currentSelection.splice(idx, 1);
    } else {
        // Check limit
        const limit = (currentTab === 'opinion') ? 2 : 3;
        if (currentSelection.length >= limit) {
            showToast(`每个分类最多选择 ${limit} 个文档`, 'warning');
            return;
        }
        currentSelection.push(numericDocId);
    }

    // Sync documentIds
    AppState.documentIds = [
        ...AppState.kbSelection.product,
        ...AppState.kbSelection.cases,
        ...AppState.kbSelection.faq,
        ...AppState.kbSelection.opinion
    ];
}

// --- Save selection ---
window.saveKbSelection = async function () {
    toggleKbModal(false);

    // 保存旧状态用于回滚
    const prevDocIds = [...(AppState.documentIds || [])];
    const prevKbSelection = JSON.parse(JSON.stringify(AppState.kbSelection));
    const prevTrackSelection = [...(AppState.opinionTrackSelection || [])];

    AppState.documentIds = [
        ...AppState.kbSelection.product,
        ...AppState.kbSelection.cases,
        ...AppState.kbSelection.faq,
        ...AppState.kbSelection.opinion
    ];

    renderSelectedDocuments();

    if (AppState.currentSessionId) {
        try {
            const payload = {
                document_ids: AppState.documentIds,
                product_doc_ids: AppState.kbSelection.product,
                case_doc_ids: AppState.kbSelection.cases,
                faq_doc_ids: AppState.kbSelection.faq,
                opinion_doc_ids: AppState.kbSelection.opinion,
                opinion_track_ids: AppState.opinionTrackSelection
            };
            await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/sessions/${AppState.currentSessionId}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showToast('知识库设置已更新', 'success');
        } catch (e) {
            console.error('Failed to update session KB selection', e);
            // 回滚到保存前的状态
            AppState.documentIds = prevDocIds;
            AppState.kbSelection = prevKbSelection;
            AppState.opinionTrackSelection = prevTrackSelection;
            renderSelectedDocuments();
            showToast('更新知识库失败，已恢复原设置', 'error');
        }
    }
}

function renderEmptyState() {
    const listContainer = document.getElementById('kbDocumentList');
    if (!listContainer) return;
    listContainer.innerHTML = `
        <div class="kb-empty-state">
            <i data-lucide="inbox" style="width:48px;height:48px;margin-bottom:16px;opacity:0.3;"></i>
            <div style="font-size:14px;color:var(--text-muted);">暂无可用的知识文档</div>
            <div style="font-size:12px;color:var(--text-light);margin-top:8px;">请先上传知识文档</div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

function getDocumentStatus(status) {
    const statusMap = {
        'ready': { class: 'ready', icon: 'check-circle', text: '就绪' },
        'processing': { class: 'processing', icon: 'loader', text: '处理中' },
        'pending': { class: 'processing', icon: 'clock', text: '等待中' },
        'failed': { class: 'failed', icon: 'alert-circle', text: '失败' },
        'error': { class: 'failed', icon: 'x-circle', text: '错误' }
    };
    return statusMap[status] || { class: 'processing', icon: 'help-circle', text: status };
}

/**
 * 渲染输入框上方的已选中知识库标签
 */
async function renderSelectedDocuments() {
    console.log('[renderSelectedDocuments] Called with documentIds:', AppState.documentIds);
    const container = document.getElementById('selectedKbContainer');
    if (!container) {
        console.warn('[renderSelectedDocuments] Container #selectedKbContainer not found');
        return;
    }

    if (!AppState.documentIds || AppState.documentIds.length === 0) {
        console.log('[renderSelectedDocuments] No documents selected, clearing container');
        container.innerHTML = '';
        return;
    }

    // 如果还没有加载过文档列表，先加载一下，以便获取标题
    if (availableDocuments.length === 0) {
        try {
            const res = await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/documents`, { method: 'GET' });
            const data = await res.json();
            if (data.code === 0 && data.data) {
                availableDocuments = Array.isArray(data.data) ? data.data : [];
            }
        } catch (e) { console.error('Failed to pre-load docs for tags', e); }
    }

    const selectedDocs = [];
    const categoryMap = {}; // docID -> category

    // Collect all selected docs
    ['product', 'cases', 'faq', 'opinion'].forEach(cat => {
        (AppState.kbSelection[cat] || []).forEach(docId => {
            categoryMap[docId] = cat;
        });
    });

    // Filter available docs
    const allSelectedIds = Object.keys(categoryMap).map(id => parseInt(id));
    availableDocuments.forEach(doc => {
        const docId = parseInt(doc.id || doc.ID);
        if (allSelectedIds.includes(docId)) {
            selectedDocs.push({
                ...doc,
                _category: categoryMap[docId]
            });
        }
    });

    console.log('[renderSelectedDocuments] Available docs:', availableDocuments.length, 'Selected docs:', selectedDocs.length, 'IDs:', selectedDocs.map(d => d.id || d.ID));

    // 生成赛道标签
    const trackTags = (AppState.opinionTrackSelection || []).map(trackId => {
        const track = availableOpinionTracks.find(t => parseInt(t.id || t.ID) === trackId);
        const name = track ? (track.name || track.Name) : `赛道 #${trackId}`;
        return `
            <div class="kb-tag opinion" title="${escapeHtml(name)}">
                <i data-lucide="compass" style="width:12px;height:12px;"></i>
                <span class="kb-tag-name" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(name)}</span>
                <div class="kb-tag-remove" onclick="removeSelectedTrack(${trackId})" title="移除赛道">
                    <i data-lucide="x"></i>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = selectedDocs.map(doc => {
        const name = doc.name || doc.Name;
        const id = parseInt(doc.id || doc.ID);
        const category = doc._category;

        return `
            <div class="kb-tag ${category}" title="${escapeHtml(name)}">
                <span class="kb-tag-name" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(name)}</span>
                <div class="kb-tag-remove" onclick="removeSelectedKb(${id})" title="移除知识库">
                    <i data-lucide="x"></i>
                </div>
            </div>
        `;
    }).join('') + trackTags;

    if (window.lucide) lucide.createIcons();

    // 知识库标签更新后，重新计算 chat-container 的底部 padding
    // 使用 setTimeout 确保 DOM 更新完成
    setTimeout(() => {
        updateChatContainerPadding();
    }, 0);
}

/**
 * 快速移除已选中的知识库
 */
window.removeSelectedKb = function (docId) {
    const numericDocId = parseInt(docId);

    // Remove from all categories
    ['product', 'cases', 'faq', 'opinion'].forEach(cat => {
        const idx = AppState.kbSelection[cat].indexOf(numericDocId);
        if (idx > -1) {
            AppState.kbSelection[cat].splice(idx, 1);
        }
    });

    // Sync documentIds
    AppState.documentIds = [
        ...AppState.kbSelection.product,
        ...AppState.kbSelection.cases,
        ...AppState.kbSelection.faq,
        ...AppState.kbSelection.opinion
    ];

    // Trigger update if we have a session
    if (AppState.currentSessionId) {
        saveKbSelection(); // Saves to server and re-renders
    } else {
        renderSelectedDocuments(); // Just re-render UI
    }
}

/**
 * 快速移除已选中的系统赛道
 */
window.removeSelectedTrack = function (trackId) {
    const idx = AppState.opinionTrackSelection.indexOf(parseInt(trackId));
    if (idx > -1) {
        AppState.opinionTrackSelection.splice(idx, 1);
    }
    if (AppState.currentSessionId) {
        saveKbSelection();
    } else {
        renderSelectedDocuments();
    }
}

window.fillInput = function (txt) {
    const i = document.getElementById('chatInput');
    i.value = txt; i.focus();
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ==================== Customer Profile Modal Functions ====================

window.openCustomerProfileModal = function () {
    const modal = document.getElementById('customerProfileModal');
    if (modal) {
        // 重置表单
        const form = document.getElementById('newCustomerProfileForm');
        if (form) form.reset();

        modal.classList.add('open');

        // 开新对话时重置知识库和档案
        AppState.documentIds = [];
        AppState.customerProfile = {};
        renderSelectedDocuments();

        // 自动聚焦到第一个输入框
        setTimeout(() => {
            const firstInput = document.getElementById('newCustName');
            if (firstInput) firstInput.focus();
        }, 300);

        if (window.lucide) lucide.createIcons();
    }
}

window.closeCustomerProfileModal = function () {
    const modal = document.getElementById('customerProfileModal');
    if (modal) {
        modal.classList.remove('open');
    }

    // 如果用户选择跳过，直接创建空白会话
    AppState.currentSessionId = null;
    AppState.customerProfile = {};
    AppState.documentIds = [];
    renderSessions();
    renderSelectedDocuments();
    const welcomeScreen = document.getElementById('welcomeScreen');
    if (welcomeScreen) welcomeScreen.style.display = 'flex';
    const chatWrapper = document.getElementById('chatWrapper');
    if (chatWrapper) chatWrapper.innerHTML = '';
    resetProfileForm();
}

window.submitCustomerProfile = async function () {
    // 收集表单数据
    const profile = {
        name: document.getElementById('newCustName')?.value || '',
        stage: document.getElementById('newCustStage')?.value || 'DISCOVERY',
        other: document.getElementById('newCustOther')?.value || ''
    };

    // 验证必填字段
    if (!profile.name) {
        alert('请填写客户姓名');
        return;
    }

    // 更新应用状态
    AppState.customerProfile = profile;
    AppState.salesStage = profile.stage;

    // 立即创建会话，使用客户名字作为标题
    const sessionTitle = `${profile.name}`;
    const newSessionId = await createSession(sessionTitle);

    if (!newSessionId) {
        alert('创建会话失败，请重试');
        return;
    }

    // 切换到新会话并强制显示欢迎语
    await switchSession(newSessionId, true);

    // 关闭弹窗
    const modal = document.getElementById('customerProfileModal');
    if (modal) modal.classList.remove('open');

    // 更新侧边栏状态
    renderSessions();
    updateProfileForm();

    console.log('Customer profile saved and session created:', profile, 'Session ID:', newSessionId);
}

/* ==================== Profile Upload Logic ==================== */
// 存储当前上传的文件列表
let currentUploadedFiles = [];

function initProfileUpload() {
    const uploadZoneInput = document.getElementById('profileUploadZoneInput');
    const input = document.getElementById('profileFileInput');

    if (!uploadZoneInput || !input) return;

    // 点击上传区域触发文件选择
    uploadZoneInput.addEventListener('click', (e) => {
        // 防止点击已上传文件区域时触发 (虽然现在列表在区域外，但在新UI中点击区域本身仍应触发)
        if (e.target.closest('.profile-uploaded-files-list')) return;
        input.click();
    });

    // Drag & Drop
    uploadZoneInput.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZoneInput.classList.add('dragover');
    });

    uploadZoneInput.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadZoneInput.classList.remove('dragover');
    });

    uploadZoneInput.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZoneInput.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            addProfileFiles(files);
        }
    });

    input.addEventListener('change', (e) => {
        if (input.files.length > 0) {
            addProfileFiles(input.files);
        }
        // 清空 input value 以便允许重复选择相同文件 (如果用户删除了它)
        input.value = '';
    });

    // 监听文本输入，更新生成按钮状态和互斥状态
    const textarea = document.getElementById('profileInputTextarea');
    if (textarea) {
        textarea.addEventListener('input', () => {
            updateGenerateButtonState();
            updateProfileInputExclusion();
        });
    }
}

function addProfileFiles(files) {
    if (!files || files.length === 0) return;

    // 转换为数组
    const newFiles = Array.from(files);
    let updated = false;

    // 检查数量限制
    if (currentUploadedFiles.length + newFiles.length > 5) {
        showToast('最多只能上传 5 个文件', 'warning');
        // 尝试只添加部分能放下的? 或者直接拒绝? 
        // 这里选择添加能放下的部分
        const remainingSlots = 5 - currentUploadedFiles.length;
        if (remainingSlots <= 0) return;
        newFiles.length = remainingSlots;
    }

    newFiles.forEach(file => {
        // 简单的去重检查 (根据名字和大小)
        const exists = currentUploadedFiles.some(f => f.name === file.name && f.size === file.size);
        if (!exists) {
            currentUploadedFiles.push(file);
            updated = true;
        }
    });

    if (updated) {
        renderProfileUploadedFiles();
        updateGenerateButtonState();
        updateProfileInputExclusion();
    }
}

function removeProfileUploadedFile(index) {
    if (index >= 0 && index < currentUploadedFiles.length) {
        currentUploadedFiles.splice(index, 1);
        renderProfileUploadedFiles();
        updateGenerateButtonState();
        updateProfileInputExclusion();
    }
}

window.clearProfileUploadedFile = function () {
    currentUploadedFiles = [];
    renderProfileUploadedFiles();
    updateGenerateButtonState();
    updateProfileInputExclusion();
}

/**
 * 更新上传区域和文本输入的互斥状态
 * 两种输入方式只能选其一：有文件时禁用文本输入，有文本时禁用上传
 */
function updateProfileInputExclusion() {
    const uploadWrapper = document.getElementById('profileUploadWrapper');
    const textareaWrapper = document.getElementById('profileTextareaWrapper');
    if (!uploadWrapper || !textareaWrapper) return;

    const hasFiles = currentUploadedFiles.length > 0;
    const hasText = (document.getElementById('profileInputTextarea')?.value.trim().length || 0) > 0;

    uploadWrapper.classList.toggle('profile-input-disabled', hasText);
    textareaWrapper.classList.toggle('profile-input-disabled', hasFiles);
}

function renderProfileUploadedFiles() {
    const listContainer = document.getElementById('profileUploadedFilesList');

    if (!listContainer) return;

    if (currentUploadedFiles.length === 0) {
        listContainer.style.display = 'none';
        listContainer.innerHTML = '';
        return;
    }

    listContainer.style.display = 'flex'; // block or flex column? css says .profile-uploaded-file is flex. 
    // container should be column probably. 
    // We need to style the container in CSS or JS. 
    // Assuming container CSS handles children layout (e.g. flex-direction: column). 
    // If not, we might need to add style here or in HTML refactor.
    // For now, let's assume vertical list.
    listContainer.style.flexDirection = 'column';
    listContainer.style.gap = '8px';
    listContainer.style.marginTop = '12px';

    listContainer.innerHTML = currentUploadedFiles.map((file, index) => `
        <div class="profile-uploaded-file" style="display: flex;">
            <div class="profile-uploaded-file-icon">
                 <i data-lucide="${getDocIcon(file.name)}"></i>
            </div>
            <div class="profile-uploaded-file-info">
                <div class="profile-uploaded-file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
                <div class="profile-uploaded-file-size">${formatFileSize(file.size)}</div>
            </div>
            <button class="profile-uploaded-file-remove" onclick="removeProfileUploadedFile(${index})">
                <i data-lucide="x"></i>
            </button>
        </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}



// 暴露给 window 对象以便 HTML onclick 调用
window.removeProfileUploadedFile = removeProfileUploadedFile;

// 清除文件标签
window.clearFileTag = function (event) {
    if (event) event.stopPropagation();
    clearProfileUploadedFile();
}

// 重新生成档案
window.regenerateProfile = function () {
    // 进入输入模式，让用户可以选择重新上传或输入
    switchProfileStep('input');
}


/* ==================== Profile Simple Editor Logic ==================== */

function initProfileInteraction() {
    const editor = document.getElementById('profileEditorSimple');
    const textarea = document.getElementById('custNotes');

    if (!editor || !textarea) return;

    // 编辑器现在是只读的，用于显示渲染后的 Markdown
    // 不需要监听编辑事件，因为 contenteditable="false"
    console.log('[initProfileInteraction] Profile editor initialized in read-only mode');
}

// 同步编辑器内容到 textarea
function syncEditorToTextarea() {
    const editor = document.getElementById('profileEditorSimple');
    const textarea = document.getElementById('custNotes');
    if (!editor || !textarea) return;

    // 不要覆盖 textarea 中的原始 Markdown！
    // 编辑器显示的是渲染后的 HTML，不应该从这里提取内容
    // textarea 中保存的是原始 Markdown，应该保持不变
    console.warn('[syncEditorToTextarea] Skipping sync to preserve original Markdown format');
}

// 清理 Markdown 内容（移除代码块包裹）
function cleanMarkdownContent(content) {
    if (!content) return content;

    // 移除开头和结尾的 ```markdown``` 或 ``` 代码块包裹
    content = content.trim();

    // 检查是否被 ```markdown 包裹
    if (content.startsWith('```markdown') && content.endsWith('```')) {
        content = content.slice(11, -3).trim(); // 移除 ```markdown 和结尾的 ```
        console.log('[cleanMarkdownContent] Removed ```markdown wrapper');
    }
    // 检查是否被 ``` 包裹
    else if (content.startsWith('```') && content.endsWith('```')) {
        content = content.slice(3, -3).trim(); // 移除开头和结尾的 ```
        console.log('[cleanMarkdownContent] Removed ``` wrapper');
    }

    return content;
}

// 设置编辑器内容（从 Markdown 渲染）
function setEditorContent(markdownContent) {
    const editor = document.getElementById('profileEditorSimple');
    const textarea = document.getElementById('custNotes');

    if (!editor) return;

    if (markdownContent) {
        // 清理可能的代码块包裹
        markdownContent = cleanMarkdownContent(markdownContent);

        // 使用 marked 渲染 Markdown
        if (window.marked) {
            console.log('[setEditorContent] Rendering Markdown with marked');
            editor.innerHTML = marked.parse(markdownContent);
        } else {
            console.warn('[setEditorContent] marked library not available, showing plain text');
            editor.innerText = markdownContent;
        }
    } else {
        editor.innerHTML = '';
    }

    if (textarea) {
        textarea.value = markdownContent || '';
    }
}

// 获取编辑器内容（作为 Markdown）
function getEditorContent() {
    const textarea = document.getElementById('custNotes');
    return textarea ? textarea.value : '';
}

// 更新客户档案显示页状态
// 更新客户档案显示页状态
function updateDisplayPageState() {
    const p = AppState.customerProfile;
    const hasContent = p.notes && p.notes.trim().length > 0;

    const emptyState = document.getElementById('profileDisplayEmpty');
    const contentState = document.getElementById('profileDisplayContent');
    const leftBtn = document.getElementById('profileDisplayLeftBtn');
    const editBtn = document.getElementById('profileEditBtn');
    const saveBtn = document.getElementById('profileSaveBtn');

    if (hasContent) {
        // 有记录：显示内容，左下角"重新生成"，右下角"编辑"和"保存"
        if (emptyState) emptyState.style.display = 'none';
        if (contentState) contentState.style.display = 'flex';
        if (leftBtn) {
            leftBtn.innerHTML = '<span>重新生成</span>';
            if (window.lucide) lucide.createIcons();
        }
        if (editBtn) editBtn.style.display = 'inline-flex';
        if (saveBtn) saveBtn.style.display = 'none'; // 显示页不需要保存按钮
    } else {
        // 无记录：显示空状态，左下角"创建档案"，右下角隐藏编辑和保存
        if (emptyState) emptyState.style.display = 'flex';
        if (contentState) contentState.style.display = 'none';
        if (leftBtn) {
            leftBtn.innerHTML = '<i data-lucide="plus"></i><span>创建档案</span>';
            if (window.lucide) lucide.createIcons();
        }
        if (editBtn) editBtn.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'none';
    }
}

function updateProfileForm() {
    const p = AppState.customerProfile;
    const content = p.notes || '';

    // 设置编辑器内容
    setEditorContent(content);

    // 更新显示页状态
    updateDisplayPageState();

    // 显示显示页
    switchProfileStep('display');
}

// Override global save

// Override global save
window.saveCustomerProfileOnly = async function () {
    // 不需要同步 - textarea 中已经保存了原始 Markdown
    // 编辑器是只读的，用于显示渲染后的内容
    const textarea = document.getElementById('custNotes');

    console.log('[saveCustomerProfileOnly] Saving profile with Markdown format preserved');
    console.log('[saveCustomerProfileOnly] Content preview:', textarea?.value.substring(0, 200));

    const btn = event?.currentTarget;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 保存中...';
        if (window.lucide) lucide.createIcons();
    }

    const success = await persistProfile();

    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="check"></i><span>保存档案</span>';
        if (window.lucide) lucide.createIcons();
    }

    if (success) {
        console.log('Profile saved');
        // 显示保存成功通知
        showNotification('客户档案已保存', 'success');
        // 关闭弹窗
        toggleProfileModal(false);
    }
};

// 保存编辑后的 Markdown
window.saveProfileEdit = async function () {
    const editTextarea = document.getElementById('profileEditTextarea');
    const textarea = document.getElementById('custNotes');

    if (!editTextarea || !textarea) {
        showNotification('保存失败：未找到编辑器', 'error');
        return;
    }

    // 将编辑后的 Markdown 保存到隐藏的 textarea
    textarea.value = editTextarea.value;

    console.log('[saveProfileEdit] Saving edited Markdown');
    console.log('[saveProfileEdit] Content preview:', textarea.value.substring(0, 200));

    // 调用保存函数
    const success = await persistProfile();

    if (success) {
        // 更新显示内容
        setEditorContent(textarea.value);
        // 切换回显示页
        switchProfileStep('display');
        // 更新显示页状态
        updateDisplayPageState();
        showNotification('客户档案已保存', 'success');
    } else {
        showNotification('保存失败，请重试', 'error');
    }
};

// 取消编辑
window.cancelProfileEdit = function () {
    // 直接返回显示页，不保存编辑
    switchProfileStep('display');
};

/**
 * 显示通知
 * @param {string} message 消息内容
 * @param {string} type 类型: 'success', 'error', 'info'
 */
function showNotification(message, type = 'info') {
    // 检查是否已有通知容器
    let container = document.getElementById('notificationContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notificationContainer';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `notification-toast ${type}`;

    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-circle';

    toast.innerHTML = `
        <i data-lucide="${icon}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    // 动画进入
    setTimeout(() => toast.classList.add('show'), 10);

    // 自动移除
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * 显示 Toast 通知（与知识库管理页面统一的样式）
 * @param {string} message 消息内容
 * @param {string} type 类型: 'success', 'error', 'info'
 * @param {number} duration 显示时长（毫秒）
 */
function showToast(message, type = 'success', duration = 2000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconName = type === 'success' ? 'check-circle' :
        type === 'error' ? 'x-circle' : 'info';

    toast.innerHTML = `
        <i data-lucide="${iconName}" class="toast-icon"></i>
        <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    // 自动消失
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, duration);
}

/* ==================== Chat Style Analysis Feature (与客户档案统一交互逻辑) ==================== */

// 存储当前上传的文件信息
let chatStyleUploadedFile = null;

/**
 * Toggle chat style modal visibility
 * @param {boolean} show - Whether to show or hide the modal
 */
function toggleChatStyleModal(show) {
    const modal = document.getElementById('chatStyleModal');
    if (show) {
        modal.classList.add('open');
        // Initialize icons in modal
        if (window.lucide) lucide.createIcons();
        // Load saved chat style and update form (与客户档案保持一致)
        loadSavedChatStyle();
    } else {
        modal.classList.remove('open');
    }
}

// 切换语言指纹分析步骤
window.switchChatStyleStep = function (stepName) {
    // 隐藏所有步骤
    document.querySelectorAll('.profile-step').forEach(step => {
        step.classList.remove('active');
    });

    // 隐藏所有底部按钮
    document.getElementById('chatStyleFooterDisplay').style.display = 'none';
    document.getElementById('chatStyleFooterInput').style.display = 'none';

    // 显示对应步骤和按钮
    switch (stepName) {
        case 'display':
            document.getElementById('chatStyleStepDisplay').classList.add('active');
            document.getElementById('chatStyleFooterDisplay').style.display = 'flex';
            document.getElementById('chatStyleModalTitle').textContent = '语言风格';
            break;
        case 'input':
            document.getElementById('chatStyleStepInput').classList.add('active');
            document.getElementById('chatStyleFooterInput').style.display = 'flex';
            document.getElementById('chatStyleModalTitle').textContent = '创建语言风格';
            // 初始化生成按钮状态
            window.updateChatStyleGenerateButtonState();
            break;
        case 'analyzing':
            document.getElementById('chatStyleStepAnalyzing').classList.add('active');
            document.getElementById('chatStyleModalTitle').textContent = '生成语言风格';
            break;
    }
};

// 返回语言指纹显示页
window.returnToChatStyleDisplayPage = function () {
    // 清空输入
    document.getElementById('chatStyleInputTextarea').value = '';
    window.clearChatStyleUploadedFile();
    // 返回显示页
    switchChatStyleStep('display');
};

// 更新生成按钮状态（检查是否有输入）
window.updateChatStyleGenerateButtonState = function () {
    const file = chatStyleUploadedFile;
    const text = document.getElementById('chatStyleInputTextarea').value.trim();
    const generateBtn = document.getElementById('chatStyleGenerateBtn');

    if (generateBtn) {
        generateBtn.disabled = !file && !text;
    }
};

// 清除已上传的文件
window.clearChatStyleUploadedFile = function (event) {
    if (event) event.stopPropagation();
    chatStyleUploadedFile = null;
    document.getElementById('chatStyleUploadZoneInput').style.display = 'flex';
    document.getElementById('chatStyleUploadedFile').style.display = 'none';
    document.getElementById('chatStyleFileInput').value = '';
    // 更新生成按钮状态
    window.updateChatStyleGenerateButtonState();
};

/**
 * 加载保存的聊天风格分析结果（与客户档案 updateProfileForm 保持一致）
 */
async function loadSavedChatStyle() {
    try {
        const response = await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/analyze-chat-style`, {
            method: 'GET'
        });
        const res = await response.json();

        if (res.code === 0 && res.data && res.data.style) {
            // 如果有历史记录，设置编辑器内容并显示显示页
            setChatStyleEditorContent(res.data.style);
            updateChatStyleDisplayPageState();
            switchChatStyleStep('display');
        } else {
            // 没有历史记录，显示空状态
            updateChatStyleDisplayPageState();
            switchChatStyleStep('display');
            // 清空输入
            document.getElementById('chatStyleInputTextarea').value = '';
            window.clearChatStyleUploadedFile();
        }
    } catch (e) {
        console.warn('Failed to load saved chat style:', e);
        // 出错时显示空状态
        updateChatStyleDisplayPageState();
        switchChatStyleStep('display');
        // 清空输入
        document.getElementById('chatStyleInputTextarea').value = '';
        window.clearChatStyleUploadedFile();
    }
}

// 更新语言指纹显示页状态
function updateChatStyleDisplayPageState() {
    const content = getChatStyleEditorContent();
    const hasContent = content && content.trim().length > 0;

    const emptyState = document.getElementById('chatStyleDisplayEmpty');
    const contentState = document.getElementById('chatStyleDisplayContent');
    const leftBtn = document.getElementById('chatStyleDisplayLeftBtn');
    const saveBtn = document.getElementById('chatStyleSaveBtn');

    if (hasContent) {
        // 有记录：显示内容，左下角"重新生成"，右下角"保存"
        if (emptyState) emptyState.style.display = 'none';
        if (contentState) contentState.style.display = 'flex';
        if (leftBtn) {
            leftBtn.innerHTML = '<span>重新生成</span>';
        }
        if (saveBtn) saveBtn.style.display = 'inline-flex';
    } else {
        // 无记录：显示空状态，左下角"创建档案"，右下角隐藏保存
        if (emptyState) emptyState.style.display = 'flex';
        if (contentState) contentState.style.display = 'none';
        if (leftBtn) {
            leftBtn.innerHTML = '<i data-lucide="plus"></i><span>创建档案</span>';
            if (window.lucide) lucide.createIcons();
        }
        if (saveBtn) saveBtn.style.display = 'none';
    }
}

/**
 * 重置聊天风格分析表单（清空状态）
 */
function resetChatStyleForm() {
    // 清空编辑器内容
    setChatStyleEditorContent('');

    // 清空文本输入
    document.getElementById('chatStyleInputTextarea').value = '';

    // 清空文件
    const fileInput = document.getElementById('chatStyleFileInput');
    if (fileInput) fileInput.value = '';

    // 清空已上传文件
    window.clearChatStyleUploadedFile();

    // 重置上传文件变量
    chatStyleUploadedFile = null;
}

/**
 * 开始生成语言指纹档案（与客户档案 startProfileGeneration 保持一致）
 */
window.startChatStyleGeneration = async function () {
    const file = chatStyleUploadedFile;
    const text = document.getElementById('chatStyleInputTextarea').value.trim();

    // 检查是否有输入
    if (!file && !text) {
        showNotification('请上传文件或输入文本内容', 'warning');
        return;
    }

    // 切换到分析中状态
    switchChatStyleStep('analyzing');

    let analysisResult = '';
    let isStreamingMode = false; // 标记是否使用了流式处理
    const chatStyleDisplay = document.getElementById('chatStyleEditorSimple');

    try {
        if (file) {
            // Upload file for analysis
            const formData = new FormData();
            formData.append('file', file);

            console.log('[analyze-chat-style] Sending file:', file.name, file.size);

            const response = await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/analyze-chat-style`, {
                method: 'POST',
                body: formData
            });

            console.log('[analyze-chat-style] Response status:', response.status);
            console.log('[analyze-chat-style] Content-Type:', response.headers.get('content-type'));

            if (!response.ok) throw new Error('分析请求失败: ' + response.status);

            const contentType = response.headers.get('content-type') || '';

            // 检查是否是 SSE 流式响应
            const isSSE = contentType.includes('text/event-stream') ||
                contentType.includes('text/plain') ||
                contentType.includes('application/octet-stream');

            if (isSSE) {
                console.log('[analyze-chat-style] Processing as SSE stream, content-type:', contentType);
                isStreamingMode = true; // 标记使用了流式处理

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let hasReceivedData = false;
                let startTime = Date.now();

                while (true) {
                    const { done, value } = await reader.read();

                    // 超时检查（300秒总超时）
                    if (Date.now() - startTime > 300000) {
                        throw new Error('请求超时，请稍后重试');
                    }

                    if (done) {
                        console.log('[analyze-chat-style] Stream done');
                        break;
                    }

                    hasReceivedData = true;
                    const decoded = decoder.decode(value, { stream: true });
                    buffer += decoded;

                    console.log('[analyze-chat-style] Received chunk:', decoded.substring(0, 200));

                    // SSE 事件以 \n\n 分隔
                    let chunks = buffer.split('\n\n');
                    if (chunks.length === 1) {
                        const lines = buffer.split('\n');
                        if (lines.length > 1) {
                            buffer = lines.pop() || '';
                            chunks = lines;
                        }
                    } else {
                        buffer = chunks.pop() || '';
                    }

                    for (const chunk of chunks) {
                        const trimmedChunk = chunk.trim();
                        if (!trimmedChunk) continue;

                        console.log('[analyze-chat-style] Processing chunk:', trimmedChunk.substring(0, 200));

                        const lines = trimmedChunk.split('\n');
                        for (const line of lines) {
                            const trimmedLine = line.trim();
                            if (!trimmedLine.startsWith('data: ')) continue;

                            const dataStr = trimmedLine.slice(6).trim();
                            if (!dataStr) continue;

                            console.log('[analyze-chat-style] Data string:', dataStr.substring(0, 200));

                            try {
                                const event = JSON.parse(dataStr);
                                console.log('[analyze-chat-style] Event type:', event.type);

                                if (event.type === 'token') {
                                    analysisResult += event.data;
                                    // 切换到显示页（如果是第一个 token）
                                    if (document.getElementById('chatStyleStepAnalyzing').classList.contains('active')) {
                                        switchChatStyleStep('display');
                                        // 强制显示内容区域（流式输出开始时立即显示）
                                        const emptyState = document.getElementById('chatStyleDisplayEmpty');
                                        const contentState = document.getElementById('chatStyleDisplayContent');
                                        if (emptyState) emptyState.style.display = 'none';
                                        if (contentState) contentState.style.display = 'flex';
                                    }
                                    // 实时渲染 Markdown（同步更新，立即显示）
                                    if (window.marked) {
                                        chatStyleDisplay.innerHTML = marked.parse(analysisResult);
                                    } else {
                                        chatStyleDisplay.textContent = analysisResult;
                                    }
                                    // 自动滚动到底部
                                    chatStyleDisplay.scrollTop = chatStyleDisplay.scrollHeight;
                                } else if (event.type === 'status') {
                                    console.log('[analyze-chat-style] Status:', event.data);
                                } else if (event.type === 'done') {
                                    if (event.analysis !== undefined || event.style !== undefined) {
                                        analysisResult = event.analysis || event.style || analysisResult;
                                        console.log('[analyze-chat-style] Done event received, analysis length:', analysisResult.length);
                                    }
                                    if (!analysisResult || analysisResult.trim() === '') {
                                        console.warn('[analyze-chat-style] Analysis is empty in done event');
                                    }
                                } else if (event.type === 'error') {
                                    throw new Error(event.data);
                                }
                            } catch (e) {
                                console.warn('[analyze-chat-style] Failed to parse SSE event:', e, dataStr);
                            }
                        }
                    }
                }

                // 如果内容为空，报错
                if (!analysisResult || analysisResult.trim() === '') {
                    throw new Error('分析结果为空，请检查文件内容或稍后重试');
                }
            } else {
                // 非流式响应，按普通 JSON 处理
                console.log('[analyze-chat-style] Processing as JSON response');
                const result = await response.json();
                console.log('[analyze-chat-style] JSON result:', result);

                if (result.code !== 0) {
                    throw new Error(result.message || '分析失败');
                }

                analysisResult = result.data?.analysis || result.data?.style || '暂无分析结果';
                switchChatStyleStep('display');
            }
        } else {
            // Send text directly
            const formData = new FormData();
            formData.append('text', text);

            console.log('[analyze-chat-style] Sending text, length:', text.length);

            const response = await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/analyze-chat-style`, {
                method: 'POST',
                body: formData
            });

            console.log('[analyze-chat-style] Response status:', response.status);
            console.log('[analyze-chat-style] Content-Type:', response.headers.get('content-type'));

            if (!response.ok) throw new Error('分析请求失败: ' + response.status);

            const contentType = response.headers.get('content-type') || '';

            // 检查是否是 SSE 流式响应
            const isSSE = contentType.includes('text/event-stream') ||
                contentType.includes('text/plain') ||
                contentType.includes('application/octet-stream');

            if (isSSE) {
                console.log('[analyze-chat-style] Processing as SSE stream (text input), content-type:', contentType);
                isStreamingMode = true; // 标记使用了流式处理

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let startTime = Date.now();

                while (true) {
                    const { done, value } = await reader.read();

                    // 超时检查（300秒总超时）
                    if (Date.now() - startTime > 300000) {
                        throw new Error('请求超时，请稍后重试');
                    }

                    if (done) {
                        console.log('[analyze-chat-style] Stream done (text input)');
                        break;
                    }

                    const decoded = decoder.decode(value, { stream: true });
                    buffer += decoded;

                    console.log('[analyze-chat-style] Received chunk (text input):', decoded.substring(0, 200));

                    // SSE 事件以 \n\n 分隔
                    let chunks = buffer.split('\n\n');
                    if (chunks.length === 1) {
                        const lines = buffer.split('\n');
                        if (lines.length > 1) {
                            buffer = lines.pop() || '';
                            chunks = lines;
                        }
                    } else {
                        buffer = chunks.pop() || '';
                    }

                    for (const chunk of chunks) {
                        const trimmedChunk = chunk.trim();
                        if (!trimmedChunk) continue;

                        const lines = trimmedChunk.split('\n');
                        for (const line of lines) {
                            const trimmedLine = line.trim();
                            if (!trimmedLine.startsWith('data: ')) continue;

                            const dataStr = trimmedLine.slice(6).trim();
                            if (!dataStr) continue;

                            try {
                                const event = JSON.parse(dataStr);
                                console.log('[analyze-chat-style] Event type (text input):', event.type);

                                if (event.type === 'token') {
                                    analysisResult += event.data;
                                    // 切换到显示页（如果是第一个 token）
                                    if (document.getElementById('chatStyleStepAnalyzing').classList.contains('active')) {
                                        switchChatStyleStep('display');
                                        // 强制显示内容区域
                                        const emptyState = document.getElementById('chatStyleDisplayEmpty');
                                        const contentState = document.getElementById('chatStyleDisplayContent');
                                        if (emptyState) emptyState.style.display = 'none';
                                        if (contentState) contentState.style.display = 'flex';
                                    }
                                    // 实时渲染 Markdown
                                    if (window.marked) {
                                        chatStyleDisplay.innerHTML = marked.parse(analysisResult);
                                    } else {
                                        chatStyleDisplay.textContent = analysisResult;
                                    }
                                    // 自动滚动到底部
                                    chatStyleDisplay.scrollTop = chatStyleDisplay.scrollHeight;
                                } else if (event.type === 'status') {
                                    console.log('[analyze-chat-style] Status (text input):', event.data);
                                } else if (event.type === 'done') {
                                    if (event.analysis !== undefined || event.style !== undefined) {
                                        analysisResult = event.analysis || event.style || analysisResult;
                                        console.log('[analyze-chat-style] Done event received (text input), analysis length:', analysisResult.length);
                                    }
                                } else if (event.type === 'error') {
                                    throw new Error(event.data);
                                }
                            } catch (e) {
                                console.warn('[analyze-chat-style] Failed to parse SSE event (text input):', e, dataStr);
                            }
                        }
                    }
                }

                // 如果内容为空，报错
                if (!analysisResult || analysisResult.trim() === '') {
                    throw new Error('分析结果为空，请检查输入内容或稍后重试');
                }
            } else {
                // 非流式响应，按普通 JSON 处理
                console.log('[analyze-chat-style] Processing as JSON response (text input)');
                const result = await response.json();

                if (result.code !== 0) {
                    throw new Error(result.message || '分析失败');
                }

                analysisResult = result.data?.analysis || result.data?.style || '暂无分析结果';
                switchChatStyleStep('display');
            }
        }

        // 完成后的统一步骤
        // 只在非流式模式下设置编辑器内容（流式模式已经实时更新了）
        if (!isStreamingMode) {
            setChatStyleEditorContent(analysisResult);
        } else {
            // 流式模式下，需要同步内容到隐藏的 textarea（用于保存）
            const textarea = document.getElementById('chatStyleNotes');
            if (textarea) {
                textarea.value = analysisResult;
            }
        }

        // 自动保存到数据库
        const saveSuccess = await persistChatStyle();

        if (saveSuccess) {
            showNotification('语言风格已生成并保存', 'success');
        }

        // 清空输入并返回显示页
        document.getElementById('chatStyleInputTextarea').value = '';
        window.clearChatStyleUploadedFile();

        // 更新显示页状态
        updateChatStyleDisplayPageState();

    } catch (error) {
        console.error('Chat style generation failed:', error);
        showNotification('生成失败：' + error.message, 'error');
        // 返回输入状态
        switchChatStyleStep('input');
    }
};

// 持久化语言指纹档案
async function persistChatStyle() {
    const content = getChatStyleEditorContent();
    if (!content.trim()) {
        return false;
    }

    try {
        const response = await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/analyze-chat-style`, {
            method: 'PUT',
            body: JSON.stringify({ style: content })
        });

        const result = await response.json();
        return result.code === 0;
    } catch (e) {
        console.error('Failed to save chat style:', e);
        return false;
    }
}

/**
 * 设置聊天风格分析编辑器内容（与客户档案 setEditorContent 一致）
 */
function setChatStyleEditorContent(content) {
    const editor = document.getElementById('chatStyleEditorSimple');
    const textarea = document.getElementById('chatStyleNotes');

    if (!editor) return;

    if (content) {
        // 使用 marked 渲染 Markdown
        if (window.marked) {
            editor.innerHTML = marked.parse(content);
        } else {
            editor.innerText = content;
        }
    } else {
        editor.innerHTML = '';
    }

    if (textarea) {
        textarea.value = content || '';
    }
}

/**
 * 获取聊天风格分析编辑器内容
 */
function getChatStyleEditorContent() {
    const textarea = document.getElementById('chatStyleNotes');
    return textarea ? textarea.value : '';
}

/**
 * 更新文件标签显示（已废弃，使用新的 handleChatStyleUpload 代替）
 * 保留此函数以兼容旧代码调用
 */
function updateChatStyleFileTag(filename) {
    // 新的实现已在 handleChatStyleUpload 中处理
    // 此函数保留以避免其他代码调用出错
}

/**
 * 清除文件标签（与客户档案 clearFileTag 一致）
 */
window.clearChatStyleFileTag = function (event) {
    if (event) event.stopPropagation();
    window.clearChatStyleUploadedFile();
};

/**
 * 重新分析（与客户档案 regenerateProfile 一致）
 */
window.regenerateChatStyle = function () {
    // 切换到输入模式，让用户可以重新上传或输入
    switchChatStyleStep('input');
};

/**
 * 保存聊天风格分析结果（与客户档案 saveCustomerProfileOnly 一致）
 */
window.saveChatStyleOnly = async function () {
    // 同步编辑器内容到 textarea
    const editor = document.getElementById('chatStyleEditorSimple');
    const textarea = document.getElementById('chatStyleNotes');

    if (editor && textarea) {
        // 保存编辑器的纯文本内容
        textarea.value = editor.innerText || '';
    }

    const content = getChatStyleEditorContent();
    if (!content.trim()) {
        showNotification('没有内容可保存', 'error');
        return;
    }

    const btn = event?.currentTarget;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> 保存中...';
        if (window.lucide) lucide.createIcons();
    }

    try {
        // 调用保存 API
        const response = await authManager.fetchWithAuth(`${API_BASE_URL}/v1/sales-rag/analyze-chat-style`, {
            method: 'PUT',
            body: JSON.stringify({ style: content })
        });

        const result = await response.json();

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>保存</span>';
            if (window.lucide) lucide.createIcons();
        }

        if (result.code === 0) {
            showNotification('语言风格已保存', 'success');
            // 关闭弹窗
            toggleChatStyleModal(false);
        } else {
            throw new Error(result.message || '保存失败');
        }
    } catch (e) {
        console.error('Failed to save chat style:', e);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>保存</span>';
            if (window.lucide) lucide.createIcons();
        }
        showNotification(e.message || '保存失败，请重试', 'error');
    }
};

/**
 * 初始化聊天风格分析上传功能（与客户档案 initProfileUpload 一致）
 */
function initChatStyleUpload() {
    const uploadZoneInput = document.getElementById('chatStyleUploadZoneInput');
    const input = document.getElementById('chatStyleFileInput');

    if (!uploadZoneInput || !input) return;

    // 点击上传区域触发文件选择
    uploadZoneInput.addEventListener('click', (e) => {
        // 防止点击已上传文件区域时触发
        if (e.target.closest('.profile-uploaded-file') || e.target.closest('.profile-uploaded-file-remove')) return;
        input.click();
    });

    // Drag & Drop
    uploadZoneInput.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZoneInput.classList.add('dragover');
    });

    uploadZoneInput.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadZoneInput.classList.remove('dragover');
    });

    uploadZoneInput.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZoneInput.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleChatStyleUpload(files[0]);
        }
    });

    input.addEventListener('change', (e) => {
        if (input.files.length > 0) {
            handleChatStyleUpload(input.files[0]);
        }
    });

    // 监听文本输入，更新生成按钮状态
    const textarea = document.getElementById('chatStyleInputTextarea');
    if (textarea) {
        textarea.addEventListener('input', window.updateChatStyleGenerateButtonState);
    }
}

// 处理语言指纹文件上传
function handleChatStyleUpload(file) {
    if (!file) return;

    // 保存当前上传的文件
    chatStyleUploadedFile = file;

    // 显示已上传文件
    document.getElementById('chatStyleUploadZoneInput').style.display = 'none';
    document.getElementById('chatStyleUploadedFile').style.display = 'flex';
    document.getElementById('chatStyleUploadedFileName').textContent = file.name;
    document.getElementById('chatStyleUploadedFileSize').textContent = formatFileSize(file.size);

    // 刷新图标
    if (window.lucide) lucide.createIcons();

    // 清空文件输入，允许重复选择同一文件
    document.getElementById('chatStyleFileInput').value = '';

    // 更新生成按钮状态
    window.updateChatStyleGenerateButtonState();
}

/**
 * 初始化聊天风格分析编辑器交互（与客户档案 initProfileInteraction 一致）
 */
function initChatStyleEditor() {
    const editor = document.getElementById('chatStyleEditorSimple');
    const textarea = document.getElementById('chatStyleNotes');

    if (!editor || !textarea) return;

    // 监听编辑器内容变化，同步到隐藏的 textarea
    editor.addEventListener('input', () => {
        syncChatStyleEditorToTextarea();
    });

    // 监听粘贴事件，处理纯文本粘贴
    editor.addEventListener('paste', (e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    });
}

/**
 * 同步聊天风格分析编辑器内容到 textarea
 */
function syncChatStyleEditorToTextarea() {
    const editor = document.getElementById('chatStyleEditorSimple');
    const textarea = document.getElementById('chatStyleNotes');
    if (!editor || !textarea) return;

    textarea.value = editor.innerText || '';
}

/**
 * Initialize chat style feature event listeners
 */
function initChatStyleFeature() {
    const chatStyleBtn = document.getElementById('chatStyleBtn');

    if (chatStyleBtn) {
        chatStyleBtn.addEventListener('click', () => toggleChatStyleModal(true));
    }

    // 初始化上传功能
    initChatStyleUpload();

    // 初始化编辑器交互
    initChatStyleEditor();

    // Close modal when clicking outside
    const modal = document.getElementById('chatStyleModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                toggleChatStyleModal(false);
            }
        });
    }
}

// chat style 初始化由 __salesAgentLegacyInit 统一触发，避免重复绑定

// ==================== Actions Helpers ====================

window.handleCopyMessage = async function (btn) {
    const bubble = btn.closest('.message')?.querySelector('.msg-bubble');
    if (!bubble) return;

    let textToCopy = '';

    // Check if it's AI message (has actions inside)
    if (btn.classList.contains('ai-action-btn')) {
        // Clone the bubble to not affect display
        const clone = bubble.cloneNode(true);
        const actions = clone.querySelector('.ai-actions-container');
        if (actions) actions.remove();
        textToCopy = clone.innerText;
    } else {
        // User message
        textToCopy = bubble.innerText;
    }

    textToCopy = textToCopy.trim();
    if (!textToCopy) return;

    try {
        // Try modern Clipboard API first (requires secure context)
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(textToCopy);
        } else {
            // Fallback for non-secure contexts (e.g. http)
            const textArea = document.createElement("textarea");
            textArea.value = textToCopy;

            // Ensure textArea is not visible but part of DOM
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            document.body.appendChild(textArea);

            textArea.focus();
            textArea.select();

            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);

            if (!successful) throw new Error('浏览器不支持复制功能');
        }

        // Success Feedback
        if (typeof showToast === 'function') {
            showToast('已复制', 'success');
        }

        // Force visible state immediately for user buttons
        if (!btn.classList.contains('ai-action-btn')) {
            btn.classList.add('copied');
        }

        const originalHTML = btn.innerHTML;
        const isIconOnly = !btn.textContent.trim();

        if (isIconOnly) {
            btn.innerHTML = '<i data-lucide="check" width="14"></i>';
        } else {
            btn.innerHTML = '<i data-lucide="check" width="14"></i> 已复制';
            btn.style.color = 'var(--primary)';
        }

        if (window.lucide) lucide.createIcons();

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.color = '';
            if (!btn.classList.contains('ai-action-btn')) {
                btn.classList.remove('copied');
            }
            if (window.lucide) lucide.createIcons();
        }, 2000);

    } catch (err) {
        console.error('Copy failed', err);
        if (typeof showToast === 'function') {
            showToast('复制失败', 'error');
        } else {
            alert('复制失败');
        }
    }
};

window.handleRegenerate = function () {
    const userMessages = document.querySelectorAll('.message.user .msg-bubble');
    if (userMessages.length > 0) {
        const lastMsg = userMessages[userMessages.length - 1].innerText;
        const input = document.getElementById('chatInput');
        input.value = lastMsg;
        // Trigger send logic
        sendMessage();
    }
};

// ==================== Citation Modal Event Listeners ====================

/**
 * Initialize citation modal event listeners
 */
function initCitationModal() {
    // Close modal when clicking outside
    const modal = document.getElementById('citationModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                toggleCitationModal(false);
            }
        });
    }

    // Close on Escape key
    window._citationEscHandler = (e) => {
        if (e.key === 'Escape') {
            const citationModal = document.getElementById('citationModal');
            if (citationModal && citationModal.classList.contains('open')) {
                toggleCitationModal(false);
            }
        }
    };
    document.addEventListener('keydown', window._citationEscHandler);
}

// citation 初始化由 __salesAgentLegacyInit 统一触发，避免重复绑定

/* ==================== Image Preview Modal Logic (新) ==================== */

/**
 * 初始化图片预览模态框 HTML 并绑定全局事件
 */
function initImagePreviewModal() {
    if (document.getElementById('imagePreviewModal')) return;

    const modal = document.createElement('div');
    modal.id = 'imagePreviewModal';
    modal.className = 'image-preview-modal';
    modal.innerHTML = `
        <div class="image-preview-content">
            <button class="image-preview-close" onclick="closeImageModal()">
                <i data-lucide="x"></i>
            </button>
            <img src="" alt="预览图片" id="imagePreviewTarget">
        </div>
    `;

    document.body.appendChild(modal);

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeImageModal();
    });

    if (window.lucide) lucide.createIcons();
}

/**
 * 打开图片预览模态框
 * @param {string} url 图片链接
 */
function openImageModal(url) {
    if (!url) return;
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('imagePreviewTarget');
    if (!modal || !img) return;

    img.src = url;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('open'), 10);
}

/**
 * 关闭图片预览模态框
 */
function closeImageModal() {
    const modal = document.getElementById('imagePreviewModal');
    if (!modal) return;

    modal.classList.remove('open');
    setTimeout(() => {
        modal.style.display = 'none';
        document.getElementById('imagePreviewTarget').src = '';
    }, 300);
}

/* ==================== Cleanup (供 Vue unmount 调用) ==================== */
/**
 * 清理 legacy 脚本注册的 document 级事件监听器。
 * 由 salesAgent.ts 的 unmountLegacy() 调用。
 */
window.__salesAgentLegacyCleanup = function () {
    // 1. 移除 document click 监听
    document.removeEventListener('click', closeAllSessionMenus);

    // 2. 移除 SalesStageManager 的 document click 监听
    if (SalesStageManager._stageDocClickHandler) {
        document.removeEventListener('click', SalesStageManager._stageDocClickHandler);
        SalesStageManager._stageDocClickHandler = null;
    }

    // 3. 移除 citation modal 的 Escape 监听
    if (window._citationEscHandler) {
        document.removeEventListener('keydown', window._citationEscHandler);
        window._citationEscHandler = null;
    }

    // 4. 取消进行中的 SSE 流
    if (window.__sseAbortController) {
        window.__sseAbortController.abort();
        window.__sseAbortController = null;
    }

    // 5. 清理滚动防抖计时器
    if (window.scrollDebounceTimer) {
        clearTimeout(window.scrollDebounceTimer);
        window.scrollDebounceTimer = null;
    }
    delete window.lastScrollTop;

    // 6. 重置 legacyBound 标记，允许下次进入时重新初始化
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
        delete chatContainer.dataset.legacyBound;
    }

    // 7. 重置 AppState
    AppState.currentSessionId = null;
    AppState.sessions = [];
    AppState.messages = [];
    AppState.images = [];
};
