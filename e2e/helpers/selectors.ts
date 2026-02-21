/**
 * Unified DOM selectors for E2E tests.
 * All IDs and classes come from SalesView.vue + sales-agent-legacy.js.
 */

// ── Auth (LoginView) ──────────────────────────────────────────────
export const auth = {
  usernameInput: '#username',
  passwordInput: '#password',
  loginButton: '.login-button',
  errorMessage: '.error-message',
} as const

// ── Sidebar & Sessions ───────────────────────────────────────────
export const sidebar = {
  root: '#sidebar',
  newChatBtn: '#newChatBtn',
  sessionsList: '#sessionsList',
  sessionItem: '.session-item',
  sessionMenuBtn: '.session-menu-btn',
  sessionMenuItem: '.session-menu-item',
  pinIndicator: '.pin-indicator',
} as const

// ── Header ────────────────────────────────────────────────────────
export const header = {
  sessionTitle: '#currentSessionTitle',
  kbBtn: '#kbBtn',
  profileBtn: '#profileBtn',
  chatStyleBtn: '#chatStyleBtn',
  stageTrigger: '#stageTrigger',
  currentStageText: '#currentStageText',
  stageDropdown: '#stageDropdown',
} as const

// ── Chat Area ─────────────────────────────────────────────────────
// Legacy JS uses: div.className = `message ${role === 'assistant' ? 'ai' : 'user'}`
export const chat = {
  container: '#chatContainer',
  welcomeScreen: '#welcomeScreen',
  chatWrapper: '#chatWrapper',
  message: '.message',
  userMessage: '.message.user',
  aiMessage: '.message.ai',
  msgBubble: '.msg-bubble',
  messageText: '.message-text',
  citationButton: '.citation-button',
  scrollToBottom: '#scrollToBottomBtn',
} as const

// ── Input Area ────────────────────────────────────────────────────
export const input = {
  textarea: '#chatInput',
  sendBtn: '#sendBtn',
  modeToggleBtn: '#modeToggleBtn',
  modeLabel: '#modeLabel',
  deepThinkingBtn: '#deepThinkingBtn',
  imageUploadBtn: '#imageUploadBtn',
  expandBtn: '#expandBtn',
} as const

// ── New Customer Modal ────────────────────────────────────────────
export const newCustomerModal = {
  overlay: '#customerProfileModal',
  form: '#newCustomerProfileForm',
  nameInput: '#newCustName',
  submitBtn: '#newCustomerProfileForm ~ .modal-footer-compact .btn-primary, .modal-footer-compact .btn-primary',
  skipBtn: '.modal-footer-compact .btn-secondary',
} as const

// ── Profile Modal ─────────────────────────────────────────────────
export const profileModal = {
  overlay: '#profileModal',
  title: '#profileModalTitle',
  stepDisplay: '#profileStepDisplay',
  stepInput: '#profileStepInput',
  stepAnalyzing: '#profileStepAnalyzing',
  stepEdit: '#profileStepEdit',
  displayEmpty: '#profileDisplayEmpty',
  displayContent: '#profileDisplayContent',
  createBtn: '#profileDisplayLeftBtn',
  editBtn: '#profileEditBtn',
  closeBtn: '#profileModal .modal-close-btn',
} as const

// ── Knowledge Base Modal ──────────────────────────────────────────
export const kbModal = {
  overlay: '#kbModal',
  title: '#kbModalTitle',
  loading: '#kbLoading',
  viewOverview: '#kbViewOverview',
  overviewGrid: '#kbOverviewGrid',
  viewWizard: '#kbViewWizard',
  wizardSteps: '#kbWizardSteps',
  closeBtn: '#kbModal .modal-close-btn',
} as const

// ── Rename / Delete Modals ────────────────────────────────────────
export const renameModal = {
  overlay: '#renameSessionModal',
  input: '#renameSessionInput',
  confirmBtn: '#renameSessionModal .btn-primary',
  cancelBtn: '#renameSessionModal .btn-secondary',
} as const

export const deleteModal = {
  overlay: '#deleteSessionModal',
  confirmBtn: '#deleteSessionModal .btn-primary',
  cancelBtn: '#deleteSessionModal .btn-secondary',
} as const

// ── Citation Modal ────────────────────────────────────────────────
export const citationModal = {
  overlay: '#citationModal',
  list: '#citationList',
  count: '#citationCount',
  item: '.citation-item',
  closeBtn: '#citationModal .modal-close-btn',
} as const

// ── Chat Style Modal ──────────────────────────────────────────────
export const chatStyleModal = {
  overlay: '#chatStyleModal',
  title: '#chatStyleModalTitle',
  stepDisplay: '#chatStyleStepDisplay',
  stepInput: '#chatStyleStepInput',
  displayEmpty: '#chatStyleDisplayEmpty',
  closeBtn: '#chatStyleModal .modal-close-btn',
} as const
