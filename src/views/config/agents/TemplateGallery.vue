<script setup lang="ts">
import { onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import {
  Bot,
  Sparkles,
  FilePlus2,
  User,
  Briefcase,
  BookOpen,
  MessageCircle,
  GraduationCap,
  BarChart3,
  Lightbulb,
  Heart,
  Star,
  Coffee,
  type LucideIcon,
} from "lucide-vue-next";
import AppButton from "@/components/common/AppButton.vue";
import { useAgentBuilderStore } from "@/stores/agentBuilder";
import type { SkillTemplate } from "@/types/agentBuilder";

const router = useRouter();
const store = useAgentBuilderStore();

// Map lucide:X prefix → component
const ICON_MAP: Record<string, LucideIcon> = {
  Bot,
  Sparkles,
  FilePlus2,
  User,
  Briefcase,
  BookOpen,
  MessageCircle,
  GraduationCap,
  BarChart3,
  Lightbulb,
  Heart,
  Star,
  Coffee,
};

function resolveIcon(iconUrl: string): LucideIcon {
  if (iconUrl && iconUrl.startsWith("lucide:")) {
    const name = iconUrl.slice("lucide:".length);
    return ICON_MAP[name] ?? Bot;
  }
  return Bot;
}

function isImageUrl(iconUrl: string): boolean {
  return iconUrl.startsWith("data:") || iconUrl.startsWith("http");
}

function selectTemplate(template: SkillTemplate) {
  router.push({
    path: "/config/agents/builder",
    query: { from: `template:${template.id}` },
  });
}

function goScratch() {
  router.push({ path: "/config/agents/builder", query: { from: "scratch" } });
}

function cancel() {
  router.push("/config/agents/new");
}

function retry() {
  store.fetchTemplates();
}

onMounted(() => {
  store.fetchTemplates();
});

// Determine view state
const viewState = computed<"loading" | "error" | "empty" | "success">(() => {
  if (store.templatesLoading) return "loading";
  if (store.templatesError) return "error";
  if (store.templates.length === 0) return "empty";
  return "success";
});
</script>

<template>
  <div class="gallery-page">
    <!-- Page header -->
    <div class="gallery-header">
      <div class="gallery-header-text">
        <h1 class="gallery-title">选择模板</h1>
        <p class="gallery-subtitle">选好后会预填问卷，你可以再做调整</p>
      </div>
      <AppButton variant="text" size="sm" @click="cancel">取消</AppButton>
    </div>

    <!-- Loading state: skeleton cards -->
    <div v-if="viewState === 'loading'" class="gallery-grid">
      <div
        v-for="i in 6"
        :key="i"
        class="template-card template-card--skeleton"
      >
        <div class="skeleton-icon" />
        <div class="skeleton-name" />
        <div class="skeleton-desc" />
        <div class="skeleton-desc skeleton-desc--short" />
      </div>
    </div>

    <!-- Error state -->
    <div v-else-if="viewState === 'error'" class="gallery-feedback">
      <div class="feedback-icon feedback-icon--error">
        <Sparkles :size="32" />
      </div>
      <p class="feedback-msg">{{ store.templatesError }}</p>
      <AppButton variant="secondary" @click="retry">重试</AppButton>
    </div>

    <!-- Empty state -->
    <div v-else-if="viewState === 'empty'" class="gallery-feedback">
      <div class="feedback-icon">
        <Bot :size="40" />
      </div>
      <p class="feedback-title">暂无可用模板</p>
      <p class="feedback-msg">您可以从零创建助手</p>
      <AppButton variant="primary" @click="goScratch">从零创建</AppButton>
    </div>

    <!-- Success state: template grid -->
    <div v-else class="gallery-grid">
      <div
        v-for="template in store.templates"
        :key="template.id"
        class="template-card"
      >
        <!-- Icon: image URL or lucide icon -->
        <div class="template-icon-wrap">
          <img
            v-if="isImageUrl(template.icon_url)"
            :src="template.icon_url"
            :alt="template.name"
            class="template-icon-img"
          />
          <component :is="resolveIcon(template.icon_url)" v-else :size="32" />
        </div>

        <h3 class="template-name">{{ template.name }}</h3>
        <p class="template-desc">{{ template.description }}</p>

        <AppButton
          variant="primary"
          size="sm"
          class="template-cta"
          @click="selectTemplate(template)"
        >
          用这个模板
        </AppButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gallery-page {
  max-width: 1040px;
  margin: 0 auto;
  padding: var(--space-10) var(--space-8);
}

/* Header */
.gallery-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: var(--space-8);
}

.gallery-header-text {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.gallery-title {
  font-family: var(--font-headline);
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--on-surface);
  margin: 0;
}

.gallery-subtitle {
  font-size: var(--text-sm);
  color: var(--on-surface-variant);
  margin: 0;
}

/* Grid */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-5);
}

/* Template card */
.template-card {
  background: var(--surface-lowest);
  border: 1px solid var(--outline-variant);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-3);
  transition:
    border-color var(--transition-base),
    box-shadow var(--transition-base),
    transform var(--transition-fast);
}

.template-card:hover {
  border-color: var(--tertiary);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

/* Icon */
.template-icon-wrap {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  background: var(--info-soft);
  color: var(--tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.template-icon-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Text */
.template-name {
  font-family: var(--font-headline);
  font-size: var(--text-base);
  font-weight: 700;
  color: var(--on-surface);
  margin: 0;
}

.template-desc {
  font-size: var(--text-sm);
  color: var(--on-surface-variant);
  line-height: 1.5;
  margin: 0;
  flex: 1;
}

.template-cta {
  margin-top: auto;
  width: 100%;
}

/* Skeleton card */
.template-card--skeleton {
  cursor: default;
  pointer-events: none;
}

.skeleton-icon {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-lg);
  background: linear-gradient(
    90deg,
    var(--surface-low) 25%,
    var(--surface-high) 50%,
    var(--surface-low) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
}

.skeleton-name {
  height: 16px;
  width: 70%;
  border-radius: var(--radius-sm);
  background: linear-gradient(
    90deg,
    var(--surface-low) 25%,
    var(--surface-high) 50%,
    var(--surface-low) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite 0.1s;
}

.skeleton-desc {
  height: 12px;
  width: 90%;
  border-radius: var(--radius-sm);
  background: linear-gradient(
    90deg,
    var(--surface-low) 25%,
    var(--surface-high) 50%,
    var(--surface-low) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite 0.2s;
}

.skeleton-desc--short {
  width: 60%;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Feedback (empty / error) */
.gallery-feedback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-12) var(--space-8);
  text-align: center;
}

.feedback-icon {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-xl);
  background: var(--surface-low);
  color: var(--outline-variant);
  display: flex;
  align-items: center;
  justify-content: center;
}

.feedback-icon--error {
  background: var(--danger-soft);
  color: var(--danger);
}

.feedback-title {
  font-family: var(--font-headline);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--on-surface);
  margin: 0;
}

.feedback-msg {
  font-size: var(--text-sm);
  color: var(--on-surface-variant);
  margin: 0;
}
</style>
