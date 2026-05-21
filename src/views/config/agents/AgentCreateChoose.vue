<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { Sparkles, FilePlus2, Copy, Bot, X } from "lucide-vue-next";
import AppButton from "@/components/common/AppButton.vue";
import { useAgentBuilderStore } from "@/stores/agentBuilder";
import type { Agent } from "@/types/agentBuilder";

const router = useRouter();
const store = useAgentBuilderStore();

// "从已有派生" modal state
const showCopyModal = ref(false);
const copyModalError = ref("");

function handleFromTemplate() {
  router.push("/config/agents/new/from-template");
}

function handleFromScratch() {
  router.push({ path: "/config/agents/builder", query: { from: "scratch" } });
}

async function openCopyModal() {
  showCopyModal.value = true;
  copyModalError.value = "";
  if (store.list.length === 0 && !store.loading) {
    try {
      await store.fetchList();
    } catch {
      copyModalError.value = store.error || "加载失败，请重试";
    }
  }
}

function closeCopyModal() {
  showCopyModal.value = false;
}

function selectAgentToCopy(agent: Agent) {
  showCopyModal.value = false;
  router.push({ path: "/config/agents/builder", query: { from: `copy:${agent.id}` } });
}

function retryFetchList() {
  copyModalError.value = "";
  store.fetchList().catch(() => {
    copyModalError.value = store.error || "加载失败，请重试";
  });
}
</script>

<template>
  <div class="choose-page">
    <div class="choose-header">
      <h1 class="choose-title">创建 AI 助手</h1>
      <p class="choose-subtitle">选择一种方式开始</p>
    </div>

    <div class="choose-cards">
      <!-- Path A: 从模板创建 -->
      <div
        class="choose-card choose-card--recommended"
        @click="handleFromTemplate"
      >
        <div class="card-badge">推荐</div>
        <div class="card-icon-wrap">
          <Sparkles :size="36" />
        </div>
        <h2 class="card-title">从模板创建</h2>
        <p class="card-desc">从 10+ 个内置模板派生，3-5 分钟搞定</p>
        <AppButton
          variant="primary"
          class="card-cta"
          @click.stop="handleFromTemplate"
        >
          选择模板
        </AppButton>
      </div>

      <!-- Path B: 从零创建 -->
      <div class="choose-card" @click="handleFromScratch">
        <div class="card-icon-wrap">
          <FilePlus2 :size="36" />
        </div>
        <h2 class="card-title">从零创建</h2>
        <p class="card-desc">12 题问卷逐步填写，约 8-15 分钟</p>
        <AppButton
          variant="secondary"
          class="card-cta"
          @click.stop="handleFromScratch"
        >
          开始填写
        </AppButton>
      </div>

      <!-- Path C: 从已有派生 -->
      <div class="choose-card" @click="openCopyModal">
        <div class="card-icon-wrap">
          <Copy :size="36" />
        </div>
        <h2 class="card-title">从已有派生</h2>
        <p class="card-desc">复制已有助手作为起点</p>
        <AppButton
          variant="secondary"
          class="card-cta"
          @click.stop="openCopyModal"
        >
          选择助手
        </AppButton>
      </div>
    </div>

    <!-- Copy modal overlay -->
    <Teleport to="body">
      <div
        v-if="showCopyModal"
        class="modal-overlay"
        @click.self="closeCopyModal"
      >
        <div class="modal-panel">
          <div class="modal-header">
            <h3 class="modal-title">选择要复制的助手</h3>
            <button
              class="modal-close"
              @click="closeCopyModal"
              aria-label="关闭"
            >
              <X :size="18" />
            </button>
          </div>

          <!-- Loading state -->
          <div v-if="store.loading" class="modal-body modal-body--loading">
            <div v-for="i in 4" :key="i" class="agent-row-skeleton" />
          </div>

          <!-- Error state -->
          <div v-else-if="copyModalError" class="modal-body modal-body--error">
            <p class="error-msg">{{ copyModalError }}</p>
            <AppButton variant="secondary" size="sm" @click="retryFetchList"
              >重试</AppButton
            >
          </div>

          <!-- Empty state -->
          <div
            v-else-if="store.list.length === 0"
            class="modal-body modal-body--empty"
          >
            <Bot :size="40" class="empty-icon" />
            <p class="empty-msg">暂无助手，请先创建一个</p>
            <AppButton variant="secondary" size="sm" @click="closeCopyModal"
              >关闭</AppButton
            >
          </div>

          <!-- Success state -->
          <div v-else class="modal-body">
            <ul class="agent-list">
              <li
                v-for="agent in store.list"
                :key="agent.id"
                class="agent-row"
                @click="selectAgentToCopy(agent)"
              >
                <div class="agent-row-icon">
                  <Bot :size="20" />
                </div>
                <div class="agent-row-info">
                  <span class="agent-row-name">{{ agent.name }}</span>
                  <span v-if="agent.description" class="agent-row-desc">{{
                    agent.description
                  }}</span>
                </div>
                <Copy :size="16" class="agent-row-arrow" />
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.choose-page {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-10) var(--space-8);
}

/* Header */
.choose-header {
  margin-bottom: var(--space-10);
  text-align: center;
}

.choose-title {
  font-family: var(--font-headline);
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--on-surface);
  margin: 0 0 var(--space-2);
}

.choose-subtitle {
  font-size: var(--text-base);
  color: var(--on-surface-variant);
  margin: 0;
}

/* 3-column card grid */
.choose-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-6);
}

/* Card */
.choose-card {
  position: relative;
  background: var(--surface-lowest);
  border: 1px solid var(--outline-variant);
  border-radius: var(--radius-lg);
  padding: var(--space-8) var(--space-6);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-4);
  cursor: pointer;
  transition:
    border-color var(--transition-base),
    box-shadow var(--transition-base),
    transform var(--transition-fast);
}

.choose-card:hover {
  border-color: var(--tertiary);
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}

.choose-card--recommended {
  border-color: var(--tertiary);
}

/* Recommended badge */
.card-badge {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  background: var(--tertiary);
  color: white;
  font-family: var(--font-label);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px var(--space-2);
  border-radius: var(--radius-sm);
}

/* Icon */
.card-icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-xl);
  background: var(--info-soft);
  color: var(--tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* Text */
.card-title {
  font-family: var(--font-headline);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--on-surface);
  margin: 0;
}

.card-desc {
  font-size: var(--text-sm);
  color: var(--on-surface-variant);
  line-height: 1.6;
  margin: 0;
}

.card-cta {
  margin-top: var(--space-2);
}

/* Modal overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-panel {
  background: var(--surface-lowest);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  width: 480px;
  max-width: calc(100vw - var(--space-8));
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5) var(--space-6);
  border-bottom: 1px solid var(--outline-variant);
  flex-shrink: 0;
}

.modal-title {
  font-family: var(--font-headline);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--on-surface);
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--on-surface-variant);
  display: flex;
  align-items: center;
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  transition:
    color var(--transition-fast),
    background var(--transition-fast);
}

.modal-close:hover {
  color: var(--on-surface);
  background: var(--surface-low);
}

.modal-body {
  overflow-y: auto;
  flex: 1;
  padding: var(--space-4) var(--space-6);
}

.modal-body--loading,
.modal-body--error,
.modal-body--empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  min-height: 160px;
}

/* Skeleton rows */
.agent-row-skeleton {
  height: 52px;
  border-radius: var(--radius-md);
  background: linear-gradient(
    90deg,
    var(--surface-low) 25%,
    var(--surface-high) 50%,
    var(--surface-low) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
  margin-bottom: var(--space-2);
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Error */
.error-msg {
  font-size: var(--text-sm);
  color: var(--danger);
  margin: 0;
  text-align: center;
}

/* Empty */
.empty-icon {
  color: var(--outline-variant);
}

.empty-msg {
  font-size: var(--text-sm);
  color: var(--on-surface-variant);
  margin: 0;
}

/* Agent list */
.agent-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.agent-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--outline-variant);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast);
}

.agent-row:hover {
  border-color: var(--tertiary);
  background: var(--info-soft);
}

.agent-row-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: var(--surface-low);
  color: var(--on-surface-variant);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.agent-row-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-row-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--on-surface);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-row-desc {
  font-size: var(--text-xs);
  color: var(--on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-row-arrow {
  color: var(--outline-variant);
  flex-shrink: 0;
  transition: color var(--transition-fast);
}

.agent-row:hover .agent-row-arrow {
  color: var(--tertiary);
}
</style>
