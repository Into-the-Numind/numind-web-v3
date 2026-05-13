<!--
  VisibilityScopeCard — 可见范围权限卡片 (sop-chatbot-visibility-scope)

  接入 SOP 模板编辑页 + 智能体编辑页, 让父账户配置"仅指定子用户可见"开关 + 白名单.

  状态机:
    - loading=true: GET visibility 加载中 → skeleton
    - hasSubUsers=false: 父账户 0 子用户 → 卡片整体隐藏 (AC-20)
    - dirty=true: 保存失败待重试 → inline 错误条 + 重试按钮 (P1-2)
    - restricted=false: 默认全部子用户可见 (D3 保留: 名单仍在 modelValue, 重新打开恢复)
    - restricted=true: 仅指定子用户可见 → 显示 "已选 N 位" + "选择子用户" 按钮

  交互:
    - 关→开 且有历史名单: 弹"上次已配置 N 位" 提示, 用户选保留或清空重选
    - 关→开 且无历史名单: 直接打开 SubUserMultiSelectDialog
    - 开→关 且有名单: 弹"已配置 N 位将保留" 确认 (D3 锁定)

  使用方式:
  ```vue
  <VisibilityScopeCard
    v-model="visibilityValue"
    entity-type="sop"
    :loading="visibilityLoading"
    :dirty="store.state.visibilityDirty"
    @retry="onRetryVisibility"
  />
  ```
-->
<template>
  <div v-if="hasSubUsersLoaded && !hasSubUsers" class="visibility-empty-hint">
    您还没有子用户。添加子用户后可在此设置 {{ entityLabel }} 的可见范围。
  </div>

  <div v-else-if="hasSubUsersLoaded" class="visibility-card">
    <div class="card-header">
      <h3 class="card-title">可见范围</h3>
      <p class="card-subtitle">默认所有子用户可见; 打开开关可限定仅部分子用户可见.</p>
    </div>

    <div v-if="loading" class="card-skeleton">
      <div class="skeleton-row" />
      <div class="skeleton-row" />
    </div>

    <div v-else class="card-body">
      <label class="toggle-row">
        <input
          type="checkbox"
          :checked="modelValue.restricted"
          :disabled="disabled"
          @change="onToggle(($event.target as HTMLInputElement).checked)"
        />
        <span>仅指定子用户可见</span>
      </label>

      <div v-if="modelValue.restricted" class="selected-row">
        <span class="badge">已选 {{ modelValue.subUserIDs.length }} 位</span>
        <button type="button" class="btn-pick" :disabled="disabled" @click="openDialog">
          选择子用户
        </button>
      </div>

      <div v-if="dirty" class="dirty-banner">
        <span>可见范围未保存</span>
        <button type="button" class="btn-retry" @click="$emit('retry')">重试</button>
      </div>
    </div>

    <!-- 弹窗: 选择子用户 -->
    <SubUserMultiSelectDialog
      v-model:visible="dialogVisible"
      v-model="dialogDraft"
      @confirm="onDialogConfirm"
    />

    <!-- 开→关 确认 (D3 锁定: 保留名单, 下次打开恢复) -->
    <ConfirmModal
      v-model="showConfirmDisable"
      title="关闭可见范围限制?"
      :message="`已配置 ${modelValue.subUserIDs.length} 位子用户的名单将保留, 下次打开恢复. 仍要关闭吗?`"
      confirm-text="关闭"
      @confirm="confirmDisable"
    />

    <!-- 关→开 历史名单提示 -->
    <ConfirmModal
      v-model="showHistoryHint"
      :title="`上次已配置 ${modelValue.subUserIDs.length} 位子用户`"
      message="保留上次名单并打开, 还是清空重选?"
      confirm-text="保留并打开"
      cancel-text="清空重选"
      @confirm="keepHistoryAndOpen"
      @cancel="clearAndOpen"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import ConfirmModal from '@/components/common/ConfirmModal.vue'
import SubUserMultiSelectDialog from '@/components/SubUserMultiSelectDialog.vue'
import { fetchStatistics } from '@/api/customers'
import type { VisibilityValue } from '@/api/visibility'

interface Props {
  /** v-model: 当前可见范围配置 */
  modelValue: VisibilityValue
  /** 'sop' 或 'chatbot', 影响 UI 文案 (例如 "添加子用户后可在此设置 SOP / 智能体 的可见范围") */
  entityType: 'sop' | 'chatbot'
  /** 是否禁用整个卡片 (例如保存中) */
  disabled?: boolean
  /** dirty: 保存失败待重试, 显示 inline 错误条 + 重试按钮 (P1-2) */
  dirty?: boolean
  /** loading: visibility GET 进行中, 显示 skeleton */
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  dirty: false,
  loading: false
})

const emit = defineEmits<{
  'update:modelValue': [value: VisibilityValue]
  retry: []
}>()

const entityLabel = computed(() => (props.entityType === 'sop' ? 'SOP' : '智能体'))

// hasSubUsers 状态: 通过 customer statistics 探测父账户名下子用户数
const hasSubUsers = ref(false)
const hasSubUsersLoaded = ref(false)

async function loadHasSubUsers() {
  try {
    const res = await fetchStatistics()
    hasSubUsers.value = (res.data?.total_sub_users ?? 0) > 0
  } catch {
    // 静默失败: 默认显示卡片 (false negative 优于隐藏)
    hasSubUsers.value = true
  } finally {
    hasSubUsersLoaded.value = true
  }
}

onMounted(loadHasSubUsers)

// 弹窗状态
const dialogVisible = ref(false)
const dialogDraft = ref<number[]>([])
// 切换确认
const showConfirmDisable = ref(false)
const showHistoryHint = ref(false)

function update(val: VisibilityValue) {
  emit('update:modelValue', val)
}

function onToggle(checked: boolean) {
  if (checked) {
    // 关→开
    if (props.modelValue.subUserIDs.length > 0) {
      // 有历史名单: 弹提示让用户选保留或清空
      showHistoryHint.value = true
    } else {
      // 无历史名单: 直接 restricted=true + 立即打开选择弹窗 (不允许"开但不选")
      update({ restricted: true, subUserIDs: [] })
      openDialog()
    }
  } else {
    // 开→关
    if (props.modelValue.subUserIDs.length > 0) {
      // 有名单: 弹确认 (D3: 保留名单)
      showConfirmDisable.value = true
    } else {
      // 无名单: 直接关
      update({ restricted: false, subUserIDs: [] })
    }
  }
}

function openDialog() {
  dialogDraft.value = [...props.modelValue.subUserIDs]
  dialogVisible.value = true
}

function onDialogConfirm(selected: number[]) {
  update({ restricted: true, subUserIDs: selected })
}

function confirmDisable() {
  // D3 锁定: restricted=false 但 subUserIDs 不动 (保留历史)
  update({ restricted: false, subUserIDs: props.modelValue.subUserIDs })
}

function keepHistoryAndOpen() {
  // P1-1: 用本地快照避免 props 时序问题 (emit 后立即读 props 不保证同步可见新值).
  // 不调 openDialog() (它依赖 props.modelValue), 改为直接设 draft + 打开.
  const snapshot = [...props.modelValue.subUserIDs]
  update({ restricted: true, subUserIDs: snapshot })
  dialogDraft.value = snapshot
  dialogVisible.value = true
}

function clearAndOpen() {
  update({ restricted: true, subUserIDs: [] })
  openDialog()
}
</script>

<style scoped>
.visibility-empty-hint {
  padding: 16px 20px;
  background: var(--color-bg-muted, #f8fafc);
  border: 1px dashed var(--color-border, #e2e8f0);
  border-radius: 8px;
  color: var(--color-text-muted, #64748b);
  font-size: 13px;
}

.visibility-card {
  padding: 20px 24px;
  background: var(--color-bg, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
}

.card-header {
  margin-bottom: 14px;
}

.card-title {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #0f172a);
}

.card-subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
}

.card-skeleton .skeleton-row {
  width: 100%;
  height: 28px;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    var(--color-bg-muted, #f1f5f9) 0%,
    var(--color-border, #e2e8f0) 50%,
    var(--color-bg-muted, #f1f5f9) 100%
  );
  background-size: 200% 100%;
  animation: skeleton 1.2s infinite;
  margin-bottom: 8px;
}

@keyframes skeleton {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.toggle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text, #0f172a);
}

.selected-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.badge {
  padding: 4px 10px;
  background: var(--color-bg-muted, #f1f5f9);
  border-radius: 12px;
  font-size: 12px;
  color: var(--color-text-muted, #64748b);
}

.btn-pick {
  padding: 6px 14px;
  background: var(--color-bg, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 6px;
  font-size: 13px;
  color: var(--brand-primary, #2563eb);
  cursor: pointer;
}

.btn-pick:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dirty-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
  padding: 10px 14px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #c00;
  font-size: 13px;
}

.btn-retry {
  padding: 4px 12px;
  background: var(--brand-primary, #2563eb);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}
</style>
