<template>

    <!-- Loading 占位 -->
    <div v-if="!legacyReady && !errorText" class="legacy-loading">
        <div class="legacy-loading-spinner"></div>
    </div>

    <!-- 主内容，legacy 就绪后才显示 -->
    <div class="sop-page-container" v-show="legacyReady">

    <!-- 左侧边栏（legacy CSS 已设 display:none） -->
    <div class="sidebar">
        <div class="sidebar-header">
            <div class="logo-icon"></div>
            <div class="sidebar-title">AI Workflow</div>
        </div>

        <div class="search-bar">
            <svg class="search-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    d="M7 12C9.76142 12 12 9.76142 12 7C12 4.23858 9.76142 2 7 2C4.23858 2 2 4.23858 2 7C2 9.76142 4.23858 12 7 12Z"
                    stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M14 14L10.5 10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                    stroke-linejoin="round" />
            </svg>
            <span>Q 跳转至</span>
        </div>

        <div class="nav-menu">
            <a href="javascript:void(0)" class="nav-item">上传文档</a>
            <a href="javascript:void(0)" class="nav-item active">工作区</a>
            <a href="javascript:void(0)" class="nav-item">节点组件</a>
            <a href="javascript:void(0)" class="nav-item">SOP文档</a>
            <a href="javascript:void(0)" class="nav-item">回收站</a>
            <a href="javascript:void(0)" class="nav-item">成员</a>
            <a href="javascript:void(0)" class="nav-item">设置</a>
            <a href="javascript:void(0)" class="nav-item">联系和支持</a>
        </div>

        <div class="sidebar-footer">
            <div class="run-count-card">
                <div class="run-count-title">运行次数</div>
                <div class="run-count-value">156</div>
                <div class="run-count-label">本月累计</div>
                <div class="run-count-progress">
                    <div class="run-count-progress-bar"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- 返回首页按钮 -->
    <a href="javascript:void(0)" class="back-to-home-btn" onclick="handleBackToHome(event)">
        <svg class="back-to-home-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                stroke-linejoin="round" />
        </svg>
    </a>

    <!-- 历史记录按钮 -->
    <button class="history-btn" onclick="openHistoryModal()" title="历史记录">
        <svg class="history-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    </button>

    <!-- 自定义确认对话框 -->
    <div class="confirm-dialog-overlay" id="confirm-dialog-overlay" onclick="closeConfirmDialogOnOverlay(event)">
        <div class="confirm-dialog" onclick="event.stopPropagation()">
            <div class="confirm-dialog-title" id="confirm-dialog-title">确认操作</div>
            <div class="confirm-dialog-message" id="confirm-dialog-message">确定要执行此操作吗？</div>
            <div class="confirm-dialog-buttons">
                <button class="confirm-dialog-btn confirm-dialog-btn-secondary"
                    onclick="closeConfirmDialog()">取消</button>
                <button class="confirm-dialog-btn confirm-dialog-btn-primary"
                    id="confirm-dialog-confirm-btn">确定</button>
            </div>
        </div>
    </div>

    <!-- 历史记录弹窗 -->
    <div class="history-modal-overlay" id="history-modal-overlay" onclick="closeHistoryModalOnOverlay(event)">
        <div class="history-modal" onclick="event.stopPropagation()">
            <div class="history-modal-header">
                <div class="history-modal-title">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                        style="width: 20px; height: 20px; color: var(--accent);">
                        <path
                            d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                    任务记录
                </div>
                <button class="history-close-btn" onclick="closeHistoryModal()" title="关闭">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
                        style="width: 20px; height: 20px;">
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                            stroke-linejoin="round" />
                    </svg>
                </button>
            </div>
            <div class="history-modal-content" id="history-modal-content">
                <div id="history-card-container">
                    <!-- 历史记录卡片将由 JS 渲染在此处 -->
                </div>
            </div>
        </div>
    </div>

    <!-- 页面加载遮罩 -->
    <div class="page-loading-overlay" id="page-loading-overlay">
        <div class="loading-spinner">
            <div class="spinner-dot"></div>
            <div class="spinner-dot"></div>
            <div class="spinner-dot"></div>
        </div>
        <div class="loading-text">刷新中...</div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
        <div class="content-wrapper">
            <!-- 步骤条 -->
            <div class="stepper">
                <div class="step active" data-step="1" onclick="setActiveStep(1)">
                    <div class="step-number">1</div>
                    <div class="step-label">AI 拆解产品</div>
                </div>
                <div class="step" data-step="2" onclick="setActiveStep(2)">
                    <div class="step-number">2</div>
                    <div class="step-label">AI 拆解爆款文案</div>
                </div>
                <div class="step" data-step="3" onclick="setActiveStep(3)">
                    <div class="step-number">3</div>
                    <div class="step-label">AI 拆解语言风格</div>
                </div>
                <div class="step step-before-chat" data-step="4" onclick="setActiveStep(4)">
                    <div class="step-number">4</div>
                    <div class="step-label">AI 进行创作</div>
                </div>
                <div class="step step-chat" data-step="5" onclick="setActiveStep(5)">
                    <div class="step-number">5</div>
                    <div class="step-label">AI 聊天</div>
                </div>
            </div>

            <!-- 第 1 步：AI 拆解产品 -->
            <div class="step-content active" id="step-1">
                <div class="step-content-header">
                    <div class="step-content-title">
                        第 1 步：AI 拆解产品
                    </div>
                    <div class="step-content-description">
                        请将你的产品介绍输入或上传到下方
                    </div>
                </div>

                <div class="page-tip" style="margin-bottom: 24px;">
                    &#x1F4A1; 建议从以下角度提供完整、详细的产品介绍，以确保AI更准确地理解您的产品或服务：<br>
                    一、核心业务定位 (1)您是做什么的？(2)核心差异化是什么？(3)核心客户是谁？(4)帮客户解决了什么核心痛点？<br>
                    二、IP基础信息与信任背书 (1)创始人背景经历 (2)人设标签定位 (3)硬核战绩成果<br>
                    三、目标用户画像 (1)详细用户画像 (2)地域分布 (3)年龄段 (4)收入水平 (5)职业特征<br>
                    四、用户深层心理与需求 (1)核心焦虑点 (2)核心渴望 (3)潜在顾虑与担忧
                </div>

                <div class="input-section">
                    <div class="input-label">
                        <span>产品介绍</span>
                        <div class="label-actions">
                            <button class="upload-btn"
                                onclick="event.stopPropagation(); document.getElementById('product-file-input').click()">上传文件</button>
                            <button class="check-quality-btn"
                                onclick="event.stopPropagation(); checkProductQuality()">检测质量</button>
                        </div>
                    </div>
                    <input type="file" id="product-file-input" class="file-input" multiple
                        accept=".pdf,.txt,.md,.docx,.doc,.rtf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg"
                        onchange="handleFileUpload(event, 'product-input')">
                    <!-- 文件上传加载提示 -->
                    <div class="file-upload-loading" id="product-input-file-loading">
                        <div class="loading-message">
                            <div>
                                <div class="message-name">正在识别文档...</div>
                                <div class="loading-dots">
                                    <div class="loading-dot"></div>
                                    <div class="loading-dot"></div>
                                    <div class="loading-dot"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="image-preview-container" id="product-input-image-preview">
                        <div class="image-preview-list"></div>
                        <div class="image-preview-status"></div>
                    </div>
                    <textarea class="input-textarea" id="product-input"
                        placeholder="请输入产品介绍内容，或点击&quot;上传文件&quot;"></textarea>

                    <!-- 质量检测加载状态 -->
                    <div class="quality-loading" id="quality-loading" style="display: none;">
                        <div class="loading-message">
                            <div>
                                <div class="message-name">AI 正在检测质量</div>
                                <div class="loading-dots">
                                    <div class="loading-dot"></div>
                                    <div class="loading-dot"></div>
                                    <div class="loading-dot"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 质量检测结果 -->
                    <div class="quality-result" id="quality-result">
                        <button class="quality-close-btn" onclick="closeQualityResult()" title="关闭">&#x2715;</button>
                        <div class="quality-suggestions-content prose" id="quality-content"></div>
                    </div>
                </div>

                <!-- Chatbot 风格的 AI 分析结果 -->
                <div class="chat-container" id="product-chat">
                    <!-- 加载状态 -->
                    <div class="chat-message" id="loading-message">
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
                    </div>

                    <!-- AI 返回的结果 -->
                    <div class="chat-message" id="result-message" style="display: none;">
                        <div class="message-header" style="display: none;">
                            <div class="message-avatar">
                                <img src="https://numind-dev-1334169463.cos.ap-chengdu.myqcloud.com/sop/logo/iconify-arcticons_ai.png"
                                    alt="AI">
                            </div>
                            <div class="message-name">AI 产品分析助手</div>
                        </div>
                        <div class="message-bubble">
                            <div class="message-content prose" id="analysis-content"></div>
                        </div>
                    </div>
                </div>

                <div class="nav-buttons">
                    <div></div>
                    <button class="btn btn-primary" id="step1-next-btn" onclick="handleStep1Next()">下一步</button>
                </div>
            </div>

            <!-- 第 2 步：AI 拆解爆款文案 -->
            <div class="step-content" id="step-2">
                <div class="step-content-header">
                    <div class="step-content-title">
                        第 2 步：AI 拆解爆款朋友圈文案
                    </div>
                    <div class="step-content-description">
                        在下方输入或上传爆款朋友圈文案
                    </div>
                </div>

                <div class="page-tip" style="margin-bottom: 24px;">
                    &#x1F4A1; 建议提供完整的爆款文案，包含开头、正文和结尾，以便AI学习完整结构
                </div>

                <div class="input-section">
                    <div class="input-label">
                        <span>爆款朋友圈文案</span>
                        <div class="label-actions">
                            <button class="upload-btn"
                                onclick="event.stopPropagation(); document.getElementById('script-file-input').click()">上传文件</button>
                        </div>
                    </div>
                    <input type="file" id="script-file-input" class="file-input" multiple
                        accept=".pdf,.txt,.md,.docx,.doc,.rtf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg"
                        onchange="handleFileUpload(event, 'script-input')">
                    <!-- 文件上传加载提示 -->
                    <div class="file-upload-loading" id="script-input-file-loading">
                        <div class="loading-message">
                            <div>
                                <div class="message-name">正在识别文档...</div>
                                <div class="loading-dots">
                                    <div class="loading-dot"></div>
                                    <div class="loading-dot"></div>
                                    <div class="loading-dot"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="image-preview-container" id="script-input-image-preview">
                        <div class="image-preview-list"></div>
                        <div class="image-preview-status"></div>
                    </div>
                    <textarea class="input-textarea" id="script-input"
                        placeholder="请输入爆款朋友圈文案内容，或点击&quot;上传文件&quot;"></textarea>
                </div>

                <!-- Chatbot 风格的 AI 分析结果 -->
                <div class="chat-container" id="script-chat">
                    <!-- 加载状态 -->
                    <div class="chat-message" id="script-loading-message">
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
                    </div>

                    <!-- AI 返回的结果 -->
                    <div class="chat-message" id="script-result-message" style="display: none;">
                        <div class="message-header" style="display: none;">
                            <div class="message-avatar">
                                <img src="https://numind-dev-1334169463.cos.ap-chengdu.myqcloud.com/sop/logo/iconify-arcticons_ai.png"
                                    alt="AI">
                            </div>
                            <div class="message-name">AI 文案分析助手</div>
                        </div>
                        <div class="message-bubble">
                            <div class="message-content prose" id="script-analysis-content"></div>
                        </div>
                    </div>
                </div>

                <div class="nav-buttons">
                    <button class="btn btn-secondary" onclick="prevStep()">&#x2190; 上一步</button>
                    <button class="btn btn-primary" id="step2-next-btn" onclick="handleStep2Next()">下一步</button>
                </div>
            </div>

            <!-- 第 3 步：AI 拆解用户 IP 语言风格 -->
            <div class="step-content" id="step-3">
                <div class="step-content-header">
                    <div class="step-content-title">
                        第 3 步：AI拆解IP语言风格
                    </div>
                    <div class="step-content-description">
                        在下方输入或上传你的历史朋友圈文稿
                    </div>
                </div>

                <div class="page-tip" style="margin-bottom: 24px;">
                    &#x1F4A1; 建议提供完整、流畅的历史文稿，内容完整度越高，AI越能准确学习你的语言风格
                </div>

                <div class="input-section">
                    <div class="input-label">
                        <span>你的历史朋友圈文稿</span>
                        <div class="label-actions">
                            <button class="upload-btn"
                                onclick="event.stopPropagation(); document.getElementById('style-file-input').click()">上传文件</button>
                        </div>
                    </div>
                    <input type="file" id="style-file-input" class="file-input" multiple
                        accept=".pdf,.txt,.md,.docx,.doc,.rtf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg"
                        onchange="handleFileUpload(event, 'style-input')">
                    <!-- 文件上传加载提示 -->
                    <div class="file-upload-loading" id="style-input-file-loading">
                        <div class="loading-message">
                            <div>
                                <div class="message-name">正在识别文档...</div>
                                <div class="loading-dots">
                                    <div class="loading-dot"></div>
                                    <div class="loading-dot"></div>
                                    <div class="loading-dot"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="image-preview-container" id="style-input-image-preview">
                        <div class="image-preview-list"></div>
                        <div class="image-preview-status"></div>
                    </div>
                    <textarea class="input-textarea" id="style-input"
                        placeholder="请输入你的历史朋友圈文稿，或点击&quot;上传文件&quot;"></textarea>
                </div>

                <!-- Chatbot 风格的 AI 分析结果 -->
                <div class="chat-container" id="style-chat">
                    <!-- 加载状态 -->
                    <div class="chat-message" id="style-loading-message">
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
                    </div>

                    <!-- AI 返回的结果 -->
                    <div class="chat-message" id="style-result-message" style="display: none;">
                        <div class="message-header" style="display: none;">
                            <div class="message-avatar">
                                <img src="https://numind-dev-1334169463.cos.ap-chengdu.myqcloud.com/sop/logo/iconify-arcticons_ai.png"
                                    alt="AI">
                            </div>
                            <div class="message-name">AI 风格分析助手</div>
                        </div>
                        <div class="message-bubble">
                            <div class="message-content prose" id="style-analysis-content"></div>
                        </div>
                    </div>
                </div>

                <div class="nav-buttons">
                    <button class="btn btn-secondary" onclick="prevStep()">&#x2190; 上一步</button>
                    <button class="btn btn-primary" id="step3-next-btn" onclick="handleStep3Next()">下一步</button>
                </div>
            </div>

            <!-- 第 4 步：AI 进行创作 -->
            <div class="step-content" id="step-4">
                <div class="step-content-header">
                    <div class="step-content-title">
                        第 4 步：AI 进行创作
                    </div>
                    <div class="step-content-description">
                        在下方输入创作主题
                    </div>
                </div>

                <div class="page-tip" style="margin-bottom: 24px;">
                    &#x1F4A1; 请从以下角度进行输入：
                    <ul style="margin-top: 8px; margin-bottom: 0; padding-left: 20px;">
                        <li>场景：[在哪里？和谁？]</li>
                        <li>事件：[发生了什么具体动作？]</li>
                        <li>内心感受：[最真实的初始情绪]</li>
                        <li>转折：[发生了什么变化/反差？]</li>
                        <li>模糊灵感：[用户感觉有点道理，但没说透的想法]</li>
                    </ul>
                </div>

                <div class="input-section">
                    <div class="input-label">
                        <span>创作主题</span>
                        <div class="label-actions">
                            <button class="upload-btn" style="display: none;"
                                onclick="event.stopPropagation(); document.getElementById('theme-file-input').click()">上传文件</button>
                        </div>
                    </div>
                    <input type="file" id="theme-file-input" class="file-input" multiple
                        accept=".pdf,.txt,.md,.docx,.doc,.rtf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg"
                        onchange="handleFileUpload(event, 'theme-input')">
                    <!-- 文件上传加载提示 -->
                    <div class="file-upload-loading" id="theme-input-file-loading">
                        <div class="loading-message">
                            <div>
                                <div class="message-name">正在识别文档...</div>
                                <div class="loading-dots">
                                    <div class="loading-dot"></div>
                                    <div class="loading-dot"></div>
                                    <div class="loading-dot"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="image-preview-container" id="theme-input-image-preview">
                        <div class="image-preview-list"></div>
                        <div class="image-preview-status"></div>
                    </div>
                    <textarea class="input-textarea" id="theme-input" placeholder="请输入创作主题，或点击&quot;上传文件&quot;"
                        style="min-height: 120px;"></textarea>
                </div>

                <!-- Chatbot 风格的 AI 生成结果 -->
                <div class="chat-container" id="final-chat">
                    <!-- 加载状态 -->
                    <div class="chat-message" id="final-loading-message">
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
                    </div>

                    <!-- AI 返回的结果 -->
                    <div class="chat-message" id="final-result-message" style="display: none;">
                        <div class="message-header" style="display: none;">
                            <div class="message-avatar">
                                <img src="https://numind-dev-1334169463.cos.ap-chengdu.myqcloud.com/sop/logo/iconify-arcticons_ai.png"
                                    alt="AI">
                            </div>
                            <div class="message-name">AI 创作助手</div>
                        </div>
                        <div class="message-bubble">
                            <div class="message-content prose" id="generated-script"></div>
                        </div>
                    </div>
                </div>

                <div class="nav-buttons">
                    <button class="btn btn-secondary" id="step4-prev-btn" onclick="handleStep4Prev()">&#x2190; 上一步</button>
                    <button class="btn btn-primary" id="step4-next-btn" onclick="handleStep4Next()">生成仿写文稿</button>
                </div>
            </div>

            <!-- 第 5 步：AI 聊天 -->
            <div class="step-content" id="step-5">
                <!-- 聊天消息容器 -->
                <div class="chatbot-container" id="chatbot-container">
                    <div class="chatbot-messages" id="chatbot-messages">
                        <!-- 消息列表将动态添加到这里 -->
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 输入区域 - 悬浮在body级别，完全独立 -->
    <div class="chatbot-input-area" id="chatbot-input-area">
        <div class="chatbot-input-wrapper">
            <!-- 扩展/收缩按钮 - 右上角 -->
            <button class="chatbot-expand-btn" id="chatbot-expand-btn" title="展开输入框" style="display: none;">
                <i data-lucide="maximize-2" class="expand-icon" style="width: 14px; height: 14px;"></i>
                <i data-lucide="minimize-2" class="collapse-icon" style="width: 14px; height: 14px; display: none;"></i>
            </button>
            <textarea class="chatbot-input" id="chatbot-input" placeholder="输入你的问题或需求..." rows="1"></textarea>
            <div class="chatbot-input-toolbar">
                <button class="deep-thinking-btn" id="deep-thinking-btn" title="开启后大模型会返回推理思维链">
                    <span>深度思考</span>
                </button>
                <div class="toolbar-right">
                    <button class="chatbot-send-btn" id="chatbot-send-btn" disabled>
                        <i data-lucide="arrow-up"></i>
                    </button>
                </div>
            </div>
        </div>
    </div>

    </div><!-- /sop-page-container -->

    <div v-if="errorText" class="legacy-error">{{ errorText }}</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSopStore } from '@/stores/sop'

const router = useRouter()
const route = useRoute()
const sopStore = useSopStore()
const errorText = ref('')
const legacyReady = ref(false)

const goHome = async () => {
  await router.push('/')
}

const switchRun = (runId: string, templateId: string) => {
  router.replace({ query: { runId, templateId } })
}

onMounted(async () => {
  document.body.classList.add('sop-route')

  try {
    await sopStore.mountLegacy({
      templateId: (route.query.templateId as string) || '',
      runId: (route.query.runId as string) || '',
      onNavigateHome: goHome,
      onSwitchRun: switchRun
    })
    errorText.value = ''
    legacyReady.value = true
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : 'SOP 初始化失败'
  }
})

onBeforeUnmount(() => {
  document.body.classList.remove('sop-route')
  sopStore.unmountLegacy()
})
</script>

<style scoped>
:global(body.sop-route) {
  height: 100vh;
  overflow: hidden;
}

:global(body.sop-route #app) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sop-page-container {
  height: 100%;
  display: flex;
  flex: 1;
  min-height: 0;
}

.legacy-loading {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.legacy-loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e5e7eb;
  border-top-color: #25a769;
  border-radius: 50%;
  animation: legacy-spin 0.6s linear infinite;
}

@keyframes legacy-spin {
  to { transform: rotate(360deg); }
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
