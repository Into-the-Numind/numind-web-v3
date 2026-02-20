<template>

    <div class="app-container">
        <!-- 1. SOP-Style Home Button (Top Left) -->
        <a href="/" class="back-to-home-btn" title="返回首页" @click.prevent="goHome">
            <i data-lucide="home"></i>
        </a>

        <!-- 2. Clean Sidebar -->
        <aside class="sidebar" id="sidebar">
            <!-- New Chat Button at Top -->
            <button class="new-chat-btn" id="newChatBtn">
                <i data-lucide="plus"></i>
                <span>新对话</span>
            </button>

            <div class="sessions-list" id="sessionsList">
                <!-- Session Items -->
            </div>
        </aside>

        <!-- Sidebar Overlay (Mobile) -->
        <div class="sidebar-overlay" id="sidebarOverlay"></div>

        <!-- 3. Main Stage -->
        <!-- 3. Main Stage -->
        <main class="main-stage">
            <header class="main-header">
                <div class="header-left">
                    <h2 class="session-title" id="currentSessionTitle">新对话</h2>
                </div>
                <div class="header-right">
                    <button class="header-btn" id="kbBtn" title="知识库">
                        <i data-lucide="library"></i>
                    </button>
                    <button class="header-btn" id="profileBtn" title="客户档案">
                        <i data-lucide="user"></i>
                    </button>
                    <button class="header-btn" id="chatStyleBtn" title="语言风格">
                        <i data-lucide="message-circle"></i>
                    </button>

                    <div class="stage-pill" id="stageTrigger">
                        <div class="stage-dot" id="stageDot"></div>
                        <span id="currentStageText">未设置阶段</span>
                        <i data-lucide="chevron-down" style="width: 14px; height: 14px; opacity: 0.5;"></i>

                        <div class="stage-dropdown" id="stageDropdown">
                            <!-- Options filled by JS -->
                        </div>
                    </div>

                    <button class="header-btn" id="mobileMenuBtn" style="display:none;">
                        <i data-lucide="menu"></i>
                    </button>
                </div>
            </header>

            <!-- Chat Area -->
            <div class="chat-container" id="chatContainer">
                <!-- Welcome Screen -->
                <div class="welcome-screen" id="welcomeScreen">
                    <div class="welcome-content">
                        <!-- AI Icon -->
                        <div class="welcome-icon">
                            <i data-lucide="bot"></i>
                        </div>

                        <!-- Heading -->
                        <h1 class="welcome-title">你好，我是销售智能助手</h1>
                        <p class="welcome-subtitle">我能基于知识库为你生成话术或提供策略建议</p>

                        <!-- Suggestion Cards (仅展示提示，不可点击) -->
                        <div class="suggestion-cards">
                            <div class="suggestion-card suggestion-card--static">
                                <i data-lucide="message-square"></i>
                                <span class="suggestion-text">客户说"太贵了"，帮我回复</span>
                            </div>

                            <div class="suggestion-card suggestion-card--static">
                                <i data-lucide="help-circle"></i>
                                <span class="suggestion-text">客户进入犹豫期，如何跟进？</span>
                            </div>

                            <div class="suggestion-card suggestion-card--static">
                                <i data-lucide="scale"></i>
                                <span class="suggestion-text">客户问我们和竞品的区别</span>
                            </div>
                        </div>

                        <!-- Bottom Hint -->
                        <p class="welcome-hint">
                            <i data-lucide="info"></i>
                            <span>配置知识库，让回复更精准</span>
                        </p>
                    </div>
                </div>

                <div class="chat-wrapper" id="chatWrapper">
                    <!-- Messages will be appended here -->

                    <!-- 回到底部按钮 -->
                    <button class="scroll-to-bottom-btn" id="scrollToBottomBtn" style="display: none;">
                        <i data-lucide="arrow-down"></i>
                        <span>回到底部</span>
                    </button>
                </div>
            </div>

            <!-- Input Area -->
            <div class="input-stage">
                <!-- Selected KB Display -->
                <div id="selectedKbContainer" class="selected-kb-container"></div>

                <!-- Start Chat Button (Hidden by default) -->
                <div id="startChatContainer" class="start-chat-container" style="display: none;">
                    <button class="btn-primary start-chat-btn" onclick="document.getElementById('newChatBtn').click()">
                        <i data-lucide="plus"></i>
                        <span>创建新对话</span>
                    </button>
                </div>

                <div class="input-floating-container" id="inputContainer">
                    <!-- 展开/收起按钮 - 右上角 -->
                    <button class="expand-btn" id="expandBtn" title="展开/收起输入框">
                        <i data-lucide="maximize-2"></i>
                    </button>
                    <!-- 图片预览区域 (动态生成) -->
                    <div id="imagePreviewContainer" class="image-preview-container" style="display: none;"></div>

                    <textarea id="chatInput" class="chat-input" placeholder="输入消息..." rows="1"></textarea>

                    <div class="input-toolbar">
                        <div class="toolbar-left">
                            <button class="mode-toggle-btn sales-mode" id="modeToggleBtn" title="点击切换对话模式">
                                <span class="mode-indicator"></span>
                                <span id="modeLabel">销售话术</span>
                            </button>
                            <button class="deep-thinking-btn" id="deepThinkingBtn" title="开启后大模型会展示思考过程">
                                <i data-lucide="brain"></i>
                                <span>深度思考</span>
                            </button>
                            <!-- 图片上传按钮 -->
                            <button class="image-upload-btn" id="imageUploadBtn" title="上传图片回复">
                                <i data-lucide="image"></i>
                                <span>图片</span>
                            </button>
                        </div>
                        <div class="toolbar-right">
                            <button class="send-btn" id="sendBtn">
                                <i data-lucide="arrow-up"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <!-- Hidden Image Upload Input -->
    <input type="file" id="imageInput" hidden accept="image/*">

    <!-- 4. Restored Components -->

    <!-- Customer Profile Modal (重构: 分步骤流程) -->
    <div class="modal-overlay" id="profileModal">
        <div class="modal-card profile-modal-card">
            <!-- Header -->
            <div class="profile-modal-header">
                <span class="modal-title" id="profileModalTitle">客户档案</span>
                <button class="modal-close-btn" onclick="toggleProfileModal(false)">
                    <i data-lucide="x"></i>
                </button>
            </div>

            <div class="profile-modal-body">
                <!-- Step 1: 客户档案显示页（有记录显示内容，无记录显示空状态） -->
                <div class="profile-step profile-step-display" id="profileStepDisplay">
                    <!-- 空状态（无记录时显示） -->
                    <div class="profile-display-empty" id="profileDisplayEmpty">
                        <i data-lucide="file-text"></i>
                        <span>未生成客户档案</span>
                    </div>
                    <!-- 有记录时显示编辑器 -->
                    <div class="profile-editor-wrapper" id="profileDisplayContent" style="display: none;">
                        <div class="profile-editor-simple" id="profileEditorSimple" contenteditable="false"
                            data-placeholder="上传文档后，AI 将自动生成客户档案..."></div>
                        <textarea id="custNotes" style="display: none;"></textarea>
                    </div>
                </div>

                <!-- Step 2: 资料输入页 -->
                <div class="profile-step profile-step-input" id="profileStepInput">
                    <!-- 上传区域 -->
                    <div class="profile-input-upload-wrapper" id="profileUploadWrapper">
                        <div class="profile-upload-zone" id="profileUploadZoneInput">
                            <div class="profile-upload-icon">
                                <i data-lucide="upload"></i>
                            </div>
                            <div class="profile-upload-text">点击或拖拽上传文件 (最多5个)</div>
                            <div class="profile-upload-hint">支持 PDF, Word, Excel, 图片</div>
                        </div>
                        <div class="profile-uploaded-files-list" id="profileUploadedFilesList" style="display: none;">
                            <!-- File items will be rendered here -->
                        </div>
                        <div class="profile-input-disabled-hint">已输入文本，清空后可上传文件</div>
                    </div>

                    <!-- 分隔线 -->
                    <div class="profile-input-divider">
                        <span>或手动输入</span>
                    </div>

                    <!-- 文本输入 -->
                    <div class="profile-input-textarea-wrapper" id="profileTextareaWrapper">
                        <textarea class="profile-input-textarea" id="profileInputTextarea"
                            placeholder="粘贴客户信息，如公司简介、业务需求、联系人等，AI 将自动分析生成画像..."></textarea>
                        <div class="profile-input-disabled-hint">已上传文件，清除后可手动输入</div>
                    </div>
                </div>

                <!-- Step 3: 分析中 -->
                <div class="profile-step profile-step-analyzing" id="profileStepAnalyzing">
                    <div class="profile-analyzing-state">
                        <div class="profile-analyzing-spinner"></div>
                        <div class="profile-analyzing-title">AI 正在分析中...</div>
                        <div class="profile-analyzing-subtitle">根据您上传的文件大小，生成时间可能需要 5 秒到 1 分钟，请耐心等待</div>
                    </div>
                </div>

                <!-- Step 4: 编辑页 -->
                <div class="profile-step profile-step-edit" id="profileStepEdit">
                    <div class="profile-edit-wrapper">
                        <textarea class="profile-edit-textarea" id="profileEditTextarea"
                            placeholder="在此编辑 Markdown 格式的客户档案..."></textarea>
                    </div>
                </div>

                <!-- Hidden Upload Input -->
                <input type="file" id="profileFileInput" hidden multiple
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.json,.html,.jpg,.jpeg,.png,.gif,.webp">
            </div>

            <!-- Footer -->
            <div class="profile-modal-footer" id="profileModalFooter">
                <!-- 显示页按钮 -->
                <div class="profile-footer-display" id="profileFooterDisplay">
                    <button type="button" class="btn-secondary" id="profileDisplayLeftBtn"
                        onclick="switchProfileStep('input')">
                        <i data-lucide="plus"></i>
                        <span>创建档案</span>
                    </button>
                    <button type="button" class="btn-primary" id="profileEditBtn" onclick="switchProfileStep('edit')"
                        style="display: none;">
                        <span>编辑</span>
                    </button>
                </div>

                <!-- 输入页按钮 -->
                <div class="profile-footer-input" id="profileFooterInput" style="display: none;">
                    <button type="button" class="btn-secondary" onclick="returnToDisplayPage()">返回</button>
                    <button type="button" class="btn-primary" id="profileGenerateBtn" onclick="startProfileGeneration()"
                        disabled>
                        <span>生成</span>
                    </button>
                </div>

                <!-- 编辑页按钮 -->
                <div class="profile-footer-edit" id="profileFooterEdit" style="display: none;">
                    <button type="button" class="btn-secondary" onclick="cancelProfileEdit()">
                        <span>取消</span>
                    </button>
                    <button type="button" class="btn-primary" onclick="saveProfileEdit()">
                        <span>保存</span>
                    </button>
                </div>

                <!-- 分析中无按钮 -->
            </div>
        </div>
    </div>

    <!-- Customer Profile Modal (Shown on New Chat) -->
    <div class="modal-overlay" id="customerProfileModal">
        <div class="modal-card modal-card-compact">
            <div class="modal-header-compact">
                <span class="modal-title">新建客户对话</span>
                <button class="modal-close-btn" onclick="closeCustomerProfileModal()">
                    <i data-lucide="x"></i>
                </button>
            </div>

            <form id="newCustomerProfileForm" class="customer-profile-form-compact">
                <div class="form-group-compact">
                    <label class="form-label" for="newCustName">
                        客户姓名 <span class="required-star">*</span>
                    </label>
                    <input type="text" class="form-input" id="newCustName" placeholder="请输入客户姓名" required>
                </div>
            </form>

            <div class="modal-footer-compact">
                <button type="button" class="btn-secondary" onclick="closeCustomerProfileModal()">
                    跳过
                </button>
                <button type="submit" class="btn-primary" form="newCustomerProfileForm">
                    <span>创建</span>
                </button>
            </div>
        </div>
    </div>

    <!-- Knowledge Document Selection Modal -->
    <div class="modal-overlay" id="kbModal">
        <div class="modal-card" id="kbModalCard">
            <div class="modal-header">
                <div class="kb-header-left">
                    <button class="kb-back-btn" id="kbBackBtn" onclick="kbGoBack()" style="display:none;">
                        <i data-lucide="arrow-left"></i>
                    </button>
                    <span class="modal-title" id="kbModalTitle">知识库配置</span>
                </div>
                <button class="modal-close-btn" onclick="toggleKbModal(false)">
                    <i data-lucide="x"></i>
                </button>
            </div>

            <!-- Loading state -->
            <div class="kb-loading" id="kbLoading" style="display: none;">
                <div class="loader-dots">加载中...</div>
            </div>

            <!-- ===== View 1: Overview (3-column) ===== -->
            <div class="kb-view" id="kbViewOverview" style="display:none;">
                <div class="kb-overview-grid" id="kbOverviewGrid">
                    <!-- JS renders 3 category cards here -->
                </div>
                <div class="modal-footer" style="border-top:none;">
                    <button class="btn-secondary" onclick="toggleKbModal(false)">关闭</button>
                    <button class="btn-primary" onclick="saveKbSelection()">
                        <span>保存</span>
                    </button>
                </div>
            </div>

            <!-- ===== View 2: Wizard (step-by-step) ===== -->
            <div class="kb-view" id="kbViewWizard" style="display:none;">
                <div class="kb-wizard-steps" id="kbWizardSteps">
                    <div class="kb-step active" data-step="product">
                        <div class="kb-step-dot">1</div>
                        <span>产品文档</span>
                    </div>
                    <div class="kb-step-line"></div>
                    <div class="kb-step" data-step="cases">
                        <div class="kb-step-dot">2</div>
                        <span>成功案例</span>
                    </div>
                    <div class="kb-step-line"></div>
                    <div class="kb-step" data-step="faq">
                        <div class="kb-step-dot">3</div>
                        <span>百问百答</span>
                    </div>
                </div>
                <div class="kb-limit-hint" id="kbWizardHint">
                    <i data-lucide="info" style="width:14px;height:14px;vertical-align:middle;"></i>
                    <span id="kbWizardHintText">请选择产品知识库（最多 3 个）</span>
                </div>
                <div class="kb-document-list" id="kbDocumentList">
                    <!-- Documents rendered by JS -->
                </div>
                <div class="modal-footer" style="border-top:none;">
                    <button class="btn-secondary" id="kbWizardPrevBtn" onclick="kbWizardPrev()">上一步</button>
                    <button class="btn-primary" id="kbWizardNextBtn" onclick="kbWizardNext()">
                        <span>下一步</span>
                    </button>
                </div>
            </div>

            <!-- ===== View 3: Category Edit (single category picker) ===== -->
            <div class="kb-view" id="kbViewCategoryEdit" style="display:none;">
                <div class="kb-limit-hint">
                    <i data-lucide="info" style="width:14px;height:14px;vertical-align:middle;"></i>
                    最多选择 3 个文档
                </div>
                <div class="kb-document-list" id="kbCategoryDocList">
                    <!-- Documents rendered by JS -->
                </div>
                <div class="modal-footer" style="border-top:none;">
                    <button class="btn-secondary" onclick="kbGoBack()">返回</button>
                    <button class="btn-primary" onclick="kbFinishCategoryEdit()">
                        <span>完成</span>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Rename Session Modal -->
    <div class="modal-overlay" id="renameSessionModal">
        <div class="modal-card modal-card-simple">
            <div class="modal-header">
                <span class="modal-title">重命名会话</span>
            </div>
            <div class="modal-body-simple">
                <div class="form-group">
                    <input type="text" class="form-input" id="renameSessionInput" placeholder="请输入新的会话名称"
                        onkeydown="if(event.key === 'Enter') confirmRenameSession()">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="toggleRenameModal(false)">取消</button>
                <button class="btn-primary" onclick="confirmRenameSession()">
                    <span>确认</span>
                </button>
            </div>
        </div>
    </div>

    <!-- Delete Session Modal -->
    <div class="modal-overlay" id="deleteSessionModal">
        <div class="modal-card modal-card-simple">
            <div class="modal-header">
                <span class="modal-title">删除会话</span>
            </div>
            <div class="modal-body-simple">
                <p>
                    确认删除记录吗?此操作不可恢复
                </p>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="toggleDeleteModal(false)">取消</button>
                <button class="btn-primary" style="background: #ef4444; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.2);"
                    onclick="confirmDeleteSession()">
                    <span>确认删除</span>
                </button>
            </div>
        </div>
    </div>

    <!-- Knowledge Citation Modal (知识库引用弹窗) -->
    <div class="modal-overlay" id="citationModal">
        <div class="modal-card citation-modal-card">
            <div class="modal-header">
                <div class="citation-modal-title">
                    <i data-lucide="book-open"></i>
                    <span>知识库引用</span>
                    <span class="citation-count" id="citationCount">0</span>
                </div>
                <button class="modal-close-btn" onclick="toggleCitationModal(false)">
                    <i data-lucide="x"></i>
                </button>
            </div>
            <div class="citation-list" id="citationList">
                <!-- Citations will be rendered here -->
            </div>
        </div>
    </div>

    <!-- Chat Style Analysis Modal (重构: 与客户档案统一交互逻辑) -->
    <div class="modal-overlay" id="chatStyleModal">
        <div class="modal-card profile-modal-card">
            <!-- Header -->
            <div class="profile-modal-header">
                <span class="modal-title" id="chatStyleModalTitle">语言风格</span>
                <button class="modal-close-btn" onclick="toggleChatStyleModal(false)">
                    <i data-lucide="x"></i>
                </button>
            </div>

            <div class="profile-modal-body">
                <!-- Step 1: 语言指纹显示页（有记录显示内容，无记录显示空状态） -->
                <div class="profile-step profile-step-display" id="chatStyleStepDisplay">
                    <!-- 空状态（无记录时显示） -->
                    <div class="profile-display-empty" id="chatStyleDisplayEmpty">
                        <i data-lucide="message-square"></i>
                        <span>未生成语言风格</span>
                    </div>
                    <!-- 有记录时显示编辑器 -->
                    <div class="profile-editor-wrapper" id="chatStyleDisplayContent" style="display: none;">
                        <div class="profile-editor-simple" id="chatStyleEditorSimple" contenteditable="true"
                            data-placeholder="分析结果将在这里显示，您也可以在这里直接编辑..."></div>
                        <textarea id="chatStyleNotes" style="display: none;"></textarea>
                    </div>
                </div>

                <!-- Step 2: 资料输入页 -->
                <div class="profile-step profile-step-input" id="chatStyleStepInput">
                    <!-- 上传区域 -->
                    <div class="profile-input-upload-wrapper">
                        <div class="profile-upload-zone" id="chatStyleUploadZoneInput">
                            <div class="profile-upload-icon">
                                <i data-lucide="upload"></i>
                            </div>
                            <div class="profile-upload-text">点击上传 PDF、Word、Excel、图片</div>
                        </div>
                        <div class="profile-uploaded-file" id="chatStyleUploadedFile" style="display: none;">
                            <div class="profile-uploaded-file-icon">
                                <i data-lucide="file-text"></i>
                            </div>
                            <div class="profile-uploaded-file-info">
                                <div class="profile-uploaded-file-name" id="chatStyleUploadedFileName"></div>
                                <div class="profile-uploaded-file-size" id="chatStyleUploadedFileSize"></div>
                            </div>
                            <button class="profile-uploaded-file-remove" onclick="clearChatStyleUploadedFile(event)">
                                <i data-lucide="x"></i>
                            </button>
                        </div>
                    </div>

                    <!-- 分隔线 -->
                    <div class="profile-input-divider">
                        <span>或手动输入</span>
                    </div>

                    <!-- 文本输入 -->
                    <div class="profile-input-textarea-wrapper">
                        <textarea class="profile-input-textarea" id="chatStyleInputTextarea"
                            placeholder="粘贴聊天记录、邮件或其他文本内容，AI 将自动分析您的语言风格..."></textarea>
                    </div>
                </div>

                <!-- Step 3: 分析中 -->
                <div class="profile-step profile-step-analyzing" id="chatStyleStepAnalyzing">
                    <div class="profile-analyzing-state">
                        <div class="profile-analyzing-spinner"></div>
                        <div class="profile-analyzing-title">AI 正在分析中...</div>
                        <div class="profile-analyzing-subtitle">根据您上传的文件大小，生成时间可能需要 5 秒到 1 分钟，请耐心等待</div>
                    </div>
                </div>

                <!-- Hidden Upload Input -->
                <input type="file" id="chatStyleFileInput" hidden
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.json,.html,.jpg,.jpeg,.png,.gif,.webp">
            </div>

            <!-- Footer -->
            <div class="profile-modal-footer" id="chatStyleModalFooter">
                <!-- 显示页按钮 -->
                <div class="profile-footer-display" id="chatStyleFooterDisplay">
                    <button type="button" class="btn-secondary" id="chatStyleDisplayLeftBtn"
                        onclick="switchChatStyleStep('input')">
                        <i data-lucide="plus"></i>
                        <span>创建档案</span>
                    </button>
                    <button type="button" class="btn-primary" id="chatStyleSaveBtn" onclick="saveChatStyleOnly()"
                        style="display: none;">
                        <span>保存</span>
                    </button>
                </div>

                <!-- 输入页按钮 -->
                <div class="profile-footer-input" id="chatStyleFooterInput" style="display: none;">
                    <button type="button" class="btn-secondary" onclick="returnToChatStyleDisplayPage()">返回</button>
                    <button type="button" class="btn-primary" id="chatStyleGenerateBtn"
                        onclick="startChatStyleGeneration()" disabled>
                        <span>生成</span>
                    </button>
                </div>

                <!-- 分析中无按钮 -->
            </div>
        </div>
    </div>

    <!-- Toast 通知容器 -->
    <div id="toast-container"></div>

    <div v-if="errorText" class="legacy-error">{{ errorText }}</div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSalesAgentStore } from '@/stores/salesAgent'

const router = useRouter()
const salesAgentStore = useSalesAgentStore()
const errorText = ref('')

const ensureRandomUUIDPolyfill = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return
  }

  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    return
  }

  // 与 legacy 页面保持一致，保证会话初始化在非安全上下文也可用
  ;(crypto as any).randomUUID = function randomUUIDPolyfill() {
    return ([1e7] as unknown as string).replace(/[018]/g, (c: string) =>
      (
        Number(c) ^
        ((crypto.getRandomValues(new Uint8Array(1))[0] & 15) >> (Number(c) / 4))
      ).toString(16)
    )
  }
}

const goHome = async () => {
  await router.push('/')
}

onMounted(async () => {
  document.body.classList.add('sales-agent-route')
  ensureRandomUUIDPolyfill()

  try {
    await salesAgentStore.mountLegacy()
    errorText.value = ''
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '销售智能体初始化失败'
  }
})

onBeforeUnmount(() => {
  document.body.classList.remove('sales-agent-route')
  salesAgentStore.unmountLegacy()
})
</script>

<style scoped>
:global(body.sales-agent-route) {
  height: 100vh;
  overflow: hidden;
}

:global(body.sales-agent-route #app) {
  height: 100%;
}

.app-container {
  height: 100%;
}

.legacy-error {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 9999;
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 13px;
  max-width: 420px;
}
</style>
