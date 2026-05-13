<!--
  SubUserMultiSelectDialog — 子用户多选弹窗 (sop-chatbot-visibility-scope)

  用于父账户在 SOP/智能体编辑页配置「可见范围」时, 从子用户列表中勾选哪些子用户
  可以看到该实体. 复用组件: SOP 编辑页 + chatbot 编辑页都接入.

  4 状态处理 (spec §6.2 AC-22):
    - loading: 加载中 skeleton
    - empty: 父账户名下 0 子用户 → 提示去客户管理添加
    - error: 加载失败 + 重试按钮
    - success: 子用户列表 + 勾选 + 全选/搜索

  使用方式:
  ```vue
  <SubUserMultiSelectDialog
    v-model:visible="dialogVisible"
    v-model="selectedIDs"
    @confirm="onConfirm"
  />
  ```

  设计决策:
    - 双 v-model: visible (显隐) + modelValue (selected IDs)
    - 内部维护 draft 副本, 确认时才 emit modelValue (取消放弃改动)
    - 子用户数 > 10 时显示搜索框 (默认 searchable=true)
    - 与 ConfirmModal 同款 Teleport + Esc 关闭 + click overlay 关闭
-->
<template>
  <Teleport to="body">
    <Transition name="overlay-fade">
      <div v-if="visible" class="dialog-overlay" @click.self="handleCancel">
        <div class="dialog-box" role="dialog" aria-modal="true">
          <div class="dialog-header">
            <div class="dialog-title">{{ title }}</div>
          </div>

          <div class="dialog-body">
            <!-- loading -->
            <div v-if="loading" class="state-loading">
              <div class="skeleton-row" />
              <div class="skeleton-row" />
              <div class="skeleton-row" />
            </div>

            <!-- error -->
            <div v-else-if="errorMsg" class="state-error">
              <p>{{ errorMsg }}</p>
              <button type="button" class="btn-retry" @click="loadSubUsers">重试</button>
            </div>

            <!-- empty: 父账户 0 子用户 -->
            <div v-else-if="subUsers.length === 0" class="state-empty">
              <p>您还没有子用户。添加后才能设置可见范围。</p>
              <button type="button" class="btn-cta" @click="onGoToCustomers">去客户管理添加</button>
            </div>

            <!-- success -->
            <template v-else>
              <input
                v-if="searchable && subUsers.length > 10"
                v-model="search"
                type="text"
                class="search-input"
                placeholder="搜索昵称或手机号"
              />

              <label class="select-all-row">
                <input
                  type="checkbox"
                  :checked="allFilteredSelected"
                  :indeterminate.prop="someFilteredSelected"
                  @change="toggleAll"
                />
                <span>全选 ({{ filteredUsers.length }})</span>
              </label>

              <ul class="user-list">
                <li v-for="u in filteredUsers" :key="u.id" class="user-row">
                  <label>
                    <input
                      type="checkbox"
                      :value="Number(u.id)"
                      :checked="draft.includes(Number(u.id))"
                      @change="toggleOne(Number(u.id))"
                    />
                    <span class="nickname">{{ u.nickname || u.username || '未命名' }}</span>
                    <span v-if="u.phone" class="phone">{{ maskPhone(u.phone) }}</span>
                  </label>
                </li>
              </ul>
            </template>
          </div>

          <div class="dialog-footer">
            <button type="button" class="btn-cancel" @click="handleCancel">取消</button>
            <button
              type="button"
              class="btn-confirm"
              :disabled="loading || subUsers.length === 0"
              @click="handleConfirm"
            >
              确认 (已选 {{ draft.length }})
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchSubUsers, type SubUser } from '@/api/customers'

interface Props {
  /** v-model:visible — 弹窗显隐 */
  visible: boolean
  /** v-model — 已选 sub_user_ids (number[]) */
  modelValue: number[]
  /** 弹窗标题, 默认 "选择子用户" */
  title?: string
  /** 是否显示搜索框 (子用户数 > 10 时才显示); 默认 true */
  searchable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  title: '选择子用户',
  searchable: true
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'update:modelValue': [value: number[]]
  confirm: [selected: number[]]
  cancel: []
}>()

const router = useRouter()

// state
const subUsers = ref<SubUser[]>([])
const loading = ref(false)
const errorMsg = ref('')
const search = ref('')
const draft = ref<number[]>([])

// computed
const filteredUsers = computed(() => {
  if (!search.value) return subUsers.value
  const q = search.value.toLowerCase()
  return subUsers.value.filter(
    (u) =>
      (u.nickname || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.phone || '').includes(q)
  )
})

const allFilteredSelected = computed(
  () =>
    filteredUsers.value.length > 0 &&
    filteredUsers.value.every((u) => draft.value.includes(Number(u.id)))
)

const someFilteredSelected = computed(
  () =>
    !allFilteredSelected.value &&
    filteredUsers.value.some((u) => draft.value.includes(Number(u.id)))
)

// actions
async function loadSubUsers() {
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await fetchSubUsers(0, 500)
    subUsers.value = res.data || []
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : '加载子用户失败'
  } finally {
    loading.value = false
  }
}

function toggleOne(id: number) {
  const idx = draft.value.indexOf(id)
  if (idx === -1) {
    draft.value.push(id)
  } else {
    draft.value.splice(idx, 1)
  }
}

function toggleAll() {
  const filteredIDs = filteredUsers.value.map((u) => Number(u.id))
  if (allFilteredSelected.value) {
    // 取消勾选当前 filter 显示的全部
    draft.value = draft.value.filter((id) => !filteredIDs.includes(id))
  } else {
    // 加上当前 filter 显示的全部 (保留之前的)
    filteredIDs.forEach((id) => {
      if (!draft.value.includes(id)) draft.value.push(id)
    })
  }
}

function handleConfirm() {
  emit('update:modelValue', [...draft.value])
  emit('confirm', [...draft.value])
  emit('update:visible', false)
}

function handleCancel() {
  emit('cancel')
  emit('update:visible', false)
}

function onGoToCustomers() {
  emit('update:visible', false)
  router.push('/customers')
}

function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

// Esc 关闭
function onDocumentKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.visible) {
    handleCancel()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeyDown)
})

// 弹窗打开时: 每次都强制刷新子用户列表 (EC-1: 期间被删的子用户不应残留)
// + 同步 draft = props.modelValue (副本, 取消时不影响原值)
watch(
  () => props.visible,
  async (v) => {
    if (v) {
      draft.value = [...props.modelValue]
      search.value = ''
      await loadSubUsers()
    }
  }
)
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.dialog-box {
  background: var(--color-bg, #fff);
  border-radius: 12px;
  width: min(90vw, 480px);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
}

.dialog-header {
  padding: 20px 24px 12px;
}

.dialog-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #0f172a);
}

.dialog-body {
  padding: 4px 24px;
  overflow-y: auto;
  flex: 1;
  min-height: 200px;
}

.dialog-footer {
  padding: 16px 24px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid var(--color-border, #e2e8f0);
}

/* states */
.state-loading,
.state-error,
.state-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 0;
  color: var(--color-text-muted, #64748b);
  text-align: center;
  gap: 12px;
}

.skeleton-row {
  width: 100%;
  height: 36px;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    var(--color-bg-muted, #f1f5f9) 0%,
    var(--color-border, #e2e8f0) 50%,
    var(--color-bg-muted, #f1f5f9) 100%
  );
  background-size: 200% 100%;
  animation: skeleton 1.2s infinite;
}

@keyframes skeleton {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.btn-retry,
.btn-cta {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid var(--color-border, #e2e8f0);
  background: var(--color-bg, #fff);
  color: var(--brand-primary, #2563eb);
  cursor: pointer;
  font-size: 14px;
}

/* search */
.search-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--color-border, #e2e8f0);
  font-size: 14px;
  margin-bottom: 12px;
}

.search-input:focus {
  outline: none;
  border-color: var(--brand-primary, #2563eb);
}

/* select-all */
.select-all-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  margin-bottom: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text, #0f172a);
}

/* user list */
.user-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.user-row {
  padding: 6px 0;
}

.user-row label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
}

.nickname {
  color: var(--color-text, #0f172a);
  font-weight: 500;
}

.phone {
  color: var(--color-text-muted, #64748b);
  font-size: 12px;
}

/* buttons */
.btn-cancel,
.btn-confirm {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn-cancel {
  background: var(--color-bg, #fff);
  border-color: var(--color-border, #e2e8f0);
  color: var(--color-text, #0f172a);
}

.btn-confirm {
  background: var(--brand-primary, #2563eb);
  color: #fff;
}

.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* transitions */
.overlay-fade-enter-active,
.overlay-fade-leave-active {
  transition: opacity 0.16s ease;
}

.overlay-fade-enter-from,
.overlay-fade-leave-to {
  opacity: 0;
}
</style>
