<template>
  <section class="panel">
    <header class="panel-header">
      <h3>客户信息</h3>
      <p>用于阶段判断与回复个性化</p>
    </header>

    <div class="form-grid">
      <label class="form-field">
        <span>客户姓名</span>
        <input
          :value="modelValue.name"
          type="text"
          placeholder="例如：张老师"
          @input="onInput('name', $event)"
        />
      </label>

      <label class="form-field">
        <span>公司/品牌</span>
        <input
          :value="modelValue.company"
          type="text"
          placeholder="例如：莫小派工作室"
          @input="onInput('company', $event)"
        />
      </label>
    </div>

    <label class="form-field">
      <span>销售阶段</span>
      <select :value="modelValue.stage" @change="onSelectStage">
        <option value="">未设置</option>
        <option v-for="option in stageOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </label>

    <label class="form-field">
      <span>客户备注</span>
      <textarea
        :value="modelValue.notes"
        rows="5"
        placeholder="客户背景、预算、痛点、禁忌话术等"
        @input="onInput('notes', $event)"
      />
    </label>
  </section>
</template>

<script setup lang="ts">
export interface CustomerProfileForm {
  name: string
  company: string
  stage: string
  notes: string
}

interface StageOption {
  label: string
  value: string
}

const props = defineProps<{
  modelValue: CustomerProfileForm
  stageOptions: StageOption[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: CustomerProfileForm]
}>()

const patchModel = (patch: Partial<CustomerProfileForm>) => {
  emit('update:modelValue', {
    ...props.modelValue,
    ...patch
  })
}

const onInput = (key: keyof CustomerProfileForm, event: Event) => {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement
  patchModel({ [key]: target.value })
}

const onSelectStage = (event: Event) => {
  const target = event.target as HTMLSelectElement
  patchModel({ stage: target.value })
}
</script>

<style scoped>
.panel {
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  background: var(--surface);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.panel-header h3 {
  font-size: 16px;
  color: var(--text);
  font-weight: 700;
}

.panel-header p {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field span {
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 600;
}

.form-field input,
.form-field select,
.form-field textarea {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  background: #fff;
  color: var(--text);
  transition: all 0.2s ease;
}

.form-field textarea {
  resize: vertical;
  min-height: 110px;
}

.form-field input:focus,
.form-field select:focus,
.form-field textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px hsl(158 64% 90% / 0.55);
}

@media (max-width: 1280px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>

